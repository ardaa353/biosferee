import { t as trText } from "@/lib/i18n";
import { getLocale, setAccountLanguage, t, type Locale } from "@/lib/i18n";
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
  const utils = trpc.useUtils();
  const [language, setLanguage] = useState<Locale>(getLocale);
  const languageMutation = trpc.biosfere.users.setLanguage.useMutation({
    onSuccess: (result) => {
      utils.biosfere.auth.me.setData(undefined, (current) =>
        current ? { ...current, language: result.language } : current,
      );
      setAccountLanguage(result.language);
    },
  });
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  // Hesap ayarlarını güncelle
  const update = trpc.biosfere.users.updateSettings.useMutation({
    onSuccess: () => {
      setIsSuccess(true);
      setMessage(trText("Ayarlarınız başarıyla güncellendi."));
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
        trText("Hesap silinirken hata oluştu: ") + errorMessage(error),
      );
    },
  });
  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <PageHeading
          eyebrow={trText("Hesap Yönetimi")}
          title={trText("Giriş yapmalısınız")}
          description={trText(
            "Hesap ayarlarını görüntülemek için oturum açmanız gerekiyor.",
          )}
        />

        <Link to="/giris" className={`${buttonClass} mt-6 inline-flex`}>
          {trText("Giriş Yap")}
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
      payload.password = password;
    }
    if (Object.keys(payload).length === 0) {
      setIsSuccess(false);
      setMessage(
        trText("Lütfen güncellemek istediğiniz en az bir bilgiyi girin."),
      );
      return;
    }
    update.mutate(payload);
  }
  function handleDeleteAccount() {
    if (!user || deleteAccount.isPending) return;
    const confirmed = window.confirm(
      trText("DİKKAT: Hesabınızı kalıcı olarak silmek üzeresiniz. ") +
        trText(
          "Profiliniz, gözlemleriniz ve ilişkili verileriniz silinebilir. ",
        ) +
        trText("Bu işlem geri alınamaz. Devam etmek istiyor musunuz?"),
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
          {trText("Geri dön")}
        </button>

        <Link
          to={`/profil/${user.username}`}
          className={`${secondaryButton} flex items-center gap-2`}
        >
          <UserRound size={16} />
          {trText("Profilime dön")}
        </Link>
      </div>

      <PageHeading
        eyebrow={trText("Hesap Yönetimi")}
        title={trText("Ayarlar")}
        description={trText(
          "Giriş bilgilerinizi güncelleyin veya hesabınızı kalıcı olarak sistemden kaldırın.",
        )}
      />

      <section
        className="mt-8 rounded-xl border border-[#09352e]/15 bg-white p-6 sm:p-8"
        aria-labelledby="language-heading"
      >
        <h2 id="language-heading" className="font-serif text-2xl">
          {t("Dil")}
        </h2>
        <p className="mt-2 text-sm text-[#5f7169]">
          {t(
            "Varsayılan dil cihazından belirlenir. Buradaki seçim hesabına kaydedilir ve diğer cihazlarda da kullanılır.",
          )}
        </p>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            languageMutation.mutate({ language });
          }}
        >
          <Field label={t("Uygulama dili")}>
            <select
              className={inputClass}
              value={language}
              onChange={(event) => setLanguage(event.target.value as Locale)}
            >
              <option value="tr" lang="tr">
                Türkçe
              </option>
              <option value="en" lang="en">
                English
              </option>
            </select>
          </Field>
          <button className={buttonClass} disabled={languageMutation.isPending}>
            {t(
              languageMutation.isPending
                ? trText("Kaydediliyor…")
                : trText("Dili kaydet"),
            )}
          </button>
        </form>
        {languageMutation.isSuccess && (
          <p role="status" className="mt-3 text-sm text-[#007f24]">
            {t("Dil tercihin kaydedildi.")}
          </p>
        )}
        {languageMutation.error && (
          <p role="alert" className="mt-3 text-sm text-[#8d302a]">
            {errorMessage(languageMutation.error)}
          </p>
        )}
        <p className="mt-4 text-xs leading-5 text-[#5f7169]">
          {t(
            "Gözlem notları otomatik çevrilir; bilimsel adlar ve özgün kayıtlar korunur. Çeviri için metin ücretsiz çeviri sağlayıcısına gönderilir. Servis kotası veya kesinti olduğunda özgün metin gösterilir.",
          )}
        </p>
      </section>
      {/* Hesap ayarları */}
      <form
        onSubmit={submit}
        className="mt-8 space-y-8 rounded-xl border border-[#09352e]/15 bg-white p-6 shadow-sm sm:p-8"
      >
        <div className="flex items-center gap-3 border-b border-[#09352e]/10 pb-4">
          <Settings className="text-[#007f24]" size={24} />

          <h2 className="font-serif text-2xl text-[#09352e]">
            {trText("Kişisel Bilgiler")}
          </h2>
        </div>

        <p className="text-sm leading-6 text-[#5f7169]">
          {trText(
            "Yalnızca değiştirmek istediğiniz alanları doldurun. Boş bıraktığınız alanlar değiştirilmez.",
          )}
        </p>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label={trText("Yeni E-posta Adresi")}>
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={trText("Yeni e-posta adresiniz")}
              autoComplete="email"
            />
          </Field>

          <Field label={trText("Yeni Telefon Numarası")}>
            <input
              type="tel"
              className={inputClass}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder={trText("Örn: 0555 555 55 55")}
              autoComplete="tel"
            />
          </Field>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label={trText("Yeni Şifre")}>
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={trText("En az 8 karakter")}
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
            {trText(message)}
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
              : trText("Değişiklikleri Kaydet")}
          </button>
        </div>
      </form>

      {/* Tehlikeli bölge */}
      <section className="mt-12 rounded-xl border border-[#a63f36]/30 bg-[#a63f36]/5 p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3 border-b border-[#a63f36]/20 pb-4">
          <ShieldAlert className="text-[#a63f36]" size={24} />

          <h2 className="font-serif text-2xl text-[#8d302a]">
            {trText("Tehlikeli Bölge")}
          </h2>
        </div>

        <p className="mb-6 max-w-2xl text-sm font-medium leading-6 text-[#8d302a]">
          {trText(
            "Hesabınızı sildiğinizde profiliniz ve ilişkili verileriniz kalıcı olarak silinebilir. Bu işlem geri alınamaz. Devam etmeden önce kararınızı dikkatlice değerlendirin.",
          )}
        </p>

        {message.startsWith("Hesap silinirken") && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-[#a63f36]/20 bg-white/70 p-4 text-sm font-semibold text-[#8d302a]"
          >
            {trText(message)}
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
            : trText("Hesabımı Kalıcı Olarak Sil")}
        </button>
      </section>
    </div>
  );
}
