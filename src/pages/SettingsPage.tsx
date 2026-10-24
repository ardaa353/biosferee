import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router";
import { Check, ShieldAlert, Trash2, ArrowLeft, Settings } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/utils";
import {
  Field,
  PageHeading,
  buttonClass,
  inputClass,
  secondaryButton,
} from "@/components/BioUI";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Alanları başlangıçta boş bırakıyoruz, sadece doldurulanlar güncellenecek
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  const update = trpc.biosfere.users.updateSettings.useMutation({
    onSuccess: () => {
      setIsSuccess(true);
      setMessage("Ayarlarınız başarıyla güncellendi.");
      setPassword(""); // Güvenlik için şifre alanını temizle
    },
    onError: (err) => {
      setIsSuccess(false);
      setMessage(errorMessage(err));
    }
  });

  const deleteAccount = trpc.biosfere.users.delete.useMutation({
    onSuccess: () => {
      logout(); // Sistemden çıkar
      navigate("/"); // Ana sayfaya yönlendir
    },
    onError: (err) => {
      setIsSuccess(false);
      setMessage("Hesap silinirken hata oluştu: " + errorMessage(err));
    }
  });

  if (!user) return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    setMessage("");

    const payload: any = {};
    if (email.trim()) payload.email = email.trim();
    if (phone.trim()) payload.phone = phone.trim();
    if (password.trim()) payload.password = password.trim();

    // Hiçbir şey girilmeden butona basıldıysa
    if (Object.keys(payload).length === 0) {
      setIsSuccess(false);
      setMessage("Lütfen güncellemek istediğiniz bir bilgiyi girin.");
      return;
    }

    update.mutate(payload);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6">
        <button 
          onClick={() => navigate(-1)} 
          className="flex items-center gap-2 text-sm font-semibold text-[#5f7169] hover:text-[#09352e] transition-colors"
        >
          <ArrowLeft size={16} /> Geri dön
        </button>
      </div>

      <PageHeading
        eyebrow="Hesap Yönetimi"
        title="Ayarlar"
        description="Giriş bilgilerinizi güncelleyin veya hesabınızı kalıcı olarak sistemden kaldırın."
      />

      {/* GÜNCELLEME FORMU */}
      <form onSubmit={submit} className="mt-8 space-y-8 rounded-xl border border-[#09352e]/15 bg-white p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-3 border-b border-[#09352e]/10 pb-4">
          <Settings className="text-[#007f24]" size={24} />
          <h2 className="font-serif text-2xl text-[#09352e]">Kişisel Bilgiler</h2>
        </div>

        <p className="text-sm text-[#5f7169]">
          Sadece değiştirmek istediğiniz alanları doldurun. Değişmesini istemediğiniz alanları boş bırakabilirsiniz.
        </p>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Yeni E-posta Adresi">
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-posta adresinizi değiştirin"
            />
          </Field>

          <Field label="Yeni Telefon Numarası">
            <input
              type="tel"
              className={inputClass}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Örn: 0555 555 55 55"
            />
          </Field>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Yeni Şifre">
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="En az 8 karakter olmalı"
              minLength={8}
            />
          </Field>
        </div>

        {message && !message.includes("silinirken") && (
          <p
            role="alert"
            className={`rounded-lg p-4 text-sm font-semibold ${
              isSuccess 
                ? "border border-[#007f24]/20 bg-[#85c093]/10 text-[#007f24]" 
                : "border border-[#a63f36]/30 bg-[#a63f36]/5 text-[#8d302a]"
            }`}
          >
            {message}
          </p>
        )}

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            className={buttonClass}
            disabled={update.isPending}
          >
            {update.isPending ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
          </button>
        </div>
      </form>

      {/* TEHLİKELİ BÖLGE (HESAP SİLME) */}
      <div className="mt-12 rounded-xl border border-[#a63f36]/30 bg-[#a63f36]/5 p-6 sm:p-8">
        <div className="flex items-center gap-3 border-b border-[#a63f36]/20 pb-4 mb-6">
          <ShieldAlert className="text-[#a63f36]" size={24} />
          <h2 className="font-serif text-2xl text-[#8d302a]">Tehlikeli Bölge</h2>
        </div>

        <p className="text-sm leading-6 text-[#8d302a] font-medium max-w-2xl mb-6">
          Hesabınızı sildiğinizde; profil fotoğrafınız (Cloudinary dahil), tüm gözlem kayıtlarınız, fotoğraflarınız, raporlarınız ve ortak çalışmalarınız sistemden <strong>kalıcı olarak</strong> temizlenir. Bu işlem geri alınamaz.
        </p>

        {message && message.includes("silinirken") && (
          <p className="mb-4 text-sm text-[#8d302a] font-semibold">{message}</p>
        )}

        <button
          type="button"
          disabled={deleteAccount.isPending}
          onClick={() => {
            const confirmed = window.confirm(
              "DİKKAT: Hesabınızı kalıcı olarak silmek üzeresiniz. Tüm verileriniz silinecek. Devam etmek istiyor musunuz?"
            );
            if (confirmed) {
              deleteAccount.mutate({ userId: user.id });
            }
          }}
          className="flex items-center gap-2 rounded-lg bg-[#a63f36] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#8d302a] disabled:opacity-50"
        >
          <Trash2 size={18} />
          {deleteAccount.isPending ? "Hesap Siliniyor..." : "Hesabımı Kalıcı Olarak Sil"}
        </button>
      </div>
    </div>
  );
}
