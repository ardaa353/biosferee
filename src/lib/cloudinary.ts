import { preparePhoto } from "./photos";

const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
export type UploadedPhoto = { name: string; contentType: string; contentBase64: string };
const completed = new WeakMap<File, Promise<UploadedPhoto>>();

async function upload(file: File): Promise<UploadedPhoto> {
  if (!cloudName || !preset) throw new Error("Fotoğraf deposunun yükleme ayarları eksik.");
  let current = file;
  for (const [i, edge] of [3840, 2560, 1600, 960, 600].entries()) {
    if (i) current = await preparePhoto(file, edge, Math.max(48_000, Math.min(7_500_000, file.size) / 3 ** i));
    const body = new FormData();
    body.append("file", current);
    body.append("upload_preset", preset);
    body.append("folder", "biosfere/posts");
    const response = await fetch("https://api.cloudinary.com/v1_1/" + encodeURIComponent(cloudName) + "/image/upload", { method: "POST", body });
    const result = await response.json().catch(() => ({}));
    if (response.ok && typeof result.secure_url === "string") {
      return { name: current.name, contentType: current.type, contentBase64: result.secure_url };
    }
    const message = result.error?.message || "";
    if (response.status === 413 || /file size too large|maximum file size|file size exceeds|too many megapixels|pixel limit|too large/i.test(message)) continue;
    throw new Error(message || "Fotoğraf yüklenemedi. Bağlantını kontrol edip tekrar deneyebilirsin.");
  }
  throw new Error("Depolama sağlayıcısı küçültülen fotoğrafı da kabul etmedi. Yükleme ön ayarını kontrol edin.");
}

export function uploadPreparedPhoto(file: File): Promise<UploadedPhoto> {
  const previous = completed.get(file);
  if (previous) return previous;
  const pending = upload(file).catch(error => { completed.delete(file); throw error; });
  completed.set(file, pending);
  return pending;
}
