import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock("./queries/connection", () => ({ getDb: state.database }));
vi.mock("./lib/localization", () => ({
  getUserLanguage: vi.fn(async () => null), saveUserLanguage: vi.fn(), prepareLocalization: vi.fn(),
}));
import { biosfereRouter } from "./biosfereRouter";

describe("fresh database registration", () => {
  it("does not award administrator access to the first public registration", async () => {
    const user = { id: 1_000_000_000, firstName: "Test", lastName: "User", username: "test_user", email: "owner@example.test", bio: "", role: "user", avatarKey: null, createdAt: new Date() };
    const results = [[], [], [user]];
    const values = vi.fn((_input: Record<string, unknown>) => ({ $returningId: async () => [{ id: user.id }] }));
    const query = {
      from: () => query, where: () => query, limit: async () => results.shift() ?? [],
      then: (resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(results.shift() ?? []).then(resolve, reject),
    };
    state.database.mockReturnValue({ select: () => query, insert: () => ({ values }) });
    const caller = biosfereRouter.createCaller({ req: new Request("https://biosfere.test"), resHeaders: new Headers() });
    const result = await caller.auth.register({ firstName: "Test", lastName: "User", username: "test_user", email: "owner@example.test", password: "local-test-password-only" });
    expect(values.mock.calls[0]?.[0]).toMatchObject({ role: "user" });
    expect(result.user.role).toBe("user");
    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
  });
});
