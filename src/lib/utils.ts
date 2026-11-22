import { localeTag } from "@/lib/i18n";
import { t as trText } from "@/lib/i18n";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function formatDate(date: Date) {
  return new Intl.DateTimeFormat(localeTag(), {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
export function seasonOf(date: Date) {
  const m = date.getMonth() + 1;
  return m >= 3 && m <= 5
    ? trText("İlkbahar")
    : m >= 6 && m <= 8
      ? trText("Yaz")
      : m >= 9 && m <= 11
        ? trText("Sonbahar")
        : trText("Kış");
}
export function errorMessage(error: unknown) {
  if (!(error instanceof Error)) return trText("Beklenmeyen bir hata oluştu.");
  try {
    const issues = JSON.parse(error.message);
    if (Array.isArray(issues))
      return issues
        .map((issue) => trText(String(issue.message || "")))
        .join(" ");
  } catch {
    /* Ordinary server errors are plain text. */
  }
  return trText(error.message);
}
