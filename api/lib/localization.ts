import { eq, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { userPreferences } from "../../db/schema";
export type Locale = "tr" | "en";
let prepared: Promise<void> | undefined;
export function prepareLocalization() {
  return (prepared ??= (async () => {
    await getDb().execute(
      sql`CREATE TABLE IF NOT EXISTS user_preferences (user_id bigint unsigned NOT NULL PRIMARY KEY, language varchar(2) NULL)`,
    );
    await getDb().execute(
      sql`CREATE TABLE IF NOT EXISTS text_translations (content_hash varchar(64) NOT NULL PRIMARY KEY, translated_text text NOT NULL, source_language varchar(12) NOT NULL, provider varchar(40) NOT NULL, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    );
  })().catch((error) => {
    prepared = undefined;
    throw error;
  }));
}
export async function getUserLanguage(userId: number): Promise<Locale | null> {
  await prepareLocalization();
  const [row] = await getDb()
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  return row?.language === "en" || row?.language === "tr" ? row.language : null;
}
export async function saveUserLanguage(userId: number, language: Locale) {
  await prepareLocalization();
  await getDb()
    .insert(userPreferences)
    .values({ userId, language })
    .onDuplicateKeyUpdate({ set: { language } });
}
