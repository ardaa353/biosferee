import { createHash } from "node:crypto";
import { franc } from "franc-min";
import { eq } from "drizzle-orm";
import { textTranslations } from "../../db/schema";
import { getDb } from "../queries/connection";
import { prepareLocalization, type Locale } from "./localization";

type Translation = {
  text: string;
  source: string;
  provider: string;
  translated: boolean;
  unavailable?: boolean;
};
const cache = new Map<string, Translation>();
const pending = new Map<string, Promise<Translation>>();
export function selectMyMemoryTranslation(
  text: string,
  body: {
    matches?: {
      segment: string;
      translation: string;
      match: number;
      "created-by"?: string;
    }[];
    responseData?: { translatedText?: string; match?: number };
  },
): string | undefined {
  const normalize = (value: string) =>
    value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
  const matches = (body.matches || []).filter(
    (match) => normalize(match.segment) === normalize(text),
  );
  const exact =
    matches.find((match) => match["created-by"] === "MT!") ||
    matches.find((match) => Number(match.match) >= 0.99);
  return (
    exact?.translation ||
    (Number(body.responseData?.match) >= 0.99
      ? body.responseData?.translatedText
      : undefined)
  );
}
export function decodeTranslationEntities(text: string) {
  const entities: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
  };
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,
    (whole, entity: string) => {
      if (!entity.startsWith("#"))
        return entities[entity.toLowerCase()] || whole;
      const code =
        entity[1].toLowerCase() === "x"
          ? parseInt(entity.slice(2), 16)
          : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    },
  );
}
let unavailableUntil = 0;
let active = 0;
const waiting: (() => void)[] = [];
async function withSlot<T>(run: () => Promise<T>): Promise<T> {
  if (active >= 3) await new Promise<void>((resolve) => waiting.push(resolve));
  else active++;
  try {
    return await run();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}
export function detectLanguage(text: string): string {
  if (/[ğışİĞŞ]/.test(text)) return "tur";
  if (
    /\b(the|this|was|were|with|found|observed|near|leaves|flower|bird)\b/i.test(
      text,
    ) &&
    !/\b(bir|bu|olan|ile|için)\b/i.test(text)
  )
    return "eng";
  const language = franc(text, { minLength: 20 });
  return language === "und" ? "tur" : language;
}
export function splitTranslationText(text: string, maxBytes = 450): string[] {
  const chunks: string[] = [];
  let chunk = "";
  // Keep words and paragraph breaks, and respect MyMemory's UTF-8 byte limit.
  for (const token of text.match(/\S+\s*|\s+/gu) ?? []) {
    if (chunk && Buffer.byteLength(chunk + token) > maxBytes) {
      chunks.push(chunk);
      chunk = "";
    }
    if (Buffer.byteLength(token) <= maxBytes) {
      chunk += token;
      continue;
    }
    for (const char of token) {
      if (Buffer.byteLength(chunk + char) > maxBytes) {
        chunks.push(chunk);
        chunk = "";
      }
      chunk += char;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}
function remember(key: string, value: Translation) {
  if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
  return value;
}
async function translateWithProvider(
  text: string,
  source: string,
  target: Locale,
): Promise<{ text: string; provider: string }> {
  const libre = process.env.LIBRETRANSLATE_URL;
  if (libre) {
    const url = new URL("translate", libre.endsWith("/") ? libre : libre + "/");
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        source: "auto",
        target,
        format: "text",
        ...(process.env.LIBRETRANSLATE_API_KEY
          ? { api_key: process.env.LIBRETRANSLATE_API_KEY }
          : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Translation service unavailable");
    const body = (await response.json()) as {
      matches?: {
        segment: string;
        translation: string;
        match: number;
        "created-by"?: string;
      }[];
      translatedText?: string;
    };
    if (!body.translatedText?.trim()) throw new Error("Empty translation");
    return { text: body.translatedText, provider: "LibreTranslate" };
  }
  if (Date.now() < unavailableUntil)
    throw new Error("Translation quota unavailable");
  const languageCodes: Record<string, string> = {
    tur: "tr",
    eng: "en",
    fra: "fr",
    deu: "de",
    spa: "es",
    ita: "it",
    por: "pt",
    nld: "nl",
    rus: "ru",
    ukr: "uk",
    ara: "ar",
    pes: "fa",
    fas: "fa",
    pol: "pl",
    jpn: "ja",
    cmn: "zh",
    zho: "zh",
    kor: "ko",
    hin: "hi",
    urd: "ur",
    ben: "bn",
    ell: "el",
    ron: "ro",
    bul: "bg",
    ces: "cs",
    slk: "sk",
    slv: "sl",
    hrv: "hr",
    srp: "sr",
    bos: "bs",
    hun: "hu",
    fin: "fi",
    dan: "da",
    swe: "sv",
    nob: "nb",
    nno: "nn",
    heb: "he",
    ind: "id",
    msa: "ms",
    vie: "vi",
    tha: "th",
    tam: "ta",
    tel: "te",
    mar: "mr",
    guj: "gu",
    pan: "pa",
    nep: "ne",
    sin: "si",
    mal: "ml",
    kan: "kn",
    uzn: "uz",
    kaz: "kk",
    azj: "az",
    hye: "hy",
    kat: "ka",
    sqi: "sq",
    lit: "lt",
    lav: "lv",
    est: "et",
    mkd: "mk",
    cat: "ca",
    eus: "eu",
    glg: "gl",
    afr: "af",
    swh: "sw",
    tgl: "tl",
    khm: "km",
    mya: "my",
    amh: "am",
    yor: "yo",
    hau: "ha",
    ibo: "ig",
    som: "so",
    zul: "zu",
    bel: "be",
  };
  const translated: string[] = [];
  for (const chunk of splitTranslationText(text)) {
    const url = new URL("https://api.mymemory.translated.net/get");
    url.searchParams.set("q", chunk.trim());
    url.searchParams.set(
      "langpair",
      (languageCodes[source] || source) + "|" + target,
    );
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const body = (await response.json()) as {
      matches?: {
        segment: string;
        translation: string;
        match: number;
        "created-by"?: string;
      }[];
      responseStatus?: number;
      quotaFinished?: boolean;
      responseData?: { translatedText?: string; match?: number };
    };
    if (
      response.status === 429 ||
      body.quotaFinished ||
      body.responseStatus === 429 ||
      body.responseStatus === 403
    ) {
      unavailableUntil = Date.now() + 30 * 60_000;
      throw new Error("Translation quota unavailable");
    }
    const value = selectMyMemoryTranslation(chunk.trim(), body);
    if (
      !response.ok ||
      Number(body.responseStatus) !== 200 ||
      !value?.trim() ||
      /MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID LANGUAGE PAIR/i.test(value)
    )
      throw new Error("Translation service unavailable");
    translated.push(
      decodeTranslationEntities(value).trim() +
        (chunk.match(/\s+$/)?.[0] ?? ""),
    );
  }
  return { text: translated.join(""), provider: "MyMemory" };
}
export async function translateContent(
  text: string,
  target: Locale,
): Promise<Translation> {
  const source = detectLanguage(text);
  const original: Translation = {
    text,
    source,
    provider: "",
    translated: false,
  };
  if (!text.trim() || source === (target === "en" ? "eng" : "tur"))
    return original;
  const key = createHash("sha256")
    .update("v1\0" + target + "\0" + text)
    .digest("hex");
  const saved = cache.get(key);
  if (saved) return saved;
  if (pending.has(key)) return pending.get(key)!;
  // Bound concurrent third-party work and preserve availability of the main site.
  if (pending.size >= 60) return { ...original, unavailable: true };
  const task = (async () => {
    try {
      await prepareLocalization();
      const [row] = await getDb()
        .select()
        .from(textTranslations)
        .where(eq(textTranslations.contentHash, key))
        .limit(1);
      if (row)
        return remember(key, {
          text: row.translatedText,
          source: row.sourceLanguage,
          provider: row.provider,
          translated: row.translatedText !== text,
        });
    } catch {
      /* A storage outage must not prevent reading observations. */
    }
    try {
      const result = await withSlot(() =>
        translateWithProvider(text, source, target),
      );
      if (result.text.length > 20000)
        throw new Error("Invalid translation length");
      const value = {
        ...result,
        source,
        translated: result.text.trim() !== text.trim(),
      };
      if (value.translated) {
        try {
          await prepareLocalization();
          await getDb()
            .insert(textTranslations)
            .values({
              contentHash: key,
              translatedText: value.text,
              sourceLanguage: source,
              provider: value.provider,
            })
            .onDuplicateKeyUpdate({
              set: { translatedText: value.text, provider: value.provider },
            });
        } catch {
          /* The in-memory cache remains usable until persistence recovers. */
        }
      }
      return remember(key, value);
    } catch {
      return { ...original, unavailable: true };
    }
  })().finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}
