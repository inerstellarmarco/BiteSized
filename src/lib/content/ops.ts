import { and, asc, eq, isNull } from "drizzle-orm";
import {
  bites,
  categories,
  contentRevisions,
  courses,
  lessons,
  questions,
  subCategories,
  subLessons,
} from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";
import { newId } from "@/lib/ids";
import type { Choice, QuestionType } from "@/lib/types";
import { comparePosition, keyForInsert, keyForMove } from "@/lib/content/order";
import { toSnapshot } from "@/lib/content/snapshot";

export type EntityType = "category" | "sub_category" | "lesson" | "sub_lesson" | "bite" | "question";

type Sibling = {
  id: string;
  position: string;
  archivedAt: Date | string | null;
};

type Located = Sibling & {
  parentId: string;
  row: Record<string, unknown>;
};

async function recordRevision(
  db: AppDatabase,
  input: {
    entityType: EntityType | "course" | "sub_category_toolkit";
    entityId: string;
    op: "insert" | "update" | "move" | "archive" | "restore";
    snapshot: Record<string, unknown>;
    actorProfileId?: string | null;
  },
) {
  await db.insert(contentRevisions).values({
    id: newId("rev"),
    entityType: input.entityType,
    entityId: input.entityId,
    op: input.op,
    snapshot: input.snapshot,
    actorProfileId: input.actorProfileId ?? null,
  });
}

async function siblingsOf(db: AppDatabase, type: EntityType, parentId: string): Promise<Sibling[]> {
  switch (type) {
    case "category":
      return db
        .select({ id: categories.id, position: categories.position, archivedAt: categories.archivedAt })
        .from(categories)
        .where(eq(categories.courseId, parentId));
    case "sub_category":
      return db
        .select({ id: subCategories.id, position: subCategories.position, archivedAt: subCategories.archivedAt })
        .from(subCategories)
        .where(eq(subCategories.categoryId, parentId));
    case "lesson":
      return db
        .select({ id: lessons.id, position: lessons.position, archivedAt: lessons.archivedAt })
        .from(lessons)
        .where(eq(lessons.subCategoryId, parentId));
    case "sub_lesson":
      return db
        .select({ id: subLessons.id, position: subLessons.position, archivedAt: subLessons.archivedAt })
        .from(subLessons)
        .where(eq(subLessons.lessonId, parentId));
    case "bite":
      return db
        .select({ id: bites.id, position: bites.position, archivedAt: bites.archivedAt })
        .from(bites)
        .where(eq(bites.subLessonId, parentId));
    case "question":
      return db
        .select({ id: questions.id, position: questions.position, archivedAt: questions.archivedAt })
        .from(questions)
        .where(eq(questions.biteId, parentId));
  }
}

async function locate(db: AppDatabase, type: EntityType, id: string): Promise<Located | null> {
  switch (type) {
    case "category": {
      const [row] = await db.select().from(categories).where(eq(categories.id, id));
      return row ? { id: row.id, position: row.position, archivedAt: row.archivedAt, parentId: row.courseId, row: toSnapshot(row) } : null;
    }
    case "sub_category": {
      const [row] = await db.select().from(subCategories).where(eq(subCategories.id, id));
      return row ? { id: row.id, position: row.position, archivedAt: row.archivedAt, parentId: row.categoryId, row: toSnapshot(row) } : null;
    }
    case "lesson": {
      const [row] = await db.select().from(lessons).where(eq(lessons.id, id));
      return row ? { id: row.id, position: row.position, archivedAt: row.archivedAt, parentId: row.subCategoryId, row: toSnapshot(row) } : null;
    }
    case "sub_lesson": {
      const [row] = await db.select().from(subLessons).where(eq(subLessons.id, id));
      return row ? { id: row.id, position: row.position, archivedAt: row.archivedAt, parentId: row.lessonId, row: toSnapshot(row) } : null;
    }
    case "bite": {
      const [row] = await db.select().from(bites).where(eq(bites.id, id));
      return row ? { id: row.id, position: row.position, archivedAt: row.archivedAt, parentId: row.subLessonId, row: toSnapshot(row) } : null;
    }
    case "question": {
      const [row] = await db.select().from(questions).where(eq(questions.id, id));
      return row ? { id: row.id, position: row.position, archivedAt: row.archivedAt, parentId: row.biteId, row: toSnapshot(row) } : null;
    }
  }
}

function sortedActive(rows: Sibling[], exceptId?: string): Sibling[] {
  return rows
    .filter((row) => row.id !== exceptId && !row.archivedAt)
    .sort((a, b) => comparePosition(a.position, b.position));
}

export async function moveEntity(
  db: AppDatabase,
  type: EntityType,
  id: string,
  toIndex: number,
  actorProfileId?: string | null,
): Promise<void> {
  const current = await locate(db, type, id);
  if (!current) throw new Error(`Missing ${type} ${id}`);
  const all = await siblingsOf(db, type, current.parentId);
  const occupied = all.map((row) => row.position).filter((position) => position !== current.position);
  const others = sortedActive(all, id).map((row) => row.position);
  const position = keyForMove(occupied, others, toIndex);
  await recordRevision(db, {
    entityType: type,
    entityId: id,
    op: "move",
    snapshot: current.row,
    actorProfileId,
  });
  const patch = { position, updatedAt: new Date() };
  switch (type) {
    case "category":
      await db.update(categories).set(patch).where(eq(categories.id, id));
      break;
    case "sub_category":
      await db.update(subCategories).set(patch).where(eq(subCategories.id, id));
      break;
    case "lesson":
      await db.update(lessons).set(patch).where(eq(lessons.id, id));
      break;
    case "sub_lesson":
      await db.update(subLessons).set(patch).where(eq(subLessons.id, id));
      break;
    case "bite":
      await db.update(bites).set(patch).where(eq(bites.id, id));
      break;
    case "question":
      await db.update(questions).set(patch).where(eq(questions.id, id));
      break;
  }
}

export async function archiveEntity(
  db: AppDatabase,
  type: EntityType,
  id: string,
  actorProfileId?: string | null,
): Promise<void> {
  const current = await locate(db, type, id);
  if (!current) throw new Error(`Missing ${type} ${id}`);
  if (current.archivedAt) return;
  await recordRevision(db, {
    entityType: type,
    entityId: id,
    op: "archive",
    snapshot: current.row,
    actorProfileId,
  });
  const patch = { archivedAt: new Date(), updatedAt: new Date() };
  switch (type) {
    case "category":
      await db.update(categories).set(patch).where(eq(categories.id, id));
      break;
    case "sub_category":
      await db.update(subCategories).set(patch).where(eq(subCategories.id, id));
      break;
    case "lesson":
      await db.update(lessons).set(patch).where(eq(lessons.id, id));
      break;
    case "sub_lesson":
      await db.update(subLessons).set(patch).where(eq(subLessons.id, id));
      break;
    case "bite":
      await db.update(bites).set(patch).where(eq(bites.id, id));
      break;
    case "question":
      await db.update(questions).set(patch).where(eq(questions.id, id));
      break;
  }
}

export async function restoreEntity(
  db: AppDatabase,
  type: EntityType,
  id: string,
  actorProfileId?: string | null,
): Promise<void> {
  const current = await locate(db, type, id);
  if (!current) throw new Error(`Missing ${type} ${id}`);
  if (!current.archivedAt) return;
  await recordRevision(db, {
    entityType: type,
    entityId: id,
    op: "restore",
    snapshot: current.row,
    actorProfileId,
  });
  const patch = { archivedAt: null, updatedAt: new Date() };
  switch (type) {
    case "category":
      await db.update(categories).set(patch).where(eq(categories.id, id));
      break;
    case "sub_category":
      await db.update(subCategories).set(patch).where(eq(subCategories.id, id));
      break;
    case "lesson":
      await db.update(lessons).set(patch).where(eq(lessons.id, id));
      break;
    case "sub_lesson":
      await db.update(subLessons).set(patch).where(eq(subLessons.id, id));
      break;
    case "bite":
      await db.update(bites).set(patch).where(eq(bites.id, id));
      break;
    case "question":
      await db.update(questions).set(patch).where(eq(questions.id, id));
      break;
  }
}

export async function insertBite(
  db: AppDatabase,
  input: {
    subLessonId: string;
    title: string;
    body: string;
    sourceNote?: string;
    lastReviewedOn?: string | null;
    diagram?: string | null;
    toIndex?: number;
    id?: string;
    actorProfileId?: string | null;
  },
) {
  const all = await siblingsOf(db, "bite", input.subLessonId);
  const occupied = all.map((row) => row.position);
  const active = sortedActive(all).map((row) => row.position);
  const position = keyForInsert(occupied, active, input.toIndex ?? active.length);
  const id = input.id ?? newId("bit");
  const row = {
    id,
    subLessonId: input.subLessonId,
    title: input.title,
    body: input.body,
    sourceNote: input.sourceNote ?? "",
    lastReviewedOn: input.lastReviewedOn ?? null,
    diagram: input.diagram ?? null,
    position,
  };
  await db.insert(bites).values(row);
  await recordRevision(db, {
    entityType: "bite",
    entityId: id,
    op: "insert",
    snapshot: toSnapshot(row),
    actorProfileId: input.actorProfileId,
  });
  return row;
}

export async function updateBite(
  db: AppDatabase,
  id: string,
  patch: {
    title?: string;
    body?: string;
    sourceNote?: string;
    lastReviewedOn?: string | null;
    diagram?: string | null;
  },
  actorProfileId?: string | null,
) {
  const [existing] = await db.select().from(bites).where(eq(bites.id, id));
  if (!existing) throw new Error(`Missing bite ${id}`);
  await recordRevision(db, {
    entityType: "bite",
    entityId: id,
    op: "update",
    snapshot: toSnapshot(existing),
    actorProfileId,
  });
  await db
    .update(bites)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(bites.id, id));
}

export async function activeBites(db: AppDatabase, subLessonId: string) {
  const [subLesson] = await db.select().from(subLessons).where(eq(subLessons.id, subLessonId));
  if (!subLesson || subLesson.archivedAt) return [];
  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, subLesson.lessonId));
  if (!lesson || lesson.archivedAt) return [];
  const [subCategory] = await db.select().from(subCategories).where(eq(subCategories.id, lesson.subCategoryId));
  if (!subCategory || subCategory.archivedAt) return [];
  const [category] = await db.select().from(categories).where(eq(categories.id, subCategory.categoryId));
  if (!category || category.archivedAt) return [];
  const [course] = await db.select().from(courses).where(eq(courses.id, category.courseId));
  if (!course || course.archivedAt) return [];
  return db
    .select()
    .from(bites)
    .where(and(eq(bites.subLessonId, subLessonId), isNull(bites.archivedAt), eq(bites.reviewStatus, "approved")))
    .orderBy(asc(bites.position));
}

export async function insertQuestion(
  db: AppDatabase,
  input: {
    biteId: string;
    type: QuestionType;
    prompt: string;
    choices: Choice[];
    correctChoiceId: string;
    explanation?: string;
    toIndex?: number;
    id?: string;
    actorProfileId?: string | null;
  },
) {
  const all = await siblingsOf(db, "question", input.biteId);
  const occupied = all.map((row) => row.position);
  const active = sortedActive(all).map((row) => row.position);
  const position = keyForInsert(occupied, active, input.toIndex ?? active.length);
  const id = input.id ?? newId("qst");
  const row = {
    id,
    biteId: input.biteId,
    type: input.type,
    prompt: input.prompt,
    choices: input.choices,
    correctChoiceId: input.correctChoiceId,
    explanation: input.explanation ?? "",
    position,
  };
  await db.insert(questions).values(row);
  await recordRevision(db, {
    entityType: "question",
    entityId: id,
    op: "insert",
    snapshot: toSnapshot(row),
    actorProfileId: input.actorProfileId,
  });
  return row;
}
