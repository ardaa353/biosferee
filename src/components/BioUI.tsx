import { AlertCircle, Leaf, LoaderCircle, RefreshCw, SearchX } from "lucide-react";
import { Link } from "react-router";
import { useState, type ReactNode } from "react";
import { photoUrl } from "@/lib/photoUrls";

export function Logo({ compact = false }: { compact?: boolean }) {
  return <Link to="/akis" className="inline-flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09352e]">
    <span className="grid h-10 w-10 place-items-center rounded-full border border-[#09352e]/25 bg-[#f7f7f7]/45"><Leaf size={21} strokeWidth={1.8} className="text-[#123c30]" /></span>
    {!compact && <span className="font-serif text-[28px] font-semibold tracking-[-1.2px]">Bio<span className="italic">Sfere</span></span>}
  </Link>;
}
export function Avatar({ user, size = "md" }: { user?: { firstName: string; lastName: string; avatarUrl?: string; avatarKey?: string | null }; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "h-24 w-24 text-2xl" : size === "sm" ? "h-8 w-8 text-xs" : "h-11 w-11 text-sm";
  const url = user?.avatarUrl || user?.avatarKey || undefined;
  const [failedUrl, setFailedUrl] = useState("");
  return <span className={`${cls} inline-grid shrink-0 place-items-center overflow-hidden rounded-full border border-[#09352e]/15 bg-[#d4e3d5] font-mono font-semibold text-[#09352e]`}>
    {url && failedUrl !== url ? <img src={photoUrl(url, size === "lg" ? 240 : 96)} alt="" loading="lazy" decoding="async" onError={event => { if (event.currentTarget.src !== url) {event.currentTarget.srcset = ""; event.currentTarget.src = url;} else setFailedUrl(url); }} className="h-full w-full object-cover" /> : user ? `${user.firstName[0] || ""}${user.lastName[0] || ""}` : <Leaf size={18} />}
  </span>;
}
export function Loading({ label = "Kayıtlar getiriliyor…" }: { label?: string }) { return <div role="status" className="flex min-h-48 items-center justify-center gap-3 text-sm text-[#50665d]"><LoaderCircle className="animate-spin motion-reduce:animate-none" size={19} />{label}</div>; }
export function QueryError({retry, text = "Kayıtlar şu anda getirilemedi. Bağlantını kontrol edip yeniden deneyebilirsin."}: {retry: () => unknown; text?: string}) {
  return <div role="alert" className="rounded-2xl border border-[#a63f36]/20 bg-white p-7 text-center"><AlertCircle size={28} className="mx-auto text-[#a63f36]" /><h2 className="mt-3 font-serif text-2xl">Bağlantı tamamlanamadı</h2><p className="mx-auto mt-2 max-w-md text-sm text-[#53675f]">{text}</p><button type="button" onClick={() => void retry()} className={secondaryButton + " mt-5"}><RefreshCw size={16} />Yeniden dene</button></div>;
}
export function FeedSkeleton() {
  return <div role="status" aria-label="Gözlemler yükleniyor" className="space-y-6">{[0, 1].map(i => <div key={i} aria-hidden="true" className="animate-pulse motion-reduce:animate-none rounded-2xl border border-[#09352e]/10 bg-white p-5"><div className="mb-5 flex items-center gap-3"><div className="h-11 w-11 rounded-full bg-[#e5ece6]" /><div className="h-4 w-40 rounded bg-[#e5ece6]" /></div><div className="aspect-[16/10] rounded-xl bg-[#e5ece6]" /><div className="mt-5 h-6 w-2/3 rounded bg-[#e5ece6]" /></div>)}</div>;
}
export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="border-y border-[#09352e]/15 py-14 text-center"><SearchX className="mx-auto mb-4 text-[#71807e]" strokeWidth={1.4} size={34} /><h3 className="font-serif text-2xl">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#5f7169]">{text}</p>{action && <div className="mt-5">{action}</div>}</div>;
}
export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 border-b border-[#09352e]/10 pb-7 md:flex-row md:items-end"><div className="min-w-0"><p className="mb-2 text-xs font-semibold uppercase tracking-[.14em] text-[#007f24]">{eyebrow}</p><h1 className="text-balance font-serif text-4xl leading-tight tracking-[-1.2px] md:text-5xl">{title}</h1><p className="mt-3 max-w-2xl text-base leading-7 text-[#53675f]">{description}</p></div>{action && <div className="shrink-0">{action}</div>}</div>;
}
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-sm font-semibold"><span className="mb-1.5 block text-[#40574c]">{label}</span>{children}</label>; }
export const inputClass = "min-h-12 w-full rounded-xl border border-[#09352e]/20 bg-white px-3.5 py-2.5 text-base text-[#09352e] outline-none transition placeholder:text-[#70837a] hover:border-[#007f24]/50 focus:border-[#007f24] focus:ring-2 focus:ring-[#007f24]/15";
export const buttonClass = "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-[#007f24] bg-[#007f24] px-5 py-2.5 text-sm font-semibold text-[#f7f7f7] transition hover:bg-[#096b29] active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007f24] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButton = "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-[#09352e]/25 bg-transparent px-5 py-2.5 text-sm font-semibold text-[#09352e] transition hover:border-[#007f24] hover:bg-[#85c093]/15 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007f24] disabled:opacity-50";
