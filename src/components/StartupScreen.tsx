import { t as trText } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n";
export default function StartupScreen({
  failed = false,
  retry,
}: {
  failed?: boolean;
  retry?: () => void;
}) {
  useLocale();
  return (
    <div className="biosfere-startup" role="status" aria-live="polite">
      <div className="biosfere-startup-brand" aria-hidden="true">
        <span className="biosfere-startup-mark">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 21c0-3 1.85-5.36 5.08-6" />
            <g className="biosfere-startup-leaf">
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
              <path d="M7.08 15C9.5 14.52 12 13 13 12" />
            </g>
          </svg>
        </span>
        <span className="biosfere-startup-word">
          Bio<em>Sfere</em>
        </span>
      </div>
      <p className="biosfere-startup-label">
        {failed
          ? trText("Bağlantı henüz kurulamadı.")
          : trText("BioSfere açılıyor…")}
      </p>
      {failed && (
        <button
          type="button"
          className="biosfere-startup-retry"
          onClick={retry}
        >
          {trText("Yeniden dene")}
        </button>
      )}
    </div>
  );
}
