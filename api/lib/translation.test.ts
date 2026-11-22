import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./localization", () => ({
  prepareLocalization: vi.fn(async () => {
    throw new Error("storage unavailable");
  }),
}));
import {
  decodeTranslationEntities,
  detectLanguage,
  selectMyMemoryTranslation,
  splitTranslationText,
  translateContent,
} from "./translation";
afterEach(() => vi.unstubAllGlobals());
describe("Gözlem metni çevirisi", () => {
  it("çok baytlı karakterleri, paragrafları ve uzun kelimeleri kaybetmeden servis sınırına böler", () => {
    const text = "Çiçek yaprakları yeşil. 🌿\n\n".repeat(60) + "ş".repeat(500);
    const chunks = splitTranslationText(text);
    expect(chunks.join("")).toBe(text);
    expect(chunks.every((chunk) => Buffer.byteLength(chunk) <= 450)).toBe(true);
  });
  it("hedef dildeki notları yeniden çevirmez", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(detectLanguage("Bu gözlem çiçekli bir bitkiye aittir.")).toBe("tur");
    expect(
      await translateContent("This bird was found near the river.", "en"),
    ).toMatchObject({ translated: false });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("farklı cümlenin benzer eşleşmesini çeviri olarak kabul etmez", () => {
    expect(
      selectMyMemoryTranslation("Bu bitki ormanda bulundu.", {
        responseData: {
          translatedText: "His corpse was found in the forest.",
          match: 0.6,
        },
        matches: [
          {
            segment: "Cesedi ormanda bulundu.",
            translation: "His corpse was found in the forest.",
            match: 0.6,
          },
        ],
      }),
    ).toBeUndefined();
    expect(
      selectMyMemoryTranslation("Bu bitki ormanda bulundu.", {
        matches: [
          {
            segment: "Bu bitki ormanda bulundu.",
            translation: "This plant was found in the forest.",
            match: 0.85,
            "created-by": "MT!",
          },
        ],
      }),
    ).toBe("This plant was found in the forest.");
  });
  it("aynı çeviri için eşzamanlı istekleri birleştirir ve sonraki okumada yeniden servis çağırmaz", async () => {
    const text = "Bu çiçek sarı renklidir ve ormanda bulundu.";
    const fetch = vi.fn(async (_input: unknown) =>
      Response.json({
        responseStatus: 200,
        matches: [
          {
            segment: text,
            translation: "This flower is yellow and was found in the forest.",
            match: 0.85,
            "created-by": "MT!",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const [a, b] = await Promise.all([
      translateContent(text, "en"),
      translateContent(text, "en"),
    ]);
    expect(a).toEqual(b);
    expect(a.translated).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      new URL(String(fetch.mock.calls[0]?.[0])).searchParams.get("langpair"),
    ).toBe("tr|en");
    await translateContent(text, "en");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("servis hata verdiğinde özgün notu değiştirmeden döndürür", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unavailable", { status: 503 })),
    );
    const text = "Çiçeklerin yaprakları büyük ve yeşildi.";
    expect(await translateContent(text, "en")).toMatchObject({
      text,
      translated: false,
      unavailable: true,
    });
  });
  it("tarayıcı tercihinde sunucu kotasını harcamadan çeviri bilgisini döndürür", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const text = "Bu gözlemin çevirisi tarayıcıdan yapılacaktır.";
    expect(await translateContent(text, "en", true)).toMatchObject({
      text,
      source: "tur",
      provider: "MyMemory",
      needsClientTranslation: true,
      translated: false,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("HTML varlıklarını düz metne çözer", () => {
    expect(
      decodeTranslationEntities(
        "Plant&#39;s leaves &amp; flowers &lt;script&gt;",
      ),
    ).toBe("Plant's leaves & flowers <script>");
  });
});
