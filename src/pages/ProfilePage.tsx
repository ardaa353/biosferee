import { useState, useEffect, useRef, type FormEvent } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { Camera, Check, Settings, LogOut, Trash2, ShieldCheck } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/utils"; 
import PostCard from "@/components/PostCard";
import { Avatar, Empty, Field, Loading, buttonClass, inputClass, secondaryButton } from "@/components/BioUI";

export default function ProfilePage() {
  const { username } = useParams(); 
  const { user: current, refresh, logout } = useAuth(); // Çıkış yapma fonksiyonunu (logout) auth'tan çekiyoruz
  const users = trpc.biosfere.users.list.useQuery(); 
  const posts = trpc.biosfere.posts.list.useQuery();
  const navigate = useNavigate(); // Yönlendirmeler için eklendi
  
  const profile = users.data?.find((u) => u.username === username); 
  const [tab, setTab] = useState<"posts" | "collabs" | "species">("posts"); 
  const [editing, setEditing] = useState(false); 
  const [bio, setBio] = useState(""); 
  
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  
  const update = trpc.biosfere.users.updateProfile.useMutation({ 
    onSuccess: () => { 
      setEditing(false); 
      setAvatarUrl(undefined); 
      users.refetch(); 
      posts.refetch(); 
      refresh(); 
    } 
  });

  // Hesabı kalıcı silme işlemi için mutation (backend tarafı sonradan yazılacak)
  const deleteAccount = trpc.biosfere.users.delete.useMutation({
    onSuccess: () => {
      logout(); // Hesap silindikten sonra çıkış yaptır
      navigate("/"); // Ana sayfaya gönder
    }
  });
  
  const widgetRef = useRef<any>(null);

  useEffect(() => {
    if ("cloudinary" in window) {
      widgetRef.current = (window as any).cloudinary.createUploadWidget(
        {
          cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME,
          uploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET,
          multiple: false, 
          clientAllowedFormats: ["jpeg", "png", "webp", "gif"],
          maxFileSize: 5000000 
        },
        (error: any, result: any) => {
          if (!error && result && result.event === "success") {
            setAvatarUrl(result.info.secure_url);
          }
        }
      );
    }
  }, []);

  if (users.isLoading || posts.isLoading) return <Loading />;
  if (!profile) return <Empty title="Kullanıcı bulunamadı" text="Bu profil bağlantısı geçersiz olabilir." />;
  
  const own = (posts.data ?? []).filter((p) => p.status !== "removed" && p.author.id === profile.id);
  const collabs = (posts.data ?? []).filter((p) => p.status !== "removed" && p.collaborators.some((c) => c.id === profile.id));
  const shown = tab === "collabs" ? collabs : own;
  const species = [...new Map(own.filter((p) => p.species).map((p) => [p.species, p])).values()];
  
  async function submit(e: FormEvent) { 
    e.preventDefault(); 
    update.mutate({ 
      bio, 
      avatar: avatarUrl ? { 
        name: "cloudinary_profile.jpg", 
        contentType: "image/jpeg", 
        contentBase64: avatarUrl 
      } : undefined 
    }); 
  }
  
  return (
    <div className="mx-auto max-w-4xl">
      <header className="grid gap-6 border-b border-[#09352e]/15 pb-8 sm:grid-cols-[auto_1fr]">
        <Avatar user={profile} size="lg" />
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-serif text-4xl tracking-[-1px]">{profile.firstName} {profile.lastName}</h1>
            {profile.role !== "user" && (
              <span className="rounded-full border border-[#007f24]/25 px-2.5 py-1 font-mono text-[10px] uppercase text-[#007f24]">
                {profile.role === "admin" ? "Admin" : "Moderatör"}
              </span>
            )}
          </div>
          
          <p className="mt-1 font-mono text-xs text-[#71807e]">@{profile.username}</p>
          <p className="mt-4 max-w-2xl whitespace-pre-wrap text-[15px] leading-6 text-[#50665d]">{profile.bio}</p>
          
          <div className="mt-5 flex flex-wrap gap-6 font-mono text-[11px]">
            <span><strong className="text-lg text-[#09352e]">{own.length}</strong> gözlem</span>
            <span><strong className="text-lg text-[#09352e]">{species.length}</strong> tür</span>
            <span><strong className="text-lg text-[#09352e]">{profile.reputation}</strong> itibar</span>
          </div>
          
          {/* YENİ: Mobilde Çıkış, Ayarlar ve Admin Paneli Butonları (Sadece profil sahibi görebilir) */}
          {current?.id === profile.id && (
            <div className="mt-6 flex flex-wrap gap-2">
              <button 
                onClick={() => { setBio(profile.bio); setEditing(!editing); }} 
                className={`${secondaryButton}`}
              >
                Profili düzenle
              </button>

              <Link to="/ayarlar" className={`${secondaryButton} gap-2`}>
                <Settings size={15} /> Ayarlar
              </Link>
              
              <button 
                onClick={() => logout()} 
                className={`${secondaryButton} gap-2 bg-gray-100 hover:bg-gray-200 border-none`}
              >
                <LogOut size={15} /> Çıkış Yap
              </button>

              {current.role === "admin" && (
                <Link to="/admin" className={`${secondaryButton} gap-2 bg-[#09352e] text-white border-none hover:bg-[#09352e]/90`}>
                  <ShieldCheck size={15} /> Yönetim Merkezi
                </Link>
              )}
            </div>
          )}
        </div>
      </header>

      {editing && (
        <form onSubmit={submit} className="my-6 rounded-xl border border-[#09352e]/15 bg-[#fdfefb] p-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
            <Field label="Biyografi">
              <textarea className={inputClass} value={bio} onChange={(e) => setBio(e.target.value)} required />
            </Field>
    
            <Field label="Yeni profil fotoğrafı">
              <button 
                type="button" 
                onClick={() => widgetRef.current?.open()} 
                className="flex min-h-20 w-full cursor-pointer items-center justify-center gap-3 rounded-lg border border-dashed border-[#007f24]/35 bg-[#85c093]/10 p-3 text-sm transition hover:bg-[#85c093]/20"
              >
                <Camera size={20} className="text-[#007f24]" />
                {avatarUrl ? "Fotoğraf Yüklendi ✅ (Değiştirmek için tıkla)" : "Cloudinary'den Fotoğraf Seç"}
              </button>
            </Field>
          </div>
          
          {update.error && <p className="mt-3 text-sm text-[#8d302a]">{errorMessage(update.error)}</p>}
          
          <div className="mt-4 flex flex-wrap gap-2 justify-between">
            <button type="submit" className={`${buttonClass}`} disabled={update.isPending}>
              <Check size={16} />{update.isPending ? "Kaydediliyor…" : "Değişiklikleri kaydet"}
            </button>
            
            {/* YENİ: Hesabı Sil Butonu */}
            <button 
              type="button"
              onClick={() => {
                if (window.confirm("Hesabını kalıcı olarak silmek istediğine emin misin? Bu işlem geri alınamaz ve tüm fotoğrafların/verilerin silinir!")) {
                  deleteAccount.mutate({ userId: current.id });
                }
              }}
              className="px-4 py-2 text-sm font-semibold text-[#a63f36] hover:bg-[#a63f36]/10 rounded-full transition-colors flex items-center gap-2"
            >
              <Trash2 size={16} /> Hesabımı Sil
            </button>
          </div>
        </form>
      )}

      <div className="my-7 flex gap-2 overflow-x-auto border-b border-[#09352e]/15">
        {(["posts", "collabs", "species"] as const).map((t) => (
          <button 
            key={t} 
            onClick={() => setTab(t)} 
            className={`min-h-12 shrink-0 border-b-2 px-4 text-sm font-semibold ${tab === t ? "border-[#007f24] text-[#007f24]" : "border-transparent text-[#71807e]"}`}
          >
            {t === "posts" ? "Gönderiler" : t === "collabs" ? "Ortak çalışmalar" : "Tür envanteri"}
          </button>
        ))}
      </div>

      {tab === "species" ? (
        species.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {species.map((p) => (
              <div key={p.id} className="border-b border-[#09352e]/15 py-4">
                <h2 className="font-serif text-2xl">{p.commonName}</h2>
                <p className="font-serif italic text-[#50665d]">{p.species}</p>
                <p className="mt-2 font-mono text-[11px] text-[#71807e]">{p.kingdom} / {p.family} / {p.genus}</p>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Henüz tür kaydı yok" text="Doğrulanmış gözlemler burada tür envanterine dönüşür." />
        )
      ) : shown.length ? (
        <div className="mx-auto max-w-3xl space-y-9">
          {shown.map((p) => <PostCard key={p.id} post={p} compact />)}
        </div>
      ) : (
        <Empty title="Henüz gönderi yok" text={tab === "collabs" ? "Bu kullanıcının ortak yazar olduğu bir gözlem bulunmuyor." : "Bu kullanıcı henüz bir canlı gözlemi paylaşmadı."} />
      )}
    </div>
  );
}
