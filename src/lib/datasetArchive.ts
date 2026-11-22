import { t as trText } from "@/lib/i18n";
import { isVideoFile, mediaContentType } from "@contracts/media";
import {
  BlobReader,
  BlobWriter,
  TextReader,
  ZipReader,
  ZipWriter,
  configure,
} from "@zip.js/zip.js";
import { datasetSchema, type Dataset } from "@contracts/dataset";
configure({ useWebWorkers: false });
export type DatasetArchive = {
  dataset: Dataset;
  readPhoto: (path: string) => Promise<File>;
  close: () => Promise<void>;
};
export async function downloadPreparedArchive(
  archive: DatasetArchive,
  progress: (message: string) => void,
  signal: AbortSignal,
) {
  const writer = new ZipWriter(new BlobWriter("application/zip"));
  const written = new Set<string>();
  try {
    for (const [index, post] of archive.dataset.posts.entries()) {
      progress(
        trText("Gönderi {0} / {1} ZIP'e yazılıyor…", [
          index + 1,
          archive.dataset.posts.length,
        ]),
      );
      for (const path of post.images) {
        signal.throwIfAborted();
        if (written.has(path)) continue;
        await writer.add(
          path.replace(/^\.\//, ""),
          new BlobReader(await archive.readPhoto(path)),
          { level: 0 },
        );
        written.add(path);
      }
    }
    signal.throwIfAborted();
    await writer.add(
      "data.json",
      new TextReader(JSON.stringify(archive.dataset, null, 2)),
    );
    const blob = await writer.close();
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download =
      "biosfere-atolye-" + new Date().toISOString().slice(0, 10) + ".zip";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    try {
      await writer.close();
    } catch {
      /* Preserve the original error. */
    }
    throw error;
  }
}
function normalized(path: string) {
  const value = path.replace(/^\.\//, "").replace(/\\/g, "/");
  if (
    value.startsWith("/") ||
    value.split("/").some((part) => part === "..") ||
    value.includes("\0")
  )
    throw new Error(trText("Arşivde güvenli olmayan bir dosya yolu var."));
  return value;
}
function uniquePaths(names: string[]) {
  const result = new Map<string, string>();
  for (const name of names) {
    const key = normalized(name);
    if (result.has(key))
      throw new Error(trText("Arşivde aynı ada sahip iki dosya var: ") + key);
    result.set(key, name);
  }
  return result;
}
export async function openDatasetArchive(file: File): Promise<DatasetArchive> {
  const magic = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  let names: Map<string, string>;
  let read: (path: string) => Promise<Blob>;
  let close = async () => {};
  if (magic[0] === 80 && magic[1] === 75) {
    const reader = new ZipReader(new BlobReader(file));
    const entries = await reader.getEntries();
    const files = entries.filter((entry) => !entry.directory);
    names = uniquePaths(files.map((entry) => entry.filename));
    const map = new Map(files.map((entry) => [entry.filename, entry]));
    read = async (path) => {
      const entry = map.get(path);
      if (!entry?.getData)
        throw new Error(trText("Arşiv dosyası bulunamadı: ") + path);
      return entry.getData(new BlobWriter());
    };
    close = () => reader.close();
  } else if (String.fromCharCode(...magic.slice(0, 4)) === "Rar!") {
    const { createExtractorFromData } = await import("node-unrar-js");
    const response = await fetch("/archive/unrar-2.0.2.wasm");
    if (!response.ok) throw new Error(trText("RAR okuyucusu yüklenemedi."));
    const extractor = await createExtractorFromData({
      data: await file.arrayBuffer(),
      wasmBinary: await response.arrayBuffer(),
    });
    const list = extractor.getFileList();
    const headers = [...list.fileHeaders].filter(
      (entry) => !entry.flags.directory,
    );
    if (
      list.arcHeader.flags.headerEncrypted ||
      headers.some((entry) => entry.flags.encrypted)
    )
      throw new Error(trText("Arşivi şifresiz ZIP veya RAR olarak kaydedin."));
    names = uniquePaths(headers.map((entry) => entry.name));
    read = async (path) => {
      const extracted = [...extractor.extract({ files: [path] }).files];
      const entry = extracted.find((value) => value.fileHeader.name === path);
      if (!entry?.extraction)
        throw new Error(trText("RAR fotoğrafı okunamadı: ") + path);
      return new Blob([new Uint8Array(entry.extraction)]);
    };
  } else throw new Error(trText("Geçerli bir ZIP veya RAR arşivi seçin."));
  try {
    const manifest = names.get("data.json");
    if (!manifest)
      throw new Error(trText("Arşivin kökünde data.json bulunmalı."));
    const data = JSON.parse(await (await read(manifest)).text());
    const parsed = datasetSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(
        trText("Veri biçimi geçersiz (") +
          issue.path.join(".") +
          "): " +
          issue.message,
      );
    }
    const ids = new Set<string>();
    for (const post of parsed.data.posts) {
      if (ids.has(post.id))
        throw new Error(trText("Tekrarlanan gönderi kimliği: ") + post.id);
      ids.add(post.id);
      for (const path of post.images)
        if (!names.has(normalized(path)))
          throw new Error(trText("Fotoğraf eksik: ") + path);
    }
    return {
      dataset: parsed.data,
      close,
      readPhoto: async (path) => {
        const full = names.get(normalized(path));
        if (!full) throw new Error(trText("Fotoğraf bulunamadı: ") + path);
        const name = full.split("/").at(-1) || "gozlem.jpg";
        return new File([await read(full)], name, {
          type: isVideoFile({ name, type: "" }) ? mediaContentType(name) : "",
        });
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
export async function exportDatasetZip(
  snapshot: {
    format: string;
    version: number;
    archiveId: string;
    exportedAt: string;
    users: unknown[];
    posts: ({
      id: string;
      images: {
        url: string;
      }[];
    } & Record<string, unknown>)[];
  },
  progress: (message: string) => void,
  signal: AbortSignal,
) {
  const writer = new ZipWriter(new BlobWriter("application/zip"));
  const posts = [];
  let done = 0;
  const total = snapshot.posts.reduce(
    (sum, post) => sum + post.images.length,
    0,
  );
  const extensions: Record<string, string> = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "video/x-matroska": "mkv",
    "video/x-msvideo": "avi",
    "video/3gpp": "3gp",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "image/tiff": "tiff",
    "image/heic": "heic",
  };
  try {
    for (const post of snapshot.posts) {
      const images = [];
      for (const [index, image] of post.images.entries()) {
        signal.throwIfAborted();
        progress(trText("Fotoğraf indiriliyor · ") + ++done + " / " + total);
        const url = new URL(image.url);
        if (url.protocol !== "https:")
          throw new Error(trText("Güvenli olmayan fotoğraf adresi."));
        const response = await fetch(url, { signal });
        if (!response.ok)
          throw new Error(
            trText("Gönderi ") +
              post.id +
              trText(" fotoğrafı indirilemedi (HTTP ") +
              response.status +
              trText("). Arşiv tamamlanmadı."),
          );
        const photo = await response.blob();
        const type = photo.type.split(";")[0];
        if (!type.startsWith("image/") && !type.startsWith("video/"))
          throw new Error(
            trText("Medya sunucusu fotoğraf veya video döndürmedi."),
          );
        const suffix =
          url.pathname.match(/\.([A-Za-z0-9]{2,5})$/)?.[1]?.toLowerCase() ||
          "jpg";
        const path =
          "photos/gonderi" +
          post.id +
          "." +
          (index + 1) +
          "." +
          (extensions[type] || suffix);
        await writer.add(path, new BlobReader(photo), { level: 0 });
        images.push("./" + path);
      }
      posts.push({ ...post, images });
    }
    signal.throwIfAborted();
    progress(trText("data.json ve ZIP tamamlanıyor…"));
    await writer.add(
      "data.json",
      new TextReader(JSON.stringify({ ...snapshot, posts }, null, 2)),
    );
    const blob = await writer.close();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download =
      "biosfere-veri-" + new Date().toISOString().slice(0, 10) + ".zip";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    try {
      await writer.close();
    } catch {
      /* Preserve the original archive error. */
    }
    throw error;
  }
}
