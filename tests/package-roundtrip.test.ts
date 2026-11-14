import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { verifyPinHash } from "@/lib/auth/pin";
import { archiveEntity, updateBite } from "@/lib/content/ops";
import { loadCatalog, loadLearnCards } from "@/lib/content/catalog";
import { markBiteSeen } from "@/lib/content/progress";
import { openMemoryDatabase } from "@/lib/db/memory";
import {
  biteLinks,
  bites,
  biteProgress,
  lessons,
  profiles,
  questions,
  quizAnswers,
  subCategories,
  subLessons,
  contentRevisions,
} from "@/lib/db/schema";
import { importPackageFiles, importPackageFromDir, SAMPLE_PACKAGE_DIR, wipeDatabase, exportPackageToDir } from "@/lib/packages/io";
import { looksLikeOutlineFile, notACoursePackageMessage, outlineFileMessage } from "@/lib/packages/outline-hint";
import { saveQuizAttempt } from "@/lib/quiz/attempts";

const expectedSubLessons = [
  "Data Types & Structures",
  "Control Flow",
  "Functions",
  "Classes & Objects",
  "Modules & Packages",
  "Environments & Dependencies",
  "Async Concepts",
  "APIs, HTTP & JSON",
  "Error Handling",
  "Reading & Understanding Code",
  "Debugging",
  "AI Coding Assistants",
];

describe("course package mistaken for an outline", () => {
  it("names the Import a Google Doc page when the zip has no index.json", async () => {
    const opened = await openMemoryDatabase();
    try {
      const message = notACoursePackageMessage();
      expect(message).toContain("Import a Google Doc");
      expect(message).toContain("/admin/import");
      await expect(importPackageFiles(opened.db, {})).rejects.toThrow(message);
      await expect(importPackageFiles(opened.db, { "notes.txt": "hello" })).rejects.toThrow(message);
    } finally {
      await opened.close();
    }
  });

  it("recognizes a Word, HTML, or text file picked for the package box", () => {
    expect(looksLikeOutlineFile("Week 1 outline.docx")).toBe(true);
    expect(looksLikeOutlineFile("export.HTML")).toBe(true);
    expect(looksLikeOutlineFile("notes.htm")).toBe(true);
    expect(looksLikeOutlineFile("outline.txt")).toBe(true);
    expect(looksLikeOutlineFile("course.zip")).toBe(false);
    expect(looksLikeOutlineFile("notes.docx.zip")).toBe(false);
    expect(outlineFileMessage("Week 1 outline.docx")).toContain("Import a Google Doc");
    expect(outlineFileMessage("Week 1 outline.docx")).toContain("/admin/import");
  });
});

describe("course package round trip", () => {
  it("exports, wipes, and imports content plus learner progress", async () => {
    const opened = await openMemoryDatabase();
    const dir = await mkdtemp(path.join(tmpdir(), "bitesized-package-"));
    try {
      await importPackageFromDir(opened.db, SAMPLE_PACKAGE_DIR, {
        replace: false,
        includeLearners: false,
        includeHistory: false,
      });
      const titles = (await opened.db.select().from(subLessons)).map((row) => row.title).sort();
      expect(titles).toEqual([...expectedSubLessons].sort());
      const allBites = await opened.db.select().from(bites);
      expect(allBites.length).toBeGreaterThanOrEqual(expectedSubLessons.length * 2);
      expect(allBites.some((bite) => bite.diagram)).toBe(true);
      const questionRows = await opened.db.select().from(questions);
      expect(questionRows.every((question) => question.type === "multiple_choice")).toBe(true);
      expect(questionRows.length).toBeGreaterThanOrEqual(allBites.length * 2);
      const [moduleRow] = await opened.db.select().from(subCategories);
      expect(moduleRow?.levelTag).toBe("Foundations");
      expect(moduleRow?.toolkit.handsOnProjects.length).toBeGreaterThan(0);
      const lesson = (await opened.db.select().from(lessons)).find((row) => row.code === "A1.4");
      expect(lesson?.prerequisiteIds).toEqual(["les_a1_1", "les_a1_2"]);
      const forward = await opened.db.select().from(biteLinks).where(eq(biteLinks.targetCode, "B5.3"));
      expect(forward.length).toBeGreaterThan(0);

      const bite = allBites[0];
      if (!bite) throw new Error("missing bite");
      await opened.db.insert(profiles).values({
        id: "prf_round",
        name: "Round",
        pinHash: "placeholder",
        isAdmin: false,
      });
      const { hashPin } = await import("@/lib/auth/pin");
      const pinHash = await hashPin("2468");
      await opened.db.update(profiles).set({ pinHash }).where(eq(profiles.id, "prf_round"));
      await markBiteSeen(opened.db, "prf_round", bite.id);
      const [question] = await opened.db.select().from(questions).where(eq(questions.biteId, bite.id));
      if (!question) throw new Error("missing question");
      await saveQuizAttempt(opened.db, {
        profileId: "prf_round",
        subLessonId: bite.subLessonId,
        answers: [{ questionId: question.id, selectedChoiceId: question.correctChoiceId === "a" ? "b" : "a" }],
        stoppedEarly: true,
      });
      await updateBite(opened.db, bite.id, { body: `${bite.body} Edited.` }, "prf_round");
      const spare = allBites[1];
      if (!spare) throw new Error("missing second bite");
      await archiveEntity(opened.db, "bite", spare.id);

      await exportPackageToDir(opened.db, dir, {
        includeLearners: true,
        includeHistory: true,
        includeArchived: true,
      });
      await wipeDatabase(opened.db);
      expect(await opened.db.select().from(bites)).toHaveLength(0);
      expect(await opened.db.select().from(profiles)).toHaveLength(0);

      await importPackageFromDir(opened.db, dir, {
        replace: true,
        includeLearners: true,
        includeHistory: true,
      });

      const restoredBite = (await opened.db.select().from(bites).where(eq(bites.id, bite.id)))[0];
      expect(restoredBite?.body.endsWith("Edited.")).toBe(true);
      expect(restoredBite?.id).toBe(bite.id);
      const restoredSpare = (await opened.db.select().from(bites).where(eq(bites.id, spare.id)))[0];
      expect(restoredSpare?.archivedAt).toBeTruthy();
      const activeCount = (await opened.db.select().from(bites).where(isNull(bites.archivedAt))).length;
      expect(activeCount).toBe(allBites.length - 1);
      const progress = await opened.db.select().from(biteProgress);
      expect(progress).toEqual([expect.objectContaining({ profileId: "prf_round", biteId: bite.id })]);
      const wrong = await opened.db.select().from(quizAnswers).where(eq(quizAnswers.correct, false));
      expect(wrong.map((row) => row.questionId)).toContain(question.id);
      const [profile] = await opened.db.select().from(profiles).where(eq(profiles.id, "prf_round"));
      expect(profile ? await verifyPinHash("2468", profile.pinHash) : false).toBe(true);
      const history = await opened.db.select().from(contentRevisions).where(eq(contentRevisions.entityId, bite.id));
      expect(history.some((row) => row.op === "update")).toBe(true);
      expect((await opened.db.select().from(subLessons)).map((row) => row.title).sort()).toEqual([...expectedSubLessons].sort());
    } finally {
      await opened.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("imports the full 1,794-card course package in batches and loads the catalog cleanly", async () => {
    const opened = await openMemoryDatabase();
    const fullPackageDir = path.join(process.cwd(), "content", "course", "package");
    try {
      await importPackageFromDir(opened.db, fullPackageDir, {
        replace: false,
        includeLearners: false,
        includeHistory: false,
      });
      const catalog = await loadCatalog(opened.db);
      expect(catalog).not.toBeNull();
      const allSubLessons = catalog!.categories.flatMap((category) =>
        category.subCategories.flatMap((subCategory) => subCategory.lessons.flatMap((lesson) => lesson.subLessons)),
      );
      expect(allSubLessons.length).toBe(330);
      const totalBites = allSubLessons.reduce((sum, item) => sum + item.biteCount, 0);
      expect(totalBites).toBeGreaterThanOrEqual(1780);
      const sampleCards = await loadLearnCards(opened.db, allSubLessons[0]!.id);
      expect(sampleCards?.bites.length).toBeGreaterThan(0);
    } finally {
      await opened.close();
    }
  });
});
