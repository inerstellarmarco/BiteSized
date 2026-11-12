import { mkdir } from "fs/promises";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { count } from "drizzle-orm";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createProfile } from "@/lib/auth/profiles";
import { ensureStyleDraft } from "@/lib/style/guide";
import * as schema from "@/lib/db/schema";
import { courses, profiles } from "@/lib/db/schema";
import { MIGRATION_SQL } from "@/lib/db/sql";
import type { AppDatabase } from "@/lib/db/types";
import { importPackageFromDir, SAMPLE_PACKAGE_DIR } from "@/lib/packages/io";

export type OpenedDatabase = {
  db: AppDatabase;
  close: () => Promise<void>;
};

async function seedIfEmpty(db: AppDatabase) {
  const [courseCount] = await db.select({ value: count() }).from(courses);
  if (Number(courseCount?.value ?? 0) === 0) {
    await importPackageFromDir(db, SAMPLE_PACKAGE_DIR, {
      replace: false,
      includeLearners: false,
      includeHistory: false,
    });
  }
  const [profileCount] = await db.select({ value: count() }).from(profiles);
  if (Number(profileCount?.value ?? 0) === 0) {
    const pin = process.env.SEED_ADMIN_PIN || "family-admin";
    const created = await createProfile(db, { name: "Eric", pin, isAdmin: true, id: "prf_eric" });
    if (!created.ok) throw new Error(created.error);
  }
}

export async function createDatabase(options?: {
  dataDir?: string;
  databaseUrl?: string | null;
  seed?: boolean;
}): Promise<OpenedDatabase> {
  const url = options?.databaseUrl === undefined ? process.env.DATABASE_URL : options.databaseUrl;
  if (!url && process.env.VERCEL === "1") {
    throw new Error("DATABASE_URL is required on Vercel. The app does not write a local database in production.");
  }
  let opened: OpenedDatabase;
  if (url) {
    const client = postgres(url, {
      max: 5,
      prepare: false,
      ssl: url.includes("localhost") || url.includes("127.0.0.1") ? undefined : "require",
    });
    await client.unsafe(MIGRATION_SQL);
    const db = drizzlePg(client, { schema }) as unknown as AppDatabase;
    opened = { db, close: () => client.end({ timeout: 5 }) };
  } else {
    const dataDir = options?.dataDir ?? process.env.PGLITE_DIR ?? path.join(process.cwd(), "data", "bitesized");
    await mkdir(dataDir, { recursive: true });
    const client = new PGlite(dataDir);
    await client.exec(MIGRATION_SQL);
    const db = drizzlePglite(client, { schema });
    opened = { db, close: () => client.close() };
  }
  if (options?.seed !== false) await seedIfEmpty(opened.db);
  await ensureStyleDraft(opened.db);
  return opened;
}

const globalForDb = globalThis as unknown as { biteDb?: Promise<OpenedDatabase> };

export async function getDb(): Promise<AppDatabase> {
  if (!globalForDb.biteDb) globalForDb.biteDb = createDatabase();
  const opened = await globalForDb.biteDb;
  return opened.db;
}
