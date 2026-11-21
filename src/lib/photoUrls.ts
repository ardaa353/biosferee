export function photoUrl(original: string, width: number): string {
  // Old posts can contain URLs from other stores or already signed transformations.
  if (!/^https:\/\/res\.cloudinary\.com\/[\w-]+\/image\/upload\/v\d+\//.test(original)) return original;
  return original.replace("/image/upload/", "/image/upload/c_limit,w_" + width + ",f_auto,q_auto/");
}

export function photoSources(original: string, widths: number[]): string | undefined {
  if (photoUrl(original, widths[0]) === original) return undefined;
  return widths.map((width) => photoUrl(original, width) + " " + width + "w").join(", ");
}
