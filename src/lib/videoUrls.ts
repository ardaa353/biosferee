import { isVideoUrl } from "@contracts/media";
export function videoPoster(url: string, width = 720) {
  if (!/https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/v\d+\//.test(url))
    return "";
  return url
    .replace("/video/upload/", `/video/upload/so_0,c_limit,w_${width},q_auto/`)
    .replace(/\.[^/.?]+(?:\?.*)?$/, ".jpg");
}
export function videoSource(url: string) {
  if (!/https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/v\d+\//.test(url))
    return url;
  return url
    .replace(
      "/video/upload/",
      "/video/upload/c_limit,w_1080,q_auto,vc_h264,ac_aac/",
    )
    .replace(/\.[^/.?]+(?:\?.*)?$/, ".mp4");
}
export function mediaThumbnail(url: string, width = 480) {
  return isVideoUrl(url) ? videoPoster(url, width) : url;
}
