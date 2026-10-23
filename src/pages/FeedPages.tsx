import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowDownUp, Plus } from "lucide-react";
import { trpc } from "@/providers/trpc";
import PostCard from "@/components/PostCard";
import { Empty, Loading, PageHeading, buttonClass } from "@/components/BioUI";

export function FeedPage() {
  const query = trpc.biosfere.posts.list.useQuery(); const [sort, setSort] = useState<"reputation" | "newest">("reputation"); const [kingdom, setKingdom] = useState("all");
  const posts = useMemo(() => (query.data ?? []).filter((p) => p.status === "verified" && (kingdom === "all" || p.kingdom === kingdom)).sort((a, b) => sort === "newest" ? b.createdAt.getTime() - a.createdAt.getTime() : b.author.reputation - a.author.reputation || b.createdAt.getTime() - a.createdAt.getTime()), [query.data, sort, kingdom]);
  return <div className="mx-auto max-w-3xl"><PageHeading eyebrow="Takipsiz açık bilim akışı" title="Canlı gözlemleri" description="Herkesin kayıtları tek akışta. Yazarın toplam beğeni itibarı, yeni gözlemlerin görünürlüğünü artırır." action={<Link to="/paylas" className={buttonClass}><Plus size={17} />Gözlem paylaş</Link>} /><div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex flex-wrap gap-2">{["all", "Animalia", "Plantae", "Fungi", "Bacteria", "Protista", "Archaea"].map((k) => <button key={k} onClick={() => setKingdom(k)} className={`min-h-10 cursor-pointer rounded-full border px-3.5 text-xs font-semibold transition ${kingdom === k ? "border-[#09352e] bg-[#09352e] text-white" : "border-[#09352e]/20 hover:border-[#007f24]"}`}>{k === "all" ? "Tümü" : k}</button>)}</div><button onClick={() => setSort(sort === "reputation" ? "newest" : "reputation")} className="flex min-h-10 shrink-0 cursor-pointer items-center gap-2 font-mono text-[11px] font-semibold text-[#50665d]"><ArrowDownUp size={15} />{sort === "reputation" ? "İtibar sıralı" : "En yeni"}</button></div>{query.isLoading ? <Loading /> : posts.length ? <div className="space-y-9">{posts.map((p) => <PostCard key={p.id} post={p} />)}</div> : <Empty title="Henüz doğrulanmış gözlem yok" text="BioSfere’nin ilk canlı kaydını sen oluştur. Fotoğraf, konum ve taksonomi bilgileriyle yeni bir gözlem paylaş." action={<Link to="/paylas" className={buttonClass}>İlk gözlemi paylaş</Link>} />}</div>;
}

export function UnknownPage() {
  const query = trpc.biosfere.posts.list.useQuery(); const posts = (query.data ?? []).filter((p) => p.status === "unknown");
  return <div className="mx-auto max-w-3xl"><PageHeading eyebrow="Topluluk tanımlama alanı" title="Türü bilinmeyenler" description="Taksonomi önerilerini karşılaştır. Moderatör onayından geçen tür, gönderiyi doğrulanmış akışa ve sistematik şemaya taşır." action={<Link to="/paylas?bilinmiyor=1" className={buttonClass}><Plus size={17} />Bilinmeyen yükle</Link>} />{query.isLoading ? <Loading /> : posts.length ? <div className="space-y-9">{posts.map((p) => <PostCard key={p.id} post={p} />)}</div> : <Empty title="Bekleyen bilinmeyen tür yok" text="Tanımlanmayı bekleyen tüm gözlemler tamamlandı. Yeni bir canlının türünden emin değilsen ‘Türü bilinmiyor’ seçeneğiyle paylaşabilirsin." />}</div>;
}
