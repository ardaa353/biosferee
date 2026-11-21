import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { photoSources, photoUrl } from "@/lib/photoUrls";

function Picture({ url, alt, expanded = false, priority = false }: { url: string; alt: string; expanded?: boolean; priority?: boolean }) {
  const [failed, setFailed] = useState<"derivative" | "original" | null>(null);
  if (failed === "original") return <span className="self-center text-center text-sm" role="status">Fotoğraf yüklenemedi.</span>;
  const widths = expanded ? [800, 1280, 1920, 2560, 3840] : [400, 720, 1080, 1600];
  return <img alt={alt} draggable={false} decoding="async" loading={expanded || priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"}
    src={failed ? url : photoUrl(url, expanded ? 1920 : 720)}
    srcSet={failed ? undefined : photoSources(url, widths)}
    sizes={expanded ? "100vw" : "(max-width: 768px) 100vw, 760px"}
    className={expanded ? "gallery-full-photo" : "h-full w-full object-cover"}
    onError={() => setFailed(!failed && photoUrl(url, widths[0]) !== url ? "derivative" : "original")} />;
}

export default function PhotoGallery({ images, alt, priority = false }: { images: { url: string }[]; alt: string; priority?: boolean }) {
  const [slide, setSlide] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const count = images.length;
  const index = Math.min(slide, count - 1);
  const url = images[index]?.url;

  useEffect(() => {
    const element = dialog.current;
    if (!expanded || !element) return;
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    element.showModal();
    return () => {
      element.close();
      document.documentElement.style.overflow = previous;
      trigger.current?.focus({ preventScroll: true });
    };
  }, [expanded]);

  if (!url) return null;
  const move = (step: number) => setSlide((value) => (Math.min(value, count - 1) + step + count) % count);
  const controls = (full: boolean) => count > 1 && <>
    <button type="button" className={"gallery-arrow gallery-prev" + (full ? " large" : "")} aria-label="Önceki fotoğraf" onClick={() => move(-1)}><ChevronLeft /></button>
    <button type="button" className={"gallery-arrow gallery-next" + (full ? " large" : "")} aria-label="Sonraki fotoğraf" onClick={() => move(1)}><ChevronRight /></button>
    <span className="gallery-counter" aria-live={full ? "polite" : "off"}>{index + 1} / {count}</span>
  </>;
  return <div className="mb-5">
    <div className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-[#dfe7df] sm:aspect-[16/10]">
      <button type="button" ref={trigger} className="grid h-full w-full cursor-zoom-in" aria-label={alt + " · Fotoğrafı büyüt"} onClick={() => setExpanded(true)}>
        <Picture key={url} url={url} alt={alt} priority={priority} />
      </button>
      {controls(false)}
    </div>
    {expanded && createPortal(<dialog ref={dialog} className="photo-dialog" aria-label="Gözlem fotoğrafları"
      onCancel={(event) => { event.preventDefault(); setExpanded(false); }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          move(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}>
      <div className="gallery-stage" onClick={(event) => { if (event.target === event.currentTarget) setExpanded(false); }}
        onTouchStart={(event) => { touch.current = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null; }}
        onTouchCancel={() => { touch.current = null; }}
        onTouchEnd={(event) => {
          const start = touch.current;
          touch.current = null;
          if (!start || !event.changedTouches.length || event.touches.length || count < 2 || (window.visualViewport?.scale ?? 1) > 1) return;
          const dx = event.changedTouches[0].clientX - start.x;
          const dy = event.changedTouches[0].clientY - start.y;
          if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
        }}>
        <Picture key={url} url={url} alt={alt + " (" + (index + 1) + "/" + count + ")"} expanded />
      </div>
      <button type="button" autoFocus className="gallery-close" aria-label="Görüntüleyiciyi kapat" onClick={() => setExpanded(false)}><X /></button>
      {controls(true)}
    </dialog>, document.body)}
  </div>;
}
