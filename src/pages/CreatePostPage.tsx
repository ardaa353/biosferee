import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowUpRight, MapPin, Search } from "lucide-react";
import { trpc } from "@/providers/trpc";
import BioMap from "@/components/BioMap";
import { Avatar, Empty, Loading, PageHeading, inputClass } from "@/components/BioUI";
import type { BioPost } from "@/lib/types";

// ==========================================
// 1. HARİTA SAYFASI (MapPage)
// ==========================================
export function MapPage() {
  const query = trpc.biosfere.posts.list.useQuery();
  const [filter, setFilter] = useState("all");
  
  const posts = (query.data ?? []).filter((p) => {
    if (p.status === "removed") return false;
    if (filter === "all") return true;
    if (filter === "unknown") return p.status === "unknown";
    return p.kingdom === filter;
  });

  const filterOptions = ["all", "Animalia", "Plantae", "Fungi", "Bacteria", "Protista", "unknown"];

  return (
    <div>
      <PageHeading 
        eyebrow="Koordinatlı açık kayıtlar" 
        title="Ortak canlı haritası" 
        description="Her nokta gerçek bir kullanıcı gözlemini gösterir. Noktaya dokunarak türü, lokali ve gönderi bağlantısını açabilirsiniz." 
      />
      
      <div className="mb-4 flex flex-wrap gap-2">
        {filterOptions.map((f) => (
          <button 
            key={f} 
            onClick={() => setFilter(f)} 
            className={`min-h-10 cursor-pointer rounded-full border px-4 text-xs font-semibold ${
              filter === f 
                ? "border-[#09352e] bg-[#09352e] text-white" 
                : "border-[#09352e]/20 hover:border-[#007f24]"
            }`}
          >
            {f === "all" ? "Tümü" : f === "unknown" ? "Bilinmeyenler" : f}
          </button>
        ))}
      </div>
      
      {query.isLoading ? (
        <Loading />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#09352e]/15">
          <BioMap posts={posts} />
        </div>
      )}
      <p className="mt-3 font-mono text-[11px] text-[#71807e]">
        {posts.length} gözlem noktası gösteriliyor · Harita altlığı Esri / OpenStreetMap katkıcıları
      </p>
    </div>
  );
}

// ==========================================
// 2. ARAMA SAYFASI (SearchPage)
// ==========================================
export function SearchPage() {
  const postsQuery = trpc.biosfere.posts.list.useQuery();
  const usersQuery = trpc.biosfere.users.list.useQuery();
  
  const [term, setTerm] = useState("");
  const [mode, setMode] = useState<"all" | "city">("all");
  
  const results = useMemo(() => {
    const q = term.trim().toLocaleLowerCase("tr-TR");
    const posts = (postsQuery.data ?? []).filter((p) => p.status === "verified");
    
    if (!q) return [];
    
    if (mode === "city") {
      const matching = posts.filter((p) => p.city.toLocaleLowerCase("tr-TR").includes(q));
      const counts = new Map<string, number>();
      
      posts.forEach((p) => p.species && counts.set(p.species, (counts.get(p.species) ?? 0) + 1));
      return matching.sort((a, b) => (counts.get(a.species ?? "") ?? 0) - (counts.get(b.species ?? "") ?? 0));
    }
    
    return posts.filter((p) => 
      [p.species, p.commonName, p.genus, p.family, p.city, p.author.username, p.author.firstName, p.author.lastName]
        .some((v) => v?.toLocaleLowerCase("tr-TR").includes(q))
    );
  }, [postsQuery.data, term, mode]);
  
  const matchingUsers = term && mode === "all" 
    ? (usersQuery.data ?? []).filter((u) => 
        `${u.firstName}${u.lastName} ${u.username}`.toLocaleLowerCase("tr-TR").includes(term.toLocaleLowerCase("tr-TR")) ) : [];  return ( <div className="mx-auto max-w-5xl"> <PageHeading eyebrow="Tür, cins, kişi ve şehir" title="Kayıtlarda keşfet" description="Şehir kipinde sonuçlar, türün platformdaki fotoğraf sayısına göre en az kayıtlı olandan en çok kayıtlı olana doğru sıralanır." />  <div className="relative"> <Search className="absolute left-4 top-4 text-[#007f24]" size={20} /> <input autoFocus className={`${inputClass} min-h-14 pl-12 pr-32 text-base`} 
          value={term} 
          onChange={(e) => setTerm(e.target.value)} 
          placeholder={mode === "city" ? "Şehir yazın: Giresun, Van…" : "Tür, cins, kişi veya konum yazın…"} 
        />
        <div className="absolute right-2 top-2 flex rounded-full bg-[#e4ebe3] p-1">
          <button 
            onClick={() => setMode("all")} 
            className={`min-
