import { useSyncExternalStore } from "react";
import messages from "./messages.en.json";
export type Locale = "tr" | "en";
export function deviceLocale(
  language = typeof navigator === "undefined" ? "tr" : navigator.language,
): Locale {
  return /^tr(?:-|$)/i.test(language) ? "tr" : "en";
}
function initialLocale(): Locale {
  if (typeof document === "undefined") return "tr";
  try {
    const saved =
      localStorage.getItem("biosfere_session") &&
      localStorage.getItem("biosfere_locale_current");
    if (saved === "tr" || saved === "en") return saved;
  } catch {
    /* Device detection also works without browser storage. */
  }
  return deviceLocale();
}
let locale = initialLocale();
const listeners = new Set<() => void>();
export const getLocale = () => locale;
export const localeTag = () => (locale === "tr" ? "tr-TR" : "en-GB");
export function setAccountLanguage(preference: Locale | null) {
  try {
    if (preference) localStorage.setItem("biosfere_locale_current", preference);
    else localStorage.removeItem("biosfere_locale_current");
  } catch {
    /* The account preference remains stored on the server. */
  }
  const next = preference ?? deviceLocale();
  if (locale !== next) {
    locale = next;
    listeners.forEach((listener) => listener());
  }
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}
export function useLocale() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getLocale,
    () => "tr" as const,
  );
}
const dictionary = messages as Record<string, string>;
const originals = new Map(
  Object.entries(dictionary).map(([tr, en]) => [en, tr]),
);
const templates = Object.entries(dictionary)
  .filter(([key]) => /\{\d+\}/.test(key))
  .map(([tr, en]) => ({
    tr,
    en,
    pattern: new RegExp(
      "^" +
        tr
          .split(/\{\d+\}/)
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join("([\\s\\S]*?)") +
        "$",
    ),
  }));
export function t(text: string | number, values?: readonly unknown[]): string {
  if (typeof text === "number") return String(text);
  const normalized = text.replace(/\s+/g, " ").trim();
  const original = dictionary[normalized]
    ? normalized
    : (originals.get(normalized) ?? normalized);
  let translated =
    locale === "en" ? (dictionary[original] ?? original) : original;
  if (locale === "en" && translated === original && !values) {
    for (const template of templates) {
      const match = normalized.match(template.pattern);
      if (match) {
        translated = template.en.replace(
          /\{(\d+)\}/g,
          (_, index) => match[Number(index) + 1] ?? "",
        );
        break;
      }
    }
  }
  if (values)
    translated = translated.replace(/\{(\d+)\}/g, (_, index) =>
      String(values[Number(index)] ?? ""),
    );
  const leading = /^\s/.test(text) ? " " : "",
    trailing = /\s$/.test(text) ? " " : "";
  return leading + translated + trailing;
}
