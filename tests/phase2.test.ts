import { readFileSync, existsSync } from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { activeBites } from "@/lib/content/ops";
import { bites, lessons, questions, styleVersions } from "@/lib/db/schema";
import { checkAnswerKey } from "@/lib/generation/answer-key";
import { generateForSubLesson } from "@/lib/generation/pipeline";
import { batchApprove } from "@/lib/generation/review";
import { applyProposal } from "@/lib/import/apply";
import { parseDocxXml, parseHtml, parseOutlineText, propose } from "@/lib/import/parse";
import { mockProvider } from "@/lib/llm/mock";
import { lockStyle, saveStyleDraft, ensureStyleDraft } from "@/lib/style/guide";
import { makeStack, withDb } from "./helpers";

const sample = readFileSync(path.join(process.cwd(), "tests/fixtures/outline-sample.txt"), "utf8");

describe("outline parser", () => {
  const proposal = propose(parseOutlineText(sample));

  it("maps headings, level tags, topics, toolkit, cross-links, and the learning path", () => {
    const trackA = proposal.categories.find((category) => category.code === "A");
    const trackB = proposal.categories.find((category) => category.code === "B");
    expect(trackA?.include).toBe(true);
    expect(proposal.categories.find((category) => category.title === "Introduction")?.include).toBe(false);
    const moduleA1 = trackA?.subCategories.find((sub) => sub.code === "A1");
    expect(moduleA1?.levelTag).toBe("Foundations");
    expect(moduleA1?.toolkit.handsOnProjects).toContain("Explain an AI-written script");
    expect(moduleA1?.toolkit.toolsAndFrameworks).toContain("Python 3");
    const lesson = moduleA1?.lessons.find((item) => item.code === "A1.1");
    expect(lesson?.subLessons.map((sub) => sub.title)).toEqual(["Data Types & Structures", "Control Flow"]);
    expect(lesson?.subLessons[0]?.topics.map((topic) => topic.title)).toContain("Strings, numbers, booleans");
    const linked = trackB?.subCategories[0]?.lessons[0]?.subLessons[0]?.topics[0];
    expect(linked?.crossLinks.map((link) => link.targetCode)).toContain("A1.3");
    expect(trackB?.subCategories[0]?.lessons[0]?.prerequisiteCodes).toEqual(["A"]);
    expect(trackA?.subCategories[0]?.lessons[0]?.prerequisiteCodes).toEqual([]);
    expect(trackB?.subCategories[1]?.levelTag).toBe("Intermediate");
  });

  it("reads the real outline when that file is present", () => {
    const fullPath = path.join(process.cwd(), "uploads/outline_8c27.txt");
    if (!existsSync(fullPath)) return;
    const full = propose(parseOutlineText(readFileSync(fullPath, "utf8")));
    const trackA = full.categories.find((category) => category.code === "A");
    expect(trackA?.subCategories.map((sub) => sub.code)).toEqual(["A1", "A2", "A3", "A4", "A5"]);
    const dataTypes = trackA?.subCategories[0]?.lessons[0]?.subLessons[0];
    expect(dataTypes?.title).toBe("Data Types & Structures");
    expect(dataTypes?.topics.length).toBe(3);
  });

  it("keeps HTML heading levels and Word heading styles", () => {
    const html = propose(parseHtml("<h1>Track Z: Kitchen</h1><h2>Z1 Heat [Foundations]</h2><h3>Z1.1 Boiling</h3><ol><li>Bubbles</li></ol><ul><li>Steam (see A1.1)</li></ul>"));
    expect(html.categories[0]?.subCategories[0]?.lessons[0]?.subLessons[0]?.title).toBe("Bubbles");
    expect(html.categories[0]?.subCategories[0]?.lessons[0]?.subLessons[0]?.topics[0]?.crossLinks[0]?.targetCode).toBe("A1.1");
    const docx = parseDocxXml('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Track Q: Quiet</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Q1 Notes [Advanced]</w:t></w:r></w:p>');
    expect(propose(docx).categories[0]?.code).toBe("Q");
    expect(propose(docx).categories[0]?.subCategories[0]?.levelTag).toBe("Advanced");
  });
});

describe("re-import matching", () => {
  it("updates a matched lesson instead of creating a second copy", async () => {
    await withDb(async (db) => {
      const first = propose(parseOutlineText(sample));
      await applyProposal(db, first);
      const before = await db.select().from(lessons);
      const renamed = propose(parseOutlineText(sample.replace("Core Programming Concepts", "Core Ideas")));
      await applyProposal(db, renamed);
      const after = await db.select().from(lessons);
      expect(after.filter((lesson) => lesson.code === "A1.1")).toHaveLength(1);
      expect(after.find((lesson) => lesson.code === "A1.1")?.title).toContain("Core Ideas");
      expect(after).toHaveLength(before.length);
      expect(after.find((lesson) => lesson.code === "A1.1")?.id).toBe(before.find((lesson) => lesson.code === "A1.1")?.id);
    });
  });
});

describe("style versions", () => {
  it("locks an immutable version and leaves it unchanged when the draft is edited", async () => {
    await withDb(async (db) => {
      await ensureStyleDraft(db);
      await saveStyleDraft(db, {
        tone: "Warm and plain",
        lengthGuide: "About 60 words",
        readingLevel: "Everyday",
        analogyUse: "Rare",
        formatting: "One paragraph",
        temperature: "0.2",
      });
      const locked = await lockStyle(db, "prf_eric");
      await saveStyleDraft(db, {
        tone: "A different draft",
        lengthGuide: "Longer",
        readingLevel: "Technical",
        analogyUse: "Often",
        formatting: "Bullets",
        temperature: "0.9",
      });
      const [version] = await db.select().from(styleVersions).where(eq(styleVersions.id, locked.id));
      expect(version?.number).toBe(1);
      expect(version?.tone).toBe("Warm and plain");
      expect(version?.temperature).toBe("0.2");
      const second = await lockStyle(db, "prf_eric");
      expect(second.number).toBe(2);
      const [still] = await db.select().from(styleVersions).where(eq(styleVersions.number, 1));
      expect(still?.tone).toBe("Warm and plain");
    });
  });
});

describe("approval and generation", () => {
  it("hides pending bites from learners until approval, and blocks flagged keys", async () => {
    await withDb(async (db) => {
      const { subLessonId } = await makeStack(db);
      await db.insert(bites).values({
        id: "bit_pending",
        subLessonId,
        title: "Pending",
        body: "Not yet.",
        position: "a0",
        reviewStatus: "pending",
      });
      expect(await activeBites(db, subLessonId)).toHaveLength(0);
      await db.insert(questions).values({
        id: "q_flag",
        biteId: "bit_pending",
        type: "multiple_choice",
        prompt: "Which?",
        choices: [
          { id: "a", text: "One" },
          { id: "b", text: "Two" },
        ],
        correctChoiceId: "a",
        explanation: "Because.",
        position: "a0",
        reviewStatus: "pending",
        answerKeyStatus: "flagged",
        answerKeyNote: "Unsure",
      });
      const blocked = await batchApprove(db, subLessonId);
      expect(blocked.ok).toBe(false);
      await db.update(questions).set({ answerKeyStatus: "confirmed" }).where(eq(questions.id, "q_flag"));
      const approved = await batchApprove(db, subLessonId);
      expect(approved.ok).toBe(true);
      expect(await activeBites(db, subLessonId)).toHaveLength(1);
      const [bite] = await db.select().from(bites).where(eq(bites.id, "bit_pending"));
      expect(bite?.lastReviewedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(bite?.reviewStatus).toBe("approved");
    });
  });

  it("flags a question without exactly one correct choice and confirms a sound one", async () => {
    const flagged = await checkAnswerKey(mockProvider, {
      prompt: "Which is it?",
      choices: [
        { id: "a", text: "Same" },
        { id: "b", text: "Same" },
      ],
      correctChoiceId: "a",
      explanation: "Because.",
    });
    expect(flagged.status).toBe("flagged");
    const doubtful = await checkAnswerKey(mockProvider, {
      prompt: "Which is it?",
      choices: [
        { id: "a", text: "Yes" },
        { id: "b", text: "No" },
      ],
      correctChoiceId: "a",
      explanation: "DOUBTFUL case",
    });
    expect(doubtful.status).toBe("flagged");
    const confirmed = await checkAnswerKey(mockProvider, {
      prompt: "Which is it?",
      choices: [
        { id: "a", text: "Yes" },
        { id: "b", text: "No" },
      ],
      correctChoiceId: "a",
      explanation: "Yes is the definition.",
    });
    expect(confirmed.status).toBe("confirmed");
  });

  it("writes pending bites and questions with the locked style version", async () => {
    await withDb(async (db) => {
      const { subLessonId } = await makeStack(db);
      await ensureStyleDraft(db);
      const locked = await lockStyle(db, null);
      await db.insert(bites).values({
        id: "bit_topic",
        subLessonId,
        title: "Strings, numbers, booleans",
        body: "",
        position: "a0",
        reviewStatus: "pending",
        sourceNote: "Outline topic · confidence: unset",
      });
      const result = await generateForSubLesson(db, subLessonId, mockProvider);
      expect(result.wroteQuestions).toBeGreaterThan(0);
      const [bite] = await db.select().from(bites).where(eq(bites.id, "bit_topic"));
      expect(bite?.body.length).toBeGreaterThan(40);
      expect(bite?.reviewStatus).toBe("pending");
      expect(bite?.styleVersionId).toBe(locked.id);
      expect(bite?.sourceNote).toContain("confidence");
      const rows = await db.select().from(questions).where(eq(questions.biteId, "bit_topic"));
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.reviewStatus === "pending" && row.styleVersionId === locked.id)).toBe(true);
      expect(rows.every((row) => row.answerKeyStatus === "confirmed")).toBe(true);
      expect(await activeBites(db, subLessonId)).toHaveLength(0);
    });
  });
});
