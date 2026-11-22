import { t as trText } from "@/lib/i18n";
import { withPhoto } from "./photos";
import { rankPhotos, type Guess } from "./species-ranking";
export {
  broadGroup,
  confident,
  rankPhotos,
  type Guess,
} from "./species-ranking";
const known = new WeakMap<File, Guess[]>();
function pixels(image: HTMLImageElement, size: number, crop: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error(trText("Fotoğraf okunamadı."));
  const w = image.naturalWidth,
    h = image.naturalHeight;
  const scale = crop ? size / (Math.min(w, h) * 0.875) : size / Math.max(w, h);
  context.fillStyle = "#808080";
  context.fillRect(0, 0, size, size);
  context.drawImage(
    image,
    (size - w * scale) / 2,
    (size - h * scale) / 2,
    w * scale,
    h * scale,
  );
  const rgba = context.getImageData(0, 0, size, size).data;
  const rgb = new Uint8Array(size * size * 3);
  for (let a = 0, b = 0; a < rgba.length; a += 4) {
    rgb[b++] = rgba[a];
    rgb[b++] = rgba[a + 1];
    rgb[b++] = rgba[a + 2];
  }
  canvas.width = canvas.height = 1;
  return rgb;
}
export async function identifyPhotos(
  files: File[],
  signal: AbortSignal,
  progress: (message: string) => void,
) {
  const pending = files.filter((file) => !known.has(file));
  if (!pending.length)
    return rankPhotos(files.map((file) => known.get(file) || []));
  signal.throwIfAborted();
  progress(
    trText(
      "Fotoğraflar cihazında inceleniyor. İlk analizde model dosyaları indiriliyor…",
    ),
  );
  const worker = new Worker(
    "/identification/assets/litert-2.6.0/worker.js?v=plants-2",
  );
  const stopped = () => new DOMException(trText("İptal edildi."), "AbortError");
  let fail: ((reason: Error) => void) | undefined;
  const abort = () => {
    worker.terminate();
    fail?.(stopped());
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    for (let i = 0; i < pending.length; i += 4) {
      const batch = pending.slice(i, i + 4);
      const inputs: {
        full: Uint8Array<ArrayBuffer>;
        crop: Uint8Array<ArrayBuffer>;
        detail: Uint8Array<ArrayBuffer>;
      }[] = [];
      for (const file of batch) {
        signal.throwIfAborted();
        inputs.push(
          await withPhoto(file, (image) => ({
            full: pixels(image, 224, false),
            crop: pixels(image, 160, true),
            detail: pixels(image, 224, true),
          })),
        );
      }
      signal.throwIfAborted();
      const rows = await new Promise<Guess[][]>((resolve, reject) => {
        fail = reject;
        worker.onmessage = (
          event: MessageEvent<{
            error?: string;
            results?: Guess[][];
          }>,
        ) => {
          if (event.data.results?.length === batch.length)
            resolve(event.data.results);
          else
            reject(
              new Error(event.data.error || trText("Model yanıt vermedi.")),
            );
        };
        worker.onerror = (event) =>
          reject(new Error(event.message || trText("Model başlatılamadı.")));
        worker.onmessageerror = () =>
          reject(new Error(trText("Model yanıtı okunamadı.")));
        worker.postMessage(
          inputs,
          inputs.flatMap((x) => [
            x.full.buffer,
            x.crop.buffer,
            x.detail.buffer,
          ]),
        );
      });
      batch.forEach((file, index) => known.set(file, rows[index]));
    }
    return rankPhotos(files.map((file) => known.get(file) || []));
  } finally {
    signal.removeEventListener("abort", abort);
    worker.terminate();
  }
}
