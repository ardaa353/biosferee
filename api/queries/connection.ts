import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let instance: ReturnType<typeof drizzle<typeof fullSchema>>;

export function getDb() {
  if (!instance) {
    instance = drizzle(process.env.DATABASE_URL as string, {
      mode: "planetscale",
      schema: fullSchema,
    });
  }
  return instance;
}
