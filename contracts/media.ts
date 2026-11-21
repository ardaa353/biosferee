export function isVideoUrl(url: string) {
  return (
    /\/video\/upload\//.test(url) ||
    /\.(mp4|mov|m4v|webm|mkv|avi|3gp)(?:\?|$)/i.test(url)
  );
}
export function isVideoFile(file: { name: string; type: string }) {
  return (
    file.type.startsWith("video/") ||
    /\.(mp4|mov|m4v|webm|mkv|avi|3gp)$/i.test(file.name)
  );
}
export function mediaContentType(name: string) {
  const extension = name.split(".").at(-1)?.toLowerCase();
  return (
    (
      {
        mp4: "video/mp4",
        m4v: "video/mp4",
        mov: "video/quicktime",
        webm: "video/webm",
        mkv: "video/x-matroska",
        avi: "video/x-msvideo",
        "3gp": "video/3gpp",
      } as Record<string, string>
    )[extension || ""] || "application/octet-stream"
  );
}
