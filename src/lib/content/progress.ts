import { and, eq, inArray } from "drizzle-orm";
import { activeBites } from "@/lib/content/ops";
import { biteProgress, bites, learnerCursors } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";

export async function markBiteSeen(db: AppDatabase, profileId: string, biteId: string) {
  const [bite] = await db.select().from(bites).where(eq(bites.id, biteId));
  if (!bite || bite.archivedAt) return;
  const now = new Date();
  await db.insert(biteProgress).values({ profileId, biteId, seenAt: now }).onConflictDoNothing();
  await db
    .insert(learnerCursors)
    .values({ profileId, subLessonId: bite.subLessonId, biteId, mode: "learn", updatedAt: now })
    .onConflictDoUpdate({
      target: learnerCursors.profileId,
      set: { subLessonId: bite.subLessonId, biteId, mode: "learn", updatedAt: now },
    });
}

export async function subLessonProgress(db: AppDatabase, profileId: string, subLessonId: string) {
  const rows = await activeBites(db, subLessonId);
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return { seen: 0, total: 0, ratio: 0 };
  const seenRows = await db
    .select({ biteId: biteProgress.biteId })
    .from(biteProgress)
    .where(and(eq(biteProgress.profileId, profileId), inArray(biteProgress.biteId, ids)));
  const seen = seenRows.length;
  return { seen, total: ids.length, ratio: seen / ids.length };
}
