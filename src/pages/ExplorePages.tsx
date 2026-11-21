import { photoUrl } from "@/lib/photoUrls";
import { lazy, Suspense, useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router";
import { MapPin, Search } from "lucide-react";
import { trpc } from "@/providers/trpc";
const BioMap = lazy(() => import("@/components/BioMap"));
import { validCoordinates } from "@/lib/geography";
import { buildTaxonomyTree } from "@/lib/taxonomyTree";
import { TaxonomyBranch } from "@/components/TaxonomyTree";
import { Avatar, Empty, Loading, PageHeading, QueryError, inputClass, secondaryButton } from "@/components/BioUI";


export function MapPage() {
  const query = trpc.biosfere.posts.list.useQuery();
  const [filter, setFilter] = useState("all");
  
  const posts = (query.data ?? []).filter((p) => {
    if (p.status === "removed" || !validCoordinates(p)) return false;
    if (filter === "all") return true;
    if (filter === "unknown") return p.status === "unknown";
    return p.kingdom === filter;
  });

  const filterOptions = ["all", "Animalia", "Plantae", "Fungi", "Bacteria", "Protista", "Archaea", "unknown"];

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
      
      {query.isError ? <QueryError retry={() => query.refetch()} /> : query.isLoading ? (
        <Loading />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#09352e]/15">
          <Suspense fallback={<Loading label="Harita açılıyor…" />}><BioMap posts={posts} /></Suspense>
        </div>
      )}
      <p className="mt-3 font-mono text-xs text-[#71807e]">
        {posts.length} gözlem noktası gösteriliyor · Harita altlığı Esri / OpenStreetMap katkıcıları
      </p>
    </div>
  );
}

export function SearchPage() {
  const [term, setTerm] = useState("");
  const deferredTerm = useDeferredValue(term.trim());
  const postsQuery = trpc.biosfere.posts.list.useQuery(undefined, {enabled: deferredTerm.length >= 2});
  const usersQuery = trpc.biosfere.users.list.useQuery(undefined, {enabled: deferredTerm.length >= 2});
  const [visible, setVisible] = useState(60);
  const [mode, setMode] = useState<"all" | "city">("all");
  
  const results = useMemo(() => {
    const q = deferredTerm.toLocaleLowerCase("tr-TR");
    const posts = (postsQuery.data ?? []).filter((p) => p.status === "verified");
    
    if (!q) return [];
    
    if (mode === "city") {
      const matching = posts.filter((p) => p.city.toLocaleLowerCase("tr-TR").includes(q));
      const counts = new Map<string, number>();
      
      posts.forEach((p) => p.species && counts.set(p.species, (counts.get(p.species) ?? 0) + p.images.length));
      return matching.sort((a, b) => (counts.get(a.species ?? "") ?? 0) - (counts.get(b.species ?? "") ?? 0));
    }
    
    return posts.filter((p) => 
      [p.species, p.commonName, p.genus, p.family, p.city, p.author.username, p.author.firstName, p.author.lastName]
        .some((v) => v?.toLocaleLowerCase("tr-TR").includes(q))
    );
  }, [postsQuery.data, deferredTerm, mode]);
  
  const matchingUsers = deferredTerm.length >= 2 && mode === "all" 
    ? (usersQuery.data ?? []).filter((u) => 
        `${u.firstName} ${u.lastName} ${u.username}`.toLocaleLowerCase("tr-TR").includes(deferredTerm.toLocaleLowerCase("tr-TR"))
      ) 
    : [];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeading 
        eyebrow="Tür, cins, kişi ve şehir" 
        title="Kayıtlarda keşfet" 
        description="Şehir kipinde sonuçlar, türün platformdaki fotoğraf sayısına göre en az kayıtlı olandan en çok kayıtlı olana doğru sıralanır." 
      />
      
      <div className="flex flex-col gap-3">
        <div className="relative"><Search className="absolute left-4 top-4 text-[#007f24]" size={20} />
        <input 
          aria-label="Tür, kişi veya konum ara" 
          className={`${inputClass} min-h-14 pl-12 text-base`} 
          value={term} 
          onChange={(e) => {setTerm(e.target.value); setVisible(60);}} 
          placeholder={mode === "city" ? "Şehir yazın: Giresun, Van…" : "Tür, cins, kişi veya konum yazın…"} 
        />
        </div><div role="group" aria-label="Arama yöntemi" className="flex w-fit max-w-full rounded-full bg-[#e4ebe3] p-1">
          <button 
            onClick={() => {setMode("all"); setVisible(60);}} 
            className={`min-h-10 rounded-full px-3 text-xs font-semibold ${mode === "all" ? "bg-[#09352e] text-white" : ""}`}
          >
            Genel
          </button>
          <button 
            onClick={() => {setMode("city"); setVisible(60);}} 
            className={`min-h-10 rounded-full px-3 text-xs font-semibold ${mode === "city" ? "bg-[#09352e] text-white" : ""}`}
          >
            Şehir / nadirlik
          </button>
        </div>
      </div>
      
      {deferredTerm.length < 2 ? (
        <div className="py-16 text-center">
          <p className="font-serif text-2xl">Ne arıyorsun?</p>
          <p className="mt-2 text-sm text-[#71807e]">Örneğin “Amanita”, “Felis” veya “Rize” ile başlayabilirsin.</p>
        </div>
      ) : postsQuery.isError || usersQuery.isError ? <QueryError retry={() => {void postsQuery.refetch(); void usersQuery.refetch();}} /> : postsQuery.isPending || usersQuery.isPending ? <Loading /> : (
        <div className="mt-8">
          {matchingUsers.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 font-serif text-2xl">Kullanıcılar</h2>
              <div className="flex flex-wrap gap-3">
                {matchingUsers.map((u) => (
                  <Link key={u.id} to={`/profil/${u.username}`} className="flex items-center gap-3 rounded-full border border-[#09352e]/15 py-2 pl-2 pr-5 hover:border-[#007f24]">
                    <Avatar user={u} size="sm" />
                    <span className="text-sm font-semibold">{u.firstName} {u.lastName}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-2xl">Gözlemler</h2>
            <span className="font-mono text-xs text-[#71807e]">{results.length} kayıt</span>
          </div>
          
          {results.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.slice(0, visible).map((p, i) => (
                <Link key={p.id} to={`/gonderi/${p.id}`} className="group overflow-hidden rounded-xl border border-[#09352e]/15 bg-[#fdfefb] transition hover:-translate-y-0.5 hover:border-[#007f24]/50">
                  {p.images[0] && (
                    <div className="aspect-[4/3] overflow-hidden">
                      <img loading="lazy" decoding="async" src={photoUrl(p.images[0].url, 480)} onError={e => { if (e.currentTarget.src !== p.images[0].url) e.currentTarget.src = p.images[0].url; }} alt={p.commonName ?? ""} className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]" />
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-serif text-xl">{p.commonName || p.species}</h3>
                        <p className="font-serif text-sm italic text-[#5f7169]">{p.species}</p>
                      </div>
                      {mode === "city" && <span className="font-mono text-xs text-[#007f24]">#{i + 1}</span>}
                    </div>
                    <p className="mt-3 flex items-center gap-1 font-mono text-xs text-[#71807e]">
                      <MapPin size={12} />{p.city} · {p.author.isSystem ? "BioSfere" : "@" + p.author.username}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="Eşleşen kayıt bulunamadı" text="Yazımı kontrol edin veya daha genel bir tür, cins ya da şehir adı deneyin." />
          )}
          {results.length > visible && <button className={secondaryButton + " mt-6"} onClick={() => setVisible(value => value + 60)}>Daha fazla sonuç</button>}
        </div>
      )}
    </div>
  );
}

export function TaxonomyPage() {
  const query = trpc.biosfere.posts.list.useQuery();
  const [term, setTerm] = useState("");
  const search = useDeferredValue(term.trim());
  const tree = useMemo(() => buildTaxonomyTree(query.data || [], search), [query.data, search]);
  return <div><PageHeading eyebrow="Âlemden türe" title="Yaşamın sistematiği" description="Gözlemleri âlem, şube, sınıf, takım, familya, cins ve tür düzeyinde keşfet. Bir dalı açarak o gruptaki kayıtlara ulaş." />
    <label className="mb-7 block max-w-lg"><span className="sr-only">Sistematik şemada ara</span><input className={inputClass} value={term} onChange={event => setTerm(event.target.value)} placeholder="Tür, cins veya familya ara…" /></label>
    {query.isPending ? <Loading /> : query.isError ? <QueryError retry={() => query.refetch()} /> : tree.length ? <div className="space-y-4">{tree.map(node => <TaxonomyBranch key={node.name} node={node} searching={Boolean(search)} />)}</div> : <Empty title={search ? "Bu aramayla eşleşen kayıt yok" : "Sistematik şema henüz boş"} text={search ? "Daha genel bir tür, cins veya familya adı deneyebilirsin." : "Türü belirtilmiş gözlemler sınıflandırmadaki yerlerine otomatik eklenir."} />}
  </div>;
}
