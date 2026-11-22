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
