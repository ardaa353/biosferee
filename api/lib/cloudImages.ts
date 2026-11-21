import { createHash } from "node:crypto";

export const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME || "whjqcubr";

export function isCloudinaryImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === "https://res.cloudinary.com" && !url.username && !url.password &&
      url.pathname.startsWith("/" + cloudName + "/image/upload/");
  } catch { return false; }
}

export async function destroyCloudImage(url: string): Promise<void> {
  if (!isCloudinaryImageUrl(url)) return;
  const key = process.env.CLOUDINARY_API_KEY, secret = process.env.CLOUDINARY_API_SECRET;
  if (!key || !secret) throw new Error("Cloudinary silme ayarları eksik.");
  const suffix = new URL(url).pathname.slice(("/" + cloudName + "/image/upload/").length);
  const version = /(?:^|\/)v\d+\//.exec(suffix);
  const assetPath = version ? suffix.slice(version.index + version[0].length) : suffix;
  const publicId = decodeURIComponent(assetPath.replace(/\.[^/.]+$/, ""));
  if (!publicId) throw new Error("Fotoğrafın bulut kimliği çözülemedi.");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHash("sha256").update("invalidate=true&public_id=" + publicId + "&timestamp=" + timestamp + secret).digest("hex");
  const response = await fetch("https://api.cloudinary.com/v1_1/" + encodeURIComponent(cloudName) + "/image/destroy", {
    method: "POST", body: new URLSearchParams({ public_id: publicId, timestamp, signature, api_key: key, invalidate: "true" }),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json().catch(() => ({})) as { result?: string };
  if (!response.ok || !["ok", "not found"].includes(result.result || "")) {
    throw new Error("Cloudinary silme işlemini doğrulamadı (" + response.status + ").");
  }
}
