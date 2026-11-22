import { afterEach, describe, expect, it, vi } from "vitest";
import { deviceLocale, getLocale, setAccountLanguage, t } from "./i18n";
afterEach(() => {
  vi.unstubAllGlobals();
  setAccountLanguage(null);
});
describe("Dil seçimi", () => {
  it("Türkçe bölgesel cihazları Türkçe, diğer cihazları İngilizce açar", () => {
    for (const language of ["tr", "tr-TR", "TR-cy"])
      expect(deviceLocale(language)).toBe("tr");
    for (const language of ["en-US", "de-DE", "ar", "fr", "ru", "zh-CN"])
      expect(deviceLocale(language)).toBe("en");
  });
  it("hesap tercihi cihaz dilini geçersiz kılar, çıkışta cihaz diline döner", () => {
    vi.stubGlobal("navigator", { language: "de-DE" });
    setAccountLanguage("tr");
    expect(getLocale()).toBe("tr");
    setAccountLanguage("en");
    expect(t("Yeni gözlem")).toBe("New observation");
    expect(t("Bilinmeyen")).toBe("Unknown");
    setAccountLanguage(null);
    expect(getLocale()).toBe("en");
    vi.stubGlobal("navigator", { language: "tr-TR" });
    setAccountLanguage(null);
    expect(getLocale()).toBe("tr");
  });
  it("dil değişiminde saklanan durum mesajlarını ve sayıları çevirir, bilimsel adları korur", () => {
    setAccountLanguage("en");
    expect(t("Gönderi {0} / {1} · {2}", [2, 10, "Amanita muscaria"])).toBe(
      "Post 2 / 10 · Amanita muscaria",
    );
    expect(t("Gönderi 2 / 10 · Amanita muscaria")).toBe(
      "Post 2 / 10 · Amanita muscaria",
    );
    expect(t("Amanita muscaria")).toBe("Amanita muscaria");
    setAccountLanguage("tr");
    expect(t("Save changes")).toBe("Değişiklikleri Kaydet");
  });
});
