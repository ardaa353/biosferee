import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let instance: ReturnType<typeof drizzle<typeof fullSchema>>;

export function getDb() {
  if (!instance) {
    // Render'dan veya lokalden gelen URL'yi doğrudan alıyoruz
    const dbUrl = process.env.DATABASE_URL;

    // Eğer Render değişkeni okuyamazsa (boş gelirse) saçma sapan "Invalid URL" hatası vermek yerine tam sebebi konsola yazdıracak:
    if (!dbUrl) {
      console.error("🚨 KRİTİK HATA: DATABASE_URL değişkeni sunucuda bulunamadı veya boş dönüyor!");
      throw new Error("Veritabanı URL'si eksik. Lütfen Render Environment Variables ayarlarını kontrol edin.");
    }

    // Değişken varsa bağlantıyı kuruyor
    instance = drizzle(dbUrl, {
      mode: "planetscale",
      schema: fullSchema,
    });
  }
  return instance;
}
