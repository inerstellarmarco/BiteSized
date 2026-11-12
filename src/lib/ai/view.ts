import { and, eq, inArray } from "drizzle-orm";
import { usageToday } from "@/lib/ai/usage";
import { asDate } from "@/lib/dates";
import { bites, hearts, personalBites } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";

export async function learnOverlay(db: AppDatabase, profileId: string, biteIds: string[]) {
  const usage = await usageToday(db, profileId);
  if (biteIds.length === 0) return { ...usage, personal: {} as Record<string, PersonalView>, hearts: [] as string[] };
  const [personalRows, heartRows, biteRows] = await Promise.all([
    db.select().from(personalBites).where(and(eq(personalBites.profileId, profileId), inArray(personalBites.biteId, biteIds))),
    db.select().from(hearts).where(and(eq(hearts.profileId, profileId), eq(hearts.targetType, "bite"), inArray(hearts.targetId, biteIds))),
    db.select().from(bites).where(inArray(bites.id, biteIds)),
  ]);
  const originals = new Map(biteRows.map((bite) => [bite.id, bite]));
  const personal: Record<string, PersonalView> = {};
  for (const row of personalRows) {
    const original = originals.get(row.biteId);
    const originalAt = asDate(original?.updatedAt)?.getTime() ?? 0;
    const basedAt = asDate(row.basedOnUpdatedAt)?.getTime() ?? 0;
    personal[row.biteId] = {
      title: row.title,
      body: row.body,
      diagram: row.diagram,
      showing: row.showing === "original" ? "original" : "personal",
      stale: originalAt > basedAt,
      basedOnUpdatedAt: asDate(row.basedOnUpdatedAt)?.toISOString() ?? new Date().toISOString(),
    };
  }
  return { ...usage, personal, hearts: heartRows.map((row) => row.targetId) };
}

export type PersonalView = {
  title: string;
  body: string;
  diagram: string | null;
  showing: "personal" | "original";
  stale: boolean;
  basedOnUpdatedAt: string;
};
