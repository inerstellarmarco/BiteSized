import { readdirSync, readFileSync } from "fs";
import path from "path";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { applySource, MIN_BODY_WORDS, parseBiteSource, wordCount, type SubLessonFile } from "@/lib/packages/bite-source";

// Checks every file of the full course package in content/course/package:
// the files the "Import package" button on the Family page will read.
const root = path.join(process.cwd(), "content", "course");
const packageDir = path.join(root, "package");
const sourceDir = path.join(root, "source");

type Index = {
  format: string;
  formatVersion: number;
  categories: { subCategories: { lessons: { subLessons: { id: string; file: string }[] }[] }[] }[];
};

const indexText = readFileSync(path.join(packageDir, "index.json"), "utf8");
const index = JSON.parse(indexText) as Index;
const entries = index.categories.flatMap((category) =>
  category.subCategories.flatMap((subCategory) => subCategory.lessons.flatMap((lesson) => lesson.subLessons)),
);
const texts = new Map(entries.map((entry) => [entry.id, readFileSync(path.join(packageDir, entry.file), "utf8")]));
const files = new Map([...texts].map(([id, text]) => [id, JSON.parse(text) as SubLessonFile]));
const sources = readdirSync(sourceDir)
  .filter((name) => name.endsWith(".txt"))
  .sort()
  .flatMap((name) => parseBiteSource(readFileSync(path.join(sourceDir, name), "utf8"), name).map((subLesson) => ({ name, subLesson })));

describe("full course package", () => {
  it("is a Bite Sized package with a file for every sub-lesson", () => {
    expect(index.format).toBe("bite-sized.package");
    expect(index.formatVersion).toBe(1);
    expect(entries.length).toBeGreaterThan(300);
    for (const entry of entries) expect(files.get(entry.id)?.id, entry.file).toBe(entry.id);
  });

  it("has unique ids and ordered positions", () => {
    const biteIds = new Set<string>();
    const questionIds = new Set<string>();
    for (const file of files.values()) {
      const positions = file.bites.map((bite) => bite.position);
      expect([...positions].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)), file.id).toEqual(positions);
      expect(new Set(positions).size, file.id).toBe(positions.length);
      for (const bite of file.bites) {
        expect(biteIds.has(bite.id), bite.id).toBe(false);
        biteIds.add(bite.id);
        expect(bite.title.trim().length, bite.id).toBeGreaterThan(0);
        for (const question of bite.questions) {
          expect(questionIds.has(question.id), question.id).toBe(false);
          questionIds.add(question.id);
        }
      }
    }
  });

  it("has a readable body and a sound question on every written bite", () => {
    for (const file of files.values()) {
      for (const bite of file.bites) {
        if (!bite.body.trim()) continue;
        expect(wordCount(bite.body), `${file.id} ${bite.title}`).toBeGreaterThanOrEqual(MIN_BODY_WORDS);
        expect(bite.questions.length, `${file.id} ${bite.title}`).toBeGreaterThan(0);
        for (const question of bite.questions) {
          expect(question.type, question.id).toBe("multiple_choice");
          expect(question.prompt.trim().length, question.id).toBeGreaterThan(0);
          expect(question.choices, question.id).toHaveLength(4);
          expect(new Set(question.choices.map((choice) => choice.id)).size, question.id).toBe(4);
          expect(new Set(question.choices.map((choice) => choice.text.trim())).size, question.id).toBe(4);
          expect(question.choices.some((choice) => choice.id === question.correctChoiceId), question.id).toBe(true);
          expect(question.explanation.trim().length, question.id).toBeGreaterThan(0);
        }
      }
    }
  });

  it("matches the written source files exactly", () => {
    const seen = new Set<string>();
    for (const { name, subLesson } of sources) {
      expect(seen.has(subLesson.id), `${name} ${subLesson.id}`).toBe(false);
      seen.add(subLesson.id);
      const file = files.get(subLesson.id);
      expect(file, `${name} ${subLesson.id}`).toBeDefined();
      if (!file) continue;
      expect(applySource(file, subLesson, name), `${name} ${subLesson.id}: run npm run course:build`).toEqual(file);
    }
  });

  it("leaves no empty non-archived bite anywhere in the course", () => {
    for (const file of files.values()) {
      const empty = file.bites.filter((bite) => !bite.archivedAt && !bite.body.trim()).map((bite) => bite.title);
      expect(empty, `${file.id} (${file.title})`).toEqual([]);
    }
  });

  it("zips to less than the 5 MB upload limit", () => {
    const data: Record<string, Uint8Array> = { "index.json": strToU8(indexText) };
    for (const entry of entries) data[entry.file] = strToU8(texts.get(entry.id) ?? "");
    expect(zipSync(data).length).toBeLessThan(5_000_000);
  });
});
