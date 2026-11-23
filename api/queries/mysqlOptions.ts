import type { PoolOptions } from "mysql2";

export function mysqlOptions(connectionUrl: string, ca?: string, requireTls = false): PoolOptions {
  const url = new URL(connectionUrl.trim());
  if (url.protocol !== "mysql:" || !url.hostname || url.pathname.length < 2) {
    throw new Error("A MySQL connection URL with a database name is required.");
  }
  const isTiDB = url.hostname.endsWith(".tidbcloud.com");
  // TiDB requires encrypted connections. Never let a URL disable certificate
  // or hostname verification, or enable multiple statements/local file reads.
  const tls = isTiDB || requireTls || Boolean(ca);
  if (tls) {
    url.searchParams.delete("ssl");
    url.searchParams.delete("ssl-mode");
    url.searchParams.delete("sslMode");
  }
  for (const option of ["multipleStatements", "infileStreamFactory", "debug", "trace", "enableCleartextPlugin"]) {
    url.searchParams.delete(option);
  }
  return {
    uri: url.toString(),
    connectionLimit: 5,
    maxIdle: 2,
    idleTimeout: 60_000,
    waitForConnections: true,
    queueLimit: 30,
    connectTimeout: 10_000,
    enableKeepAlive: true,
    multipleStatements: false,
    debug: false,
    trace: false,
    ...(tls ? { ssl: { rejectUnauthorized: true, minVersion: "TLSv1.2", ...(ca ? { ca: ca.replace(/\\n/g, "\n") } : {}) } } : {}),
  };
}
