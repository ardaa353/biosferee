import CommonName from "@/components/CommonName";
import { getLocale, t as trText } from "@/lib/i18n";
import TranslatedContent from "./TranslatedContent";
import { createPortal } from "react-dom";
import PhotoGallery from "@/components/PhotoGallery";
import { memo, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useAuth } from "@/lib/auth";
import {
  CalendarDays,
  CircleHelp,
  Flag,
  Heart,
  MapPin,
  Users,
  X,
  Pencil,
  Trash2,
  Share2,
} from "lucide-react";
import { trpc, queryClient } from "@/providers/trpc";
import { getQueryKey } from "@trpc/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import type { BioPost } from "@/lib/types";
import { cn, errorMessage, formatDate, seasonOf } from "@/lib/utils";
import {
  Avatar,
  buttonClass,
  inputClass,
  secondaryButton,
} from "@/components/BioUI";
function PostCard({
  post,
  compact = false,
  priority = false,
}: {
  post: BioPost;
  compact?: boolean;
  priority?: boolean;
}) {
  const [reporting, setReporting] = useState(false);
  const [optimisticLike, setOptimisticLike] = useState<{
    liked: boolean;
    count: number;
  } | null>(null);
  const isLiked = optimisticLike?.liked ?? post.liked;
  const likeCount = optimisticLike?.count ?? post.likeCount;
  const [details, setDetails] = useState("");
  const [reason, setReason] = useState<
    "misleading" | "wrong_species" | "inappropriate" | "other"
  >("wrong_species");
  const [message, setMessage] = useState("");
  const utils = trpc.useUtils();
  const { user: currentUser } = useAuth();
  const location = useLocation(),
    navigate = useNavigate();
  const login = () =>
    navigate("/giris?next=" + encodeURIComponent(`/gonderi/${post.id}`));
  async function share() {
    const url = new URL(`/gonderi/${post.id}`, window.location.origin).href;
    try {
      if (navigator.share)
        await navigator.share({
          title: post.commonName || post.species || trText("BioSfere gözlemi"),
          url,
        });
      else {
        await navigator.clipboard.writeText(url);
        setMessage(trText("Gönderi bağlantısı kopyalandı."));
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setMessage(trText("Bağlantı: ") + url);
    }
  }
  const like = trpc.biosfere.posts.toggleLike.useMutation({
    onSuccess: async (result) => {
      await queryClient.cancelQueries({
        queryKey: getQueryKey(trpc.biosfere.posts),
      });
      const patch = (item: BioPost): BioPost => {
        const target = item.id === post.id;
        const sameAuthor =
          result.authorId !== null && item.author.id === result.authorId;
        if (!target && !sameAuthor) return item;
        return {
          ...item,
          ...(target
            ? { liked: result.liked, likeCount: result.likeCount }
            : {}),
          ...(sameAuthor
            ? {
                author: { ...item.author, reputation: result.authorReputation },
              }
            : {}),
        };
      };
      utils.biosfere.posts.list.setData(undefined, (data) => data?.map(patch));
      queryClient.setQueriesData<BioPost>(
        { queryKey: getQueryKey(trpc.biosfere.posts.get) },
        (data) => (data ? patch(data) : data),
      );
      queryClient.setQueriesData<
        InfiniteData<{
          items: BioPost[];
          nextCursor: number | null;
        }>
      >({ queryKey: getQueryKey(trpc.biosfere.posts.feed) }, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                items: page.items.map(patch),
              })),
            }
          : data,
      );
      if (result.authorId !== null)
        utils.biosfere.users.list.setData(undefined, (users) =>
          users?.map((user) =>
            user.id === result.authorId
              ? { ...user, reputation: result.authorReputation }
              : user,
          ),
        );
      setOptimisticLike(null);
    },
    onError: (error) => {
      setOptimisticLike(null);
      setMessage(errorMessage(error));
    },
  });
  const report = trpc.biosfere.posts.report.useMutation({
    onSuccess: () => {
      setReporting(false);
      setDetails("");
      setMessage(trText("Raporunuz moderasyon ekibine iletildi."));
    },
    onError: (error) => {
      setMessage(errorMessage(error));
    },
  });
  const deletePost = trpc.biosfere.posts.delete.useMutation({
    onSuccess: async () => {
      setMessage(trText("Gönderi başarıyla silindi."));
      if (location.pathname === `/gonderi/${post.id}`)
        navigate("/akis", { replace: true });
      await Promise.all([
        utils.biosfere.posts.invalidate(),
        utils.biosfere.posts.get.invalidate({ id: post.id }),
      ]);
    },
    onError: (error) => {
      setMessage(trText("Gönderi silinemedi: ") + errorMessage(error));
    },
  });
  function submitReport(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    report.mutate({
      postId: post.id,
      reason,
      details,
    });
  }
  const isOwnerOrAdmin =
    !!currentUser &&
    (String(currentUser.id) === String(post.author.id) ||
      currentUser.role === "admin");
  return (
    <article
      className="observation-card overflow-hidden rounded-2xl border border-[#09352e]/10 bg-white p-4 shadow-[0_2px_8px_rgba(15,50,35,0.025)] sm:p-6"
      id={"gonderi-" + post.id}
    >
      <header className="mb-4 flex items-center gap-3">
        {post.author.isSystem || !currentUser ? (
          <Avatar user={post.author} />
        ) : (
          <Link to={`/profil/${post.author.username}`}>
            <Avatar user={post.author} />
          </Link>
        )}

        <div className="min-w-0 flex-1">
          {post.author.isSystem ? (
            <p className="text-sm font-bold">BioSfere</p>
          ) : !currentUser ? (
            <p className="text-sm font-bold">
              {post.author.firstName} {post.author.lastName}
            </p>
          ) : (
            <>
              <Link
                to={`/profil/${post.author.username}`}
                className="text-sm font-bold hover:underline hover:text-[#007f24]"
              >
                {post.author.firstName} {post.author.lastName}
              </Link>
              <p className="text-xs text-[#71807e]">
                @{post.author.username} · {post.author.reputation}
                {trText(" itibar")}
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          {isOwnerOrAdmin && (
            <>
              <Link
                to={`/gonderi/${post.id}/duzenle`}
                className="grid h-11 w-11 cursor-pointer place-items-center rounded-full text-[#71807e] transition hover:bg-blue-500/10 hover:text-blue-600"
                aria-label={trText("Gönderiyi düzenle")}
              >
                <Pencil size={18} />
              </Link>

              <button
                type="button"
                disabled={deletePost.isPending}
                onClick={() => {
                  const confirmed = window.confirm(
                    trText(
                      "Bu gönderiyi silmek istediğinize emin misiniz? Bu işlem geri alınamaz.",
                    ),
                  );
                  if (confirmed) {
                    setMessage("");
                    deletePost.mutate({ postId: post.id });
                  }
                }}
                className="grid h-11 w-11 cursor-pointer place-items-center rounded-full text-[#71807e] transition hover:bg-red-500/10 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={trText("Gönderiyi sil")}
                title={
                  deletePost.isPending
                    ? trText("Gönderi siliniyor...")
                    : trText("Gönderiyi sil")
                }
              >
                <Trash2 size={18} />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => {
              if (!currentUser) {
                login();
                return;
              }
              setMessage("");
              setReporting(true);
            }}
            className="grid h-11 w-11 cursor-pointer place-items-center rounded-full text-[#71807e] transition hover:bg-[#a63f36]/10 hover:text-[#8d302a]"
            aria-label={trText("Gönderiyi raporla")}
          >
            <Flag size={18} />
          </button>
        </div>
      </header>

      <PhotoGallery
        priority={priority}
        images={post.images}
        alt={
          (getLocale() === "en"
            ? post.species
            : post.commonName || post.species) || trText("Canlı gözlemi")
        }
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            {post.status === "unknown" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#a96d15]/30 bg-[#f2e5c9] px-2.5 py-1 font-mono text-xs font-semibold uppercase text-[#78500f]">
                <CircleHelp size={13} />
                {trText("Türü bilinmiyor")}
              </span>
            ) : (
              <span className="font-mono text-xs font-semibold uppercase tracking-[.14em] text-[#007f24]">
                {post.kingdom}
                {trText(" / türü belirtilmiş gözlem")}
              </span>
            )}
          </div>

          <Link to={"/gonderi/" + post.id}>
            <h2 className="font-serif text-3xl leading-tight tracking-[-.6px] hover:underline">
              {post.status === "unknown" ? (
                trText("Bu canlıyı tanıyor musun?")
              ) : (
                <CommonName taxon={post} />
              )}
            </h2>

            {post.species && post.commonName && (
              <p className="mt-0.5 font-serif text-lg italic text-[#50665d]">
                {post.species}
              </p>
            )}
          </Link>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!currentUser) {
              login();
              return;
            }
            const liked = !isLiked;
            setMessage("");
            setOptimisticLike({
              liked,
              count: Math.max(0, likeCount + (liked ? 1 : -1)),
            });
            like.mutate({ postId: post.id, liked });
          }}
          disabled={like.isPending}
          aria-pressed={isLiked}
          aria-label={trText("{0}: {1} beğeni", [
            isLiked ? trText("Beğeniyi kaldır") : trText("Gözlemi beğen"),
            likeCount,
          ])}
          className={cn(
            "flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold transition",
            isLiked
              ? "border-[#a63f36]/25 bg-[#a63f36]/10 text-[#8d302a]"
              : "border-[#09352e]/20 hover:border-[#a63f36]/40",
          )}
        >
          <Heart size={19} fill={isLiked ? "currentColor" : "none"} />
          {likeCount}
        </button>
      </div>

      {!compact && (
        <div className="mt-4 rounded-xl border border-[#09352e]/5 bg-[#f4f7f5] p-4">
          <TranslatedContent
            kind="post"
            id={post.id}
            text={post.description}
            className={
              (location.pathname === `/gonderi/${post.id}`
                ? ""
                : "line-clamp-3 ") +
              "whitespace-pre-wrap text-[15px] leading-7 text-[#354f43]"
            }
          />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#5f7169]">
        <span className="inline-flex items-center gap-1.5">
          <MapPin size={14} />
          {post.locality}, {post.city}
        </span>

        <span className="inline-flex items-center gap-1.5">
          <CalendarDays size={14} />
          {formatDate(post.createdAt)} · {seasonOf(post.createdAt)}
        </span>
      </div>

      {post.collaborators.length > 0 && (
        <p className="mt-3 flex items-center gap-2 text-xs text-[#5f7169]">
          <Users size={15} />
          {trText("Ortak çalışma:")}{" "}
          {post.collaborators.map((c, index) => (
            <span key={c.id}>
              {currentUser ? (
                <Link
                  to={`/profil/${c.username}`}
                  className="hover:underline hover:text-[#007f24] font-semibold transition-colors"
                >
                  {c.firstName} {c.lastName}
                </Link>
              ) : (
                <span>
                  {c.firstName} {c.lastName}
                </span>
              )}
              {index < post.collaborators.length - 1 ? ", " : ""}
            </span>
          ))}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void share()}
          className={secondaryButton}
        >
          <Share2 size={16} />
          {trText("Paylaş")}
        </button>
        <Link to={"/gonderi/" + post.id} className={secondaryButton}>
          {post.status === "unknown"
            ? trText("Türü şu olabilir")
            : trText("Gözlemi aç")}
        </Link>
      </div>

      {message && (
        <p
          role="status"
          className={
            "mt-3 text-sm " +
            (message.includes(trText("silinemedi")) ||
            message.includes(trText("hata")) ||
            message.includes(trText("başarısız"))
              ? "text-[#8d302a]"
              : "text-[#007f24]")
          }
        >
          {trText(message)}
        </p>
      )}

      {reporting &&
        createPortal(
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-[#09352e]/55 p-4"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                setReporting(false);
              }
            }}
          >
            <form
              onSubmit={submitReport}
              className="w-full max-w-md rounded-2xl bg-[#f7f7f7] p-6 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-label={trText("Gönderiyi raporla")}
            >
              <div className="mb-5 flex items-center justify-between">
                <h3 className="font-serif text-2xl">
                  {trText("İçeriği raporla")}
                </h3>

                <button
                  type="button"
                  onClick={() => {
                    setReporting(false);
                  }}
                  className="grid h-10 w-10 place-items-center rounded-full hover:bg-[#85c093]/20"
                  aria-label={trText("Kapat")}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <label className="block text-sm font-semibold">
                  {trText("Rapor nedeni")}
                  <select
                    className={`${inputClass} mt-2`}
                    value={reason}
                    onChange={(e) => {
                      setReason(
                        e.target.value as
                          | "misleading"
                          | "wrong_species"
                          | "inappropriate"
                          | "other",
                      );
                    }}
                  >
                    <option value="wrong_species">
                      {trText("Yanlış tür bilgisi")}
                    </option>
                    <option value="misleading">
                      {trText("Yanıltıcı içerik")}
                    </option>
                    <option value="inappropriate">
                      {trText("Uygunsuz içerik")}
                    </option>
                    <option value="other">{trText("Diğer")}</option>
                  </select>
                </label>

                <label className="block text-sm font-semibold">
                  {trText("Açıklama")}
                  <textarea
                    className={`${inputClass} mt-2 min-h-28`}
                    value={details}
                    onChange={(e) => {
                      setDetails(e.target.value);
                    }}
                    minLength={5}
                    maxLength={1500}
                    required
                    placeholder={trText(
                      "Moderasyon ekibinin inceleyebilmesi için ayrıntı verin.",
                    )}
                  />
                </label>

                {report.error && (
                  <p className="text-sm text-[#8d302a]">
                    {errorMessage(report.error)}
                  </p>
                )}

                <button
                  type="submit"
                  className={`${buttonClass} w-full`}
                  disabled={report.isPending}
                >
                  {report.isPending
                    ? trText("Gönderiliyor...")
                    : trText("Raporu gönder")}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </article>
  );
}
export default memo(PostCard);
