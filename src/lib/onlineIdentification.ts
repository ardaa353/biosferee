import { t as trText } from "@/lib/i18n";
import { emptyTaxonomy, type Taxonomy } from "@contracts/taxonomy";
import { identificationFrames } from "./media";
import { encodePhoto, withPhoto } from "./photos";
export type IdentificationMode = "online" | "database" | "browser";
export type IdentificationCandidate = {
  taxonomy: Taxonomy;
  score: number;
  modelCommonName?: string;
};
export type ReferenceImage = {
  species: string;
  url: string;
  source: string;
};
export type AnalysisResult = {
  candidates: IdentificationCandidate[];
  source: string;
  photoCount: number;
  references: ReferenceImage[];
};
export const ONLINE_CLASSIFIER = "https://imageomics-bioclip-2-demo.hf.space";
export const ONLINE_DATABASE =
  "https://imageomics-bioclip-image-search-lite.hf.space";
export function parseTaxonLabel(label: string): Taxonomy {
  const scientific = label.split(" (")[0].trim().split(/\s+/);
  if (scientific.length !== 7)
    throw new Error(
      trText(
        "Çevrim içi servis sistematik adlarını beklenen biçimde döndürmedi.",
      ),
    );
  const [kingdom, phylum, className, orderName, family, genus, epithet] =
    scientific;
  return {
    ...emptyTaxonomy,
    kingdom,
    phylum,
    className,
    orderName,
    family,
    genus,
    species: genus + " " + epithet,
  };
}
export function mergeCandidates(
  rows: IdentificationCandidate[][],
): IdentificationCandidate[] {
  const totals = new Map<string, IdentificationCandidate>();
  for (const row of rows) {
    const best = new Map<string, IdentificationCandidate>();
    for (const value of row)
      if (
        Number.isFinite(value.score) &&
        value.score >= 0 &&
        value.taxonomy.species &&
        value.score > (best.get(value.taxonomy.species)?.score ?? -1)
      )
        best.set(value.taxonomy.species, value);
    for (const value of best.values())
      totals.set(value.taxonomy.species, {
        ...value,
        score: (totals.get(value.taxonomy.species)?.score || 0) + value.score,
      });
  }
  return [...totals.values()]
    .map((value) => ({
      ...value,
      score: value.score / Math.max(1, rows.length),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
export function parseCsv(content: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  const input = content.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n")) {
      row.push(cell.replace(/\r$/, ""));
      cell = "";
      if (c === "\n") {
        rows.push(row);
        row = [];
      }
    } else cell += c;
  }
  if (quoted)
    throw new Error(trText("Görsel veritabanı geçersiz CSV döndürdü."));
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  const keys = rows.shift() || [];
  return rows
    .filter((row) => row.some(Boolean))
    .map((row) =>
      Object.fromEntries(keys.map((key, i) => [key, row[i] || ""])),
    );
}
export function databaseCandidates(
  rows: Record<string, string>[],
): IdentificationCandidate[] {
  return rows.map((row, index) => ({
    taxonomy: {
      ...emptyTaxonomy,
      kingdom: row.kingdom || "",
      phylum: row.phylum || "",
      className: row.class || "",
      orderName: row.order || "",
      family: row.family || "",
      genus: row.genus || "",
      species: (row.species || "").includes(" ")
        ? row.species
        : [row.genus, row.species].filter(Boolean).join(" "),
    },
    score: 1 / (index + 1),
    modelCommonName: row.common_name || "",
  }));
}
export function descriptionDraft(taxonomy: Taxonomy, count: number) {
  return trText(
    "{0} fotoğraf birlikte değerlendirilerek {1} olası tür olarak önerildi.{2} Tür önerisi, fotoğraftaki ayırt edici özellikler karşılaştırılarak kontrol edilmelidir.",
    [
      count,
      taxonomy.species || taxonomy.genus || trText("canlı"),
      taxonomy.family
        ? " " + taxonomy.family + trText(" familyasıyla ilişkilendirilmiştir.")
        : "",
    ],
  );
}
function safeHttps(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}
export async function analyzeObservation(
  files: File[],
  mode: IdentificationMode,
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<AnalysisResult> {
  if (!files.length) throw new Error(trText("Gönderiye fotoğraf ekleyin."));
  const mediaCount = files.length;
  files = await identificationFrames(files, signal, progress);
  if (mode === "browser") {
    const { identifyPhotos } = await import("./identification");
    const { catalogSearch, exactMatch } = await import("./catalog");
    const guesses = await identifyPhotos(files, signal, progress);
    const candidates = await Promise.all(
      guesses.map(async (guess) => {
        const kingdom =
          guess.group === "plant"
            ? "Plantae"
            : guess.group === "fungus"
              ? "Fungi"
              : "Animalia";
        const name = guess.name.split(" ").slice(0, 2).join(" ");
        const result = await catalogSearch(name, "species", signal).catch(
          () => null,
        );
        return {
          taxonomy: (result &&
            exactMatch(result.results, name, kingdom)?.taxonomy) || {
            ...emptyTaxonomy,
            kingdom,
            genus: name.split(" ")[0],
            species: name,
          },
          score: guess.score,
        };
      }),
    );
    return {
      candidates,
      source: trText("Tarayıcı modelleri ve Catalogue of Life"),
      photoCount: mediaCount,
      references: [],
    };
  }
  progress(
    trText(
      "Çevrim içi BioCLIP servisine bağlanılıyor. Büyük model indirilmez…",
    ),
  );
  const { Client, handle_file } = await import("@gradio/client");
  const host = mode === "database" ? ONLINE_DATABASE : ONLINE_CLASSIFIER;
  const connection = Client.connect(host, {
    events: ["data", "status"],
    record_history: false,
  });
  const client = await new Promise<Awaited<typeof connection>>(
    (resolve, reject) => {
      let settled = false;
      const failed = (error: unknown) => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(error);
        }
      };
      const stopped = () =>
        failed(
          signal.reason ||
            new DOMException(trText("İptal edildi."), "AbortError"),
        );
      const timer = setTimeout(
        () =>
          failed(
            new Error(
              trText(
                "Çevrim içi servise bağlanılamadı. Daha sonra yeniden deneyin.",
              ),
            ),
          ),
        60000,
      );
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", stopped);
      };
      signal.addEventListener("abort", stopped, { once: true });
      connection.then((value) => {
        if (settled) {
          value.close();
          return;
        }
        settled = true;
        cleanup();
        resolve(value);
      }, failed);
      if (signal.aborted) stopped();
    },
  );
  const timeout = new AbortController();
  const combined = AbortSignal.any([signal, timeout.signal]);
  let active: ReturnType<typeof client.submit> | undefined;
  const stop = () => {
    void active?.cancel().catch(() => {});
    client.close();
  };
  combined.addEventListener("abort", stop, { once: true });
  async function call(endpoint: string, data: unknown[]): Promise<unknown[]> {
    combined.throwIfAborted();
    const timer = setTimeout(
      () =>
        timeout.abort(
          new Error(
            trText(
              "Çevrim içi servis zamanında yanıt vermedi. Sonuçlarınızı koruyup daha sonra yeniden deneyebilirsiniz.",
            ),
          ),
        ),
      180000,
    );
    try {
      active = client.submit(endpoint, data);
      for await (const event of active) {
        combined.throwIfAborted();
        if (event.type === "data") return event.data as unknown[];
        if (event.type === "status") {
          if (event.stage === "error")
            throw new Error(
              typeof event.message === "string"
                ? event.message
                : trText("Çevrim içi analiz servisi kullanılamıyor."),
            );
          if (event.stage === "pending")
            progress(trText("Çevrim içi servis sırası bekleniyor…"));
        }
      }
      combined.throwIfAborted();
      throw new Error(trText("Çevrim içi servis sonuç döndürmedi."));
    } finally {
      clearTimeout(timer);
      active = undefined;
    }
  }
  const rows: IdentificationCandidate[][] = [],
    references: ReferenceImage[] = [];
  try {
    combined.throwIfAborted();
    for (const [index, file] of files.entries()) {
      combined.throwIfAborted();
      progress(
        trText("Fotoğraf {0} / {1} çevrim içi inceleniyor…", [
          index + 1,
          files.length,
        ]),
      );
      // A canvas copy sends pixels only, without EXIF coordinates or camera metadata.
      const pixels = await withPhoto(file, (image) =>
        encodePhoto(image, image.naturalWidth, image.naturalHeight, 1024, 0.9),
      );
      if (mode === "online") {
        const data = await call("/lambda", [handle_file(pixels), "Species"]);
        const result = data[0] as {
          confidences?: {
            label: string;
            confidence: number;
          }[];
        };
        const candidates: IdentificationCandidate[] = [];
        for (const value of result.confidences || []) {
          try {
            candidates.push({
              taxonomy: parseTaxonLabel(value.label),
              score: value.confidence,
              modelCommonName: value.label.match(/ \((.*)\)$/)?.[1] || "",
            });
          } catch {
            /* Skip malformed provider labels. */
          }
        }
        if (!candidates.length)
          throw new Error(
            trText(
              "Çevrim içi servis tür adaylarını beklenen biçimde döndürmedi.",
            ),
          );
        rows.push(candidates);
      } else {
        await call("/search", [handle_file(pixels), 10, 16, "All Sources"]);
        const exported = await call("/_prepare_export", []);
        const output = exported[0] as {
          url?: string;
          value?: {
            url?: string;
          };
        };
        const link = output?.value?.url || output?.url;
        if (!link || new URL(link, host).origin !== host)
          throw new Error(
            trText("Görsel veritabanının sonuç dosyası alınamadı."),
          );
        const response = await fetch(new URL(link, host), { signal: combined });
        if (!response.ok)
          throw new Error(trText("Görsel veritabanı sonuçları indirilemedi."));
        const entries = parseCsv(await response.text());
        const candidates = databaseCandidates(entries).filter(
          (value) => value.taxonomy.species,
        );
        if (!candidates.length)
          throw new Error(
            trText("Görsel veritabanı eşleşen kayıt döndürmedi."),
          );
        rows.push(candidates);
        for (const entry of entries) {
          const url = safeHttps(entry.image_url);
          if (url && !references.some((value) => value.url === url))
            references.push({
              species: entry.species,
              url,
              source: entry.source_dataset || "TreeOfLife",
            });
        }
      }
    }
    return {
      candidates: mergeCandidates(rows),
      source:
        mode === "online"
          ? "BioCLIP 2 · Imageomics/Hugging Face"
          : "BioCLIP Image Search Lite · TreeOfLife 200M+",
      photoCount: mediaCount,
      references: references.slice(0, 20),
    };
  } finally {
    combined.removeEventListener("abort", stop);
    stop();
  }
}
