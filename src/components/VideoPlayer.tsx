import { t as trText } from "@/lib/i18n";
import { useEffect, useId, useRef, useState } from "react";
import {
  LoaderCircle,
  Maximize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { videoPoster, videoSource } from "@/lib/videoUrls";
function clock(seconds: number) {
  return (
    Math.floor(seconds / 60) +
    ":" +
    String(Math.floor(seconds % 60)).padStart(2, "0")
  );
}
export default function VideoPlayer({
  url,
  label,
}: {
  url: string;
  label: string;
}) {
  const video = useRef<HTMLVideoElement>(null),
    container = useRef<HTMLDivElement>(null);
  const id = useId();
  const userPaused = useRef(false),
    savedPosition = useRef(0),
    lastPaint = useRef(0);
  const [nearby, setNearby] = useState(false),
    [playing, setPlaying] = useState(false),
    [muted, setMuted] = useState(true);
  const [buffering, setBuffering] = useState(true);
  const [original, setOriginal] = useState(false),
    [failed, setFailed] = useState(false),
    [duration, setDuration] = useState(0),
    [position, setPosition] = useState(0);
  useEffect(() => {
    const element = video.current;
    if (!element || !container.current) return;
    let visible = false;
    if (!nearby) {
      element.pause();
      element.removeAttribute("src");
      element.load();
    } else setFailed(false);
    const playIfVisible = () => {
      const reducedMotion = matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const saveData = (
        navigator as Navigator & {
          connection?: {
            saveData?: boolean;
          };
        }
      ).connection?.saveData;
      if (
        nearby &&
        visible &&
        !document.hidden &&
        !userPaused.current &&
        !reducedMotion &&
        !saveData
      )
        void element.play().catch(() => {});
      else element.pause();
    };
    const loadObserver = new IntersectionObserver(
      (entries) => {
        setNearby(entries[0].isIntersecting);
      },
      { rootMargin: "400px" },
    );
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0].intersectionRatio >= 0.6;
        playIfVisible();
      },
      { threshold: [0, 0.6] },
    );
    loadObserver.observe(container.current);
    observer.observe(container.current);
    const otherPlayer = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) element.pause();
    };
    document.addEventListener("visibilitychange", playIfVisible);
    window.addEventListener("biosfere-video-start", otherPlayer);
    const ready = () => playIfVisible();
    element.addEventListener("canplay", ready);
    element.addEventListener("loadedmetadata", ready);
    return () => {
      loadObserver.disconnect();
      observer.disconnect();
      if (element.currentTime > 0) savedPosition.current = element.currentTime;
      element.pause();
      element.removeEventListener("canplay", ready);
      element.removeEventListener("loadedmetadata", ready);
      document.removeEventListener("visibilitychange", playIfVisible);
      window.removeEventListener("biosfere-video-start", otherPlayer);
    };
  }, [url, nearby, id]);
  async function toggle() {
    if (!video.current) return;
    if (video.current.paused) {
      setNearby(true);
      if (!video.current.getAttribute("src"))
        video.current.src = original ? url : videoSource(url);
      userPaused.current = false;
      try {
        await video.current.play();
      } catch {
        setPlaying(false);
      }
    } else {
      userPaused.current = true;
      video.current.pause();
    }
  }
  async function fullscreen() {
    const element = video.current as
      | (HTMLVideoElement & {
          webkitEnterFullscreen?: () => void;
        })
      | null;
    try {
      if (container.current?.requestFullscreen)
        await container.current.requestFullscreen();
      else element?.webkitEnterFullscreen?.();
    } catch {
      /* Playback remains available inline. */
    }
  }
  return (
    <div
      ref={container}
      className="relative h-full w-full bg-[#0a120f] text-white"
      aria-label={label + trText(" · Video")}
    >
      <video
        ref={video}
        src={nearby ? (original ? url : videoSource(url)) : undefined}
        poster={nearby ? videoPoster(url) : undefined}
        muted={muted}
        playsInline
        loop
        preload={nearby ? "metadata" : "none"}
        className="h-full max-h-[80dvh] w-full object-contain"
        aria-label={label}
        onClick={() => void toggle()}
        onLoadedMetadata={(event) => {
          const element = event.currentTarget;
          const length = Number.isFinite(element.duration)
            ? element.duration
            : 0;
          setDuration(length);
          if (savedPosition.current > 0.25 && length > 0.25)
            element.currentTime = Math.min(savedPosition.current, length - 0.1);
        }}
        onTimeUpdate={(event) => {
          const element = event.currentTarget;
          if (element.paused || performance.now() - lastPaint.current < 250)
            return;
          lastPaint.current = performance.now();
          savedPosition.current = element.currentTime;
          setPosition(element.currentTime);
        }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onPlay={() => {
          setPlaying(true);
          window.dispatchEvent(
            new CustomEvent("biosfere-video-start", { detail: id }),
          );
        }}
        onPause={(event) => {
          setPlaying(false);
          if (event.currentTarget.currentTime > 0)
            savedPosition.current = event.currentTarget.currentTime;
        }}
        onError={() => {
          if (!original && videoSource(url) !== url) setOriginal(true);
          else setFailed(true);
        }}
      />
      {playing && buffering && !failed && (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 grid place-items-center"
        >
          <LoaderCircle className="animate-spin" size={30} />
          <span className="sr-only">{trText("Video yükleniyor")}</span>
        </div>
      )}
      {!playing && !failed && (
        <button
          type="button"
          className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/55"
          aria-label={trText("Videoyu oynat")}
          onClick={() => void toggle()}
        >
          <Play size={28} fill="currentColor" />
        </button>
      )}
      {failed && (
        <p
          role="status"
          className="absolute inset-0 grid place-items-center px-5 text-center text-sm"
        >
          {trText("Video şu anda oynatılamadı.")}{" "}
          <a href={url} target="_blank" rel="noreferrer" className="underline">
            {trText("Videoyu aç")}
          </a>
        </p>
      )}
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-1 bg-gradient-to-t from-black/85 to-transparent px-2 pb-2 pt-8">
        <button
          type="button"
          className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/15"
          onClick={() => void toggle()}
          aria-label={playing ? "Videoyu duraklat" : trText("Videoyu oynat")}
        >
          {playing ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <input
          aria-label={trText("Video konumu")}
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={Math.min(position, duration || 1)}
          className="min-w-12 flex-1 accent-white"
          onChange={(event) => {
            const next = Number(event.target.value);
            savedPosition.current = next;
            setPosition(next);
            if (video.current) video.current.currentTime = next;
          }}
        />
        <span className="text-xs tabular-nums">
          {clock(position)} / {clock(duration)}
        </span>
        <button
          type="button"
          className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/15"
          aria-label={muted ? trText("Sesi aç") : trText("Sesi kapat")}
          onClick={() => setMuted((value) => !value)}
        >
          {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
        <button
          type="button"
          className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/15"
          aria-label={trText("Tam ekran video")}
          onClick={() => void fullscreen()}
        >
          <Maximize size={19} />
        </button>
      </div>
    </div>
  );
}
