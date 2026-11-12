import { sql } from "drizzle-orm";
import { appSettings } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";
import { eq } from "drizzle-orm";
import { getLlmConfig } from "@/lib/llm/config";

export const CAP_SETTING = "daily_regenerate_cap";

export async function getDailyCap(db: AppDatabase): Promise<number> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, CAP_SETTING));
  const stored = Number(row?.value);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const fallback = getLlmConfig().dailyRegenerateCapPerProfile;
  await db.insert(appSettings).values({ key: CAP_SETTING, value: String(fallback) }).onConflictDoNothing();
  return fallback;
}

export async function setDailyCap(db: AppDatabase, cap: number) {
  const value = String(Math.max(1, Math.floor(cap)));
  await db.insert(appSettings).values({ key: CAP_SETTING, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } });
  return Number(value);
}

export function usageDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function usageToday(db: AppDatabase, profileId: string, now = new Date()) {
  const limit = await getDailyCap(db);
  const day = usageDay(now);
  const rows = await db.execute(sql`SELECT count FROM llm_usage WHERE profile_id = ${profileId} AND day = ${day}`);
  const count = numberFrom(rows);
  return { used: count, limit, remaining: Math.max(0, limit - count) };
}

/** Counts one successful regeneration. A full cap returns a message, not an exception. */
export async function takeRegeneration(db: AppDatabase, profileId: string, now = new Date()) {
  const limit = await getDailyCap(db);
  const day = usageDay(now);
  const rows = await db.execute(sql`
    INSERT INTO llm_usage (profile_id, day, count) VALUES (${profileId}, ${day}, 1)
    ON CONFLICT (profile_id, day) DO UPDATE SET count = llm_usage.count + 1
    WHERE llm_usage.count < ${limit}
    RETURNING count
  `);
  const count = numberFrom(rows);
  if (!count) {
    return {
      ok: false as const,
      remaining: 0,
      limit,
      message: `You've used all ${limit} regenerations for today. They reset tomorrow.`,
    };
  }
  return { ok: true as const, remaining: Math.max(0, limit - count), limit, message: "" };
}

function numberFrom(result: unknown): number {
  const rows = Array.isArray(result)
    ? result
    : result && typeof result === "object" && "rows" in result
      ? (result as { rows: unknown[] }).rows
      : [];
  const first = rows[0] as { count?: number | string } | undefined;
  return Number(first?.count ?? 0);
}
