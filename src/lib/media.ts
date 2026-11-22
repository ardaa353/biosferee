import { t as trText } from "@/lib/i18n";
import { isVideoFile, mediaContentType } from "@contracts/media";
import { photoAccept, preparePhoto } from "./photos";
export { isVideoFile, isVideoUrl } from "@contracts/media";
export const mediaAccept =
  photoAccept + ",video/*,.mp4,.mov,.m4v,.webm,.mkv,.avi,.3gp";
export function prepareMedia(file: File) {
  if (!isVideoFile(file)) return preparePhoto(file);
  if (!file.size) throw new Error(trText("Video dosyası boş."));
  return Promise.resolve(
    file.type
      ? file
      : new File([file], file.name, {
          type: mediaContentType(file.name),
          lastModified: file.lastModified,
        }),
  );
}
const frames = new WeakMap<File, File[]>();
function mediaEvent(
  video: HTMLVideoElement,
  name: string,
  signal: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(name, ready);
      video.removeEventListener("error", failed);
      signal.removeEventListener("abort", stopped);
    };
    const ready = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(
        new Error(
          trText(
            "Bu videonun görüntüsü tarayıcıda okunamadı. MP4/H.264 biçimini deneyebilirsin.",
          ),
        ),
      );
    };
    const stopped = () => {
      cleanup();
      reject(
        signal.reason || new DOMException(trText("İptal edildi"), "AbortError"),
      );
    };
    const timer = setTimeout(failed, 20000);
    video.addEventListener(name, ready, { once: true });
    video.addEventListener("error", failed, { once: true });
    signal.addEventListener("abort", stopped, { once: true });
    if (signal.aborted) stopped();
  });
}
export async function extractVideoFrames(
  file: File,
  signal: AbortSignal,
): Promise<File[]> {
  signal.throwIfAborted();
  const cached = frames.get(file);
  if (cached) return cached;
  const video = document.createElement("video"),
    url = URL.createObjectURL(file);
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    const ready = mediaEvent(video, "loadedmetadata", signal);
    video.src = url;
    video.load();
    await ready;
    if (
      !Number.isFinite(video.duration) ||
      video.duration <= 0 ||
      !video.videoWidth ||
      !video.videoHeight
    )
      throw new Error(trText("Videonun süresi veya görüntüsü okunamadı."));
    const canvas = document.createElement("canvas");
    const scale = Math.min(
      1,
      1024 / Math.max(video.videoWidth, video.videoHeight),
    );
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error(trText("Video kareleri hazırlanamadı."));
    const result: File[] = [];
    for (const fraction of [0.08, 0.35, 0.65, 0.9]) {
      signal.throwIfAborted();
      const seeked = mediaEvent(video, "seeked", signal);
      video.currentTime = Math.min(
        video.duration - 0.001,
        Math.max(0.001, video.duration * fraction),
      );
      await seeked;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.88),
      );
      signal.throwIfAborted();
      if (!blob) throw new Error(trText("Video karesi oluşturulamadı."));
      result.push(
        new File([blob], file.name + "-kare-" + (result.length + 1) + ".jpg", {
          type: "image/jpeg",
        }),
      );
    }
    frames.set(file, result);
    return result;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
export async function identificationFrames(
  files: File[],
  signal: AbortSignal,
  progress: (message: string) => void,
) {
  const result: File[] = [];
  for (const file of files) {
    if (isVideoFile(file)) {
      progress(
        trText(
          "Videonun farklı anlarından tür analizi için kareler hazırlanıyor…",
        ),
      );
      result.push(...(await extractVideoFrames(file, signal)));
    } else result.push(file);
  }
  return result;
}
export async function uploadVideo(
  file: File,
  signed: {
    url: string;
    fields: Record<string, string>;
  },
  progress: (message: string) => void,
  signal?: AbortSignal,
) {
  const chunkSize = 6000000,
    uploadId = crypto.randomUUID();
  let result: {
    secure_url?: string;
    height?: number;
    error?: {
      message?: string;
    };
  } = {};
  for (let start = 0; start < file.size; start += chunkSize) {
    signal?.throwIfAborted();
    const end = Math.min(file.size, start + chunkSize);
    const body = new FormData();
    for (const [key, value] of Object.entries(signed.fields))
      body.append(key, value);
    body.append("file", file.slice(start, end), file.name);
    progress(
      trText("Video yükleniyor · %") + Math.round((start / file.size) * 100),
    );
    const timeout = AbortSignal.timeout(120000);
    const response = await fetch(signed.url, {
      method: "POST",
      body,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: {
        "X-Unique-Upload-Id": uploadId,
        "Content-Range": `bytes ${start}-${end - 1}/${file.size}`,
      },
    });
    result = await response.json();
    if (!response.ok)
      throw new Error(
        result.error?.message ||
          trText("Video yüklenemedi. Bağlantını kontrol edip yeniden dene."),
      );
  }
  if (!result.secure_url || !result.height)
    throw new Error(
      trText("Video yüklemesi tamamlanamadı veya dosyada görüntü bulunmuyor."),
    );
  return {
    name: file.name,
    contentType: file.type || mediaContentType(file.name),
    contentBase64: result.secure_url,
  };
}
