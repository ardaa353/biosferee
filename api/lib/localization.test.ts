import { describe, expect, it, vi } from "vitest";
vi.mock("../queries/connection", () => ({
  getDb: () => ({
    execute: async () => {
      throw new Error("preference storage unavailable");
    },
  }),
}));
import { getUserLanguage, saveUserLanguage } from "./localization";
describe("Dil tercih deposu kesintisi", () => {
  it("mevcut hesaplara girişi bozmak yerine cihaz diline döner", async () => {
    expect(await getUserLanguage(1)).toBeNull();
  });
  it("kaydedilemeyen tercihi kaydedilmiş gibi bildirmez", async () => {
    await expect(saveUserLanguage(1, "en")).rejects.toThrow(
      "preference storage unavailable",
    );
  });
});
