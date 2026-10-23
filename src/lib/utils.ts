import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = reject; reader.readAsDataURL(file);
  });
}
export async function toImageInputs(files: File[]) {
  return Promise.all(files.map(async (file) => ({ name: file.name, contentType: file.type, contentBase64: await fileToBase64(file) })));
}
export function formatDate(date: Date) { return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" }).format(date); }
export function seasonOf(date: Date) { const m = date.getMonth() + 1; return m >= 3 && m <= 5 ? "İlkbahar" : m >= 6 && m <= 8 ? "Yaz" : m >= 9 && m <= 11 ? "Sonbahar" : "Kış"; }
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu."; }
