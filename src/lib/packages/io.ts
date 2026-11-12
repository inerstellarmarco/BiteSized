import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { asc, eq } from "drizzle-orm";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  biteLinks,
  biteProgress,
  bites,
  categories,
  contentRevisions,
  courses,
  learnerCursors,
  lessons,
  pinAttempts,
  profiles,
  questions,
  quizAnswers,
  quizAttempts,
  sessions,
  subCategories,
  subLessons,
} from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";
import { toIso } from "@/lib/dates";
import { PACKAGE_FORMAT, PACKAGE_VERSION, QUESTION_TYPES, type Choice, type QuestionType, type Toolkit } from "@/lib/types";

export type PackageOptions = {
  courseId?: string;
  includeLearners?: boolean;
  includeHistory?: boolean;
  includeArchived?: boolean;
};

export type ImportOptions = {
  replace?: boolean;
  includeLearners?: boolean;
  includeHistory?: boolean;
};

type IndexLesson = {
  id: string;
  code: string;
  title: string;
  prerequisiteIds: string[];
  position: string;
  archivedAt: string | null;
  subLessons: { id: string; title: string; position: string; archivedAt: string | null; file: string }[];
};

type PackageIndex = {
  format: string;
  formatVersion: number;
  course: {
    id: string;
    title: string;
    subtitle: string;
    description: string;
    author: string;
    licence: string;
    aiGenerated: boolean;
    position: string;
    archivedAt: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  };
  categories: {
    id: string;
    code: string;
    title: string;
    summary: string;
    position: string;
    archivedAt: string | null;
    subCategories: {
      id: string;
      code: string;
      title: string;
      levelTag: string;
      toolkit: Toolkit;
      position: string;
      archivedAt: string | null;
      lessons: IndexLesson[];
    }[];
  }[];
};

type BiteFile = {
  id: string;
  title: string;
  body: string;
  sourceNote: string;
  lastReviewedOn: string | null;
  diagram: string | null;
  position: string;
  archivedAt: string | null;
  crossLinks: { id: string; targetCode: string; label: string; position: string }[];
  questions: {
    id: string;
    type: QuestionType;
    prompt: string;
    choices: Choice[];
    correctChoiceId: string;
    explanation: string;
    position: string;
    archivedAt: string | null;
  }[];
};

const emptyToolkit = (): Toolkit => ({
  handsOnProjects: [],
  toolsAndFrameworks: [],
  learningOutcomes: [],
});

function archivedIso(value: Date | string | null | undefined): string | null {
  return toIso(value);
}

export async function buildPackageFiles(db: AppDatabase, options: PackageOptions = {}): Promise<Record<string, string>> {
  const includeArchived = options.includeArchived !== false;
  const courseRows = await db.select().from(courses).orderBy(asc(courses.position));
  const course = (options.courseId ? courseRows.find((row) => row.id === options.courseId) : courseRows.find((row) => includeArchived || !row.archivedAt)) ?? null;
  if (!course) throw new Error("There is no course to export.");

  const [categoryRows, subCategoryRows, lessonRows, subLessonRows, biteRows, linkRows, questionRows] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.position)),
    db.select().from(subCategories).orderBy(asc(subCategories.position)),
    db.select().from(lessons).orderBy(asc(lessons.position)),
    db.select().from(subLessons).orderBy(asc(subLessons.position)),
    db.select().from(bites).orderBy(asc(bites.position)),
    db.select().from(biteLinks).orderBy(asc(biteLinks.position)),
    db.select().from(questions).orderBy(asc(questions.position)),
  ]);

  const visible = <T extends { archivedAt: Date | string | null }>(rows: T[]) => (includeArchived ? rows : rows.filter((row) => !row.archivedAt));
  const files: Record<string, string> = {};
  const index: PackageIndex = {
    format: PACKAGE_FORMAT,
    formatVersion: PACKAGE_VERSION,
    course: {
      id: course.id,
      title: course.title,
      subtitle: course.subtitle,
      description: course.description,
      author: course.author,
      licence: course.licence,
      aiGenerated: course.aiGenerated,
      position: course.position,
      archivedAt: archivedIso(course.archivedAt),
      createdAt: archivedIso(course.createdAt),
      updatedAt: archivedIso(course.updatedAt),
    },
    categories: visible(categoryRows)
      .filter((category) => category.courseId === course.id)
      .map((category) => ({
        id: category.id,
        code: category.code,
        title: category.title,
        summary: category.summary,
        position: category.position,
        archivedAt: archivedIso(category.archivedAt),
        subCategories: visible(subCategoryRows)
          .filter((subCategory) => subCategory.categoryId === category.id)
          .map((subCategory) => ({
            id: subCategory.id,
            code: subCategory.code,
            title: subCategory.title,
            levelTag: subCategory.levelTag,
            toolkit: subCategory.toolkit ?? emptyToolkit(),
            position: subCategory.position,
            archivedAt: archivedIso(subCategory.archivedAt),
            lessons: visible(lessonRows)
              .filter((lesson) => lesson.subCategoryId === subCategory.id)
              .map((lesson) => ({
                id: lesson.id,
                code: lesson.code,
                title: lesson.title,
                prerequisiteIds: lesson.prerequisiteIds ?? [],
                position: lesson.position,
                archivedAt: archivedIso(lesson.archivedAt),
                subLessons: visible(subLessonRows)
                  .filter((subLesson) => subLesson.lessonId === lesson.id)
                  .map((subLesson) => {
                    const file = `sublessons/${subLesson.id}.json`;
                    const lessonBites = visible(biteRows).filter((bite) => bite.subLessonId === subLesson.id);
                    const payload = {
                      id: subLesson.id,
                      title: subLesson.title,
                      bites: lessonBites.map((bite) => ({
                        id: bite.id,
                        title: bite.title,
                        body: bite.body,
                        sourceNote: bite.sourceNote,
                        lastReviewedOn: bite.lastReviewedOn,
                        diagram: bite.diagram,
                        position: bite.position,
                        archivedAt: archivedIso(bite.archivedAt),
                        crossLinks: linkRows
                          .filter((link) => link.biteId === bite.id)
                          .map((link) => ({
                            id: link.id,
                            targetCode: link.targetCode,
                            label: link.label,
                            position: link.position,
                          })),
                        questions: visible(questionRows)
                          .filter((question) => question.biteId === bite.id)
                          .map((question) => ({
                            id: question.id,
                            type: question.type,
                            prompt: question.prompt,
                            choices: question.choices,
                            correctChoiceId: question.correctChoiceId,
                            explanation: question.explanation,
                            position: question.position,
                            archivedAt: archivedIso(question.archivedAt),
                          })),
                      })),
                    };
                    files[file] = JSON.stringify(payload, null, 2);
                    return {
                      id: subLesson.id,
                      title: subLesson.title,
                      position: subLesson.position,
                      archivedAt: archivedIso(subLesson.archivedAt),
                      file,
                    };
                  }),
              })),
          })),
      })),
  };
  files["index.json"] = JSON.stringify(index, null, 2);

  if (options.includeLearners) {
    const [profileRows, progressRows, cursorRows, attemptRows, answerRows] = await Promise.all([
      db.select().from(profiles),
      db.select().from(biteProgress),
      db.select().from(learnerCursors),
      db.select().from(quizAttempts),
      db.select().from(quizAnswers),
    ]);
    files["learners.json"] = JSON.stringify(
      {
        profiles: profileRows.map((profile) => ({
          id: profile.id,
          name: profile.name,
          pinHash: profile.pinHash,
          isAdmin: profile.isAdmin,
          fontSize: profile.fontSize,
          theme: profile.theme,
          failedAttempts: profile.failedAttempts,
          lockedUntil: archivedIso(profile.lockedUntil),
          createdAt: archivedIso(profile.createdAt),
          updatedAt: archivedIso(profile.updatedAt),
          archivedAt: archivedIso(profile.archivedAt),
        })),
        progress: progressRows.map((row) => ({
          profileId: row.profileId,
          biteId: row.biteId,
          seenAt: archivedIso(row.seenAt),
        })),
        cursors: cursorRows.map((row) => ({
          profileId: row.profileId,
          subLessonId: row.subLessonId,
          biteId: row.biteId,
          mode: row.mode,
          updatedAt: archivedIso(row.updatedAt),
        })),
        quizAttempts: attemptRows.map((row) => ({
          id: row.id,
          profileId: row.profileId,
          subLessonId: row.subLessonId,
          correctCount: row.correctCount,
          answeredCount: row.answeredCount,
          totalCount: row.totalCount,
          stoppedEarly: row.stoppedEarly,
          startedAt: archivedIso(row.startedAt),
          finishedAt: archivedIso(row.finishedAt),
        })),
        quizAnswers: answerRows.map((row) => ({
          id: row.id,
          attemptId: row.attemptId,
          questionId: row.questionId,
          selectedChoiceId: row.selectedChoiceId,
          correct: row.correct,
        })),
      },
      null,
      2,
    );
  }

  if (options.includeHistory) {
    const revisions = await db.select().from(contentRevisions);
    files["history.json"] = JSON.stringify(
      {
        revisions: revisions.map((row) => ({
          id: row.id,
          entityType: row.entityType,
          entityId: row.entityId,
          op: row.op,
          snapshot: row.snapshot,
          actorProfileId: row.actorProfileId,
          createdAt: archivedIso(row.createdAt),
        })),
      },
      null,
      2,
    );
  }

  return files;
}

export async function writePackageToDir(dir: string, files: Record<string, string>) {
  await mkdir(dir, { recursive: true });
  for (const [name, contents] of Object.entries(files)) {
    const full = path.join(dir, name);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, contents, "utf8");
  }
}

export async function readPackageFromDir(dir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  async function walk(current: string) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".json")) {
        const key = path.relative(dir, full).split(path.sep).join("/");
        files[key] = await readFile(full, "utf8");
      }
    }
  }
  await walk(dir);
  return files;
}

export function zipPackage(files: Record<string, string>): Uint8Array {
  const data: Record<string, Uint8Array> = {};
  for (const [name, text] of Object.entries(files)) data[name] = strToU8(text);
  return zipSync(data);
}

export function unzipPackage(bytes: Uint8Array): Record<string, string> {
  const data = unzipSync(bytes);
  const files: Record<string, string> = {};
  for (const [name, value] of Object.entries(data)) {
    if (name.endsWith("/")) continue;
    files[name.replace(/^\/+/, "")] = strFromU8(value);
  }
  return files;
}

export async function wipeDatabase(db: AppDatabase) {
  await db.delete(quizAnswers);
  await db.delete(quizAttempts);
  await db.delete(learnerCursors);
  await db.delete(biteProgress);
  await db.delete(pinAttempts);
  await db.delete(sessions);
  await db.delete(contentRevisions);
  await db.delete(biteLinks);
  await db.delete(questions);
  await db.delete(bites);
  await db.delete(subLessons);
  await db.delete(lessons);
  await db.delete(subCategories);
  await db.delete(categories);
  await db.delete(courses);
  await db.delete(profiles);
}

function parseIndex(text: string): PackageIndex {
  let data: PackageIndex;
  try {
    data = JSON.parse(text) as PackageIndex;
  } catch {
    throw new Error("index.json is not valid JSON.");
  }
  if (data.format !== PACKAGE_FORMAT) throw new Error("This file is not a Bite Sized package.");
  if (data.formatVersion !== PACKAGE_VERSION) {
    throw new Error(`Unsupported package version ${String(data.formatVersion)}.`);
  }
  if (!data.course?.id || !data.course.title) throw new Error("The package is missing a course id or title.");
  return data;
}

function when(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date ${value}.`);
  return date;
}

function toolkitOf(value: Toolkit | undefined): Toolkit {
  return {
    handsOnProjects: value?.handsOnProjects ?? [],
    toolsAndFrameworks: value?.toolsAndFrameworks ?? [],
    learningOutcomes: value?.learningOutcomes ?? [],
  };
}

async function applyPackage(db: AppDatabase, files: Record<string, string>, options: ImportOptions) {
  const index = parseIndex(files["index.json"] ?? "");
  const course = index.course;
  await db
    .insert(courses)
    .values({
      id: course.id,
      title: course.title,
      subtitle: course.subtitle ?? "",
      description: course.description ?? "",
      author: course.author ?? "",
      licence: course.licence ?? "",
      aiGenerated: Boolean(course.aiGenerated),
      position: course.position || "a0",
      archivedAt: when(course.archivedAt),
      createdAt: when(course.createdAt) ?? new Date(),
      updatedAt: when(course.updatedAt) ?? new Date(),
    })
    .onConflictDoUpdate({
      target: courses.id,
      set: {
        title: course.title,
        subtitle: course.subtitle ?? "",
        description: course.description ?? "",
        author: course.author ?? "",
        licence: course.licence ?? "",
        aiGenerated: Boolean(course.aiGenerated),
        position: course.position || "a0",
        archivedAt: when(course.archivedAt),
        updatedAt: when(course.updatedAt) ?? new Date(),
      },
    });

  for (const category of index.categories ?? []) {
    await db
      .insert(categories)
      .values({
        id: category.id,
        courseId: course.id,
        code: category.code ?? "",
        title: category.title,
        summary: category.summary ?? "",
        position: category.position,
        archivedAt: when(category.archivedAt),
      })
      .onConflictDoUpdate({
        target: categories.id,
        set: {
          courseId: course.id,
          code: category.code ?? "",
          title: category.title,
          summary: category.summary ?? "",
          position: category.position,
          archivedAt: when(category.archivedAt),
          updatedAt: new Date(),
        },
      });

    for (const subCategory of category.subCategories ?? []) {
      const toolkit = toolkitOf(subCategory.toolkit);
      await db
        .insert(subCategories)
        .values({
          id: subCategory.id,
          categoryId: category.id,
          code: subCategory.code ?? "",
          title: subCategory.title,
          levelTag: subCategory.levelTag ?? "",
          toolkit,
          position: subCategory.position,
          archivedAt: when(subCategory.archivedAt),
        })
        .onConflictDoUpdate({
          target: subCategories.id,
          set: {
            categoryId: category.id,
            code: subCategory.code ?? "",
            title: subCategory.title,
            levelTag: subCategory.levelTag ?? "",
            toolkit,
            position: subCategory.position,
            archivedAt: when(subCategory.archivedAt),
            updatedAt: new Date(),
          },
        });

      for (const lesson of subCategory.lessons ?? []) {
        await db
          .insert(lessons)
          .values({
            id: lesson.id,
            subCategoryId: subCategory.id,
            code: lesson.code ?? "",
            title: lesson.title,
            prerequisiteIds: lesson.prerequisiteIds ?? [],
            position: lesson.position,
            archivedAt: when(lesson.archivedAt),
          })
          .onConflictDoUpdate({
            target: lessons.id,
            set: {
              subCategoryId: subCategory.id,
              code: lesson.code ?? "",
              title: lesson.title,
              prerequisiteIds: lesson.prerequisiteIds ?? [],
              position: lesson.position,
              archivedAt: when(lesson.archivedAt),
              updatedAt: new Date(),
            },
          });

        for (const subLesson of lesson.subLessons ?? []) {
          await db
            .insert(subLessons)
            .values({
              id: subLesson.id,
              lessonId: lesson.id,
              title: subLesson.title,
              position: subLesson.position,
              archivedAt: when(subLesson.archivedAt),
            })
            .onConflictDoUpdate({
              target: subLessons.id,
              set: {
                lessonId: lesson.id,
                title: subLesson.title,
                position: subLesson.position,
                archivedAt: when(subLesson.archivedAt),
                updatedAt: new Date(),
              },
            });
          const fileText = files[subLesson.file];
          if (!fileText) throw new Error(`Missing content file ${subLesson.file}.`);
          const payload = JSON.parse(fileText) as { bites?: BiteFile[] };
          for (const bite of payload.bites ?? []) {
            await db
              .insert(bites)
              .values({
                id: bite.id,
                subLessonId: subLesson.id,
                title: bite.title,
                body: bite.body,
                sourceNote: bite.sourceNote ?? "",
                lastReviewedOn: bite.lastReviewedOn,
                diagram: bite.diagram,
                position: bite.position,
                archivedAt: when(bite.archivedAt),
              })
              .onConflictDoUpdate({
                target: bites.id,
                set: {
                  subLessonId: subLesson.id,
                  title: bite.title,
                  body: bite.body,
                  sourceNote: bite.sourceNote ?? "",
                  lastReviewedOn: bite.lastReviewedOn,
                  diagram: bite.diagram,
                  position: bite.position,
                  archivedAt: when(bite.archivedAt),
                  updatedAt: new Date(),
                },
              });
            await db.delete(biteLinks).where(eq(biteLinks.biteId, bite.id));
            if (bite.crossLinks?.length) {
              await db.insert(biteLinks).values(
                bite.crossLinks.map((link) => ({
                  id: link.id,
                  biteId: bite.id,
                  targetCode: link.targetCode,
                  label: link.label,
                  position: link.position,
                })),
              );
            }
            await db.delete(questions).where(eq(questions.biteId, bite.id));
            if (bite.questions?.length) {
              for (const question of bite.questions) {
                if (!QUESTION_TYPES.includes(question.type)) {
                  throw new Error(`Unknown question type ${question.type} on ${question.id}.`);
                }
              }
              await db.insert(questions).values(
                bite.questions.map((question) => ({
                  id: question.id,
                  biteId: bite.id,
                  type: question.type,
                  prompt: question.prompt,
                  choices: question.choices,
                  correctChoiceId: question.correctChoiceId,
                  explanation: question.explanation ?? "",
                  position: question.position,
                  archivedAt: when(question.archivedAt),
                })),
              );
            }
          }
        }
      }
    }
  }

  if (options.includeLearners !== false && files["learners.json"]) {
    const learners = JSON.parse(files["learners.json"]) as {
      profiles?: {
        id: string;
        name: string;
        pinHash: string;
        isAdmin: boolean;
        fontSize: "sm" | "md" | "lg";
        theme: "light" | "dark" | "system";
        failedAttempts: number;
        lockedUntil: string | null;
        createdAt: string | null;
        updatedAt: string | null;
        archivedAt: string | null;
      }[];
      progress?: { profileId: string; biteId: string; seenAt: string | null }[];
      cursors?: { profileId: string; subLessonId: string; biteId: string | null; mode: string; updatedAt: string | null }[];
      quizAttempts?: {
        id: string;
        profileId: string;
        subLessonId: string;
        correctCount: number;
        answeredCount: number;
        totalCount: number;
        stoppedEarly: boolean;
        startedAt: string | null;
        finishedAt: string | null;
      }[];
      quizAnswers?: { id: string; attemptId: string; questionId: string; selectedChoiceId: string | null; correct: boolean }[];
    };
    for (const profile of learners.profiles ?? []) {
      const values = {
        id: profile.id,
        name: profile.name,
        pinHash: profile.pinHash,
        isAdmin: profile.isAdmin,
        fontSize: profile.fontSize,
        theme: profile.theme,
        failedAttempts: profile.failedAttempts ?? 0,
        lockedUntil: when(profile.lockedUntil),
        archivedAt: when(profile.archivedAt),
        createdAt: when(profile.createdAt) ?? new Date(),
        updatedAt: when(profile.updatedAt) ?? new Date(),
      };
      await db.insert(profiles).values(values).onConflictDoUpdate({
        target: profiles.id,
        set: values,
      });
    }
    for (const row of learners.progress ?? []) {
      await db
        .insert(biteProgress)
        .values({ profileId: row.profileId, biteId: row.biteId, seenAt: when(row.seenAt) ?? new Date() })
        .onConflictDoUpdate({
          target: [biteProgress.profileId, biteProgress.biteId],
          set: { seenAt: when(row.seenAt) ?? new Date() },
        });
    }
    for (const row of learners.cursors ?? []) {
      await db
        .insert(learnerCursors)
        .values({
          profileId: row.profileId,
          subLessonId: row.subLessonId,
          biteId: row.biteId,
          mode: row.mode,
          updatedAt: when(row.updatedAt) ?? new Date(),
        })
        .onConflictDoUpdate({
          target: learnerCursors.profileId,
          set: {
            subLessonId: row.subLessonId,
            biteId: row.biteId,
            mode: row.mode,
            updatedAt: when(row.updatedAt) ?? new Date(),
          },
        });
    }
    for (const row of learners.quizAttempts ?? []) {
      const values = {
        id: row.id,
        profileId: row.profileId,
        subLessonId: row.subLessonId,
        correctCount: row.correctCount,
        answeredCount: row.answeredCount,
        totalCount: row.totalCount,
        stoppedEarly: row.stoppedEarly,
        startedAt: when(row.startedAt) ?? new Date(),
        finishedAt: when(row.finishedAt) ?? new Date(),
      };
      await db.insert(quizAttempts).values(values).onConflictDoUpdate({ target: quizAttempts.id, set: values });
    }
    for (const row of learners.quizAnswers ?? []) {
      await db.insert(quizAnswers).values(row).onConflictDoUpdate({ target: quizAnswers.id, set: row });
    }
  }

  if (options.includeHistory !== false && files["history.json"]) {
    const history = JSON.parse(files["history.json"]) as {
      revisions?: {
        id: string;
        entityType: string;
        entityId: string;
        op: string;
        snapshot: Record<string, unknown>;
        actorProfileId: string | null;
        createdAt: string | null;
      }[];
    };
    for (const row of history.revisions ?? []) {
      await db
        .insert(contentRevisions)
        .values({
          id: row.id,
          entityType: row.entityType,
          entityId: row.entityId,
          op: row.op,
          snapshot: row.snapshot,
          actorProfileId: row.actorProfileId,
          createdAt: when(row.createdAt) ?? new Date(),
        })
        .onConflictDoNothing();
    }
  }
}

export async function importPackageFiles(db: AppDatabase, files: Record<string, string>, options: ImportOptions = {}) {
  if (!files["index.json"]) throw new Error("The package needs an index.json file.");
  await db.transaction(async (tx) => {
    const database = tx as unknown as AppDatabase;
    if (options.replace) await wipeDatabase(database);
    await applyPackage(database, files, options);
  });
}

export async function importPackageFromDir(db: AppDatabase, dir: string, options: ImportOptions = {}) {
  const files = await readPackageFromDir(dir);
  await importPackageFiles(db, files, options);
}

export async function exportPackageToDir(db: AppDatabase, dir: string, options: PackageOptions = {}) {
  const files = await buildPackageFiles(db, options);
  await writePackageToDir(dir, files);
  return dir;
}

export const SAMPLE_PACKAGE_DIR = path.join(process.cwd(), "content", "packages", "applied-ai-engineering");
