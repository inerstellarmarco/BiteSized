import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { generateNKeysBetween } from "fractional-indexing";
import { courseDraft } from "../content/packages/applied-ai-engineering/course";

function positions(count: number): string[] {
  if (count === 0) return [];
  return generateNKeysBetween(null, null, count);
}

const root = path.join(process.cwd(), "content", "packages", "applied-ai-engineering");

async function main() {
  await mkdir(path.join(root, "sublessons"), { recursive: true });
  const categoryKeys = positions(courseDraft.categories.length);
  const categories = courseDraft.categories.map((category, categoryIndex) => {
    const subKeys = positions(category.subCategories.length);
    return {
      id: category.id,
      code: category.code,
      title: category.title,
      summary: category.summary,
      position: categoryKeys[categoryIndex],
      archivedAt: null,
      subCategories: category.subCategories.map((subCategory, subIndex) => {
        const lessonKeys = positions(subCategory.lessons.length);
        return {
          id: subCategory.id,
          code: subCategory.code,
          title: subCategory.title,
          levelTag: subCategory.levelTag,
          toolkit: subCategory.toolkit,
          position: subKeys[subIndex],
          archivedAt: null,
          lessons: subCategory.lessons.map((lesson, lessonIndex) => {
            const subLessonKeys = positions(lesson.subLessons.length);
            return {
              id: lesson.id,
              code: lesson.code,
              title: lesson.title,
              prerequisiteIds: lesson.prerequisiteIds ?? [],
              position: lessonKeys[lessonIndex],
              archivedAt: null,
              subLessons: lesson.subLessons.map((subLesson, subLessonIndex) => {
                const file = `sublessons/${subLesson.id}.json`;
                const biteKeys = positions(subLesson.bites.length);
                const bites = subLesson.bites.map((item, biteIndex) => {
                  const questionKeys = positions(item.questions.length);
                  const linkKeys = positions(item.crossLinks?.length ?? 0);
                  return {
                    id: item.id,
                    title: item.title,
                    body: item.body,
                    sourceNote: item.sourceNote,
                    lastReviewedOn: item.lastReviewedOn,
                    diagram: item.diagram ?? null,
                    position: biteKeys[biteIndex],
                    archivedAt: null,
                    crossLinks: (item.crossLinks ?? []).map((link, linkIndex) => ({
                      id: `lnk_${item.id}_${link.targetCode.replace(/[^A-Za-z0-9]+/g, "_")}`,
                      targetCode: link.targetCode,
                      label: link.label,
                      position: linkKeys[linkIndex],
                    })),
                    questions: item.questions.map((question, questionIndex) => ({
                      id: question.id,
                      type: question.type,
                      prompt: question.prompt,
                      choices: question.choices,
                      correctChoiceId: question.correctChoiceId,
                      explanation: question.explanation,
                      position: questionKeys[questionIndex],
                      archivedAt: null,
                    })),
                  };
                });
                return {
                  meta: {
                    id: subLesson.id,
                    title: subLesson.title,
                    position: subLessonKeys[subLessonIndex],
                    archivedAt: null,
                    file,
                  },
                  payload: { id: subLesson.id, title: subLesson.title, bites },
                  file,
                };
              }),
            };
          }),
        };
      }),
    };
  });

  const files = new Map<string, string>();
  const index = {
    format: "bite-sized.package",
    formatVersion: 1,
    course: {
      id: courseDraft.id,
      title: courseDraft.title,
      subtitle: courseDraft.subtitle,
      description: courseDraft.description,
      author: courseDraft.author,
      licence: courseDraft.licence,
      aiGenerated: courseDraft.aiGenerated,
      position: "a0",
      archivedAt: null,
    },
    categories: categories.map((category) => ({
      ...category,
      subCategories: category.subCategories.map((subCategory) => ({
        ...subCategory,
        lessons: subCategory.lessons.map((lesson) => ({
          ...lesson,
          subLessons: lesson.subLessons.map((subLesson) => {
            files.set(subLesson.file, JSON.stringify(subLesson.payload, null, 2));
            return subLesson.meta;
          }),
        })),
      })),
    })),
  };
  files.set("index.json", JSON.stringify(index, null, 2));
  for (const [name, contents] of files) {
    const full = path.join(root, name);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, `${contents}\n`, "utf8");
  }
  console.log(`Wrote ${files.size} package files to ${root}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
