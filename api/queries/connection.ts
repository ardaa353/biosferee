import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };
let instance: ReturnType<typeof drizzle<typeof fullSchema>>;

export function getDb() {
  if (!instance) {
    // DİKKAT: Aşağıdaki adresi silip KENDİ AİVEN LİNKİNİ tırnak içinde yapıştır.
    // Örnek: "mysql://avnadmin:sifre123@senin-sunucun.aivencloud.com:21312/defaultdb"
    
    const dbUrl = "mysql-35fb0864-ardakose35328-48cd.l.aivencloud.com"; 

    instance = drizzle(dbUrl, {
      mode: "planetscale",
      schema: fullSchema,
    });
  }
  return instance;
}
