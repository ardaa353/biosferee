import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rows: [] as { text: string }[],
  database: vi.fn(),
  translate: vi.fn(async (text: string) => ({
    text: "Translated: " + text,
    source: "tur",
    translated: true,
    provider: "test",
  })),
}));
vi.mock("./queries/connection", () => ({ getDb: mocks.database }));
vi.mock("./lib/translation", () => ({ translateContent: mocks.translate }));
import { translationRouter } from "./translationRouter";
import type { User } from "../db/schema";
function caller(user?: User) {
  return translationRouter.createCaller({
    req: new Request("https://biosfere.test"),
    resHeaders: new Headers(),
    user,
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = [];
  const query = {
    select: () => query,
    from: () => query,
    where: () => query,
    innerJoin: () => query,
    limit: async () => mocks.rows,
  };
  mocks.database.mockReturnValue(query);
});
describe("Çeviri erişimi", () => {
  it("misafirlere ve normal kullanıcılara moderasyon raporlarını açmaz", async () => {
    await expect(
      caller().get({ kind: "report", id: 1, target: "en" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller({ id: 1, role: "user" } as User).get({
        kind: "report",
        id: 1,
        target: "en",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.database).not.toHaveBeenCalled();
  });
  it("profil biyografileri için mevcut oturum kuralını korur", async () => {
    await expect(
      caller().get({ kind: "bio", id: 1, target: "en" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.database).not.toHaveBeenCalled();
  });
  it("bulunmayan kayıtlar için servis çağırmaz", async () => {
    await expect(
      caller().get({ kind: "post", id: 1, target: "en" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.translate).not.toHaveBeenCalled();
  });
  it("istekteki keyfi metin yerine yalnızca veritabanındaki notu çevirir", async () => {
    mocks.rows = [{ text: "Özgün gözlem notu." }];
    const result = await caller().get({
      kind: "post",
      id: 17,
      target: "en",
      ...{ text: "arbitrary request" },
    });
    expect(mocks.translate).toHaveBeenCalledWith("Özgün gözlem notu.", "en");
    expect(result.original).toBe("Özgün gözlem notu.");
  });
});
