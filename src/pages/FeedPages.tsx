import {
  useCallback,
  useEffect,
  useRef,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router";
import { Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { trpc } from "@/providers/trpc";
import PostCard from "@/components/PostCard";
import {
  Empty,
  FeedSkeleton,
  PageHeading,
  QueryError,
  buttonClass,
  secondaryButton,
} from "@/components/BioUI";

function viewedPosts(key: string): number[] {
  try {
    const data = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(data)
      ? data.filter((id) => Number.isSafeInteger(id) && id > 0).slice(-200)
      : [];
  } catch {
    return [];
  }
}
function VisiblePost({
  children,
  id,
  record,
}: {
  children: ReactNode;
  id: number;
  record: (id: number) => void;
}) {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        clearTimeout(timer);
        if (entries[0].isIntersecting && document.visibilityState === "visible")
          timer = setTimeout(() => {
            record(id);
            observer.disconnect();
          }, 900);
      },
      { threshold: 0.35 },
    );
    if (target.current) observer.observe(target.current);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [id, record]);
  return (
    <div ref={target} className="feed-post">
      {children}
    </div>
  );
}
function ObservationFeed({ unknown = false }: { unknown?: boolean }) {
  const { user } = useAuth();
  const storageKey = "biosfere_viewed_" + user?.id;
  const [session] = useState(() => ({
    seed: crypto.randomUUID(),
    seenIds: viewedPosts(storageKey),
  }));
  const [kingdom, setKingdom] = useState("all");
  const record = useCallback(
    (id: number) => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify(
            [
              ...viewedPosts(storageKey).filter((value) => value !== id),
              id,
            ].slice(-200),
          ),
        );
      } catch {
        /* Ranking remains available when browser storage is full. */
      }
    },
    [storageKey],
  );
  const query = trpc.biosfere.posts.feed.useInfiniteQuery(
    {
      status: unknown ? "unknown" : "verified",
      sort: unknown ? "newest" : "recommended",
      kingdom: kingdom === "all" ? undefined : kingdom,
      limit: 12,
      ...session,
    },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );
  const posts = useMemo(
    () => [
      ...new Map(
        (query.data?.pages.flatMap((page) => page.items) || []).map((post) => [
          post.id,
          post,
        ]),
      ).values(),
    ],
    [query.data],
  );
  return (
    <div className="mx-auto max-w-[840px]">
      {unknown && (
        <PageHeading
          eyebrow="Toplulukla tanımla"
          title="Türü bilinmeyenler"
          description="Tanımlanmayı bekleyen gözlemleri incele ve tür önerilerinle katkı sağla."
          action={
            <Link to="/paylas?bilinmiyor=1" className={buttonClass}>
              <Plus size={17} />
              Gözlem paylaş
            </Link>
          }
        />
      )}
      {!unknown && <h1 className="sr-only">Canlı gözlemleri</h1>}
      <div className="mb-5">
        <div
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
          role="group"
          aria-label="Âleme göre filtrele"
        >
          {[
            ["all", "Tümü"],
            ["Animalia", "Hayvanlar"],
            ["Plantae", "Bitkiler"],
            ["Fungi", "Mantarlar"],
            ["Bacteria", "Bakteriler"],
            ["Protista", "Protistler"],
            ["Archaea", "Arkeler"],
          ].map(([key, label]) => (
            <button
              key={key}
              aria-pressed={kingdom === key}
              onClick={() => setKingdom(key)}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition ${kingdom === key ? "border-[#143e31] bg-[#143e31] text-white" : "border-[#09352e]/15 bg-white text-[#40574c] hover:border-[#007f24]"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {query.isPending ? (
        <FeedSkeleton />
      ) : query.isError && !posts.length ? (
        <QueryError retry={() => query.refetch()} />
      ) : posts.length ? (
        <>
          <div className="space-y-7">
            {posts.map((post, index) => (
              <VisiblePost key={post.id} id={post.id} record={record}>
                <PostCard post={post} priority={index === 0} />
              </VisiblePost>
            ))}
          </div>
          {query.isError && (
            <div className="mt-5">
              <QueryError retry={() => query.fetchNextPage()} />
            </div>
          )}
          {query.hasNextPage && !query.isError && (
            <div className="mt-8 text-center">
              <button
                className={secondaryButton}
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {query.isFetchingNextPage
                  ? "Gözlemler getiriliyor…"
                  : "Daha fazla gözlem"}
              </button>
            </div>
          )}
        </>
      ) : (
        <Empty
          title={
            kingdom !== "all"
              ? "Bu âlemde henüz gözlem yok"
              : unknown
                ? "Tanımlama bekleyen gözlem yok"
                : "İlk gözlem seninle başlasın"
          }
          text={
            kingdom !== "all"
              ? "Başka bir âlemi seçebilir veya bu gruba ilk gözlemi ekleyebilirsin."
              : unknown
                ? "Türünden emin olmadığın bir canlıyla karşılaştığında topluluğa sorabilirsin."
                : "Fotoğraf, konum ve tür bilgisiyle doğanın ortak kaydına ilk katkıyı yap."
          }
          action={
            <Link
              to={unknown ? "/paylas?bilinmiyor=1" : "/paylas"}
              className={buttonClass}
            >
              Gözlem ekle
            </Link>
          }
        />
      )}
    </div>
  );
}
export function FeedPage() {
  return <ObservationFeed />;
}
export function UnknownPage() {
  return <ObservationFeed unknown />;
}
