// Plain-text source for bite content.
//
// The course outline (ids, order, titles) lives in content/course/package.
// The words on each card are written in content/course/source/*.txt in this
// small format, then merged into the package by `npm run course:build`.
//
//   @@ sll_abc123 | anything after the bar is a note
//   ## Exact bite title from the outline
//   Body text. Lines are joined into one paragraph.
//
//   A blank line starts a new paragraph.
//   ?? Question prompt
//   + The correct answer (always written first)
//   - A wrong answer
//   - A wrong answer
//   - A wrong answer
//   = Why the correct answer is right.
//
// `##+ Title` adds a bite that is not in the outline, right after the
// previous one. A line holding only `~m` marks a fast-moving topic.
// `-- Title`, placed straight after the @@ line, archives a duplicate bite.

export type SourceQuestion = { prompt: string; correct: string; wrong: string[]; explanation: string };

export type SourceBite = {
  title: string;
  added: boolean;
  body: string;
  medium: boolean;
  questions: SourceQuestion[];
  line: number;
};

export type SourceSubLesson = { id: string; bites: SourceBite[]; archive: string[]; line: number };

export type ChoiceFile = { id: string; text: string };

export type QuestionFile = {
  id: string;
  type: string;
  prompt: string;
  choices: ChoiceFile[];
  correctChoiceId: string;
  explanation: string;
  position: string;
  archivedAt: string | null;
};

export type BiteFile = {
  id: string;
  title: string;
  body: string;
  sourceNote: string;
  lastReviewedOn: string | null;
  diagram: string | null;
  position: string;
  archivedAt: string | null;
  crossLinks: unknown[];
  questions: QuestionFile[];
};

export type SubLessonFile = { id: string; title: string; bites: BiteFile[] };

export const MIN_BODY_WORDS = 25;
export const ARCHIVED_AT = "2026-11-13T00:00:00.000Z";
export const SOURCE_NOTE_HIGH = "Drafted by AI, November 2026 · confidence: high";
export const SOURCE_NOTE_MEDIUM = "Drafted by AI, November 2026 · fast-moving topic, check current details · confidence: medium";

export function normalizeTitle(title: string): string {
  return title
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function fail(where: string, line: number, message: string): never {
  throw new Error(`${where}:${line} ${message}`);
}

export function parseBiteSource(text: string, where = "source"): SourceSubLesson[] {
  const result: SourceSubLesson[] = [];
  let subLesson: SourceSubLesson | null = null;
  let bite: SourceBite | null = null;
  let question: SourceQuestion | null = null;
  let paragraphs: string[][] = [[]];

  function closeQuestion(line: number) {
    if (!question || !bite) return;
    if (!question.correct) fail(where, line, `question "${question.prompt}" has no correct answer`);
    if (question.wrong.length !== 3) fail(where, line, `question "${question.prompt}" needs exactly 3 wrong answers`);
    if (!question.explanation) fail(where, line, `question "${question.prompt}" has no explanation`);
    const texts = [question.correct, ...question.wrong].map((choice) => normalizeTitle(choice));
    if (new Set(texts).size !== texts.length) fail(where, line, `question "${question.prompt}" repeats an answer`);
    bite.questions.push(question);
    question = null;
  }

  function closeBite(line: number) {
    if (!bite || !subLesson) return;
    closeQuestion(line);
    bite.body = paragraphs
      .map((lines) => lines.join(" ").replace(/\s+/g, " ").trim())
      .filter((paragraph) => paragraph.length > 0)
      .join("\n\n");
    if (wordCount(bite.body) < MIN_BODY_WORDS) fail(where, bite.line, `bite "${bite.title}" is shorter than ${MIN_BODY_WORDS} words`);
    if (bite.questions.length === 0) fail(where, bite.line, `bite "${bite.title}" has no question`);
    subLesson.bites.push(bite);
    bite = null;
    paragraphs = [[]];
  }

  const lines = text.split(/\r?\n/);
  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    const line = raw.trimEnd();
    if (line.startsWith("@@ ")) {
      closeBite(lineNumber);
      const id = line.slice(3).split("|")[0].trim();
      if (!id) fail(where, lineNumber, "missing sub-lesson id");
      subLesson = { id, bites: [], archive: [], line: lineNumber };
      result.push(subLesson);
      return;
    }
    if (line.startsWith("## ") || line.startsWith("##+ ")) {
      closeBite(lineNumber);
      if (!subLesson) fail(where, lineNumber, "bite before any @@ sub-lesson line");
      const added = line.startsWith("##+ ");
      const title = line.slice(added ? 4 : 3).trim();
      if (!title) fail(where, lineNumber, "missing bite title");
      bite = { title, added, body: "", medium: false, questions: [], line: lineNumber };
      return;
    }
    if (!bite) {
      if (line.trim() === "" || line.startsWith("//")) return;
      if (line.startsWith("-- ") && subLesson) {
        (subLesson as SourceSubLesson).archive.push(line.slice(3).trim());
        return;
      }
      fail(where, lineNumber, "text outside a bite");
    }
    if (line.startsWith("?? ")) {
      closeQuestion(lineNumber);
      question = { prompt: line.slice(3).trim(), correct: "", wrong: [], explanation: "" };
      return;
    }
    if (question) {
      if (line.trim() === "") return;
      if (line.startsWith("+ ")) {
        if (question.correct) fail(where, lineNumber, "a question can have only one correct answer");
        question.correct = line.slice(2).trim();
      } else if (line.startsWith("- ")) question.wrong.push(line.slice(2).trim());
      else if (line.startsWith("= ")) question.explanation = line.slice(2).trim();
      else fail(where, lineNumber, "unexpected line inside a question");
      return;
    }
    if (line.trim() === "~m") {
      bite.medium = true;
      return;
    }
    if (line.trim() === "") paragraphs.push([]);
    else paragraphs[paragraphs.length - 1].push(line.trim());
  });
  closeBite(lines.length);
  return result;
}

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

const CHOICE_IDS = ["a", "b", "c", "d"];

// The source always lists the correct answer first. Where it lands on the
// card is picked from the question id, so it is stable between builds.
export function buildQuestion(id: string, position: string, source: SourceQuestion): QuestionFile {
  const slot = hash(id) % 4;
  const texts = [...source.wrong];
  texts.splice(slot, 0, source.correct);
  return {
    id,
    type: "multiple_choice",
    prompt: source.prompt,
    choices: texts.map((text, index) => ({ id: CHOICE_IDS[index], text })),
    correctChoiceId: CHOICE_IDS[slot],
    explanation: source.explanation,
    position,
    archivedAt: null,
  };
}

export function addedBiteId(subLessonId: string, title: string): string {
  const key = `${subLessonId}|${normalizeTitle(title)}`;
  return `bit_x${hash(key).toString(36)}${hash(`${key}#`).toString(36)}`.slice(0, 16);
}

// Merge written content into one sub-lesson file. Ids, order, cross links and
// anything the source does not mention are left exactly as they were.
export function applySource(file: SubLessonFile, source: SourceSubLesson, where = "source"): SubLessonFile {
  if (file.id !== source.id) throw new Error(`${where}:${source.line} expected ${file.id}, got ${source.id}`);
  const bites = file.bites.map((bite) => ({ ...bite }));
  let cursor = -1;
  for (const title of source.archive) {
    const wanted = normalizeTitle(title);
    const found = bites.find((bite) => normalizeTitle(bite.title) === wanted);
    if (!found) throw new Error(`${where}:${source.line} no bite titled "${title}" to archive in ${file.id}`);
    if (!found.archivedAt) found.archivedAt = ARCHIVED_AT;
  }
  for (const written of source.bites) {
    let target: BiteFile;
    if (written.added) {
      const id = addedBiteId(file.id, written.title);
      const existing = bites.findIndex((bite) => bite.id === id);
      if (existing >= 0) {
        target = bites[existing];
        cursor = existing;
      } else {
        if (cursor < 0) throw new Error(`${where}:${written.line} an added bite needs a bite before it`);
        target = {
          id,
          title: written.title,
          body: "",
          sourceNote: "",
          lastReviewedOn: null,
          diagram: null,
          position: `${bites[cursor].position}V`,
          archivedAt: null,
          crossLinks: [],
          questions: [],
        };
        bites.splice(cursor + 1, 0, target);
        cursor += 1;
      }
    } else {
      const wanted = normalizeTitle(written.title);
      const found = bites.findIndex((bite) => normalizeTitle(bite.title) === wanted);
      if (found < 0) throw new Error(`${where}:${written.line} no bite titled "${written.title}" in ${file.id} (${file.title})`);
      target = bites[found];
      cursor = found;
    }
    const outlineOnly = target.sourceNote === "" || target.sourceNote.startsWith("Outline topic") || target.sourceNote.startsWith("Drafted by AI");
    target.body = written.body;
    if (outlineOnly) target.sourceNote = written.medium ? SOURCE_NOTE_MEDIUM : SOURCE_NOTE_HIGH;
    const suffix = target.id.replace(/^bit_/, "");
    target.questions = written.questions.map((question, index) => buildQuestion(`q_${suffix}_${index + 1}`, `a${index}`, question));
  }
  return { ...file, bites };
}
