import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/lib/db/schema";
import { MIGRATION_SQL } from "@/lib/db/sql";
import type { AppDatabase } from "@/lib/db/types";

export async function openMemoryDatabase(): Promise<{ db: AppDatabase; close: () => Promise<void> }> {
  const client = new PGlite();
  await client.exec(MIGRATION_SQL);
  const db = drizzle(client, { schema });
  return {
    db,
    close: () => client.close(),
  };
}
