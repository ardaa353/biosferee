import { useEffect, useRef } from "react";
import { X } from "lucide-react";
export function PhotoThumb({ file, remove }: { file: File; remove: () => void }) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const element = image.current;
    if (!element) return;
    const url = URL.createObjectURL(file);
    element.src = url;
    return () => { element.removeAttribute("src"); URL.revokeObjectURL(url); };
  }, [file]);
  return <div className="relative aspect-square overflow-hidden rounded-lg bg-[#eaf0e8]">
    <img ref={image} alt={file.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
    <button type="button" onClick={remove} className="absolute right-1 top-1 grid h-10 w-10 place-items-center rounded-full bg-white/90" aria-label={file.name + " fotoğrafını kaldır"}><X size={16} /></button>
  </div>;
}
