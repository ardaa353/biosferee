import {
  contentLanguageHint,
  needsContentTranslation,
  languageCodes,
} from "@contracts/translation";
import { useQuery } from "@tanstack/react-query";
import { translateInBrowser } from "@/lib/contentTranslation";
import { t as trText } from "@/lib/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import { t, useLocale } from "@/lib/i18n";
export default function TranslatedContent({
  kind,
  id,
  text,
  className = "",
}: {
  kind: "post" | "suggestion" | "bio" | "report";
  id: number;
  text: string;
  className?: string;
}) {
  const locale = useLocale();
  const utils = trpc.useUtils();
  const sourceHint = useMemo(() => contentLanguageHint(text), [text]);
  const matchesLanguage =
    sourceHint !== undefined && !needsContentTranslation(sourceHint, locale);
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [original, setOriginal] = useState(false);
  useEffect(() => {
    if (!container.current || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "150px" },
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setOriginal(false), [locale, text]);
  const query = trpc.biosfere.translations.get.useQuery(
    {
      kind,
      id,
      target: locale,
      preferClient: true,
      revision: Array.from(text)
        .reduce(
          (hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619),
          2166136261,
        )
        .toString(36),
    },
    {
      enabled: visible && !matchesLanguage && Boolean(text.trim()),
      staleTime: (query) =>
        query.state.data?.unavailable ? 15000 : 30 * 60000,
      retry: false,
    },
  );
  // Edited records must never display an older cached translation.
  const serverResult = query.data?.original === text ? query.data : undefined;
  const source = sourceHint ?? serverResult?.source;
  const translationNeeded = needsContentTranslation(source, locale);
  const fallback = useQuery({
    queryKey: ["observation-translation", kind, id, locale, text],
    enabled:
      visible &&
      translationNeeded &&
      Boolean(
        serverResult?.needsClientTranslation ||
        serverResult?.unavailable ||
        query.isError,
      ),
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      try {
        return await translateInBrowser(
          text,
          source || (locale === "en" ? "tur" : "eng"),
          locale,
          signal,
        );
      } catch (error) {
        signal.throwIfAborted();
        // Server-side delivery remains available for browsers that block cross-origin requests.
        const result = await utils.biosfere.translations.get.fetch({
          kind,
          id,
          target: locale,
          preferClient: false,
        });
        if (!result.translated) throw error;
        return result;
      }
    },
  });
  const result = !translationNeeded
    ? undefined
    : serverResult?.translated
      ? serverResult
      : fallback.data?.original === text
        ? fallback.data
        : serverResult;
  const translating =
    translationNeeded && (query.isFetching || fallback.isFetching);
  return (
    <div ref={container}>
      <p
        className={className}
        lang={
          original || !result?.translated
            ? source
              ? languageCodes[source] || source
              : undefined
            : locale
        }
      >
        {!original && result?.translated ? result.text : text}
      </p>
      {result?.translated ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#53675f]">
          <span>{t("Otomatik çeviri")}</span>
          <button
            type="button"
            className="min-h-8 font-semibold underline underline-offset-2"
            onClick={() => setOriginal((value) => !value)}
          >
            {t(original ? trText("Çeviriyi göster") : trText("Aslını göster"))}
          </button>
        </div>
      ) : translating ? (
        <p role="status" className="mt-2 text-xs text-[#71807e]">
          {t("Çevriliyor…")}
        </p>
      ) : translationNeeded &&
        (result?.unavailable || query.isError || fallback.isError) ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#71807e]">
          <span>
            {t("Çeviri şu anda kullanılamıyor. Özgün metin gösteriliyor.")}
          </span>
          <button
            type="button"
            className="min-h-8 underline"
            onClick={() => {
              if (
                serverResult?.needsClientTranslation ||
                serverResult?.unavailable ||
                query.isError
              )
                void fallback.refetch();
              else void query.refetch();
            }}
          >
            {t(t("Yeniden dene"))}
          </button>
        </div>
      ) : null}
    </div>
  );
}
