import { t as trText } from "@/lib/i18n";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { Eye, EyeOff, Leaf, Map, Network, Microscope } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/utils";
import { Field, Logo, buttonClass, inputClass } from "@/components/BioUI";
function destination() {
  const next = new URLSearchParams(window.location.search).get("next") || "";
  return /^\/gonderi\/[1-9]\d*$/.test(next) ? next : "/akis";
}
function AuthFrame({
  children,
  mode,
}: {
  children: React.ReactNode;
  mode: "login" | "register";
}) {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#f7f7f7] lg:grid lg:grid-cols-[1.1fr_.9fr]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[.035]"
        aria-hidden="true"
      >
        <div className="grain h-full w-full" />
      </div>
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[#d4e7d7] p-12 lg:flex xl:p-16">
        <Logo />
        <div className="max-w-xl">
          <p className="font-mono text-xs font-semibold uppercase tracking-[.2em]">
            {trText("Vatandaş bilimi · açık gözlem ağı")}
          </p>
          <h1 className="mt-6 font-serif text-6xl leading-[1.02] tracking-[-2px] xl:text-7xl">
            {trText("Doğayı birlikte")}
            <br />
            <em>{trText("kayıt altına")}</em>
            {trText(" alalım.")}
          </h1>
          <p className="mt-7 max-w-lg text-lg leading-8 text-[#09352e]/80">
            {trText(
              "Canlı gözlemlerini konum ve mevsim verisiyle paylaş. Bilinmeyen türleri toplulukla tanımla, biyoçeşitlilik haritasını birlikte büyüt.",
            )}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-5 border-t border-[#09352e]/25 pt-6 font-mono text-xs leading-5">
          <span className="flex gap-2">
            <Map size={18} />
            {trText("Ortak konum")}
            <br />
            {trText("haritası")}
          </span>
          <span className="flex gap-2">
            <Microscope size={18} />
            {trText("Kolektif tür")}
            <br />
            {trText("tanımlama")}
          </span>
          <span className="flex gap-2">
            <Network size={18} />
            {trText("Açık sistematik")}
            <br />
            {trText("şeması")}
          </span>
        </div>
      </section>
      <section className="relative flex min-h-dvh items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          {children}
          <p className="mt-8 text-center font-mono text-[11px] leading-5 text-[#71807e]">
            {trText("Doğanın ortak kaydına katıl.")}
            <br />
            {mode === "login"
              ? trText("BioSfere açık vatandaş bilimi ağıdır.")
              : trText("Gözlemlerinle biyoçeşitliliğin kaydına katkı sağla.")}
          </p>
        </div>
      </section>
    </main>
  );
}
export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={destination()} replace />;
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(identifier, password);
      navigate(destination(), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame mode="login">
      <div className="mb-8">
        <p className="font-mono text-xs uppercase tracking-[.16em] text-[#007f24]">
          {trText("Tekrar hoş geldin")}
        </p>
        <h2 className="mt-2 font-serif text-4xl tracking-[-1px]">
          {trText("Gözlemlerine dön.")}
        </h2>
      </div>
      <form onSubmit={submit} className="space-y-5">
        <Field label={trText("Kullanıcı adı veya e-posta")}>
          <input
            className={inputClass}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            required
          />
        </Field>
        <Field label={trText("Şifre")}>
          <div className="relative">
            <input
              className={`${inputClass} pr-12`}
              type={show ? "text" : "password"}
              maxLength={100}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              aria-label={
                show ? trText("Şifreyi gizle") : trText("Şifreyi göster")
              }
              aria-pressed={show}
              className="absolute right-1 top-1 grid h-10 w-10 place-items-center rounded-md hover:bg-[#85c093]/15"
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </Field>
        {error && (
          <p
            role="alert"
            className="border-l-2 border-[#a63f36] pl-3 text-sm text-[#8d302a]"
          >
            {error}
          </p>
        )}
        <button className={`${buttonClass} w-full`} disabled={busy}>
          {busy ? trText("Giriş yapılıyor…") : trText("Giriş yap")}
        </button>
      </form>
      <div className="mt-7 border-t border-[#09352e]/15 pt-6 text-center text-sm">
        {trText("Henüz hesabın yok mu? ")}
        <Link
          to={"/kayit" + window.location.search}
          className="ml-1 font-semibold text-[#007f24] underline underline-offset-4"
        >
          {trText("Hesap oluştur")}
        </Link>
      </div>
    </AuthFrame>
  );
}
export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    phone: "",
    password: "",
    bio: "",
  });
  if (user) return <Navigate to={destination()} replace />;
  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await register(form);
      navigate(destination(), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame mode="register">
      <div className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[.16em] text-[#007f24]">
          {trText("Yeni gözlemci")}
        </p>
        <h2 className="mt-2 font-serif text-4xl">
          {trText("Hesabını oluştur.")}
        </h2>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={trText("İsim")}>
            <input
              className={inputClass}
              minLength={2}
              maxLength={80}
              autoComplete="given-name"
              value={form.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              required
            />
          </Field>
          <Field label={trText("Soyisim")}>
            <input
              className={inputClass}
              minLength={2}
              maxLength={80}
              autoComplete="family-name"
              value={form.lastName}
              onChange={(e) => set("lastName", e.target.value)}
              required
            />
          </Field>
        </div>
        <Field label={trText("Kullanıcı adı")}>
          <input
            className={inputClass}
            value={form.username}
            onChange={(e) => set("username", e.target.value.toLowerCase())}
            pattern="[a-z0-9_]{3,40}"
            autoComplete="username"
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={trText("E-posta")}>
            <input
              className={inputClass}
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              autoComplete="email"
              required
            />
          </Field>
          <Field label={trText("Telefon")}>
            <input
              className={inputClass}
              type="tel"
              minLength={10}
              maxLength={30}
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              autoComplete="tel"
              required
            />
          </Field>
        </div>
        <Field label={trText("Şifre (en az 8 karakter)")}>
          <input
            className={inputClass}
            type="password"
            minLength={8}
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        <Field label={trText("Biyografi / okul / akademik unvan")}>
          <textarea
            className={`${inputClass} min-h-20 resize-y`}
            minLength={3}
            maxLength={1000}
            value={form.bio}
            onChange={(e) => set("bio", e.target.value)}
            placeholder={trText("Örn. Ege Üniversitesi Biyoloji öğrencisi")}
            required
          />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-[#8d302a]">
            {error}
          </p>
        )}
        <button className={`${buttonClass} w-full`} disabled={busy}>
          {busy ? trText("Hesap oluşturuluyor…") : trText("Kayıt ol ve başla")}
          <Leaf size={17} />
        </button>
      </form>
      <p className="mt-5 text-center text-sm">
        {trText("Zaten hesabın var mı? ")}
        <Link
          to={"/giris" + window.location.search}
          className="font-semibold text-[#007f24] underline underline-offset-4"
        >
          {trText("Giriş yap")}
        </Link>
      </p>
    </AuthFrame>
  );
}
