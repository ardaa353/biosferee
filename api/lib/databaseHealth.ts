import { getDb } from "../queries/connection";

export function databaseFailure(error: unknown): { category: string; code: string } {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const item = current as { code?: unknown; cause?: unknown };
    if (typeof item.code === "string" && /^[A-Z0-9_]+$/.test(item.code)) {
      const code = item.code;
      const category = /ACCESS_DENIED|AUTH/.test(code) ? "credentials"
        : /BAD_DB|NO_DB/.test(code) ? "database"
        : /NO_SUCH_TABLE|BAD_FIELD/.test(code) ? "schema"
        : /CON_COUNT|USER_LIMIT|TOO_MANY/.test(code) ? "capacity"
        : /CERT|TLS|SSL/.test(code) ? "tls"
        : /ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|PROTOCOL_CONNECTION_LOST/.test(code) ? "connection"
        : "database";
      return { category, code };
    }
    current = item.cause;
  }
  return { category: "database", code: "UNAVAILABLE" };
}

type Health = { status: "ok" } | { status: "unavailable"; category: string; code: string };
let cached: { until: number; result: Promise<Health> } | undefined;

// Coalesce probes and never return SQL, connection strings or query parameters.
export function databaseHealth(): Promise<Health> {
  if (cached && cached.until > Date.now()) return cached.result;
  const result = (async (): Promise<Health> => {
    try {
      await getDb().$client.promise().query({ sql: "SELECT 1", timeout: 10_000 });
      return { status: "ok" };
    } catch (error) {
      return { status: "unavailable", ...databaseFailure(error) };
    }
  })();
  cached = { until: Date.now() + 30_000, result };
  return result;
}
