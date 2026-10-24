import { useState } from "react";
import { Link } from "react-router";
import { Check, ShieldCheck, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { Avatar, Loading, PageHeading, buttonClass, inputClass, secondaryButton } from "@/components/BioUI";

export default function AdminPage() {
  const { user } = useAuth(); 
  const [tab, setTab] = useState<"reports" | "suggestions" | "users">("reports"); 
  const users = trpc.biosfere.users.list.useQuery(); 
  const overview = trpc.biosfere.moderation.overview.useQuery();
  
  const role = trpc.biosfere.users.setRole.useMutation({ onSuccess: () => users.refetch() }); 
  const resolve = trpc.biosfere.moderation.resolveReport.useMutation({ onSuccess: () => { overview.refetch(); } }); 
  const accept = trpc.biosfere.identification.accept.useMutation({ onSuccess: () => overview.refetch() });
  
  // Eğer kullanıcı yoksa veya normal kullanıcıysa sayfayı gösterme
  if (!user || user.role === "user") return null;
  
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <PageHeading 
        eyebrow="Moderasyon ve topluluk güveni" 
        title="Yönetim merkezi" 
        description="Yanıltıcı içerik raporlarını inceleyin, bilinmeyen tür önerilerini karşılaştırın ve ekip yetkilerini düzenleyin." 
      />
      
      <div className="mb-7 flex flex-wrap gap-2">
        {(["reports", "suggestions", "users"] as const).map((t) => (
          <button 
            key={t} 
            onClick={() => setTab(t)} 
            className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors ${tab === t ? "border-[#09352e] bg-[#09352e] text-white" : "border-[#09352e]/20 hover:bg-[#09352e]/5"}`}
          >
            {t === "reports" 
              ? `Raporlar (${overview.data?.reports.filter((r) => r.status === "pending").length ?? 0})` 
              : t === "suggestions" 
              ? `Tür önerileri (${overview.data?.suggestions.length ?? 0})` 
              : "Kullanıcı yetkileri"}
          </button>
        ))}
      </div>

      {overview.isLoading ? (
        <Loading />
      ) : tab === "reports" && (
        <section className="space-y-4">
          {overview.data?.reports.length ? overview.data.reports.map((r) => (
            <article key={r.id} className="rounded-xl border border-[#09352e]/15 bg-[#fdfefb] p-4 sm:p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex-1">
                  <span className={`font-mono text-[10px] uppercase font-bold tracking-wider ${r.status === "pending" ? "text-[#8d302a]" : "text-[#71807e]"}`}>
                    {r.status === "pending" ? "İnceleme bekliyor" : r.status === "resolved" ? "Çözüldü" : "Reddedildi"}
                  </span>
                  <h2 className="mt-1 font-serif text-xl sm:text-2xl text-[#09352e]">
                    {r.reason === "wrong_species" ? "Yanlış tür bilgisi" : r.reason === "misleading" ? "Yanıltıcı içerik" : r.reason === "inappropriate" ? "Uygunsuz içerik" : "Diğer rapor"}
                  </h2>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-[#50665d] bg-[#f7f7f7] p-3 rounded-lg border">
                    {r.details}
                  </p>
                  <p className="mt-3 font-mono text-[11px] text-[#71807e]">
                    Raporlayan @{r.reporter.username} · <Link className="text-[#007f24] font-semibold hover:underline" to={`/gonderi/${r.post.id}`}>Gönderi #{r.post.id} Görüntüle</Link>
                  </p>
                </div>
                
                {r.status === "pending" && (
                  <div className="flex flex-row sm:flex-col flex-wrap sm:flex-nowrap gap-2 w-full sm:w-auto">
                    <button onClick={() => resolve.mutate({ reportId: r.id, action: "resolve" })} className={`${secondaryButton} flex-1 sm:flex-none justify-center`}>
                      <Check size={15} /> Çözüldü
                    </button>
                    <button onClick={() => resolve.mutate({ reportId: r.id, action: "remove" })} className={`${buttonClass} flex-1 sm:flex-none justify-center bg-[#a63f36] hover:bg-[#8d302a] text-white border-none`}>
                      Kaldır
                    </button>
                    <button onClick={() => resolve.mutate({ reportId: r.id, action: "dismiss" })} className={`${secondaryButton} flex-1 sm:flex-none justify-center opacity-70`}>
                      <X size={15} /> Reddet
                    </button>
                  </div>
                )}
              </div>
            </article>
          )) : (
            <p className="border-y border-[#09352e]/15 py-12 text-center text-sm text-[#71807e] bg-white rounded-xl">Henüz içerik raporu bulunmuyor.</p>
          )}
        </section>
      )}

      {tab === "suggestions" && (
        <section className="space-y-4">
          {overview.data?.suggestions.length ? overview.data.suggestions.map((s) => (
            <article key={s.id} className="rounded-xl border border-[#09352e]/15 bg-[#fdfefb] p-4 sm:p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] text-[#71807e]">
                    <Link to={`/gonderi/${s.post.id}`} className="hover:text-[#007f24] underline">Gönderi #{s.post.id}</Link> · Öneren @{s.author.username}
                  </p>
                  <h2 className="mt-2 font-serif text-xl sm:text-2xl text-[#09352e]">
                    {s.commonName} <em className="text-[#50665d]">{s.species}</em>
                  </h2>
                  <p className="mt-2 font-mono text-[11px] leading-6 text-[#50665d]">
                    {s.kingdom} → {s.phylum} → {s.className} → {s.orderName} → {s.family} → {s.genus}
                  </p>
                  {s.note && <p className="mt-3 text-sm bg-gray-50 p-2 rounded border border-gray-100">{s.note}</p>}
                </div>
                <button onClick={() => accept.mutate({ suggestionId: s.id })} className={`${buttonClass} w-full sm:w-auto justify-center`}>
                  <Check size={16} /> Doğru tür olarak kaydet
                </button>
              </div>
            </article>
          )) : (
            <p className="border-y border-[#09352e]/15 py-12 text-center text-sm text-[#71807e] bg-white rounded-xl">Karşılaştırma bekleyen tür önerisi yok.</p>
          )}
        </section>
      )}

      {tab === "users" && (
        <section className="overflow-x-auto rounded-xl border border-[#09352e]/15 bg-white">
          <table className="w-full min-w-[650px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#09352e]/20 bg-gray-50 font-mono text-[10px] uppercase tracking-wider text-[#71807e]">
                <th className="py-3 px-4">Kullanıcı</th>
                <th className="px-4">Biyografi</th>
                <th className="px-4">İtibar</th>
                <th className="px-4">Yetki</th>
              </tr>
            </thead>
            <tbody>
              {users.data?.map((u) => (
                <tr key={u.id} className="border-b border-[#09352e]/10 hover:bg-gray-50/50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <Avatar user={u} size="sm" />
                      <div>
                        <p className="text-sm font-semibold text-[#09352e]">{u.firstName} {u.lastName}</p>
                        <p className="font-mono text-[10px] text-[#71807e]">@{u.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-[200px] truncate px-4 text-xs text-[#50665d]">{u.bio || "-"}</td>
                  <td className="font-mono text-xs px-4">{u.reputation}</td>
                  <td className="px-4">
                    <select 
                      className={`${inputClass} max-w-36 text-sm`} 
                      value={u.role} 
                      disabled={user?.role !== "admin"} 
                      onChange={(e) => role.mutate({ userId: u.id, role: e.target.value as "user" | "moderator" | "admin" })}
                    >
                      <option value="user">Kullanıcı</option>
                      <option value="moderator">Moderatör</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {user?.role !== "admin" && (
            <div className="p-4 bg-gray-50 border-t flex items-center gap-2 text-sm text-[#71807e]">
              <ShieldCheck size={17} className="text-[#a96d15]" />
              Yetki değişiklikleri yalnızca admin hesabına açıktır.
            </div>
          )}
        </section>
      )}
    </div>
  );
}
