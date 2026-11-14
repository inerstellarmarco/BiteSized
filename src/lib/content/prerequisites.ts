import type { CatalogLesson, CourseCatalog, FlatSubLesson } from "@/lib/content/catalog";
import { flattenSubLessons } from "@/lib/content/catalog";

export type UnmetPrerequisite = {
  id: string;
  code: string;
  title: string;
  seen: number;
  total: number;
  firstSubLessonId: string | null;
};

export function lessonStats(lesson: CatalogLesson): { seen: number; total: number; complete: boolean } {
  let seen = 0;
  let total = 0;
  for (const subLesson of lesson.subLessons) {
    total += subLesson.biteCount;
    seen += Math.min(subLesson.seenCount, subLesson.biteCount);
  }
  return {
    seen,
    total,
    complete: total > 0 && seen >= total,
  };
}

export function allCatalogLessons(catalog: CourseCatalog): CatalogLesson[] {
  return catalog.categories.flatMap((category) => category.subCategories.flatMap((subCategory) => subCategory.lessons));
}

export function unmetPrerequisites(catalog: CourseCatalog, lessonId: string): UnmetPrerequisite[] {
  const lessons = allCatalogLessons(catalog);
  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const target = byId.get(lessonId);
  if (!target) return [];

  const unmet: UnmetPrerequisite[] = [];
  for (const prereqId of target.prerequisiteIds) {
    const prereq = byId.get(prereqId);
    if (!prereq) continue;
    const stats = lessonStats(prereq);
    if (!stats.complete) {
      const firstActive = prereq.subLessons.find((subLesson) => subLesson.biteCount > 0 && subLesson.seenCount < subLesson.biteCount) ?? prereq.subLessons.find((subLesson) => subLesson.biteCount > 0) ?? prereq.subLessons[0] ?? null;
      unmet.push({
        id: prereq.id,
        code: prereq.code,
        title: prereq.title,
        seen: stats.seen,
        total: stats.total,
        firstSubLessonId: firstActive?.id ?? null,
      });
    }
  }
  return unmet;
}

export function unmetPrerequisitesForSubLesson(catalog: CourseCatalog, subLessonId: string): UnmetPrerequisite[] {
  for (const lesson of allCatalogLessons(catalog)) {
    if (lesson.subLessons.some((subLesson) => subLesson.id === subLessonId)) {
      return unmetPrerequisites(catalog, lesson.id);
    }
  }
  return [];
}

/**
 * Suggests the next sub-lesson to study whose lesson prerequisites are already met,
 * falling back to the earliest unfinished prerequisite sub-lesson.
 */
export function suggestedNextSubLesson(catalog: CourseCatalog): FlatSubLesson | null {
  const flat = flattenSubLessons(catalog);
  const playable = flat.filter((item) => item.biteCount > 0 && item.seenCount < item.biteCount);
  if (playable.length === 0) return flat.find((item) => item.biteCount > 0) ?? null;

  for (const candidate of playable) {
    const unmet = unmetPrerequisites(catalog, candidate.lessonId);
    if (unmet.length === 0) return candidate;
  }

  return playable[0] ?? null;
}
