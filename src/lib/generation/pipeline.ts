import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { checkAnswerKey, type AnswerDraft } from "@/lib/generation/answer-key";
import { latestLockedStyle } from "@/lib/style/guide";
import { bites, generationJobs, questions, subLessons } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";
import { newId } from "@/lib/ids";
import { AI_UNAVAILABLE, getLlmClient, LlmUnavailableError, type LlmProvider } from "@/lib/llm";
import type { Choice } from "@/lib/types";
import { generateKeyBetween } from "fractional-indexing";

type StylePrompt = {
  tone: string;
  lengthGuide: string;
  readingLevel: string;
  analogyUse: string;
  formatting: string;
  temperature: string;
  examples: { title: string; body: string }[];
};

function styleSystem(style: StylePrompt) {
  const examples = (style.examples ?? [])
    .map((example, index) => `Example ${index + 1} — ${example.title}\n${example.body}`)
    .join("\n\n");
  return [
    "You write bite-sized lessons.",
    `Tone: ${style.tone}`,
    `Length: ${style.lengthGuide}`,
    `Reading level: ${style.readingLevel}`,
    `Analogies: ${style.analogyUse}`,
    `Formatting: ${style.formatting}`,
    "Be accurate. Do not invent citations. Return JSON only.",
    examples ? `Style examples:\n${examples}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseJson<T>(raw: string): T {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The model did not return JSON.");
  return JSON.parse(raw.slice(start, end + 1)) as T;
}

async function writeBites(provider: LlmProvider, style: StylePrompt, subLessonTitle: string, topics: string[], notes: string) {
  const raw = await provider.complete({
    system: styleSystem(style),
    user: `TASK: bites\nSUBLESSON: ${subLessonTitle}\nTOPIC: ${topics[0] ?? subLessonTitle}\nTOPICS:\n${topics.map((topic) => `- ${topic}`).join("\n") || "- (none, write two bites from the sub-lesson title)"}\nNOTES: ${notes || "(none)"}`,
    temperature: Number(style.temperature) || 0.4,
    json: true,
  });
  const parsed = parseJson<{ bites?: { title?: string; body?: string }[] }>(raw);
  return (parsed.bites ?? []).filter((bite) => bite.title && bite.body).slice(0, 4) as { title: string; body: string }[];
}

async function writeQuestions(provider: LlmProvider, style: StylePrompt, biteTitle: string, body: string) {
  const raw = await provider.complete({
    system: styleSystem(style),
    user: `TASK: questions\nBITE: ${biteTitle}\nBODY: ${body}\nWrite two multiple-choice questions. Each needs four choices, one correctChoiceId, and a one-sentence explanation.`,
    temperature: Number(style.temperature) || 0.4,
    json: true,
  });
  const parsed = parseJson<{ questions?: AnswerDraft[] }>(raw);
  return (parsed.questions ?? []).slice(0, 3);
}

export async function enqueueSubLesson(db: AppDatabase, subLessonId: string, styleVersionId: string) {
  const existing = await db
    .select()
    .from(generationJobs)
    .where(and(eq(generationJobs.subLessonId, subLessonId), inArray(generationJobs.status, ["queued", "running", "failed"])));
  if (existing.length > 0) return existing[0];
  const id = newId("job");
  await db.insert(generationJobs).values({
    id,
    subLessonId,
    styleVersionId,
    status: "queued",
    stage: "bites",
    attemptCount: 0,
    lastError: "",
  });
  return { id };
}

export async function generateForSubLesson(db: AppDatabase, subLessonId: string, provider: LlmProvider = getLlmClient()) {
  const style = await latestLockedStyle(db);
  if (!style) throw new Error("Lock a style version before generating.");
  const [subLesson] = await db.select().from(subLessons).where(eq(subLessons.id, subLessonId));
  if (!subLesson) throw new Error("Missing sub-lesson.");
  const existing = await db.select().from(bites).where(and(eq(bites.subLessonId, subLessonId), isNull(bites.archivedAt))).orderBy(asc(bites.position));
  const pending = existing.filter((bite) => bite.reviewStatus === "pending");
  const targets = pending.length > 0 ? pending : [];
  let position = existing.at(-1)?.position ?? null;

  if (targets.length === 0 && existing.every((bite) => bite.reviewStatus === "approved") && existing.length > 0) {
    return { wroteBites: 0, wroteQuestions: 0 };
  }

  const needsBody = targets.filter((bite) => bite.body.trim().length < 40);
  if (targets.length === 0 || needsBody.length > 0) {
    const topics = (needsBody.length > 0 ? needsBody : targets).map((bite) => bite.title);
    const drafted = await writeBites(
      provider,
      style,
      subLesson.title,
      topics.length > 0 ? topics : [subLesson.title],
      "",
    );
    if (targets.length === 0) {
      for (const draft of drafted) {
        position = generateKeyBetween(position, null);
        await db.insert(bites).values({
          id: newId("bit"),
          subLessonId,
          title: draft.title,
          body: draft.body,
          sourceNote: "AI draft · confidence: medium",
          position,
          reviewStatus: "pending",
          styleVersionId: style.id,
        });
      }
    } else {
      for (const bite of needsBody) {
        const draft = drafted.find((item) => item.title.toLowerCase() === bite.title.toLowerCase()) ?? drafted[needsBody.indexOf(bite)];
        if (!draft) continue;
        await db
          .update(bites)
          .set({
            body: draft.body,
            sourceNote: "AI draft · confidence: medium",
            styleVersionId: style.id,
            updatedAt: new Date(),
          })
          .where(eq(bites.id, bite.id));
      }
    }
  }

  const fresh = await db.select().from(bites).where(and(eq(bites.subLessonId, subLessonId), isNull(bites.archivedAt), eq(bites.reviewStatus, "pending")));
  let wroteQuestions = 0;
  for (const bite of fresh) {
    const already = await db.select().from(questions).where(and(eq(questions.biteId, bite.id), isNull(questions.archivedAt)));
    if (already.length > 0) continue;
    const drafted = await writeQuestions(provider, style, bite.title, bite.body);
    let questionPosition: string | null = null;
    for (const question of drafted) {
      const choices: Choice[] = (question.choices ?? []).slice(0, 4).map((choice, index) => ({
        id: choice.id || ["a", "b", "c", "d"][index] || `c${index}`,
        text: choice.text,
      }));
      const answer: AnswerDraft = {
        prompt: question.prompt,
        choices,
        correctChoiceId: question.correctChoiceId,
        explanation: question.explanation ?? "",
      };
      const checked = await checkAnswerKey(provider, answer);
      questionPosition = generateKeyBetween(questionPosition, null);
      await db.insert(questions).values({
        id: newId("qst"),
        biteId: bite.id,
        type: "multiple_choice",
        prompt: answer.prompt,
        choices: answer.choices,
        correctChoiceId: answer.correctChoiceId,
        explanation: answer.explanation,
        position: questionPosition,
        reviewStatus: "pending",
        styleVersionId: style.id,
        answerKeyStatus: checked.status,
        answerKeyNote: checked.note,
      });
      wroteQuestions += 1;
    }
  }
  return { wroteBites: fresh.length, wroteQuestions };
}

export async function processDueJobs(db: AppDatabase, limit = 5, now = new Date()) {
  const jobs = await db
    .select()
    .from(generationJobs)
    .where(and(inArray(generationJobs.status, ["queued", "failed"]), or(isNull(generationJobs.nextRetryAt), lte(generationJobs.nextRetryAt, now))))
    .orderBy(asc(generationJobs.createdAt))
    .limit(limit);
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const job of jobs) {
    await db.update(generationJobs).set({ status: "running", updatedAt: new Date() }).where(eq(generationJobs.id, job.id));
    try {
      await generateForSubLesson(db, job.subLessonId);
      await db.update(generationJobs).set({ status: "ready", stage: "done", lastError: "", updatedAt: new Date() }).where(eq(generationJobs.id, job.id));
      results.push({ id: job.id, ok: true });
    } catch (error) {
      const message = error instanceof LlmUnavailableError ? AI_UNAVAILABLE : error instanceof Error ? error.message : AI_UNAVAILABLE;
      const attemptCount = job.attemptCount + 1;
      const delay = Math.min(60_000, 500 * 2 ** attemptCount);
      await db
        .update(generationJobs)
        .set({
          status: "failed",
          attemptCount,
          lastError: message,
          nextRetryAt: new Date(now.getTime() + delay),
          updatedAt: new Date(),
        })
        .where(eq(generationJobs.id, job.id));
      results.push({ id: job.id, ok: false, error: message });
    }
  }
  return results;
}

export async function sampleBites(provider: LlmProvider, style: StylePrompt, topic: string) {
  const raw = await provider.complete({
    system: styleSystem(style),
    user: `TASK: sample\nTOPIC: ${topic}\nTOPICS:\n- ${topic}\n- A second look at ${topic}`,
    temperature: Number(style.temperature) || 0.4,
    json: true,
  });
  const parsed = parseJson<{ bites?: { title: string; body: string }[] }>(raw);
  const bitesOut = parsed.bites ?? [];
  const withQuestions = [];
  for (const bite of bitesOut.slice(0, 3)) {
    const questionsOut = await writeQuestions(provider, style, bite.title, bite.body);
    withQuestions.push({ ...bite, questions: questionsOut });
  }
  return withQuestions;
}
