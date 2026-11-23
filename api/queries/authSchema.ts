import { sql } from "drizzle-orm";
import { getDb } from "./connection";

let ready: Promise<void> | undefined;

/**
 * Render/PlanetScale deployments can be upgraded without running Drizzle's
 * migration command. Keep the small authentication table self-healing so an
 * old deployment (or a first deployment) cannot break every request carrying
 * a stale session token.
 */
export function ensureAuthSchema(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    const db = getDb();
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS sessions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        token VARCHAR(128) NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY sessions_token_unique (token),
        KEY session_user_idx (user_id)
      )
    `));

    // A partially-created legacy table may exist without one of these fields.
    // MySQL rejects duplicate-column ALTERs; ignore only those harmless errors.
    for (const statement of [
      "ALTER TABLE sessions ADD COLUMN user_id BIGINT UNSIGNED NOT NULL",
      "ALTER TABLE sessions ADD COLUMN token VARCHAR(128) NOT NULL",
      "ALTER TABLE sessions ADD COLUMN expires_at DATETIME NOT NULL",
      "ALTER TABLE sessions ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
    ]) {
      try {
        await db.execute(sql.raw(statement));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/duplicate column|already exists/i.test(message)) throw error;
      }
    }
  })().catch((error) => {
    ready = undefined;
    throw error;
  });
  return ready;
}

