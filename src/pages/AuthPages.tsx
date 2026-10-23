import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { ArrowRight, Eye, EyeOff, Leaf, Map, Network, Microscope } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/utils";
import { Field, Logo, buttonClass, inputClass } from "@/components/BioUI";

function AuthFrame({ children, mode }: { children: React.ReactNode; mode: "login" | "register" }) {
  return <main className="relative min-h-dvh overflow-hidden bg-[#f7f7f7] lg:grid lg:grid-cols-[1.1fr_.9fr]">
    <div className="pointer-events-none absolute inset-0 opacity-[.035]" aria-hidden="true"><div className="grain h-full w-full" /></div>
    <section className="relative hidden flex-col justify-between overflow-hidden bg-[#85c093] p-12 lg:flex xl:p-16">
      <Logo />
      <div className="max-w-xl"><p className="font-mono text-xs font-semibold uppercase tracking-[.2em]">Açık gözlem ağı / 001</p><h1 className="mt-6 font-serif text-6xl leading-[1.02] tracking-[-2.5px] xl:text-7xl">Doğayı birlikte<br /><em>kayıt altına</em> alalım.</h1><p className="mt-7 max-w-lg text-lg leading-8 text-[#09352e]/80">Canlı gözlemlerini konum ve mevsim verisiyle paylaş. Bilinmeyen türleri toplulukla tanımla, biyoçeşitlilik haritasını birlikte büyüt.</p></div>
      <div className="grid grid-cols-3 gap-5 border-t border-[#09352e]/25 pt-6 font-mono text-xs leading-5"><span className="flex gap-2"><Map size={18} />Ortak konum<br />haritası</span><span className="flex gap-2"><Microscope size={18} />Kolektif tür<br />tanımlama</span><span className="flex gap-2"><Network size={18} />Açık sistematik<br />şeması</span></div>
    </section>
    <section className="relative flex min-h-dvh items-center justify-center px-5 py-10 sm:px-10"><div className="w-full max-w-md"><div className="mb-10 lg:hidden"><Logo /></div>{children}<p className="mt-8 text-center font-mono text-[11px] leading-5 text-[#71807e]">Takipçi değil, güvenilir gözlem.<br />{mode === "login" ? "BioSfere açık vatandaş bilimi ağıdır." : "Kayıt için e-posta veya SMS doğrulaması istenmez."}</p></div></section>
  </main>;
}

export function LoginPage() {
  const { user, login } = useAuth(); const navigate = useNavigate();
  const [identifier, setIdentifier] = useState(""); const [password, setPassword] = useState(""); const [show, setShow] = useState(false); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/akis" replace />;
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(""); try { await login(identifier, password); navigate("/akis"); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); } }
  return <AuthFrame mode="login"><div className="mb-8"><p className="font-mono text-xs uppercase tracking-[.16em] text-[#007f24]">Tekrar hoş geldin</p><h2 className="mt-2 font-serif text-4xl tracking-[-1px]">Gözlemlerine dön.</h2></div><form onSubmit={submit} className="space-y-5"><Field label="Kullanıcı adı veya e-posta"><input className={inputClass} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required /></Field><Field label="Şifre"><div className="relative"><input className={`${inputClass} pr-12`} type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /><button type="button" onClick={() => setShow(!show)} aria-label="Şifreyi göster" className="absolute right-1 top-1 grid h-10 w-10 place-items-center rounded-md hover:bg-[#85c093]/15">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></Field>{error && <p role="alert" className="border-l-2 border-[#a63f36] pl-3 text-sm text-[#8d302a]">{error}</p>}<button className={`${buttonClass} w-full`} disabled={busy}>{busy ? "Giriş yapılıyor…" : "Giriş yap"}<ArrowRight size={17} /></button></form><div className="mt-7 border-t border-[#09352e]/15 pt-6 text-center text-sm">Henüz hesabın yok mu? <Link to="/kayit" className="ml-1 font-semibold text-[#007f24] underline underline-offset-4">Hesap oluştur</Link></div></AuthFrame>;
}

export function RegisterPage() {
  const { user, register } = useAuth(); const navigate = useNavigate(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", username: "", email: "", phone: "", password: "", bio: "" });
  if (user) return <Navigate to="/akis" replace />;
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(""); try { await register(form); navigate("/akis"); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); } }
  return <AuthFrame mode="register"><div className="mb-6"><p className="font-mono text-xs uppercase tracking-[.16em] text-[#007f24]">Yeni gözlemci</p><h2 className="mt-2 font-serif text-4xl">Hesabını oluştur.</h2></div><form onSubmit={submit} className="space-y-4"><div className="grid grid-cols-2 gap-3"><Field label="İsim"><input className={inputClass} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required /></Field><Field label="Soyisim"><input className={inputClass} value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required /></Field></div><Field label="Kullanıcı adı"><input className={inputClass} value={form.username} onChange={(e) => set("username", e.target.value.toLowerCase())} pattern="[a-z0-9_]{3,40}" autoComplete="username" required /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="E-posta"><input className={inputClass} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" required /></Field><Field label="Telefon"><input className={inputClass} type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" required /></Field></div><Field label="Şifre (en az 8 karakter)"><input className={inputClass} type="password" minLength={8} value={form.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" required /></Field><Field label="Biyografi / okul / akademik unvan"><textarea className={`${inputClass} min-h-20 resize-y`} value={form.bio} onChange={(e) => set("bio", e.target.value)} placeholder="Örn. Ege Üniversitesi Biyoloji öğrencisi" required /></Field>{error && <p role="alert" className="text-sm text-[#8d302a]">{error}</p>}<button className={`${buttonClass} w-full`} disabled={busy}>{busy ? "Hesap oluşturuluyor…" : "Kayıt ol ve başla"}<Leaf size={17} /></button></form><p className="mt-5 text-center text-sm">Zaten hesabın var mı? <Link to="/giris" className="font-semibold text-[#007f24] underline underline-offset-4">Giriş yap</Link></p></AuthFrame>;
}
