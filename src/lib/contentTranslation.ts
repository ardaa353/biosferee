import {
  decodeTranslationEntities,
  languageCodes,
  needsContentTranslation,
  selectMyMemoryTranslation,
  splitTranslationText,
} from "@contracts/translation";
import type { Locale } from "./i18n";
let active = 0;
const waiting: (() => void)[] = [];
async function withSlot<T>(
  signal: AbortSignal,
  run: () => Promise<T>,
): Promise<T> {
  if (active >= 3) await new Promise<void>((resolve) => waiting.push(resolve));
  else active++;
  try {
    signal.throwIfAborted();
    return await run();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}
export async function translateInBrowser(
  text: string,
  source: string,
  target: Locale,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (!needsContentTranslation(source, target))
    return {
      original: text,
      text,
      source,
      provider: "",
      translated: false,
      unavailable: false,
    };
  return withSlot(signal, async () => {
    const parts: string[] = [];
    for (const chunk of splitTranslationText(text)) {
      signal.throwIfAborted();
      const url = new URL("https://api.mymemory.translated.net/get");
      url.searchParams.set("q", chunk.trim());
      url.searchParams.set(
        "langpair",
        (languageCodes[source] || source) + "|" + target,
      );
      // Never send the BioSfere session, cookies or authorization headers to the provider.
      const response = await fetch(url, {
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
      });
      if (!response.ok) throw new Error("Translation unavailable");
      const body = await response.json();
      const value = selectMyMemoryTranslation(chunk.trim(), body);
      if (
        body.quotaFinished === true ||
        Number(body.responseStatus) !== 200 ||
        !value?.trim() ||
        /MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID LANGUAGE PAIR/i.test(value)
      )
        throw new Error("Translation unavailable");
      parts.push(
        decodeTranslationEntities(value).trim() +
          (chunk.match(/\s+$/)?.[0] ?? ""),
      );
    }
    const translated = parts.join("");
    return {
      original: text,
      text: translated,
      source,
      provider: "MyMemory",
      translated: translated.trim() !== text.trim(),
      unavailable: false,
    };
  });
}
