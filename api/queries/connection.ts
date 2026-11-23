import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2";
import { mysqlOptions } from "./mysqlOptions";
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

    const pool = createPool(mysqlOptions(dbUrl, process.env.DATABASE_CA_CERT));
    instance = drizzle(pool, {
      mode: "planetscale",
      schema: fullSchema,
    });
  }
  return instance;
}
