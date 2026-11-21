import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Loading, Logo, QueryError } from "@/components/BioUI";
import AppShell from "@/components/AppShell";
import { LoginPage, RegisterPage } from "@/pages/AuthPages";
import { FeedPage, UnknownPage } from "@/pages/FeedPages";
const CreatePostPage = lazy(() => import("@/pages/CreatePostPage"));
const EditPostPage = lazy(() => import("@/pages/EditPostPage"));
const PostDetailPage = lazy(() => import("@/pages/PostDetailPage"));
const MapPage = lazy(() => import("@/pages/ExplorePages").then(m => ({ default: m.MapPage })));
const SearchPage = lazy(() => import("@/pages/ExplorePages").then(m => ({ default: m.SearchPage })));
const TaxonomyPage = lazy(() => import("@/pages/ExplorePages").then(m => ({ default: m.TaxonomyPage })));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const AdminPage = lazy(() => import("@/pages/AdminPage"));
// YENİ EKLENDİ: Ayarlar sayfasını import ediyoruz
const SettingsPage = lazy(() => import("@/pages/SettingsPage")); 

function Protected() { 
  const { user, loading, error, refresh } = useAuth(); 
  if (loading) return <div className="grid min-h-dvh place-items-center"><Loading label="BioSfere açılıyor…" /></div>; 
  if (error && !user) return <main className="mx-auto max-w-lg px-5 pt-20"><QueryError retry={refresh} /></main>;
  return user ? <AppShell /> : <Navigate to="/giris" replace />; 
}

function HomeRedirect() { 
  const { user, loading } = useAuth(); 
  if (loading) return <Loading />; 
  return <Navigate to={user ? "/akis" : "/giris"} replace />; 
}

function NotFound() { 
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <div className="mb-6 flex justify-center"><Logo /></div>
        <p className="font-mono text-xs text-[#007f24]">404 / KAYIT BULUNAMADI</p>
        <h1 className="mt-3 font-serif text-4xl">Bu patika çıkmaza girdi.</h1>
        <a href="/akis" className="mt-5 inline-block font-semibold text-[#007f24] underline">
          Gözlem akışına dön
        </a>
      </div>
    </main>
  ); 
}

export default function App() { 
  return (
    <AuthProvider>
      <Suspense fallback={<Loading />}><Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/giris" element={<LoginPage />} />
        <Route path="/kayit" element={<RegisterPage />} />
        
        {/* Giriş yapmış kullanıcıların görebileceği sayfalar (Protected) */}
        <Route element={<Protected />}>
          <Route path="/akis" element={<FeedPage />} />
          <Route path="/paylas" element={<CreatePostPage />} />
          <Route path="/gonderi/:id/duzenle" element={<EditPostPage />} />
          <Route path="/gonderi/:id" element={<PostDetailPage />} />
          <Route path="/bilinmeyenler" element={<UnknownPage />} />
          <Route path="/arama" element={<SearchPage />} />
          <Route path="/harita" element={<MapPage />} />
          <Route path="/sistematik" element={<TaxonomyPage />} />
          <Route path="/profil/:username" element={<ProfilePage />} />
          
          {/* Ayarlar sayfası rotası */}
          <Route path="/ayarlar" element={<SettingsPage />} />
          
          {/* YENİ: Hem /admin hem de /yonetim adresleri aynı sayfayı (AdminPage) açacak */}
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/yonetim" element={<AdminPage />} />
        </Route>
        
        {/* Eşleşmeyen tüm adresler için 404 sayfası */}
        <Route path="*" element={<NotFound />} />
      </Routes></Suspense>
    </AuthProvider>
  ); 
}
