import { and, asc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { loadCatalog } from "@/lib/content/catalog";
import { bites, contentFlags, personalBites } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";

export type SearchMatch = {
  id: string;
  kind: "bite" | "note" | "sub-lesson" | "lesson" | "module";
  title: string;
  subtitle: string;
  snippet: string;
  href: string;
};

function makeSnippet(text: string, query: string, maxLen = 140): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const lower = clean.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx < 0 || clean.length <= maxLen) {
    return clean.length <= maxLen ? clean : `${clean.slice(0, maxLen).trim()}…`;
  }
  const start = Math.max(0, idx - 40);
  const end = Math.min(clean.length, start + maxLen);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < clean.length ? "…" : "";
  return `${prefix}${clean.slice(start, end).trim()}${suffix}`;
}

export async function searchCourse(
  db: AppDatabase,
  input: { query: string; profileId?: string | null; limit?: number },
): Promise<SearchMatch[]> {
  const rawQuery = input.query.trim();
  if (!rawQuery) return [];
  const limit = input.limit ?? 40;
  const terms = rawQuery
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);
  if (terms.length === 0) return [];

  const matchesAll = (haystack: string) => {
    const lower = haystack.toLowerCase();
    return terms.every((term) => lower.includes(term));
  };

  const [catalog, personalRows, noteRows] = await Promise.all([
    loadCatalog(db, null),
    input.profileId
      ? db
          .select({
            biteId: personalBites.biteId,
            title: personalBites.title,
            body: personalBites.body,
          })
          .from(personalBites)
          .where(eq(personalBites.profileId, input.profileId))
      : Promise.resolve([]),
    input.profileId
      ? db
          .select({
            id: contentFlags.id,
            targetId: contentFlags.targetId,
            note: contentFlags.note,
          })
          .from(contentFlags)
          .where(
            and(
              eq(contentFlags.profileId, input.profileId),
              eq(contentFlags.targetType, "bite"),
              eq(contentFlags.kind, "note"),
            ),
          )
      : Promise.resolve([]),
  ]);

  if (!catalog) return [];

  const categoryRows = catalog.categories;
  const subCategoryRows = categoryRows.flatMap((cat) =>
    cat.subCategories.map((sub) => ({ ...sub, categoryId: cat.id })),
  );
  const lessonRows = subCategoryRows.flatMap((sub) =>
    sub.lessons.map((les) => ({ ...les, subCategoryId: sub.id })),
  );
  const subLessonRows = lessonRows.flatMap((les) =>
    les.subLessons.map((sll) => ({ ...sll, lessonId: les.id })),
  );

  const categoryById = new Map(categoryRows.map((row) => [row.id, row]));
  const subCategoryById = new Map(subCategoryRows.map((row) => [row.id, row]));
  const lessonById = new Map(lessonRows.map((row) => [row.id, row]));
  const subLessonById = new Map(subLessonRows.map((row) => [row.id, row]));
  const personalByBite = new Map(personalRows.map((row) => [row.biteId, row]));

  // Find sub-lessons whose code or title matches any search term so SQL can also pull their bites
  const matchingSubLessonIds = subLessonRows
    .filter((sll) => {
      const les = lessonById.get(sll.lessonId);
      const hay = `${les?.code ?? ""} ${sll.title}`.toLowerCase();
      return terms.some((term) => hay.includes(term));
    })
    .map((sll) => sll.id);

  // Also include bite IDs from the learner's notes or personal rewrites
  const extraBiteIds = Array.from(
    new Set([
      ...noteRows.filter((n) => n.note.trim().length > 0).map((n) => n.targetId),
      ...personalRows
        .filter((p) => terms.some((t) => `${p.title} ${p.body}`.toLowerCase().includes(t)))
        .map((p) => p.biteId),
    ]),
  );

  const termFilters = terms.map((term) => {
    const pattern = `%${term.replace(/[%_\\]/g, "\\$&")}%`;
    const clauses = [ilike(bites.title, pattern), ilike(bites.body, pattern)];
    if (matchingSubLessonIds.length > 0) {
      clauses.push(inArray(bites.subLessonId, matchingSubLessonIds));
    }
    if (extraBiteIds.length > 0) {
      clauses.push(inArray(bites.id, extraBiteIds));
    }
    return or(...clauses)!;
  });

  const biteRows = await db
    .select({
      id: bites.id,
      subLessonId: bites.subLessonId,
      title: bites.title,
      body: bites.body,
    })
    .from(bites)
    .where(and(isNull(bites.archivedAt), eq(bites.reviewStatus, "approved"), ...termFilters))
    .orderBy(asc(bites.position))
    .limit(Math.max(limit * 3, 120));

  const biteById = new Map(biteRows.map((row) => [row.id, row]));

  const results: SearchMatch[] = [];

  // 1. Private notes on bites (highest relevance for the learner who wrote them)
  for (const note of noteRows) {
    if (!note.note.trim()) continue;
    const bite = biteById.get(note.targetId);
    if (!bite) continue;
    const subLesson = subLessonById.get(bite.subLessonId);
    if (!subLesson) continue;
    const lesson = lessonById.get(subLesson.lessonId);
    if (!lesson || !subCategoryById.has(lesson.subCategoryId)) continue;
    if (matchesAll(`${bite.title} ${note.note}`)) {
      results.push({
        id: `note:${note.id}`,
        kind: "note",
        title: bite.title,
        subtitle: `${lesson.code} · ${subLesson.title} · Your note`,
        snippet: makeSnippet(note.note, terms[0]!),
        href: `/learn/${subLesson.id}?bite=${bite.id}`,
      });
    }
  }

  // 2. Bites (title, body, or personal rewrite)
  for (const bite of biteRows) {
    const subLesson = subLessonById.get(bite.subLessonId);
    if (!subLesson) continue;
    const lesson = lessonById.get(subLesson.lessonId);
    if (!lesson) continue;
    const subCategory = subCategoryById.get(lesson.subCategoryId);
    if (!subCategory || !categoryById.has(subCategory.categoryId)) continue;
    const personal = personalByBite.get(bite.id);
    const searchText = `${bite.title} ${bite.body} ${personal?.title ?? ""} ${personal?.body ?? ""} ${lesson.code} ${subLesson.title}`;
    if (matchesAll(searchText)) {
      const bodyToSnippet = personal && matchesAll(`${personal.title} ${personal.body}`) ? personal.body : bite.body;
      results.push({
        id: `bite:${bite.id}`,
        kind: "bite",
        title: bite.title,
        subtitle: `${lesson.code} · ${subLesson.title}`,
        snippet: makeSnippet(bodyToSnippet, terms[0]!),
        href: `/learn/${subLesson.id}?bite=${bite.id}`,
      });
    }
    if (results.length >= limit) return results.slice(0, limit);
  }

  // 3. Sub-lessons
  for (const subLesson of subLessonRows) {
    const lesson = lessonById.get(subLesson.lessonId);
    if (!lesson) continue;
    const subCategory = subCategoryById.get(lesson.subCategoryId);
    if (!subCategory || !categoryById.has(subCategory.categoryId)) continue;
    if (matchesAll(`${lesson.code} ${lesson.title} ${subLesson.title}`)) {
      results.push({
        id: `sublesson:${subLesson.id}`,
        kind: "sub-lesson",
        title: subLesson.title,
        subtitle: `${lesson.code} · ${lesson.title}`,
        snippet: `Sub-lesson in ${subCategory.title}`,
        href: `/learn/${subLesson.id}`,
      });
    }
    if (results.length >= limit) return results.slice(0, limit);
  }

  // 4. Lessons & Modules
  for (const lesson of lessonRows) {
    const subCategory = subCategoryById.get(lesson.subCategoryId);
    if (!subCategory || !categoryById.has(subCategory.categoryId)) continue;
    if (matchesAll(`${lesson.code} ${lesson.title}`)) {
      results.push({
        id: `lesson:${lesson.id}`,
        kind: "lesson",
        title: lesson.title,
        subtitle: subCategory.title,
        snippet: lesson.code,
        href: `/course#${lesson.id}`,
      });
    }
  }

  for (const subCategory of subCategoryRows) {
    const category = categoryById.get(subCategory.categoryId);
    if (!category) continue;
    const toolkitText = [
      ...(subCategory.toolkit?.handsOnProjects ?? []),
      ...(subCategory.toolkit?.learningOutcomes ?? []),
      ...(subCategory.toolkit?.toolsAndFrameworks ?? []),
    ].join(" ");
    if (matchesAll(`${subCategory.code} ${subCategory.title} ${subCategory.levelTag} ${toolkitText}`)) {
      results.push({
        id: `module:${subCategory.id}`,
        kind: "module",
        title: subCategory.title,
        subtitle: `${category.title}${subCategory.levelTag ? ` · ${subCategory.levelTag}` : ""}`,
        snippet: makeSnippet(toolkitText || subCategory.title, terms[0]!),
        href: `/course#${subCategory.id}`,
      });
    }
  }

  return results.slice(0, limit);
}
