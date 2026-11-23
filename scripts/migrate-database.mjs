import mysql from "mysql2/promise";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mysqlOptions } from "../api/queries/mysqlOptions.ts";

// Connection secrets are accepted through stdin only. This tool never prints
// rows, passwords, connection URLs, SQL errors or authentication tokens.
const mode = process.argv[2];
if (!["--plan", "--copy"].includes(mode)) {
  console.log("Node 24: node scripts/migrate-database.mjs --plan|--copy < private-config.json");
  console.log("stdin JSON: sourceUrl, targetUrl, sourceCa?, targetCa?, sourceWritesPaused (required for --copy)");
  process.exit(mode === "--help" ? 0 : 1);
}

const quote = name => "`" + name.replaceAll("`", "``") + "`";
const modulus = 1n << 256n;
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function rowHash(row, columns) {
  const values = row.map((value, index) => {
    if (Buffer.isBuffer(value)) return { bytes: value.toString("base64") };
    if (columns[index].Type.toLowerCase() === "json" && value !== null) {
      return { json: canonical(typeof value === "string" ? JSON.parse(value) : value) };
    }
    return value;
  });
  return BigInt("0x" + createHash("sha256").update(JSON.stringify(values)).digest("hex"));
}
function rows(connection, table, columns) {
  const names = columns.map(column => quote(column.Field)).join(",");
  return connection.connection.query({ sql: `SELECT ${names} FROM ${quote(table)}`, rowsAsArray: true }).stream({ highWaterMark: 100 });
}
async function fingerprint(connection, table, columns) {
  let count = 0, sum = 0n;
  for await (const row of rows(connection, table, columns)) {
    sum = (sum + rowHash(row, columns)) % modulus;
    count++;
  }
  return { count, digest: sum.toString(16).padStart(64, "0") };
}

let source, target;
let transaction = false;
try {
  const config = JSON.parse(readFileSync(0, "utf8"));
  const sourceUrl = new URL(config.sourceUrl), targetUrl = new URL(config.targetUrl);
  if (!targetUrl.hostname.endsWith(".tidbcloud.com")) throw Object.assign(new Error(), { code: "TARGET_MUST_BE_TIDB" });
  if (sourceUrl.hostname === targetUrl.hostname && sourceUrl.pathname === targetUrl.pathname) throw Object.assign(new Error(), { code: "SOURCE_EQUALS_TARGET" });
  if (mode === "--copy" && config.sourceWritesPaused !== true) throw Object.assign(new Error(), { code: "PAUSE_SOURCE_WRITES_FIRST" });

  const options = (url, ca) => ({ ...mysqlOptions(url, ca, true), supportBigNumbers: true, bigNumberStrings: true, dateStrings: true, jsonStrings: true, charset: "utf8mb4" });
  // Never create anything on the target until the source can be read.
  source = await mysql.createConnection(options(config.sourceUrl, config.sourceCa));
  await source.query("SET time_zone = '+00:00'");
  await source.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  await source.query("SET TRANSACTION READ ONLY");
  await source.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
  transaction = true;

  const [tables] = await source.query("SHOW FULL TABLES");
  if (!tables.length) throw Object.assign(new Error(), { code: "SOURCE_IS_EMPTY" });
  if (tables.some(row => Object.values(row)[1] !== "BASE TABLE")) throw Object.assign(new Error(), { code: "SOURCE_VIEWS_REQUIRE_REVIEW" });
  for (const [table, column] of [["TRIGGERS", "TRIGGER_SCHEMA"], ["ROUTINES", "ROUTINE_SCHEMA"], ["EVENTS", "EVENT_SCHEMA"]]) {
    const [objects] = await source.query(`SELECT COUNT(*) AS n FROM information_schema.${table} WHERE ${column} = DATABASE()`);
    if (Number(objects[0].n) > 0) throw Object.assign(new Error(), { code: "SOURCE_PROGRAMS_REQUIRE_REVIEW" });
  }
  const metadata = [];
  for (const row of tables) {
    const name = Object.values(row)[0];
    const [columns] = await source.query(`SHOW FULL COLUMNS FROM ${quote(name)}`);
    const [definition] = await source.query(`SHOW CREATE TABLE ${quote(name)}`);
    metadata.push({ name, columns, ddl: definition[0]["Create Table"] });
  }

  target = await mysql.createConnection(options(config.targetUrl, config.targetCa));
  const [existing] = await target.query("SHOW FULL TABLES");
  if (existing.length) throw Object.assign(new Error(), { code: "TARGET_NOT_EMPTY" });
  if (mode === "--plan") {
    for (const table of metadata) {
      const [result] = await source.query(`SELECT COUNT(*) AS n FROM ${quote(table.name)}`);
      console.log(JSON.stringify({ table: table.name, rows: String(result[0].n), columns: table.columns.length }));
    }
    console.log(JSON.stringify({ status: "plan_only", tables: metadata.length, writes: 0 }));
  } else {
    await target.query("SET time_zone = '+00:00'");
    await target.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of metadata) {
      await target.query(table.ddl);
      const [warnings] = await target.query("SHOW WARNINGS");
      if (warnings.some(w => /unsupported|ignored/i.test(w.Message))) throw Object.assign(new Error(), { code: "SCHEMA_COMPATIBILITY_REVIEW_REQUIRED" });
    }
    for (const table of metadata) {
      const writable = table.columns.filter(column => !/\b(?:VIRTUAL|STORED) GENERATED\b/i.test(column.Extra));
      const indexes = writable.map(column => table.columns.indexOf(column));
      const names = writable.map(column => quote(column.Field)).join(",");
      let batch = [], bytes = 0, count = 0, sum = 0n;
      const flush = async () => {
        if (!batch.length) return;
        await target.query(`INSERT INTO ${quote(table.name)} (${names}) VALUES ?`, [batch]);
        batch = []; bytes = 0;
      };
      for await (const row of rows(source, table.name, table.columns)) {
        sum = (sum + rowHash(row, table.columns)) % modulus;
        count++;
        const values = indexes.map(index => row[index]);
        batch.push(values);
        bytes += Buffer.byteLength(JSON.stringify(values));
        if (batch.length >= 100 || bytes >= 512_000) await flush();
      }
      await flush();
      const expected = { count, digest: sum.toString(16).padStart(64, "0") };
      const actual = await fingerprint(target, table.name, table.columns);
      if (actual.count !== expected.count || actual.digest !== expected.digest) throw Object.assign(new Error(), { code: "DATA_VERIFICATION_FAILED" });
      console.log(JSON.stringify({ table: table.name, ...actual, verified: true }));
    }
    await target.query("SET FOREIGN_KEY_CHECKS = 1");
    console.log(JSON.stringify({ status: "verified", tables: metadata.length, renderCutoverPerformed: false }));
  }
} catch (error) {
  const code = typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code) ? error.code : "MIGRATION_FAILED";
  console.error(JSON.stringify({ status: "stopped", code, sourceModified: false, targetMayBePartial: mode === "--copy", renderCutoverPerformed: false }));
  process.exitCode = 1;
} finally {
  if (transaction) await source?.rollback().catch(() => {});
  await source?.end().catch(() => {});
  await target?.end().catch(() => {});
}
