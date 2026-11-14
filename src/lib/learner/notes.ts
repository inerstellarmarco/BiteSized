import { and, desc, eq, inArray } from "drizzle-orm";
import { asDate } from "@/lib/dates";
import { bites, contentFlags, lessons, subLessons } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";
import { newId } from "@/lib/ids";

export type BiteNoteEntry = {
  id: string;
  biteId: string;
  note: string;
  updatedAt: string;
};

export type BiteNoteWithContext = BiteNoteEntry & {
  biteTitle: string;
  subLessonId: string;
  subLessonTitle: string;
  lessonCode: string;
};

export async function saveBiteNote(
  db: AppDatabase,
  input: { profileId: string; biteId: string; note: string },
): Promise<{ id: string | null; note: string }> {
  const trimmed = input.note.trim();
  const existing = await db
    .select()
    .from(contentFlags)
    .where(
      and(
        eq(contentFlags.profileId, input.profileId),
        eq(contentFlags.targetType, "bite"),
        eq(contentFlags.targetId, input.biteId),
        eq(contentFlags.kind, "note"),
      ),
    );

  if (!trimmed) {
    if (existing.length > 0) {
      await db
        .delete(contentFlags)
        .where(
          and(
            eq(contentFlags.profileId, input.profileId),
            eq(contentFlags.targetType, "bite"),
            eq(contentFlags.targetId, input.biteId),
            eq(contentFlags.kind, "note"),
          ),
        );
    }
    return { id: null, note: "" };
  }

  const first = existing[0];
  if (first) {
    await db
      .update(contentFlags)
      .set({ note: trimmed, status: "open", createdAt: new Date() })
      .where(eq(contentFlags.id, first.id));
    if (existing.length > 1) {
      const extraIds = existing.slice(1).map((row) => row.id);
      await db.delete(contentFlags).where(inArray(contentFlags.id, extraIds));
    }
    return { id: first.id, note: trimmed };
  }

  const id = newId("nte");
  await db.insert(contentFlags).values({
    id,
    profileId: input.profileId,
    targetType: "bite",
    targetId: input.biteId,
    kind: "note",
    note: trimmed,
    status: "open",
  });
  return { id, note: trimmed };
}

export async function getBiteNotesMap(
  db: AppDatabase,
  profileId: string,
  biteIds?: string[],
): Promise<Record<string, string>> {
  if (biteIds && biteIds.length === 0) return {};
  const conditions = [
    eq(contentFlags.profileId, profileId),
    eq(contentFlags.targetType, "bite"),
    eq(contentFlags.kind, "note"),
  ];
  if (biteIds) conditions.push(inArray(contentFlags.targetId, biteIds));

  const rows = await db
    .select()
    .from(contentFlags)
    .where(and(...conditions))
    .orderBy(desc(contentFlags.createdAt));

  const map: Record<string, string> = {};
  for (const row of rows) {
    if (!(row.targetId in map) && row.note.trim()) {
      map[row.targetId] = row.note;
    }
  }
  return map;
}

export async function listLearnerNotes(db: AppDatabase, profileId: string): Promise<BiteNoteWithContext[]> {
  const rows = await db
    .select()
    .from(contentFlags)
    .where(
      and(
        eq(contentFlags.profileId, profileId),
        eq(contentFlags.targetType, "bite"),
        eq(contentFlags.kind, "note"),
      ),
    )
    .orderBy(desc(contentFlags.createdAt));

  const nonEmpty = rows.filter((row) => row.note.trim().length > 0);
  if (nonEmpty.length === 0) return [];

  const biteIds = [...new Set(nonEmpty.map((row) => row.targetId))];
  const biteRows = await db.select().from(bites).where(inArray(bites.id, biteIds));
  const biteById = new Map(biteRows.map((row) => [row.id, row]));

  const subLessonIds = [...new Set(biteRows.map((row) => row.subLessonId))];
  const subLessonRows = subLessonIds.length
    ? await db.select().from(subLessons).where(inArray(subLessons.id, subLessonIds))
    : [];
  const subLessonById = new Map(subLessonRows.map((row) => [row.id, row]));

  const lessonIds = [...new Set(subLessonRows.map((row) => row.lessonId))];
  const lessonRows = lessonIds.length ? await db.select().from(lessons).where(inArray(lessons.id, lessonIds)) : [];
  const lessonById = new Map(lessonRows.map((row) => [row.id, row]));

  const seenBite = new Set<string>();
  const out: BiteNoteWithContext[] = [];
  for (const row of nonEmpty) {
    if (seenBite.has(row.targetId)) continue;
    seenBite.add(row.targetId);
    const bite = biteById.get(row.targetId);
    if (!bite || bite.archivedAt) continue;
    const subLesson = subLessonById.get(bite.subLessonId);
    if (!subLesson || subLesson.archivedAt) continue;
    const lesson = lessonById.get(subLesson.lessonId);
    out.push({
      id: row.id,
      biteId: bite.id,
      note: row.note,
      updatedAt: (asDate(row.createdAt) ?? new Date()).toISOString(),
      biteTitle: bite.title,
      subLessonId: subLesson.id,
      subLessonTitle: subLesson.title,
      lessonCode: lesson?.code ?? "",
    });
  }
  return out;
}
