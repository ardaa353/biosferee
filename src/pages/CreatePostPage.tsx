import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { CalendarDays, ChevronLeft, ChevronRight, CircleHelp, Flag, Heart, MapPin, Users, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import type { BioPost } from "@/lib/types";
import { cn, errorMessage, formatDate, seasonOf } from "@/lib/utils";
import { Avatar, buttonClass, inputClass, secondaryButton } from "./BioUI";

export default function PostCard({ post, compact = false }: { post: BioPost; compact?: boolean }) {
  const [slide, setSlide] = useState(0); 
  const [reporting, setReporting] = useState(false); 
  const [details, setDetails] = useState(""); 
  const [reason, setReason] = useState<"misleading" | "wrong_species" | "inappropriate" | "other">("wrong_species"); 
  const [message, setMessage] = useState("");
  
  const utils = trpc.useUtils(); 
  const like = trpc.biosfere.posts.toggleLike.useMutation({ onSuccess: () => utils.biosfere.posts.list.invalidate() });
  const report = trpc.biosfere.posts.report.useMutation({ 
    onSuccess: () => { 
      setReporting(false); 
      setDetails(""); 
      setMessage("Raporunuz moderasyon ekibine iletildi."); 
    } 
  });
  
  function submitReport(e: FormEvent) { 
    e.preventDefault(); 
    report.mutate({ postId: post.id, reason, details }); 
  }

  // Akıllı URL Bulucu: "Truva Atı" ile name alanına gizlediğimiz Cloudinary linkini okur.
  function getImageUrl(image: any) {
    if (!image) return "";
    
    // YENİ SİSTEM: URL'mizi name içine saklamıştık, oradaysa doğrudan onu kullan.
    if (image.name && image.name.startsWith("http")) {
      return image.name;
    }
    
    // ESKİ SİSTEM: Eğer veritabanında gerçekten eski tipte duran bir base64 veya url varsa onu kullan.
    if (image.contentBase64 && image.contentBase64.startsWith("http")) return image.contentBase64;
    if (image.contentBase64 && image.contentBase64.length > 100) { // 1x1 şeffaf değilse
      return `data:${image.contentType || 'image/jpeg'};base64,${image.contentBase64}`;
    }
    
    return image.url || "";
  }

  return (
    <article className="overflow-hidden border-b border-[#09352e]/15 pb-7" id={`gonderi-${post.id}`}>
      <header className="mb-4 flex items-center gap-3">
        <Link to={`/profil/${post.author.username}`}>
          <Avatar user={post.author} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link to={`/profil/${post.author.username}`} className="text-sm font-bold hover:underline">
            {post.author.firstName} {post.author.lastName}
          </Link>
          <p className="font-mono text-[11px] text-[#71807e]">@{post.author.username} · {post.author.reputation} itibar</p>
        </div>
        <button onClick={() => setReporting(true)} className="grid h-11 w-11 cursor-pointer place-items-center rounded-full text-[#71807e] transition hover:bg-[#a63f36]/10 hover:text-[#8d302a]" aria-label="Gönderiyi raporla">
          <Flag size={18} />
        </button>
      </header>

      {post.images.length > 0 && (
        <div className="group relative mb-5 aspect-[4/3] overflow-hidden rounded-xl bg-[#dfe7df] sm:aspect-[16/10]">
          <img 
            src={getImageUrl(post.images[slide])} 
            alt={post.commonName ?? "Türü bilinmeyen canlı gözlemi"} 
            className="h-full w-full object-cover" 
          />
          {post.images.length > 1 && (
            <>
              <button onClick={() => setSlide((slide - 1 + post.images.length) % post.images.length)} className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-[#f7f7f7]/90 opacity-100 shadow sm:opacity-0 sm:group-hover:opacity-100" aria-label="Önceki fotoğraf">
                <ChevronLeft />
              </button>
              <button onClick={() => setSlide((slide + 1) % post.images.length)} className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-[#f7f7f7]/90 opacity-100 shadow sm:opacity-0 sm:group-hover:opacity-100" aria-label="Sonraki fotoğraf">
                <ChevronRight />
              </button>
              <span className="absolute bottom-3 right-3 rounded-full bg-[#09352e]/85 px-2.5 py-1 font-mono text-[11px] text-white">
                {slide + 1}/{post.images.length}
              </span>
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            {post.status === "unknown" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#a96d15]/30 bg-[#f2e5c9] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase text-[#78500f]">
                <CircleHelp size={13} />Türü bilinmiyor
              </span>
            ) : (
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[.14em] text-[#007f24]">
                {post.kingdom} / doğrulanmış kayıt
              </span>
            )}
          </div>
          <Link to={`/gonderi/${post.id}`}>
            <h2 className="font-serif text-3xl leading-tight tracking-[-.6px] hover:underline">
              {post.status === "unknown" ? "Bu canlıyı tanıyor musun?" : post.commonName}
            </h2>
            {post.species && <p className="mt-0.5 font-serif text-lg italic text-[#50665d]">{post.species}</p>}
          </Link>
        </div>
        <button onClick={() => like.mutate({ postId: post.id })} disabled={like.isPending} className={cn("flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold transition", post.liked ? "border-[#a63f36]/25 bg-[#a63f36]/10 text-[#8d302a]" : "border-[#09352e]/20 hover:border-[#a63f36]/40")}>
          <Heart size={19} fill={post.liked ? "currentColor" : "none"} />
          {post.likeCount}
        </button>
      </div>

      {!compact && <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-[#354f43]">{post.description}</p>}
      
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] text-[#5f7169]">
        <span className="inline-flex items-center gap-1.5"><MapPin size={14} />{post.locality}, {post.city}</span>
        <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} />{formatDate(post.createdAt)} · {seasonOf(post.createdAt)}</span>
      </div>

      {post.collaborators.length > 0 && (
        <p className="mt-3 flex items-center gap-2 text-xs text-[#5f7169]">
          <Users size={15} />Ortak çalışma: {post.collaborators.map((c) => `${c.firstName} ${c.lastName}`).join(", ")}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <Link to={`/gonderi/${post.id}`} className={secondaryButton}>
          {post.status === "unknown" ? "Türü şu olabilir" : "Gözlemi aç"}
        </Link>
      </div>
      
      {message && <p className="mt-3 text-sm text-[#007f24]">{message}</p>}
      
      {reporting && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#09352e]/55 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setReporting(false); }}>
          <form onSubmit={submitReport} className="w-full max-w-md rounded-2xl bg-[#f7f7f7] p-6 shadow-2xl" role="dialog" aria-modal="true" aria-label="Gönderiyi raporla">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-serif text-2xl">İçeriği raporla</h3>
              <button type="button" onClick={() => setReporting(false)} className="grid h-10 w-10 place-items-center rounded-full hover:bg-[#85c093]/20" aria-label="Kapat">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <label className="block text-sm font-semibold">Rapor nedeni
                <select className={`${inputClass} mt-2`} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
                  <option value="wrong_species">Yanlış tür bilgisi</option>
                  <option value="misleading">Yanıltıcı içerik</option>
                  <option value="inappropriate">Uygunsuz içerik</option>
                  <option value="other">Diğer</option>
                </select>
              </label>
              <label className="block text-sm font-semibold">Açıklama
                <textarea className={`${inputClass} mt-2 min-h-28`} value={details} onChange={(e) => setDetails(e.target.value)} minLength={5} required placeholder="Moderasyon ekibinin inceleyebilmesi için ayrıntı verin." />
              </label>
              {report.error && <p className="text-sm text-[#8d302a]">{errorMessage(report.error)}</p>}
              <button className={`${buttonClass} w-full`} disabled={report.isPending}>Raporu gönder</button>
            </div>
          </form>
        </div>
      )}
    </article>
  );
}
