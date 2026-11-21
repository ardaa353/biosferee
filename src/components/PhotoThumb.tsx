import {isVideoFile} from "@contracts/media";
import {useEffect, useState} from "react";
import {Play, X} from "lucide-react";
export function PhotoThumb({file, remove}: {file: File; remove: () => void}) {
  const [url, setUrl] = useState("");
  useEffect(() => {const source = URL.createObjectURL(file); setUrl(source); return () => URL.revokeObjectURL(source);}, [file]);
  return <div className="relative aspect-square overflow-hidden rounded-lg bg-[#eaf0e8]">
    {isVideoFile(file) ? <><video src={url} muted playsInline preload="metadata" aria-label={file.name} className="h-full w-full object-cover" /><Play className="absolute bottom-2 left-2 text-white drop-shadow" size={21} /></> : <img src={url || undefined} alt={file.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />}
    <button type="button" onClick={remove} className="absolute right-1 top-1 grid h-10 w-10 place-items-center rounded-full bg-white/90" aria-label={file.name + " dosyasını kaldır"}><X size={16} /></button>
  </div>;
}
