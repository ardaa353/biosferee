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

const utf8Length = (text: string) => new TextEncoder().encode(text).length;
export function splitTranslationText(text: string, maxBytes = 450): string[] {
  const chunks: string[] = [];
  let chunk = "";
  // Keep words and paragraph breaks, and respect MyMemory's UTF-8 byte limit.
  for (const token of text.match(/\S+\s*|\s+/gu) ?? []) {
    if (chunk && utf8Length(chunk + token) > maxBytes) {
      chunks.push(chunk);
      chunk = "";
    }
    if (utf8Length(token) <= maxBytes) {
      chunk += token;
      continue;
    }
    for (const char of token) {
      if (utf8Length(chunk + char) > maxBytes) {
        chunks.push(chunk);
        chunk = "";
      }
      chunk += char;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

export const languageCodes: Record<string, string> = {
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

/** Fast language hints for short notes and biographies, without loading a model in the browser. */
export function contentLanguageHint(
  text: string,
): "eng" | "tur" | "und" | undefined {
  const clean = text.replace(/https?:\/\/\S+|\S+@\S+\.\S+/gi, " ");
  const words = clean.match(/\p{L}+/gu) ?? [];
  if (!words.length) return "und";
  const fold = (word: string) =>
    word
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .replace(/ı/g, "i")
      .toLowerCase();
  const english =
    /^(?:i|am|my|the|this|that|these|those|and|with|for|from|was|were|is|are|have|has|its|it|of|in|at|on|to|a|an|as|found|observed|near|leaves|flower|flowers|bird|birds|biology|biologist|biologists|biological|botany|botanist|ecology|ecologist|student|students|researcher|research|nature|naturalist|wildlife|wildflower|mushroom|forest|river|field|notes|studying|science|scientist|photographer|photography|enthusiast|hello|nice|beautiful|great|photo|picture|green|yellow|black|white|blue)$/;
  const turkish =
    /^(?:ben|ve|bir|bu|su|ile|icin|olarak|gibi|olan|cok|daha|ama|da|de|var|yok|merhaba|guzel|guzeldi|mavi|sari|yesil|siyah|beyaz|renkli|rengi|yaprak|yapraklari|bitki|bitkisi|kus|kusun|orman|ormanda|bulundu|bulunan|bulundugu|biyoloji|biyolog|botanik|zooloji|ekoloji|doga|dogayi|dogada)$/;
  let en = 0,
    tr = 0;
  for (const word of words) {
    const normalized = fold(word);
    if (english.test(normalized))
      en += /^(?:a|in|as|at|on|to|of|is|it|its)$/.test(normalized) ? 1 : 3;
    if (
      turkish.test(normalized) ||
      /^(?:ogrenci|gozlem|fotograf|arastir|universite|akademisyen|dogasever)/.test(
        normalized,
      )
    )
      tr += /^(?:da|de)$/.test(normalized) ? 1 : 3;
    // A place name such as İstanbul in an English sentence must not decide the sentence's language.
    if (/[ğışĞŞ]/.test(word)) tr += 2;
    else if (/[çöüÇÖÜ]/.test(word)) tr += 1;
  }
  if (en >= 3 && en > tr * 1.3) return "eng";
  if (tr >= 3 && tr > en * 1.3) return "tur";
  return undefined;
}
export function needsContentTranslation(
  source: string | undefined,
  target: "tr" | "en",
): boolean {
  if (!source || source === "und") return false;
  const canonical =
    languageCodes[source] || source.toLowerCase().split(/[-_]/)[0];
  return canonical !== target;
}
