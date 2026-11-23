import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("../queries/connection", () => ({
  getDb: () => ({ $client: { promise: () => ({ query }) } }),
}));

beforeEach(() => { vi.resetModules(); query.mockReset(); });

describe("database availability", () => {
  it("finds a driver error wrapped by Drizzle without exposing query parameters", async () => {
    const { databaseFailure } = await import("./databaseHealth");
    const error = new Error("Failed query with private session", {
      cause: Object.assign(new Error("Access denied for private-user@private-host"), { code: "ER_ACCESS_DENIED_ERROR" }),
    });
    expect(databaseFailure(error)).toEqual({ category: "credentials", code: "ER_ACCESS_DENIED_ERROR" });
    expect(JSON.stringify(databaseFailure(error))).not.toContain("private");
  });

  it("does not confuse a missing column with an unreachable database", async () => {
    const { databaseFailure } = await import("./databaseHealth");
    expect(databaseFailure({ code: "ER_BAD_FIELD_ERROR" }).category).toBe("schema");
    expect(databaseFailure({ code: "ECONNREFUSED" }).category).toBe("connection");
    expect(databaseFailure({ code: "CERT_HAS_EXPIRED" }).category).toBe("tls");
  });

  it("coalesces parallel public probes and caches their results", async () => {
    query.mockResolvedValueOnce([[{ 1: 1 }]]);
    const { databaseHealth } = await import("./databaseHealth");
    expect(await Promise.all([databaseHealth(), databaseHealth(), databaseHealth()])).toEqual([
      { status: "ok" }, { status: "ok" }, { status: "ok" },
    ]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("reports a safe failure code without the connection string", async () => {
    query.mockRejectedValueOnce(Object.assign(new Error("mysql://private-user:secret@private-host/db"), { code: "ECONNREFUSED" }));
    const { databaseHealth } = await import("./databaseHealth");
    expect(await databaseHealth()).toEqual({ status: "unavailable", category: "connection", code: "ECONNREFUSED" });
  });
});
