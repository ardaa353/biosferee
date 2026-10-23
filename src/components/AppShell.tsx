import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { CircleHelp, Home, LogOut, Map, Network, Plus, Search, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { trpc } from "@/providers/trpc";
import { Avatar, Logo } from "./BioUI";

const nav = [
  { to: "/akis", label: "Gözlem akışı", icon: Home }, { to: "/arama", label: "Tür & şehir ara", icon: Search },
  { to: "/harita", label: "Ortak harita", icon: Map }, { to: "/sistematik", label: "Sistematik şema", icon: Network },
];
export default function AppShell() {
  const { user, logout } = useAuth(); const navigate = useNavigate(); const location = useLocation();
  const posts = trpc.biosfere.posts.list.useQuery();
  const unknownCount = posts.data?.filter((p) => p.status === "unknown").length ?? 0;
  if (!user) return null;
  const navCls = ({ isActive }: { isActive: boolean }) => `flex min-h-12 items-center gap-3 rounded-lg px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09352e] ${isActive ? "bg-[#09352e] text-[#f7f7f7]" : "text-[#09352e]/75 hover:bg-[#f7f7f7]/35 hover:text-[#09352e]"}`;
  return <div className="min-h-dvh bg-[#f7f7f7] text-[#09352e] lg:grid lg:grid-cols-[260px_1fr]">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col bg-[#85c093] px-5 py-6 lg:flex">
      <div className="px-2"><Logo /></div>
      <button onClick={() => navigate("/paylas")} className="mt-9 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full border border-[#09352e] bg-[#09352e] px-4 text-sm font-semibold text-[#f7f7f7] transition hover:bg-[#15493d] active:scale-[.98]"><Plus size={18} />Yeni gözlem</button>
      <nav className="mt-7 space-y-1" aria-label="Ana navigasyon">{nav.map((n) => <NavLink key={n.to} to={n.to} className={navCls}><n.icon size={19} strokeWidth={1.8} />{n.label}</NavLink>)}<NavLink to={`/profil/${user.username}`} className={navCls}><UserRound size={19} />Profilim</NavLink>{user.role !== "user" && <NavLink to="/yonetim" className={navCls}><ShieldCheck size={19} />Yönetim</NavLink>}</nav>
      <div className="mt-auto"><NavLink to="/bilinmeyenler" className={({ isActive }) => `block rounded-xl border p-4 transition ${isActive ? "border-[#09352e] bg-[#09352e] text-[#f7f7f7]" : "border-[#09352e]/25 bg-[#f7f7f7]/25 hover:bg-[#f7f7f7]/40"}`}><div className="flex items-center justify-between"><CircleHelp size={21} /><span className="rounded-full border border-current px-2 py-0.5 font-mono text-[11px]">{unknownCount}</span></div><h2 className="mt-3 font-serif text-xl">Türü bilinmeyenler</h2><p className="mt-1 text-xs leading-5 opacity-75">Gözlemi incele, taksonomi öner.</p></NavLink>
      <div className="mt-5 flex items-center gap-2 border-t border-[#09352e]/20 px-1 pt-4"><Avatar user={{ ...user, avatarUrl: posts.data?.find((p) => p.author.id === user.id)?.author.avatarUrl }} size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{user.firstName} {user.lastName}</p><p className="truncate font-mono text-[10px] opacity-70">@{user.username}</p></div><button onClick={() => logout().then(() => navigate("/giris"))} title="Çıkış yap" className="grid h-10 w-10 cursor-pointer place-items-center rounded-full hover:bg-[#f7f7f7]/35"><LogOut size={17} /></button></div></div>
    </aside>
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#09352e]/15 bg-[#f7f7f7]/95 px-4 backdrop-blur lg:hidden"><Logo /><button onClick={() => navigate("/paylas")} className="grid h-11 w-11 place-items-center rounded-full bg-[#007f24] text-white" aria-label="Yeni gözlem"><Plus size={21} /></button></header>
    <main className="min-w-0 px-4 pb-28 pt-7 sm:px-7 lg:col-start-2 lg:px-10 lg:pb-12 lg:pt-10 xl:px-14"><div className="mx-auto max-w-[1240px]"><Outlet /></div></main>
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-[#09352e]/15 bg-[#f7f7f7]/97 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">{[...nav.slice(0, 3), { to: "/bilinmeyenler", label: "Bilinmeyen", icon: CircleHelp }, { to: `/profil/${user.username}`, label: "Profil", icon: UserRound }].map((n) => <NavLink key={n.to} to={n.to} className={({ isActive }) => `flex min-h-16 flex-col items-center justify-center gap-1 text-[10px] font-semibold ${isActive || (n.to === "/bilinmeyenler" && location.pathname === "/sistematik") ? "text-[#007f24]" : "text-[#71807e]"}`}><n.icon size={20} /><span>{n.label === "Gözlem akışı" ? "Akış" : n.label === "Tür & şehir ara" ? "Keşfet" : n.label === "Ortak harita" ? "Harita" : n.label}</span></NavLink>)}</nav>
  </div>;
}
