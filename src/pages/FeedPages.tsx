import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router";
import { Plus, RefreshCw } from "lucide-react";
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
  return <div ref={target}>{children}</div>;
}
function ObservationFeed({ unknown = false }: { unknown?: boolean }) {
  const { user } = useAuth();
  const storageKey = "biosfere_viewed_" + user?.id;
  const [session, setSession] = useState(() => ({
    seed: crypto.randomUUID(),
    seenIds: viewedPosts(storageKey),
  }));
  const [sort, setSort] = useState<"recommended" | "reputation" | "newest">(
      "recommended",
    ),
    [kingdom, setKingdom] = useState("all");
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
      sort: unknown ? "newest" : sort,
      kingdom: kingdom === "all" ? undefined : kingdom,
      limit: 12,
      ...session,
    },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );
  const posts = [
    ...new Map(
      (query.data?.pages.flatMap((page) => page.items) || []).map((post) => [
        post.id,
        post,
      ]),
    ).values(),
  ];
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
      {!unknown && (
        <div className="mb-5 flex items-center justify-between gap-3">
          <h1 className="font-serif text-2xl">Akış</h1>
          <button
            type="button"
            className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[#40574c] hover:bg-white"
            onClick={() =>
              setSession({
                seed: crypto.randomUUID(),
                seenIds: viewedPosts(storageKey),
              })
            }
          >
            <RefreshCw size={16} />
            Yenile
          </button>
        </div>
      )}
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
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
      {!unknown && (
        <div className="mb-5 flex items-center justify-between gap-3">
          <span />
          <label className="flex shrink-0 items-center gap-2 text-sm text-[#40574c]">
            <span className="sr-only">Gözlem sıralaması</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as typeof sort)}
              className="min-h-11 rounded-lg border border-[#09352e]/15 bg-white px-3 pr-8 text-sm"
            >
              <option value="recommended">Senin için</option>
              <option value="reputation">İtibara göre</option>
              <option value="newest">En yeni</option>
            </select>
          </label>
        </div>
      )}
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
