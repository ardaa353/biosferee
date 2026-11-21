import { createHash } from "node:crypto";

function config() {
  let uri: URL | undefined;
  try { if (process.env.CLOUDINARY_URL) uri = new URL(process.env.CLOUDINARY_URL); } catch { /* Explicit settings may still be valid. */ }
  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME || uri?.hostname || "whjqcubr",
    apiKey: process.env.CLOUDINARY_API_KEY || (uri ? decodeURIComponent(uri.username) : ""),
    apiSecret: process.env.CLOUDINARY_API_SECRET || (uri ? decodeURIComponent(uri.password) : ""),
  };
}
export const cloudName = config().cloudName;
export function cloudinaryConfigured() { const c = config(); return Boolean(c.apiKey && c.apiSecret); }
export function requireCloudinary() {
  const c = config();
  if (!c.apiKey || !c.apiSecret) throw new Error("Cloudinary silme/yükleme anahtarları sunucuda eksik. Render Environment bölümüne CLOUDINARY_API_KEY ve CLOUDINARY_API_SECRET veya CLOUDINARY_URL ekleyin.");
  return c;
}
export function isCloudinaryImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === "https://res.cloudinary.com" && !url.username && !url.password && url.pathname.startsWith("/" + cloudName + "/image/upload/");
  } catch { return false; }
}
export function cloudPublicId(value: string) {
  if (!isCloudinaryImageUrl(value)) return null;
  const suffix = new URL(value).pathname.slice(("/" + cloudName + "/image/upload/").length);
  const version = /(?:^|\/)v\d+\//.exec(suffix);
  const path = version ? suffix.slice(version.index + version[0].length) : suffix;
  return decodeURIComponent(path.replace(/\.[^/.]+$/, ""));
}
export function cloudAssetUrl(publicId: string) {
  return "https://res.cloudinary.com/" + cloudName + "/image/upload/" + publicId.split("/").map(encodeURIComponent).join("/");
}
export function signCloudParameters(parameters: Record<string, string>) {
  const c = requireCloudinary();
  const signed = Object.keys(parameters).sort().map(key => key + "=" + parameters[key]).join("&");
  return createHash("sha256").update(signed + c.apiSecret).digest("hex");
}
export function signedImageUpload(publicId: string) {
  const c = requireCloudinary();
  const parameters = { public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)), overwrite: "true" };
  return { url: "https://api.cloudinary.com/v1_1/" + encodeURIComponent(c.cloudName) + "/image/upload", fields: { ...parameters, api_key: c.apiKey, signature: signCloudParameters(parameters) } };
}
export async function probeCloudinary() {
  const c = requireCloudinary();
  const response = await fetch("https://api.cloudinary.com/v1_1/" + encodeURIComponent(c.cloudName) + "/ping", {
    headers: { Authorization: "Basic " + Buffer.from(c.apiKey + ":" + c.apiSecret).toString("base64") }, signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Cloudinary anahtarları geçersiz veya bu bulut için yetkisiz." : "Cloudinary bağlantısı başarısız (HTTP " + response.status + ").");
}
async function cloudAdmin(path: string, init: RequestInit = {}) {
  const c = requireCloudinary();
  return fetch("https://api.cloudinary.com/v1_1/" + encodeURIComponent(c.cloudName) + path, {
    ...init, headers: {...init.headers, Authorization: "Basic " + Buffer.from(c.apiKey + ":" + c.apiSecret).toString("base64")}, signal: AbortSignal.timeout(20_000),
  });
}
// Destroy removes delivery files, but automatic backups retain storage and a placeholder.
// Keep the queue entry until those versions have also been removed successfully.
async function purgeDeletedBackups(publicId: string) {
  const details = await cloudAdmin("/resources/image/upload/" + encodeURIComponent(publicId) + "?versions=true");
  if (details.status === 404) return;
  if (!details.ok) throw new Error("Silinen fotoğrafın yedekleri kontrol edilemedi (HTTP " + details.status + ").");
  const resource = await details.json() as {asset_id?: string; placeholder?: boolean; backup?: boolean; versions?: {version_id?: string}[]};
  if (!resource.placeholder) throw new Error("Fotoğraf Cloudinary'de hâlâ etkin; silme yeniden denenecek.");
  const versions = (resource.versions || []).map(version => version.version_id).filter((id): id is string => Boolean(id));
  if (!versions.length) {
    if (resource.backup) throw new Error("Cloudinary yedek sürümlerini henüz listelemedi; silme yeniden denenecek.");
    return;
  }
  if (!resource.asset_id) throw new Error("Silinen fotoğrafın yedek kimliği alınamadı.");
  const parameters = new URLSearchParams();
  for (const id of versions) parameters.append("version_ids[]", id);
  const removed = await cloudAdmin("/resources/backup/" + encodeURIComponent(resource.asset_id), {method: "DELETE", body: parameters});
  if (!removed.ok) throw new Error("Fotoğraf silindi ancak yedekleri temizlenemedi (HTTP " + removed.status + ").");
}
export async function deleteExistingBackup(url: string) {
  const publicId = cloudPublicId(url);
  if (!publicId) throw new Error("Geçersiz Cloudinary fotoğrafı.");
  // This path never destroys an active original, even if restored after the list was opened.
  await purgeDeletedBackups(publicId);
}
export async function deletedCloudImageUrls(cursor?: string) {
  const response = await cloudAdmin("/resources/search", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({expression: "resource_type:image AND type:upload AND status:deleted", max_results: 100, ...(cursor ? {next_cursor: cursor} : {})})});
  if (!response.ok) throw new Error("Silinmiş Cloudinary yedekleri listelenemedi (HTTP " + response.status + ").");
  const result = await response.json() as {resources?: {public_id: string}[]; next_cursor?: string};
  return {urls: (result.resources || []).map(resource => cloudAssetUrl(resource.public_id)), cursor: result.next_cursor};
}
export async function destroyCloudImage(url: string): Promise<void> {
  const publicId = cloudPublicId(url);
  if (!publicId) throw new Error("Fotoğrafın Cloudinary kimliği çözülemedi.");
  const c = requireCloudinary();
  const parameters = { public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)), invalidate: "true" };
  const response = await fetch("https://api.cloudinary.com/v1_1/" + encodeURIComponent(c.cloudName) + "/image/destroy", {
    method: "POST", body: new URLSearchParams({ ...parameters, signature: signCloudParameters(parameters), api_key: c.apiKey }), signal: AbortSignal.timeout(12_000),
  });
  const result = await response.json().catch(() => ({})) as { result?: string };
  if (!response.ok || !["ok", "not found"].includes(result.result || "")) throw new Error(response.status === 401 || response.status === 403 ? "Cloudinary silme yetkisi reddedildi. Render'daki API anahtarlarını kontrol edin." : "Cloudinary silme işlemini doğrulamadı (HTTP " + response.status + ").");
  await purgeDeletedBackups(publicId);
}
