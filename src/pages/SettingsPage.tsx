
import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router";
import {
  Check,
  ShieldAlert,
  Trash2,
  ArrowLeft,
  Settings,
  UserRound,
} from "lucide-react";

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

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  // Hesap ayarlarını güncelle
  const update = trpc.biosfere.users.updateSettings.useMutation({
    onSuccess: () => {
      setIsSuccess(true);
      setMessage("Ayarlarınız başarıyla güncellendi.");

      setEmail("");
      setPhone("");
      setPassword("");
    },

    onError: (error) => {
      setIsSuccess(false);
      setMessage(errorMessage(error));
    },
  });

  // Hesabı kalıcı olarak sil
  const deleteAccount = trpc.biosfere.users.delete.useMutation({
    onSuccess: async () => {
      await logout();
      navigate("/", { replace: true });
    },

    onError: (error) => {
      setIsSuccess(false);
      setMessage(
        "Hesap silinirken hata oluştu: " + errorMessage(error)
      );
    },
  });

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <PageHeading
          eyebrow="Hesap Yönetimi"
          title="Giriş yapmalısınız"
          description="Hesap ayarlarını görüntülemek için oturum açmanız gerekiyor."
        />

        <Link
          to="/giris"
          className={`${buttonClass} mt-6 inline-flex`}
        >
          Giriş Yap
        </Link>
      </div>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");

    const payload: {
      email?: string;
      phone?: string;
      password?: string;
    } = {};

    if (email.trim()) {
      payload.email = email.trim();
    }

    if (phone.trim()) {
      payload.phone = phone.trim();
    }

    if (password.trim()) {
      payload.password = password.trim();
    }

    if (Object.keys(payload).length === 0) {
      setIsSuccess(false);
      setMessage(
        "Lütfen güncellemek istediğiniz en az bir bilgiyi girin."
      );
      return;
    }

    update.mutate(payload);
  }

  function handleDeleteAccount() {
    if (deleteAccount.isPending) return;

    const confirmed = window.confirm(
      "DİKKAT: Hesabınızı kalıcı olarak silmek üzeresiniz. " +
        "Profiliniz, gözlemleriniz ve ilişkili verileriniz silinebilir. " +
        "Bu işlem geri alınamaz. Devam etmek istiyor musunuz?"
    );

    if (!confirmed) return;

    setMessage("");

    deleteAccount.mutate({
      userId: user.id,
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
      {/* Üst gezinme */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm font-semibold text-[#5f7169] transition-colors hover:text-[#09352e]"
        >
          <ArrowLeft size={16} />
          Geri dön
        </button>

        <Link
          to={`/profil/${user.username}`}
          className={`${secondaryButton} flex items-center gap-2`}
        >
          <UserRound size={16} />
          Profilime dön
        </Link>
      </div>

      <PageHeading
        eyebrow="Hesap Yönetimi"
        title="Ayarlar"
        description="Giriş bilgilerinizi güncelleyin veya hesabınızı kalıcı olarak sistemden kaldırın."
      />

      {/* Hesap ayarları */}
      <form
        onSubmit={submit}
        className="mt-8 space-y-8 rounded-xl border border-[#09352e]/15 bg-white p-6 shadow-sm sm:p-8"
      >
        <div className="flex items-center gap-3 border-b border-[#09352e]/10 pb-4">
          <Settings
            className="text-[#007f24]"
            size={24}
          />

          <h2 className="font-serif text-2xl text-[#09352e]">
            Kişisel Bilgiler
          </h2>
        </div>

        <p className="text-sm leading-6 text-[#5f7169]">
          Yalnızca değiştirmek istediğiniz alanları doldurun.
          Boş bıraktığınız alanlar değiştirilmez.
        </p>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Yeni E-posta Adresi">
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Yeni e-posta adresiniz"
              autoComplete="email"
            />
          </Field>

          <Field label="Yeni Telefon Numarası">
            <input
              type="tel"
              className={inputClass}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Örn: 0555 555 55 55"
              autoComplete="tel"
            />
          </Field>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Yeni Şifre">
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="En az 8 karakter"
              minLength={8}
              maxLength={100}
              autoComplete="new-password"
            />
          </Field>
        </div>

        {message && !message.startsWith("Hesap silinirken") && (
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

        <div className="flex justify-end border-t border-[#09352e]/10 pt-5">
          <button
            type="submit"
            className={buttonClass}
            disabled={update.isPending || deleteAccount.isPending}
          >
            <Check size={16} />

            {update.isPending
              ? "Kaydediliyor..."
              : "Değişiklikleri Kaydet"}
          </button>
        </div>
      </form>

      {/* Tehlikeli bölge */}
      <section className="mt-12 rounded-xl border border-[#a63f36]/30 bg-[#a63f36]/5 p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3 border-b border-[#a63f36]/20 pb-4">
          <ShieldAlert
            className="text-[#a63f36]"
            size={24}
          />

          <h2 className="font-serif text-2xl text-[#8d302a]">
            Tehlikeli Bölge
          </h2>
        </div>

        <p className="mb-6 max-w-2xl text-sm font-medium leading-6 text-[#8d302a]">
          Hesabınızı sildiğinizde profiliniz ve ilişkili verileriniz
          kalıcı olarak silinebilir. Bu işlem geri alınamaz.
          Devam etmeden önce kararınızı dikkatlice değerlendirin.
        </p>

        {message.startsWith("Hesap silinirken") && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-[#a63f36]/20 bg-white/70 p-4 text-sm font-semibold text-[#8d302a]"
          >
            {message}
          </p>
        )}

        <button
          type="button"
          disabled={deleteAccount.isPending || update.isPending}
          onClick={handleDeleteAccount}
          className="flex items-center gap-2 rounded-lg bg-[#a63f36] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#8d302a] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 size={18} />

          {deleteAccount.isPending
            ? "Hesap Siliniyor..."
            : "Hesabımı Kalıcı Olarak Sil"}
        </button>
      </section>
    </div>
  );
}
