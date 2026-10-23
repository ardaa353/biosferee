import { useState, type FormEvent } from "react";
import { useParams } from "react-router";
import { Check, GitCompareArrows } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { emptyTaxonomy } from "@/lib/types";
import { errorMessage } from "@/lib/utils";
import PostCard from "@/components/PostCard";
import { Empty, Field, Loading, buttonClass, inputClass } from "@/components/BioUI";

export default function PostDetailPage() {
  const { id } = useParams(); const postId = Number(id); const { user } = useAuth(); const [showForm, setShowForm] = useState(false); const [tax, setTax] = useState(emptyTaxonomy); const [note, setNote] = useState(""); const [message, setMessage] = useState("");
  const post = trpc.biosfere.posts.get.useQuery({ id: postId }); const suggestions = trpc.biosfere.identification.forPost.useQuery({ postId }); const utils = trpc.useUtils();
  const suggest = trpc.biosfere.identification.suggest.useMutation({ onSuccess: () => { setShowForm(false); setMessage("Tür öneriniz moderasyon karşılaştırmasına eklendi."); suggestions.refetch(); } });
  const accept = trpc.biosfere.identification.accept.useMutation({ onSuccess: () => { utils.biosfere.posts.list.invalidate(); post.refetch(); suggestions.refetch(); } });
  function submit(e: FormEvent) { e.preventDefault(); suggest.mutate({ postId, ...tax, note: note || undefined }); }
  if (post.isLoading) return <Loading />;
  if (!post.data) return <Empty title="Gönderi bulunamadı" text="Bu kayıt kaldırılmış veya bağlantı hatalı olabilir." />;
  const isUnknown = post.data.status === "unknown";
  return <div className="mx-auto max-w-3xl"><PostCard post={post.data} />
    {isUnknown && <section className="mt-8"><div className="flex flex-col justify-between gap-4 border-b border-[#09352e]/15 pb-5 sm:flex-row sm:items-center"><div><p className="font-mono text-[11px] uppercase tracking-[.14em] text-[#007f24]">Kolektif tanımlama</p><h2 className="mt-1 font-serif text-3xl">Tür önerileri</h2></div><button onClick={() => setShowForm(!showForm)} className={buttonClass}><GitCompareArrows size={17} />Türü şu olabilir</button></div>
      {message && <p className="mt-4 rounded-lg bg-[#85c093]/20 p-3 text-sm">{message}</p>}
      {showForm && <form onSubmit={submit} className="mt-5 rounded-xl border border-[#09352e]/15 bg-[#fdfefb] p-5"><h3 className="mb-4 font-serif text-xl">Alem → Tür şemasını doldurun</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{(Object.keys(emptyTaxonomy) as (keyof typeof emptyTaxonomy)[]).map((key) => <Field key={key} label={{ kingdom: "Alem", phylum: "Şube", className: "Sınıf", orderName: "Takım", family: "Familya", genus: "Cins", species: "Tür", commonName: "Yaygın ad" }[key]}><input className={inputClass} value={tax[key]} onChange={(e) => setTax({ ...tax, [key]: e.target.value })} required /></Field>)}</div><div className="mt-4"><Field label="Öneri notu (isteğe bağlı)"><textarea className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>{suggest.error && <p className="mt-3 text-sm text-[#8d302a]">{errorMessage(suggest.error)}</p>}<button className={`${buttonClass} mt-4`} disabled={suggest.isPending}>Öneriyi gönder</button></form>}
      <div className="mt-5 space-y-4">{suggestions.data?.length ? suggestions.data.map((s) => <div key={s.id} className="border-b border-[#09352e]/15 pb-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-serif text-xl">{s.commonName} <em className="text-[#5f7169]">{s.species}</em></h3><p className="mt-1 font-mono text-[11px] text-[#5f7169]">{s.kingdom} → {s.phylum} → {s.className} → {s.orderName} → {s.family} → {s.genus}</p><p className="mt-2 text-xs">Öneren: {s.author.firstName} {s.author.lastName}</p>{s.note && <p className="mt-2 text-sm leading-6 text-[#50665d]">{s.note}</p>}</div>{user?.role !== "user" && s.status === "pending" && <button onClick={() => accept.mutate({ suggestionId: s.id })} className={buttonClass} disabled={accept.isPending}><Check size={16} />Türü onayla</button>}</div></div>) : <p className="py-6 text-sm text-[#71807e]">Henüz öneri yok. İlk taksonomi önerisini sen ekleyebilirsin.</p>}</div>
    </section>}
    {!isUnknown && <section className="mt-8"><h2 className="font-serif text-2xl">Sistematik sınıflandırma</h2><p className="mt-3 font-mono text-xs leading-7 text-[#50665d]">{post.data.kingdom} → {post.data.phylum} → {post.data.className} → {post.data.orderName} → {post.data.family} → {post.data.genus} → <strong>{post.data.species}</strong></p></section>}
  </div>;
}
