import { courses, categories, lessons, subCategories, subLessons } from "@/lib/db/schema";
import { openMemoryDatabase } from "@/lib/db/memory";
import type { AppDatabase } from "@/lib/db/types";
import type { Toolkit } from "@/lib/types";

const toolkit: Toolkit = { handsOnProjects: [], toolsAndFrameworks: [], learningOutcomes: [] };

export async function withDb(run: (db: AppDatabase) => Promise<void>) {
  const opened = await openMemoryDatabase();
  try {
    await run(opened.db);
  } finally {
    await opened.close();
  }
}

export async function makeStack(db: AppDatabase) {
  await db.insert(courses).values({ id: "crs_test", title: "Test course", position: "a0" });
  await db.insert(categories).values({ id: "cat_test", courseId: "crs_test", title: "Category", code: "A", position: "a0" });
  await db.insert(subCategories).values({
    id: "sub_test",
    categoryId: "cat_test",
    title: "Module",
    code: "A1",
    levelTag: "Foundations",
    toolkit,
    position: "a0",
  });
  await db.insert(lessons).values({
    id: "les_test",
    subCategoryId: "sub_test",
    title: "Lesson",
    code: "A1.1",
    prerequisiteIds: [],
    position: "a0",
  });
  await db.insert(subLessons).values({ id: "sll_test", lessonId: "les_test", title: "Sub-lesson", position: "a0" });
  return { subLessonId: "sll_test" };
}
