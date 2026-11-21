import { Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { CircleHelp, Home, LogOut, Map, Network, Plus, Search, ShieldCheck, UserRound, WifiOff } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { trpc } from "@/providers/trpc";
import { Avatar, Loading, Logo } from "./BioUI";
import ErrorBoundary from "./ErrorBoundary";

const nav = [
  {to: "/akis", label: "Gözlem akışı", short: "Akış", icon: Home},
  {to: "/arama", label: "Tür ve konum ara", short: "Keşfet", icon: Search},
  {to: "/harita", label: "Ortak harita", short: "Harita", icon: Map},
  {to: "/sistematik", label: "Sistematik şema", short: "Sistematik", icon: Network},
];
export default function AppShell() {
  const {user, logout} = useAuth(), navigate = useNavigate(), location = useLocation();
  const summary = trpc.biosfere.posts.summary.useQuery();
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => {window.removeEventListener("online", update); window.removeEventListener("offline", update);};
  }, []);
  useEffect(() => {
    window.scrollTo({top: 0, behavior: "instant"});
    const title = nav.find(item => item.to === location.pathname)?.label || (location.pathname === "/paylas" ? "Yeni gözlem" : location.pathname.startsWith("/profil/") ? "Gözlemci profili" : "Canlı gözlem ağı");
    document.title = title + " · BioSfere";
  }, [location.pathname]);
  if (!user) return null;
  const navCls = ({isActive}: {isActive: boolean}) => `flex min-h-12 items-center gap-3 rounded-xl px-3.5 text-sm font-medium transition ${isActive ? "bg-[#e3efe5] text-[#143e31] shadow-sm" : "text-[#d2e2d8] hover:bg-white/10 hover:text-white"}`;
  return <div className="min-h-dvh bg-[#f4f7f4] text-[#09352e] lg:grid lg:grid-cols-[248px_1fr]">
    <a className="skip-link" href="#main-content">İçeriğe geç</a>
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col overflow-y-auto bg-[#123c30] px-5 py-7 text-white lg:flex">
      <div className="px-2"><Logo /><p className="mt-2 pl-[52px] text-[12px] tracking-wide text-[#b6cebe]">Canlı gözlem ağı</p></div>
      <button onClick={() => navigate("/paylas")} className="mt-8 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#c1dec3] px-4 text-sm font-semibold text-[#123c30] transition hover:bg-[#d7ead8]"><Plus size={18} />Yeni gözlem</button>
      <nav className="mt-6 space-y-1.5" aria-label="Ana menü">{nav.map(item => <NavLink key={item.to} to={item.to} className={navCls}><item.icon size={19} strokeWidth={1.8} />{item.label}</NavLink>)}<NavLink to={`/profil/${user.username}`} className={navCls}><UserRound size={19} />Profilim</NavLink>{user.role !== "user" && <NavLink to="/yonetim" className={navCls}><ShieldCheck size={19} />Yönetim</NavLink>}</nav>
      <div className="mt-auto pt-8"><NavLink to="/bilinmeyenler" className="block rounded-2xl border border-white/15 bg-white/5 p-4 transition hover:bg-white/10"><div className="flex items-center justify-between"><CircleHelp size={21} /><span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs">{summary.data?.unknown ?? "—"}</span></div><h2 className="mt-3 font-serif text-xl">Bir türü birlikte tanıyalım.</h2><p className="mt-2 text-sm leading-6 text-[#bfd4c7]">Tanımlanmayı bekleyen gözlemlere katkıda bulun.</p></NavLink>
        <div className="mt-5 flex items-center gap-2 border-t border-white/15 pt-5"><NavLink to={`/profil/${user.username}`} aria-label="Profilimi aç"><Avatar user={user} size="sm" /></NavLink><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{user.firstName} {user.lastName}</p><p className="truncate text-xs text-[#bfd4c7]">@{user.username}</p></div><button onClick={() => void logout().then(() => navigate("/giris"))} aria-label="Çıkış yap" className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-white/10"><LogOut size={17} /></button></div>
      </div>
    </aside>
    <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-[#09352e]/10 bg-white/95 px-4 backdrop-blur lg:hidden"><Logo /><button onClick={() => navigate("/paylas")} className="flex h-11 items-center gap-1.5 rounded-xl bg-[#007f24] px-3 text-sm font-semibold text-white" aria-label="Yeni gözlem"><Plus size={19} /><span className="hidden min-[360px]:inline">Gözlem ekle</span></button></header>
    <main id="main-content" tabIndex={-1} className="min-w-0 px-4 pb-28 pt-7 outline-none sm:px-7 lg:col-start-2 lg:px-10 lg:pb-12 lg:pt-11 xl:px-14"><div className="mx-auto max-w-[1240px]">
      {!online && <div role="status" className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><WifiOff size={18} className="shrink-0" />İnternet bağlantısı yok. Bağlandığında kayıtlar yeniden güncellenecek.</div>}
      <ErrorBoundary resetKey={location.pathname}><Suspense fallback={<Loading label="Sayfa açılıyor…" />}><Outlet /></Suspense></ErrorBoundary>
    </div></main>
    <nav aria-label="Mobil menü" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-[#09352e]/10 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">{[...nav, {to: "/bilinmeyenler", label: "Türü bilinmeyenler", short: "Bilinmeyen", icon: CircleHelp}, {to: `/profil/${user.username}`, label: "Profilim", short: "Profil", icon: UserRound}].map(item => <NavLink key={item.to} to={item.to} aria-label={item.label} className={({isActive}) => `flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-1 text-[10px] font-medium ${isActive ? "text-[#007f24]" : "text-[#556c60]"}`}><item.icon size={20} strokeWidth={1.8} /><span>{item.short}</span></NavLink>)}</nav>
  </div>;
}
