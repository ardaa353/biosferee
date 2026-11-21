import { Suspense } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { useAuth } from "@/lib/auth";
import AppShell from "./AppShell";
import ErrorBoundary from "./ErrorBoundary";
import { Loading, Logo, buttonClass, secondaryButton } from "./BioUI";

export default function PublicPostShell() {
  const { user } = useAuth();
  const location = useLocation();
  if (user) return <AppShell />;
  const next = "?next=" + encodeURIComponent(location.pathname);
  const authentication = (
    <>
      <Link to={"/giris" + next} className={secondaryButton}>
        Giriş yap
      </Link>
      <Link to={"/kayit" + next} className={buttonClass}>
        Kayıt ol
      </Link>
    </>
  );
  return (
    <div className="min-h-dvh bg-[#f4f7f4]">
      <header className="sticky top-0 z-30 border-b border-[#09352e]/10 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Logo />
          <nav aria-label="Hesap" className="flex gap-2">
            {authentication}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-3 py-7 sm:px-5">
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <footer className="border-t border-[#09352e]/10 px-4 py-8 text-center text-sm text-[#53675f]">
        BioSfere · Canlı gözlem ağı
      </footer>
    </div>
  );
}
