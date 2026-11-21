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
  const suffix = new URL(url).pathname.split("/image/upload/")[1];
  const publicId = decodeURIComponent(suffix.replace(/^v\d+\//, "").replace(/\.[^/.]+$/, ""));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHash("sha256").update("public_id=" + publicId + "&timestamp=" + timestamp + secret).digest("hex");
  const response = await fetch("https://api.cloudinary.com/v1_1/" + encodeURIComponent(cloudName) + "/image/destroy", {
    method: "POST", body: new URLSearchParams({ public_id: publicId, timestamp, signature, api_key: key }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Cloudinary silme isteğini kabul etmedi (" + response.status + ").");
}
