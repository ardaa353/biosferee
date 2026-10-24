import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };
let instance: ReturnType<typeof drizzle<typeof fullSchema>>;

export function getDb() {
  if (!instance) {
    const dbUrl = process.env.DATABASE_URL;

    if (!dbUrl) {
      console.error("🚨 KRİTİK HATA: DATABASE_URL değişkeni sunucuda bulunamadı!");
      throw new Error("Veritabanı URL'si eksik.");
    }

    instance = drizzle(dbUrl as string, {
      mode: "planetscale",
      schema: fullSchema,
    });
  }
  return instance;
}
