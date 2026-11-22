import CommonName from "@/components/CommonName";
import { t as trText } from "@/lib/i18n";
import TranslatedContent from "@/components/TranslatedContent";
import { preparePhoto, photoAccept } from "@/lib/photos";
import { uploadPreparedPhoto, type UploadedPhoto } from "@/lib/cloudinary";
import { useState, useRef, type FormEvent } from "react";
import { useParams, useNavigate, Link } from "react-router";
import {
  Camera,
  Check,
  Settings,
  LogOut,
  Trash2,
  ShieldCheck,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/utils";
import PostCard from "@/components/PostCard";
import {
  Avatar,
  Empty,
  Field,
  Loading,
  QueryError,
  buttonClass,
  inputClass,
  secondaryButton,
} from "@/components/BioUI";
export default function ProfilePage() {
  const { username } = useParams();
  const { user: current, refresh, logout } = useAuth(); // Çıkış yapma fonksiyonunu (logout) auth'tan çekiyoruz
  const users = trpc.biosfere.users.list.useQuery();
  const posts = trpc.biosfere.posts.list.useQuery();
  const utils = trpc.useUtils();
  const navigate = useNavigate(); // Yönlendirmeler için eklendi
  const profile = users.data?.find((u) => u.username === username);
  const [tab, setTab] = useState<"posts" | "collabs" | "species">("posts");
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState<UploadedPhoto>();
  const [avatarStatus, setAvatarStatus] = useState("");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const update = trpc.biosfere.users.updateProfile.useMutation({
    onSuccess: () => {
      setEditing(false);
      setAvatar(undefined);
      setAvatarStatus("");
      users.refetch();
      void utils.biosfere.posts.invalidate();
      refresh();
    },
  });
  // Hesabı kalıcı silme işlemi için mutation (backend tarafı sonradan yazılacak)
  const deleteAccount = trpc.biosfere.users.delete.useMutation({
    onSuccess: () => {
      logout(); // Hesap silindikten sonra çıkış yaptır
      navigate("/"); // Ana sayfaya gönder
    },
    onError: (error) => setAvatarStatus(errorMessage(error)),
  });
  async function chooseAvatar(file?: File) {
    if (!file) return;
    setAvatarBusy(true);
    setAvatarStatus(trText("Fotoğraf hazırlanıyor…"));
    try {
      setAvatar(await uploadPreparedPhoto(await preparePhoto(file, 1024)));
      setAvatarStatus(trText("Fotoğraf hazır. Uygulamak için kaydet."));
    } catch (error) {
      setAvatarStatus(errorMessage(error));
    } finally {
      setAvatarBusy(false);
    }
  }
  if (users.isError || posts.isError)
    return (
      <QueryError
        retry={() => {
          void users.refetch();
          void posts.refetch();
        }}
      />
    );
  if (users.isLoading || posts.isLoading) return <Loading />;
  if (!profile)
    return (
      <Empty
        title={trText("Kullanıcı bulunamadı")}
        text={trText("Bu profil bağlantısı geçersiz olabilir.")}
      />
    );
  const own = (posts.data ?? []).filter(
    (p) => p.status !== "removed" && p.author.id === profile.id,
  );
  const collabs = (posts.data ?? []).filter(
    (p) =>
      p.status !== "removed" &&
      p.collaborators.some((c) => c.id === profile.id),
  );
  const shown = tab === "collabs" ? collabs : own;
  const species = [
    ...new Map(
      own
        .filter((p) => p.status === "verified" && p.species)
        .map((p) => [p.species, p]),
    ).values(),
  ];
  async function submit(e: FormEvent) {
    e.preventDefault();
    update.mutate({
      bio,
      avatar,
    });
  }
  return (
    <div className="mx-auto max-w-4xl">
      <header className="grid gap-6 border-b border-[#09352e]/15 pb-8 sm:grid-cols-[auto_1fr]">
        <Avatar user={profile} size="lg" />
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-serif text-4xl tracking-[-1px]">
              {profile.firstName} {profile.lastName}
            </h1>
            {profile.role !== "user" && (
              <span className="rounded-full border border-[#007f24]/25 px-2.5 py-1 font-mono text-[10px] uppercase text-[#007f24]">
                {profile.role === "admin"
                  ? trText("Admin")
                  : trText("Moderatör")}
              </span>
            )}
          </div>

          <p className="mt-1 font-mono text-xs text-[#71807e]">
            @{profile.username}
          </p>
          <TranslatedContent
            kind="bio"
            id={profile.id}
            text={profile.bio}
            className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#50665d]"
          />

          <div className="mt-5 flex flex-wrap gap-6 font-mono text-[11px]">
            <span>
              <strong className="text-lg text-[#09352e]">{own.length}</strong>
              {trText(" gözlem")}
            </span>
            <span>
              <strong className="text-lg text-[#09352e]">
                {species.length}
              </strong>
              {trText(" tür")}
            </span>
            <span>
              <strong className="text-lg text-[#09352e]">
                {profile.reputation}
              </strong>
              {trText(" itibar")}
            </span>
          </div>

          {/* YENİ: Mobilde Çıkış, Ayarlar ve Admin Paneli Butonları (Sadece profil sahibi görebilir) */}
          {current?.id === profile.id && (
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setBio(profile.bio);
                  setEditing(!editing);
                }}
                className={`${secondaryButton}`}
              >
                {trText("Profili düzenle")}
              </button>

              <Link to="/ayarlar" className={`${secondaryButton} gap-2`}>
                <Settings size={15} />
                {trText(" Ayarlar")}
              </Link>

              <button
                onClick={() => void logout()}
                className={`${secondaryButton} gap-2 bg-gray-100 hover:bg-gray-200 border-none`}
              >
                <LogOut size={15} />
                {trText(" Çıkış Yap")}
              </button>

              {current.role !== "user" && (
                <Link
                  to="/admin"
                  className={`${secondaryButton} gap-2 bg-[#09352e] text-white border-none hover:bg-[#09352e]/90`}
                >
                  <ShieldCheck size={15} />
                  {trText(" Yönetim Merkezi")}
                </Link>
              )}
            </div>
          )}
        </div>
      </header>

      {editing && (
        <form
          onSubmit={submit}
          className="my-6 rounded-xl border border-[#09352e]/15 bg-[#fdfefb] p-5"
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
            <Field label={trText("Biyografi")}>
              <textarea
                minLength={3}
                maxLength={1000}
                className={inputClass}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                required
              />
            </Field>

            <div>
              <p className="mb-2 text-sm font-semibold">
                {trText("Yeni profil fotoğrafı")}
              </p>
              <input
                hidden
                type="file"
                ref={photoInput}
                accept={photoAccept}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  void chooseAvatar(file);
                }}
              />
              <button
                type="button"
                className={secondaryButton}
                disabled={avatarBusy || update.isPending}
                onClick={() => photoInput.current?.click()}
              >
                <Camera size={18} />
                {trText("Fotoğraf seç")}
              </button>
              {avatarStatus && (
                <p role="status" className="mt-2 text-sm">
                  {avatarStatus}
                </p>
              )}
            </div>
          </div>

          {update.error && (
            <p className="mt-3 text-sm text-[#8d302a]">
              {errorMessage(update.error)}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2 justify-between">
            <button
              type="submit"
              className={`${buttonClass}`}
              disabled={update.isPending || avatarBusy}
            >
              <Check size={16} />
              {update.isPending
                ? trText("Kaydediliyor…")
                : trText("Değişiklikleri kaydet")}
            </button>

            {/* YENİ: Hesabı Sil Butonu */}
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    trText(
                      "Hesabını kalıcı olarak silmek istediğine emin misin? Bu işlem geri alınamaz ve tüm fotoğrafların/verilerin silinir!",
                    ),
                  )
                ) {
                  if (current) deleteAccount.mutate({ userId: current.id });
                }
              }}
              className="px-4 py-2 text-sm font-semibold text-[#a63f36] hover:bg-[#a63f36]/10 rounded-full transition-colors flex items-center gap-2"
            >
              <Trash2 size={16} />
              {trText(" Hesabımı Sil")}
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
            {t === "posts"
              ? trText("Gönderiler")
              : t === "collabs"
                ? trText("Ortak çalışmalar")
                : trText("Tür envanteri")}
          </button>
        ))}
      </div>

      {tab === "species" ? (
        species.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {species.map((p) => (
              <div key={p.id} className="border-b border-[#09352e]/15 py-4">
                <h2 className="font-serif text-2xl">
                  <CommonName taxon={p} />
                </h2>
                <p className="font-serif italic text-[#50665d]">{p.species}</p>
                <p className="mt-2 font-mono text-[11px] text-[#71807e]">
                  {p.kingdom} / {p.family} / {p.genus}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title={trText("Henüz tür kaydı yok")}
            text={trText(
              "Doğrulanmış gözlemler burada tür envanterine dönüşür.",
            )}
          />
        )
      ) : shown.length ? (
        <div className="mx-auto max-w-3xl space-y-9">
          {shown.map((p) => (
            <PostCard key={p.id} post={p} compact />
          ))}
        </div>
      ) : (
        <Empty
          title={trText("Henüz gönderi yok")}
          text={
            tab === "collabs"
              ? trText(
                  "Bu kullanıcının ortak yazar olduğu bir gözlem bulunmuyor.",
                )
              : trText("Bu kullanıcı henüz bir canlı gözlemi paylaşmadı.")
          }
        />
      )}
    </div>
  );
}
