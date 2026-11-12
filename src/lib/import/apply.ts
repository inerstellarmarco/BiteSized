import { and, asc, eq, isNull } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { bites, biteLinks, categories, courses, lessons, subCategories, subLessons } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";
import { enqueueSubLesson, processDueJobs } from "@/lib/generation/pipeline";
import type { Proposal } from "@/lib/import/parse";
import { newId } from "@/lib/ids";
import { latestLockedStyle } from "@/lib/style/guide";

async function nextPosition(current: string[]) {
  const sorted = [...current].sort();
  return generateKeyBetween(sorted.at(-1) ?? null, null);
}

export async function applyProposal(db: AppDatabase, proposal: Proposal) {
  const [course] = await db.select().from(courses).where(isNull(courses.archivedAt)).orderBy(asc(courses.position)).limit(1);
  let courseId = course?.id;
  if (!courseId) {
    courseId = newId("crs");
    await db.insert(courses).values({
      id: courseId,
      title: "Imported course",
      subtitle: "",
      description: "Imported from a document.",
      author: "",
      licence: "",
      aiGenerated: true,
      position: "a0",
    });
  }

  const storedCategories = await db.select().from(categories).where(eq(categories.courseId, courseId));
  const categoryRows: { id: string; code: string; title: string; summary: string; position: string; archivedAt: Date | null }[] = storedCategories.map((row) => ({
    id: row.id,
    code: row.code,
    title: row.title,
    summary: row.summary,
    position: row.position,
    archivedAt: row.archivedAt,
  }));
  let created = 0;
  let matched = 0;
  const touchedSubLessons: string[] = [];

  for (const proposed of proposal.categories.filter((item) => item.include)) {
    let category = categoryRows.find((row) => !row.archivedAt && proposed.code && row.code === proposed.code)
      ?? categoryRows.find((row) => !row.archivedAt && row.title === proposed.title);
    if (category) {
      matched += 1;
      await db.update(categories).set({ title: proposed.title, summary: proposed.summary || category.summary, updatedAt: new Date() }).where(eq(categories.id, category.id));
    } else {
      created += 1;
      const position = await nextPosition(categoryRows.map((row) => row.position));
      const id = newId("cat");
      await db.insert(categories).values({
        id,
        courseId,
        code: proposed.code,
        title: proposed.title,
        summary: proposed.summary,
        position,
      });
      category = { id, code: proposed.code, title: proposed.title, summary: proposed.summary, position, archivedAt: null };
      categoryRows.push(category);
    }

    const storedSubs = await db.select().from(subCategories).where(eq(subCategories.categoryId, category.id));
    const subRows: { id: string; code: string; title: string; levelTag: string; position: string; archivedAt: Date | null }[] = storedSubs.map((row) => ({
      id: row.id,
      code: row.code,
      title: row.title,
      levelTag: row.levelTag,
      position: row.position,
      archivedAt: row.archivedAt,
    }));
    for (const proposedSub of proposed.subCategories) {
      let sub = subRows.find((row) => !row.archivedAt && proposedSub.code && row.code === proposedSub.code)
        ?? subRows.find((row) => !row.archivedAt && row.title === proposedSub.title);
      if (sub) {
        matched += 1;
        await db.update(subCategories).set({
          title: proposedSub.title,
          levelTag: proposedSub.levelTag || sub.levelTag,
          toolkit: proposedSub.toolkit,
          updatedAt: new Date(),
        }).where(eq(subCategories.id, sub.id));
      } else {
        created += 1;
        const id = newId("sub");
        const position = await nextPosition(subRows.map((row) => row.position));
        await db.insert(subCategories).values({
          id,
          categoryId: category.id,
          code: proposedSub.code,
          title: proposedSub.title,
          levelTag: proposedSub.levelTag,
          toolkit: proposedSub.toolkit,
          position,
        });
        sub = { id, code: proposedSub.code, title: proposedSub.title, levelTag: proposedSub.levelTag, position, archivedAt: null };
        subRows.push(sub);
      }

      const storedLessons = await db.select().from(lessons).where(eq(lessons.subCategoryId, sub.id));
      const lessonRows: { id: string; code: string; title: string; position: string; archivedAt: Date | null }[] = storedLessons.map((row) => ({
        id: row.id,
        code: row.code,
        title: row.title,
        position: row.position,
        archivedAt: row.archivedAt,
      }));
      for (const proposedLesson of proposedSub.lessons) {
        let lesson = lessonRows.find((row) => !row.archivedAt && proposedLesson.code && row.code === proposedLesson.code)
          ?? lessonRows.find((row) => !row.archivedAt && row.title === proposedLesson.title);
        if (lesson) {
          matched += 1;
          await db.update(lessons).set({ title: proposedLesson.title, code: proposedLesson.code || lesson.code, updatedAt: new Date() }).where(eq(lessons.id, lesson.id));
        } else {
          created += 1;
          const id = newId("les");
          const position = await nextPosition(lessonRows.map((row) => row.position));
          await db.insert(lessons).values({
            id,
            subCategoryId: sub.id,
            code: proposedLesson.code,
            title: proposedLesson.title,
            prerequisiteIds: [],
            position,
          });
          lesson = { id, code: proposedLesson.code, title: proposedLesson.title, position, archivedAt: null };
          lessonRows.push(lesson);
        }

        const storedSubLessons = await db.select().from(subLessons).where(eq(subLessons.lessonId, lesson.id));
        const subLessonRows: { id: string; title: string; position: string; archivedAt: Date | null }[] = storedSubLessons.map((row) => ({
          id: row.id,
          title: row.title,
          position: row.position,
          archivedAt: row.archivedAt,
        }));
        for (const proposedSubLesson of proposedLesson.subLessons) {
          let subLesson = subLessonRows.find((row) => !row.archivedAt && row.title === proposedSubLesson.title);
          if (subLesson) matched += 1;
          else {
            created += 1;
            const id = newId("sll");
            const position = await nextPosition(subLessonRows.map((row) => row.position));
            await db.insert(subLessons).values({ id, lessonId: lesson.id, title: proposedSubLesson.title, position });
            subLesson = { id, title: proposedSubLesson.title, position, archivedAt: null };
            subLessonRows.push(subLesson);
          }
          const biteRows = await db.select().from(bites).where(and(eq(bites.subLessonId, subLesson.id), isNull(bites.archivedAt)));
          let bitePosition = biteRows.map((row) => row.position).sort().at(-1) ?? null;
          for (const topic of proposedSubLesson.topics) {
            const already = biteRows.find((row) => row.title.trim().toLowerCase() === topic.title.trim().toLowerCase());
            if (already) {
              matched += 1;
              continue;
            }
            created += 1;
            bitePosition = generateKeyBetween(bitePosition, null);
            const biteId = newId("bit");
            await db.insert(bites).values({
              id: biteId,
              subLessonId: subLesson.id,
              title: topic.title,
              body: "",
              sourceNote: "Outline topic · confidence: unset",
              position: bitePosition,
              reviewStatus: "pending",
            });
            if (topic.crossLinks.length > 0) {
              await db.insert(biteLinks).values(
                topic.crossLinks.map((link, index) => ({
                  id: newId("lnk"),
                  biteId,
                  targetCode: link.targetCode,
                  label: link.label,
                  position: `a${index}`,
                })),
              );
            }
          }
          touchedSubLessons.push(subLesson.id);
        }
      }
    }
  }

  await resolvePrerequisites(db, courseId, proposal);
  const style = await latestLockedStyle(db);
  if (style) {
    for (const subLessonId of [...new Set(touchedSubLessons)]) {
      const pending = await db.select().from(bites).where(and(eq(bites.subLessonId, subLessonId), eq(bites.reviewStatus, "pending"), isNull(bites.archivedAt)));
      if (pending.some((bite) => bite.body.trim().length < 40)) await enqueueSubLesson(db, subLessonId, style.id);
    }
  }
  const jobs = style ? await processDueJobs(db, 8) : [];
  return { courseId, created, matched, jobs, firstSubLessonId: touchedSubLessons[0] ?? null, styleLocked: Boolean(style) };
}

async function resolvePrerequisites(db: AppDatabase, courseId: string, proposal: Proposal) {
  const categoryRows = await db.select().from(categories).where(eq(categories.courseId, courseId));
  const subRows = await db.select().from(subCategories);
  const lessonRows = await db.select().from(lessons).where(isNull(lessons.archivedAt));
  const byCode = new Map(lessonRows.filter((row) => row.code).map((row) => [row.code, row.id]));
  for (const proposed of proposal.categories.filter((item) => item.include)) {
    const category = categoryRows.find((row) => proposed.code && row.code === proposed.code);
    if (!category) continue;
    for (const proposedSub of proposed.subCategories) {
      const sub = subRows.find((row) => row.categoryId === category.id && proposedSub.code && row.code === proposedSub.code);
      if (!sub) continue;
      for (const proposedLesson of proposedSub.lessons) {
        const lesson = lessonRows.find((row) => row.subCategoryId === sub.id && row.code === proposedLesson.code);
        if (!lesson || proposedLesson.prerequisiteCodes.length === 0) continue;
        const ids = proposedLesson.prerequisiteCodes
          .map((code) => byCode.get(code) ?? lastLessonInTrack(code, categoryRows, subRows, lessonRows))
          .filter((id): id is string => Boolean(id && id !== lesson.id));
        if (ids.length > 0) {
          await db.update(lessons).set({ prerequisiteIds: [...new Set(ids)], updatedAt: new Date() }).where(eq(lessons.id, lesson.id));
        }
      }
    }
  }
}

function lastLessonInTrack(
  track: string,
  categoryRows: { id: string; code: string }[],
  subRows: { id: string; categoryId: string; position: string }[],
  lessonRows: { id: string; subCategoryId: string; position: string }[],
) {
  const category = categoryRows.find((row) => row.code === track);
  if (!category) return null;
  const subs = subRows.filter((row) => row.categoryId === category.id).sort((a, b) => (a.position < b.position ? -1 : 1));
  const lastSub = subs.at(-1);
  if (!lastSub) return null;
  const inSub = lessonRows.filter((row) => row.subCategoryId === lastSub.id).sort((a, b) => (a.position < b.position ? -1 : 1));
  return inSub.at(-1)?.id ?? null;
}
