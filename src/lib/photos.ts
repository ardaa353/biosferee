import { t as trText } from "@/lib/i18n";
export const photoAccept =
  "image/*,.heic,.heif,.hif,.tif,.tiff,.avif,.jxl,.bmp,.dng,.cr2,.cr3,.nef,.arw,.raf,.orf,.rw2,.pef,.srw";
const uploadBudget = 7500000;
const webTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
export async function withPhoto<T>(
  file: Blob,
  action: (image: HTMLImageElement) => T | Promise<T>,
): Promise<T> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(trText("Görsel çözülemedi.")));
      image.src = url;
    });
    return await action(image);
  } finally {
    image.removeAttribute("src");
    URL.revokeObjectURL(url);
  }
}
export function contain(
  width: number,
  height: number,
  edge: number,
): [number, number] {
  const scale = Math.min(1, edge / Math.max(width, height));
  return [
    Math.max(1, Math.round(width * scale)),
    Math.max(1, Math.round(height * scale)),
  ];
}
export async function encodePhoto(
  image: CanvasImageSource,
  width: number,
  height: number,
  edge: number,
  quality = 0.9,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  [canvas.width, canvas.height] = contain(width, height, edge);
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(trText("Tarayıcı görüntü alanı oluşturamadı."));
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    if (!blob) throw new Error(trText("Fotoğraf dönüştürülemedi."));
    return blob;
  } finally {
    canvas.width = canvas.height = 1;
  }
}
function named(blob: Blob, name: string): File {
  const ext: Record<string, string> = {
    "image/webp": "webp",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
  };
  return new File(
    [blob],
    (name.replace(/\.[^.]+$/, "").slice(0, 225) || "gozlem") +
      "." +
      (ext[blob.type] || "jpg"),
    { type: blob.type },
  );
}
async function prepareReadable(
  blob: Blob,
  name: string,
  maxEdge: number,
  budget: number,
): Promise<File> {
  return withPhoto(blob, async (image) => {
    const { naturalWidth: w, naturalHeight: h } = image;
    if (!w || !h) throw new Error(trText("Görsel boş."));
    if (
      webTypes.has(blob.type) &&
      blob.size <= budget &&
      Math.max(w, h) <= maxEdge
    )
      return named(blob, name);
    let edge = Math.min(maxEdge, Math.max(w, h));
    for (let step = 0; step < 7; step++) {
      const output = await encodePhoto(
        image,
        w,
        h,
        edge,
        Math.max(0.55, 0.9 - step * 0.07),
      );
      if (output.size <= budget) return named(output, name);
      edge = Math.max(128, Math.floor(edge * 0.7));
    }
    throw new Error(trText("Görüntü bu cihazda yüklemeye hazırlanamadı."));
  });
}
// Camera RAW containers often carry a full-size JPEG preview. Scan in small chunks
// so a large original is never copied into a single JavaScript buffer.
async function cameraPreview(file: File): Promise<Blob | undefined> {
  const block = 512 * 1024;
  let start = -1,
    prev = -1,
    before = -1;
  let bestStart = 0,
    bestSize = 0;
  for (let offset = 0; offset < file.size; offset += block) {
    const bytes = new Uint8Array(
      await file.slice(offset, offset + block).arrayBuffer(),
    );
    for (let i = 0; i < bytes.length; i++) {
      const value = bytes[i],
        position = offset + i;
      if (before === 255 && prev === 216 && value === 255 && start < 0)
        start = position - 2;
      if (prev === 255 && value === 217 && start >= 0) {
        const size = position + 1 - start;
        if (size > bestSize) {
          bestStart = start;
          bestSize = size;
        }
        start = -1;
      }
      before = prev;
      prev = value;
    }
  }
  if (bestSize)
    return file.slice(bestStart, bestStart + bestSize, "image/jpeg");
}
export async function preparePhoto(
  file: File,
  maxEdge = 3840,
  budget = uploadBudget,
): Promise<File> {
  if (file.size === 0) throw new Error(trText("Dosya boş."));
  try {
    return await prepareReadable(file, file.name, maxEdge, budget);
  } catch {
    // Additional decoders are requested only on browsers that cannot open this photo.
    const signature = new Uint8Array(await file.slice(0, 32).arrayBuffer());
    const header = String.fromCharCode(...signature);
    if (
      /heic|heif|heix|hevc|hevx|mif1|msf1/.test(header) ||
      /hei[cf]|\.hif$/i.test(file.type + file.name)
    ) {
      const { heicTo } = await import("heic-to");
      const decoded: Blob = await heicTo({
        blob: file,
        type: "image/jpeg",
        quality: 0.95,
      });
      return prepareReadable(decoded, file.name, maxEdge, budget);
    }
    if (/\.(dng|cr[23]|nef|arw|raf|orf|rw2|pef|srw)$/i.test(file.name)) {
      const preview = await cameraPreview(file);
      if (preview) return prepareReadable(preview, file.name, maxEdge, budget);
    }
    if (
      /\.tiff?$/i.test(file.name) ||
      /tiff/i.test(file.type) ||
      (header.startsWith("II") && signature[2] === 42 && signature[3] === 0) ||
      (header.startsWith("MM") && signature[2] === 0 && signature[3] === 42)
    ) {
      const tiff = await import("utif");
      const bytes = await file.arrayBuffer();
      const [page] = tiff.decode(bytes);
      if (!page)
        throw new Error(trText("TIFF dosyasında okunabilir sayfa bulunamadı."));
      tiff.decodeImage(bytes, page);
      const canvas = document.createElement("canvas");
      canvas.width = page.width;
      canvas.height = page.height;
      try {
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error(trText("TIFF görüntü alanı oluşturulamadı."));
        const pixels = ctx.createImageData(page.width, page.height);
        pixels.data.set(tiff.toRGBA8(page));
        ctx.putImageData(pixels, 0, 0);
        const output = await encodePhoto(
          canvas,
          canvas.width,
          canvas.height,
          maxEdge,
        );
        return prepareReadable(output, file.name, maxEdge, budget);
      } finally {
        canvas.width = canvas.height = 1;
      }
    }
    throw new Error(
      trText(
        "Bu dosya açılamadı. Dosya bozuksa veya kamera RAW önizlemesi içermiyorsa JPEG ya da PNG olarak dışa aktarabilirsin.",
      ),
    );
  }
}
