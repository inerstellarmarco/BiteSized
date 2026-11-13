import { and, asc, eq, isNull } from "drizzle-orm";
import {
  biteLinks,
  bites,
  biteProgress,
  categories,
  courses,
  learnerCursors,
  lessons,
  questions,
  subCategories,
  subLessons,
} from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";
import type { Toolkit } from "@/lib/types";

/**
 * Short, readable label for a sub-lesson: its lesson code plus a letter by order (A1.1a, A1.1b…).
 * Computed from the order, so nothing extra is stored and reordering keeps labels tidy.
 */
export function subLessonLabel(lessonCode: string, index: number): string {
  return index < 26 ? `${lessonCode}${String.fromCharCode(97 + index)}` : `${lessonCode}-${index + 1}`;
}

/** Imported headings keep their code in the title ("A1.2 Foo"); drop it where the code is shown beside it. */
export function titleWithoutCode(code: string, title: string): string {
  if (code && title.startsWith(`${code} `)) return title.slice(code.length + 1).trim();
  return title;
}

export type CatalogSubLesson = {
  id: string;
  label: string;
  title: string;
  position: string;
  biteCount: number;
  seenCount: number;
  questionCount: number;
};

export type CatalogLesson = {
  id: string;
  code: string;
  title: string;
  position: string;
  prerequisiteIds: string[];
  prerequisites: { id: string; code: string; title: string }[];
  subLessons: CatalogSubLesson[];
};

export type CatalogSubCategory = {
  id: string;
  code: string;
  title: string;
  levelTag: string;
  position: string;
  toolkit: Toolkit;
  lessons: CatalogLesson[];
};

export type CatalogCategory = {
  id: string;
  code: string;
  title: string;
  summary: string;
  position: string;
  subCategories: CatalogSubCategory[];
};

export type CourseCatalog = {
  course: {
    id: string;
    title: string;
    subtitle: string;
    description: string;
    author: string;
    licence: string;
    aiGenerated: boolean;
  };
  categories: CatalogCategory[];
};

export type FlatSubLesson = CatalogSubLesson & {
  lessonId: string;
  lessonCode: string;
  lessonTitle: string;
  subCategoryTitle: string;
  levelTag: string;
};

export function flattenSubLessons(catalog: CourseCatalog): FlatSubLesson[] {
  const rows: FlatSubLesson[] = [];
  for (const category of catalog.categories) {
    for (const subCategory of category.subCategories) {
      for (const lesson of subCategory.lessons) {
        for (const subLesson of lesson.subLessons) {
          rows.push({
            ...subLesson,
            lessonId: lesson.id,
            lessonCode: lesson.code,
            lessonTitle: lesson.title,
            subCategoryTitle: subCategory.title,
            levelTag: subCategory.levelTag,
          });
        }
      }
    }
  }
  return rows;
}

export async function loadCatalog(db: AppDatabase, profileId?: string | null, courseId?: string): Promise<CourseCatalog | null> {
  const courseRows = await db.select().from(courses).where(isNull(courses.archivedAt)).orderBy(asc(courses.position));
  const course = courseId ? courseRows.find((row) => row.id === courseId) ?? null : courseRows[0] ?? null;
  if (!course) return null;

  const [categoryRows, subCategoryRows, lessonRows, subLessonRows, biteRows, questionRows, progressRows] = await Promise.all([
    db.select().from(categories).where(isNull(categories.archivedAt)).orderBy(asc(categories.position)),
    db.select().from(subCategories).where(isNull(subCategories.archivedAt)).orderBy(asc(subCategories.position)),
    db.select().from(lessons).where(isNull(lessons.archivedAt)).orderBy(asc(lessons.position)),
    db.select().from(subLessons).where(isNull(subLessons.archivedAt)).orderBy(asc(subLessons.position)),
    db.select().from(bites).where(and(isNull(bites.archivedAt), eq(bites.reviewStatus, "approved"))),
    db.select().from(questions).where(and(isNull(questions.archivedAt), eq(questions.reviewStatus, "approved"))),
    profileId
      ? db.select().from(biteProgress).where(eq(biteProgress.profileId, profileId))
      : Promise.resolve([]),
  ]);

  const seen = new Set(progressRows.map((row) => row.biteId));
  const lessonById = new Map(lessonRows.map((row) => [row.id, row]));

  const categoriesForCourse = categoryRows.filter((row) => row.courseId === course.id);
  return {
    course: {
      id: course.id,
      title: course.title,
      subtitle: course.subtitle,
      description: course.description,
      author: course.author,
      licence: course.licence,
      aiGenerated: course.aiGenerated,
    },
    categories: categoriesForCourse.map((category) => ({
      id: category.id,
      code: category.code,
      title: category.title,
      summary: category.summary,
      position: category.position,
      subCategories: subCategoryRows
        .filter((row) => row.categoryId === category.id)
        .map((subCategory) => ({
          id: subCategory.id,
          code: subCategory.code,
          title: subCategory.title,
          levelTag: subCategory.levelTag,
          position: subCategory.position,
          toolkit: subCategory.toolkit,
          lessons: lessonRows
            .filter((row) => row.subCategoryId === subCategory.id)
            .map((lesson) => ({
              id: lesson.id,
              code: lesson.code,
              title: lesson.title,
              position: lesson.position,
              prerequisiteIds: lesson.prerequisiteIds ?? [],
              prerequisites: (lesson.prerequisiteIds ?? [])
                .map((id) => lessonById.get(id))
                .filter((item): item is NonNullable<typeof item> => Boolean(item))
                .map((item) => ({ id: item.id, code: item.code, title: item.title })),
              subLessons: subLessonRows
                .filter((row) => row.lessonId === lesson.id)
                .map((subLesson, index) => {
                  const lessonBites = biteRows.filter((bite) => bite.subLessonId === subLesson.id);
                  const biteIds = new Set(lessonBites.map((bite) => bite.id));
                  return {
                    id: subLesson.id,
                    label: subLessonLabel(lesson.code, index),
                    title: subLesson.title,
                    position: subLesson.position,
                    biteCount: lessonBites.length,
                    seenCount: lessonBites.filter((bite) => seen.has(bite.id)).length,
                    questionCount: questionRows.filter((question) => biteIds.has(question.biteId) && question.type === "multiple_choice").length,
                  };
                }),
            })),
        })),
    })),
  };
}

export async function loadLearnCards(db: AppDatabase, subLessonId: string) {
  const [subLesson] = await db.select().from(subLessons).where(eq(subLessons.id, subLessonId));
  if (!subLesson || subLesson.archivedAt) return null;
  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, subLesson.lessonId));
  if (!lesson || lesson.archivedAt) return null;
  const biteRows = await db
    .select()
    .from(bites)
    .where(eq(bites.subLessonId, subLessonId))
    .orderBy(asc(bites.position));
  const active = biteRows.filter((bite) => !bite.archivedAt && bite.reviewStatus === "approved");
  const linkRows = active.length
    ? await db.select().from(biteLinks).orderBy(asc(biteLinks.position))
    : [];
  const codeTargets = await codeHrefMap(db);
  return {
    subLesson: { id: subLesson.id, title: subLesson.title },
    lesson: { id: lesson.id, code: lesson.code, title: lesson.title },
    bites: active.map((bite) => ({
      id: bite.id,
      title: bite.title,
      body: bite.body,
      sourceNote: bite.sourceNote,
      lastReviewedOn: bite.lastReviewedOn,
      diagram: bite.diagram,
      crossLinks: linkRows
        .filter((link) => link.biteId === bite.id)
        .map((link) => ({
          id: link.id,
          label: link.label,
          targetCode: link.targetCode,
          href: codeTargets.get(link.targetCode) ?? null,
        })),
    })),
  };
}

async function codeHrefMap(db: AppDatabase) {
  const [lessonRows, subCategoryRows, categoryRows] = await Promise.all([
    db.select().from(lessons).where(isNull(lessons.archivedAt)),
    db.select().from(subCategories).where(isNull(subCategories.archivedAt)),
    db.select().from(categories).where(isNull(categories.archivedAt)),
  ]);
  const map = new Map<string, string>();
  for (const category of categoryRows) if (category.code) map.set(category.code, `/course#${category.id}`);
  for (const subCategory of subCategoryRows) if (subCategory.code) map.set(subCategory.code, `/course#${subCategory.id}`);
  for (const lesson of lessonRows) if (lesson.code) map.set(lesson.code, `/course#${lesson.id}`);
  return map;
}

export async function continueFor(db: AppDatabase, profileId: string, catalog: CourseCatalog) {
  const flat = flattenSubLessons(catalog);
  if (flat.length === 0) return null;
  const [cursor] = await db.select().from(learnerCursors).where(eq(learnerCursors.profileId, profileId));
  const current = cursor ? flat.find((row) => row.id === cursor.subLessonId) : undefined;
  const chosen = current ?? flat[0];
  return {
    ...chosen,
    biteId: current ? cursor?.biteId ?? null : null,
    started: Boolean(current),
  };
}

export function nextSubLesson(catalog: CourseCatalog, subLessonId: string) {
  const flat = flattenSubLessons(catalog);
  const index = flat.findIndex((row) => row.id === subLessonId);
  if (index < 0) return null;
  return flat[index + 1] ?? null;
}
