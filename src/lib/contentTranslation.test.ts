import { afterEach, describe, expect, it, vi } from "vitest";
import { translateInBrowser } from "./contentTranslation";
afterEach(() => vi.unstubAllGlobals());
describe("Tarayıcıdan not çevirisi", () => {
  it("notu gerçek kaynak diliyle çevirir ve hesap bilgilerini sağlayıcıya göndermez", async () => {
    const text = "Bu bitki ormanda gözlemlendi.";
    const fetch = vi.fn(async (_url: unknown, _options: unknown) =>
      Response.json({
        responseStatus: 200,
        quotaFinished: false,
        matches: [
          {
            segment: text,
            translation: "This plant was observed in the forest.",
            match: 0.85,
            "created-by": "MT!",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await translateInBrowser(
      text,
      "tur",
      "en",
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      original: text,
      translated: true,
      text: "This plant was observed in the forest.",
    });
    const [url, options] = fetch.mock.calls[0];
    expect(new URL(String(url)).searchParams.get("langpair")).toBe("tr|en");
    expect(options).toMatchObject({
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    });
    expect(options).not.toHaveProperty("headers");
  });
  it("benzer fakat farklı cümleyi göstermez", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          responseStatus: 200,
          responseData: { translatedText: "Unrelated text", match: 0.6 },
          matches: [
            {
              segment: "Başka bir cümle",
              translation: "Unrelated text",
              match: 0.6,
            },
          ],
        }),
      ),
    );
    await expect(
      translateInBrowser(
        "Bu canlı ormanda bulundu.",
        "tur",
        "en",
        new AbortController().signal,
      ),
    ).rejects.toThrow();
  });
  it("kota yanıtını başarılı çeviri diye kaydetmez", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          responseStatus: 403,
          quotaFinished: true,
          responseData: { translatedText: "quota exceeded" },
        }),
      ),
    );
    await expect(
      translateInBrowser(
        "Bu çiçek sarıdır.",
        "tur",
        "en",
        new AbortController().signal,
      ),
    ).rejects.toThrow();
  });
  it("kapatılan gözlem için istek başlatmaz", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    controller.abort();
    await expect(
      translateInBrowser("Özgün gözlem", "tur", "en", controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
