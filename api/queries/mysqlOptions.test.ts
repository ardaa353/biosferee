import { describe, expect, it } from "vitest";
import mysql from "mysql2";
import type { ConnectionOptions } from "mysql2";
import { mysqlOptions } from "./mysqlOptions";

describe("TiDB connection security", () => {
  it("requires verified TLS even when the URL asks to disable it", async () => {
    const pool = mysql.createPool(mysqlOptions('mysql://user:secret@gateway.test.tidbcloud.com:4000/biosfere?ssl=false&multipleStatements=true&debug=true'));
    try {
      const options = Reflect.get(pool.config, "connectionConfig") as ConnectionOptions;
      expect(options.ssl).toMatchObject({ rejectUnauthorized: true, verifyIdentity: true, minVersion: "TLSv1.2" });
      expect(options.multipleStatements).toBe(false);
      expect(options.debug).toBe(false);
    } finally { await pool.promise().end(); }
  });

  it("preserves encoded credentials and the database name", () => {
    const options = mysqlOptions(" mysql://prefix.root:p%40ss%3Aword@gateway.test.tidbcloud.com:4000/biosfere ");
    const pool = mysql.createPool(options);
    const resolved = Reflect.get(pool.config, "connectionConfig") as ConnectionOptions;
    expect(resolved.password).toBe("p@ss:word");
    expect(resolved.database).toBe("biosfere");
    void pool.end();
  });

  it("supports the private CA used for a source database without disabling verification", () => {
    expect(mysqlOptions("mysql://user:secret@source.example/db", "CERT\\nBODY", true).ssl).toMatchObject({
      ca: "CERT\nBODY", rejectUnauthorized: true,
    });
  });

  it("rejects non-MySQL URLs and URLs without a database", () => {
    expect(() => mysqlOptions("https://example.com/db")).toThrow();
    expect(() => mysqlOptions("mysql://user:secret@example.com")).toThrow();
  });
});
