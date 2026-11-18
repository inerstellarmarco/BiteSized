import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { invalidateCatalogCache } from "@/lib/content/catalog";
import { bites, ingestItems, ingestKeywords, lessons, questions, subLessons } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";
import { checkAnswerKey, type AnswerDraft } from "@/lib/generation/answer-key";
import { newId } from "@/lib/ids";
import { extractSourceContent, extractYoutubeVideoId } from "@/lib/ingest/extract";
import { getLlmClient, type LlmProvider } from "@/lib/llm";
import { ensureStyleDraft, latestLockedStyle, lockStyle } from "@/lib/style/guide";
import type { Choice } from "@/lib/types";

export type KeywordVerdict =
  | "missing_recommended"
  | "already_covered"
  | "esoteric_skip"
  | "off_topic";

export type PlacementMode = "append_to_sub_lesson" | "create_sub_lesson";

type CachedSyllabusIndex = {
  expiresAt: number;
  lessons: { id: string; code: string; title: string }[];
  subLessons: { id: string; lessonId: string; title: string }[];
  cards: { id: string; subLessonId: string; title: string; snippet: string }[];
};

const syllabusIndexCache = new WeakMap<object, CachedSyllabusIndex>();
const SYLLABUS_INDEX_TTL_MS = 5 * 60 * 1000;

export function invalidateSyllabusIndex(db: AppDatabase) {
  syllabusIndexCache.delete(db as unknown as object);
}

async function getSyllabusIndex(db: AppDatabase): Promise<CachedSyllabusIndex> {
  const key = db as unknown as object;
  const now = Date.now();
  const cached = syllabusIndexCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached;
  }

  const [lessonRows, subLessonRows, biteRows] = await Promise.all([
    db
      .select({ id: lessons.id, code: lessons.code, title: lessons.title })
      .from(lessons)
      .where(isNull(lessons.archivedAt))
      .orderBy(asc(lessons.position)),
    db
      .select({
        id: subLessons.id,
        lessonId: subLessons.lessonId,
        title: subLessons.title,
      })
      .from(subLessons)
      .where(isNull(subLessons.archivedAt))
      .orderBy(asc(subLessons.position)),
    db
      .select({
        id: bites.id,
        subLessonId: bites.subLessonId,
        title: bites.title,
        body: bites.body,
      })
      .from(bites)
      .where(isNull(bites.archivedAt))
      .orderBy(asc(bites.position)),
  ]);

  const entry: CachedSyllabusIndex = {
    expiresAt: now + SYLLABUS_INDEX_TTL_MS,
    lessons: lessonRows,
    subLessons: subLessonRows,
    cards: biteRows.map((row) => ({
      id: row.id,
      subLessonId: row.subLessonId,
      title: row.title,
      snippet: row.body.slice(0, 140).replace(/\s+/g, " ").trim(),
    })),
  };
  syllabusIndexCache.set(key, entry);
  return entry;
}

function findRelevantCards(
  index: CachedSyllabusIndex,
  rawText: string,
  limit = 25,
): { subLessonTitle: string; title: string; snippet: string }[] {
  const subLessonById = new Map(index.subLessons.map((s) => [s.id, s]));
  const tokens = Array.from(
    new Set(
      rawText
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length >= 4),
    ),
  ).slice(0, 80);

  if (tokens.length === 0) return [];

  const scored = index.cards
    .map((card) => {
      const hay = `${card.title} ${card.snippet}`.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (hay.includes(token)) score += card.title.toLowerCase().includes(token) ? 3 : 1;
      }
      return { card, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ card }) => ({
    subLessonTitle: subLessonById.get(card.subLessonId)?.title ?? "",
    title: card.title,
    snippet: card.snippet,
  }));
}

function parseJsonObject<T>(raw: string): T {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("Model did not return valid JSON.");
  }
  return JSON.parse(raw.slice(start, end + 1)) as T;
}

export async function queueIngestSubmission(
  db: AppDatabase,
  input: {
    url?: string;
    text?: string;
    title?: string;
    curatorNote?: string;
    externalMessageId?: string;
  },
) {
  if (input.externalMessageId) {
    const existing = await db
      .select({ id: ingestItems.id })
      .from(ingestItems)
      .where(eq(ingestItems.externalMessageId, input.externalMessageId));
    if (existing.length > 0) {
      return { id: existing[0].id, duplicate: true };
    }
  }

  const extracted = await extractSourceContent({
    url: input.url,
    text: input.text,
    title: input.title,
  });

  const id = newId("ing");
  await db.insert(ingestItems).values({
    id,
    sourceType: extracted.sourceType,
    sourceUrl: extracted.sourceUrl,
    sourceTitle: extracted.sourceTitle,
    curatorNote: (input.curatorNote ?? "").trim(),
    rawText: extracted.rawText,
    summary: "",
    externalMessageId: input.externalMessageId ?? null,
    status: "queued",
    errorMessage: "",
  });

  return { id, duplicate: false };
}

export async function analyzeIngestItem(
  db: AppDatabase,
  ingestItemId: string,
  provider: LlmProvider = getLlmClient(),
) {
  const [item] = await db.select().from(ingestItems).where(eq(ingestItems.id, ingestItemId));
  if (!item) return { ok: false as const, error: "Ingest item not found." };

  const index = await getSyllabusIndex(db);
  const defaultLessonId = index.lessons[0]?.id ?? null;
  const defaultSubLessonId = index.subLessons[0]?.id ?? null;

  const relevantCards = findRelevantCards(
    index,
    `${item.sourceTitle}\n${item.curatorNote}\n${item.rawText}`,
  );

  const lessonCatalogLines = index.lessons
    .map((l) => `LESSON_OPTION: ${l.id} | ${l.code} ${l.title}`)
    .join("\n");
  const subLessonCatalogLines = index.subLessons
    .map((s) => `SUBLESSON_OPTION: ${s.id} | ${s.title}`)
    .join("\n");
  const cardLines =
    relevantCards.length > 0
      ? relevantCards.map((c) => `- [${c.subLessonTitle}] ${c.title}: ${c.snippet}`).join("\n")
      : "- (No close lexical card matches found)";

  const system = [
    "You are the BiteSized Curriculum Architect for an AI Engineering & Architecture course.",
    "Given a YouTube video, X post, or technical note, extract 3 to 7 concrete technical concepts/keywords and compare each against the existing syllabus and bite cards.",
    "For each keyword, assign one verdict:",
    '- "missing_recommended": Durable AI engineering concept, mechanism, pattern, or tool not yet covered that strengthens the syllabus.',
    '- "already_covered": Concept is already taught in an existing sub-lesson or bite card (cite the matching card/sub-lesson).',
    '- "esoteric_skip": Too niche, passing hype, marketing fluff, or vendor-ephemeral trivia not worth adding to the core syllabus.',
    '- "off_topic": Outside AI engineering and software architecture.',
    "For each keyword, also recommend how it would be placed if approved:",
    '- placementMode: "append_to_sub_lesson" (if it naturally extends an existing sub-lesson leaf) or "create_sub_lesson" (if it warrants a new sub-lesson under a lesson branch).',
    "- suggestedLessonId: exact ID from LESSON_OPTION.",
    "- suggestedSubLessonId: exact ID from SUBLESSON_OPTION.",
    "Return strict JSON with keys: { summary: string, keywords: Array<{ keyword, definition, verdict, verdictReason, matchedCardTitle, placementMode, suggestedLessonId, suggestedSubLessonId }> }.",
  ].join("\n");

  const user = [
    "TASK: ingest-analyze",
    `SOURCE_TYPE: ${item.sourceType}`,
    `SOURCE_TITLE: ${item.sourceTitle}`,
    item.sourceUrl ? `SOURCE_URL: ${item.sourceUrl}` : "",
    item.curatorNote ? `CURATOR_NOTE (Optional Hint): ${item.curatorNote}` : "",
    `SOURCE_CONTENT:\n${item.rawText.slice(0, 10_000)}`,
    `CLOSEST_EXISTING_BITE_CARDS:\n${cardLines}`,
    `SYLLABUS_LESSONS:\n${lessonCatalogLines}`,
    `SYLLABUS_SUBLESSONS:\n${subLessonCatalogLines}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const ytId = item.sourceUrl ? extractYoutubeVideoId(item.sourceUrl) : null;
  const canonicalYtUrl = ytId ? `https://www.youtube.com/watch?v=${ytId}` : undefined;

  try {
    const raw = await provider.complete({
      system,
      user,
      temperature: 0.2,
      json: true,
      fileUri: canonicalYtUrl,
    });

    const parsed = parseJsonObject<{
      summary?: string;
      keywords?: {
        keyword?: string;
        definition?: string;
        verdict?: string;
        verdictReason?: string;
        matchedCardTitle?: string;
        placementMode?: string;
        suggestedLessonId?: string;
        suggestedSubLessonId?: string;
      }[];
    }>(raw);

    const validLessonIds = new Set(index.lessons.map((l) => l.id));
    const validSubLessonIds = new Set(index.subLessons.map((s) => s.id));
    const subLessonToLesson = new Map(index.subLessons.map((s) => [s.id, s.lessonId]));

    await db.delete(ingestKeywords).where(eq(ingestKeywords.ingestItemId, item.id));

    const validVerdicts = new Set<KeywordVerdict>([
      "missing_recommended",
      "already_covered",
      "esoteric_skip",
      "off_topic",
    ]);

    const itemsToInsert = (parsed.keywords ?? [])
      .filter((k) => k.keyword && k.keyword.trim().length > 0)
      .slice(0, 8)
      .map((k) => {
        const verdict: KeywordVerdict = validVerdicts.has(k.verdict as KeywordVerdict)
          ? (k.verdict as KeywordVerdict)
          : "missing_recommended";
        const placementMode: PlacementMode =
          k.placementMode === "create_sub_lesson" ? "create_sub_lesson" : "append_to_sub_lesson";
        const subId =
          k.suggestedSubLessonId && validSubLessonIds.has(k.suggestedSubLessonId)
            ? k.suggestedSubLessonId
            : defaultSubLessonId;
        const lesId =
          k.suggestedLessonId && validLessonIds.has(k.suggestedLessonId)
            ? k.suggestedLessonId
            : (subId ? subLessonToLesson.get(subId) : null) ?? defaultLessonId;

        return {
          id: newId("ikw"),
          ingestItemId: item.id,
          keyword: k.keyword!.trim(),
          definition: (k.definition ?? "").trim(),
          verdict,
          verdictReason: (k.verdictReason ?? "").trim(),
          matchedCardTitle: (k.matchedCardTitle ?? "").trim(),
          placementMode,
          suggestedLessonId: lesId,
          suggestedSubLessonId: subId,
          status: "pending",
        };
      });

    if (itemsToInsert.length > 0) {
      await db.insert(ingestKeywords).values(itemsToInsert);
    }

    await db
      .update(ingestItems)
      .set({
        summary: (parsed.summary ?? "Analyzed against the BiteSized syllabus.").trim(),
        status: "analyzed",
        errorMessage: "",
        analyzedAt: new Date(),
      })
      .where(eq(ingestItems.id, item.id));

    return { ok: true as const, count: itemsToInsert.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    await db
      .update(ingestItems)
      .set({
        status: "failed",
        errorMessage: message,
      })
      .where(eq(ingestItems.id, item.id));
    return { ok: false as const, error: message };
  }
}

export async function processQueuedIngestBatch(
  db: AppDatabase,
  limit = 5,
  provider: LlmProvider = getLlmClient(),
) {
  const queued = await db
    .select({ id: ingestItems.id })
    .from(ingestItems)
    .where(eq(ingestItems.status, "queued"))
    .orderBy(asc(ingestItems.createdAt))
    .limit(limit);

  let processed = 0;
  let failed = 0;
  for (const row of queued) {
    const res = await analyzeIngestItem(db, row.id, provider);
    if (res.ok) processed += 1;
    else failed += 1;
  }
  return { processed, failed };
}

export async function approveIngestKeyword(
  db: AppDatabase,
  input: {
    keywordId: string;
    placementMode: PlacementMode;
    lessonId?: string;
    subLessonId?: string;
    profileId: string;
    provider?: LlmProvider;
  },
) {
  const provider = input.provider ?? getLlmClient();
  const [kw] = await db.select().from(ingestKeywords).where(eq(ingestKeywords.id, input.keywordId));
  if (!kw) return { ok: false as const, error: "Keyword candidate not found." };
  if (kw.status === "approved") return { ok: false as const, error: "Keyword is already approved." };

  const [sourceItem] = await db
    .select()
    .from(ingestItems)
    .where(eq(ingestItems.id, kw.ingestItemId));

  await ensureStyleDraft(db);
  let style = await latestLockedStyle(db);
  if (!style) {
    await lockStyle(db, input.profileId);
    style = await latestLockedStyle(db);
  }
  if (!style) return { ok: false as const, error: "Could not lock a style version." };

  let targetSubLessonId = input.subLessonId || kw.suggestedSubLessonId || "";
  let targetSubLessonTitle = kw.keyword;

  if (input.placementMode === "create_sub_lesson") {
    const lessonId = input.lessonId || kw.suggestedLessonId || "";
    const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId));
    if (!lesson) return { ok: false as const, error: "Select a valid Lesson branch." };

    const siblings = await db
      .select()
      .from(subLessons)
      .where(and(eq(subLessons.lessonId, lesson.id), isNull(subLessons.archivedAt)))
      .orderBy(asc(subLessons.position));

    const position = generateKeyBetween(siblings.at(-1)?.position ?? null, null);
    targetSubLessonId = newId("sll");
    targetSubLessonTitle = kw.keyword;

    await db.insert(subLessons).values({
      id: targetSubLessonId,
      lessonId: lesson.id,
      title: kw.keyword,
      position,
    });
  } else {
    const [existingSub] = await db
      .select()
      .from(subLessons)
      .where(eq(subLessons.id, targetSubLessonId));
    if (!existingSub) return { ok: false as const, error: "Select a valid Sub-Lesson leaf." };
    targetSubLessonTitle = existingSub.title;
  }

  const existingBites = await db
    .select()
    .from(bites)
    .where(and(eq(bites.subLessonId, targetSubLessonId), isNull(bites.archivedAt)))
    .orderBy(asc(bites.position));
  let bitePos = existingBites.at(-1)?.position ?? null;

  const biteRaw = await provider.complete({
    system: [
      "You write bite-sized lessons.",
      `Tone: ${style.tone}`,
      `Length: ${style.lengthGuide}`,
      `Reading level: ${style.readingLevel}`,
      `Analogies: ${style.analogyUse}`,
      `Formatting: ${style.formatting}`,
      "Be accurate. Return JSON only: { bites: [{ title, body }] }.",
    ].join("\n"),
    user: [
      "TASK: bites",
      `SUBLESSON: ${targetSubLessonTitle}`,
      `TOPIC: ${kw.keyword}`,
      "TOPICS:",
      `- ${kw.keyword}: What it is and how it works`,
      `- ${kw.keyword}: When to use it and key trade-offs`,
      `NOTES: ${kw.definition}\nSource: ${sourceItem?.sourceTitle ?? ""} ${sourceItem?.sourceUrl ?? ""}`,
    ].join("\n"),
    temperature: Number(style.temperature) || 0.4,
    json: true,
  });

  const draftedBites = (
    parseJsonObject<{ bites?: { title?: string; body?: string }[] }>(biteRaw).bites ?? []
  )
    .filter((b) => b.title && b.body)
    .slice(0, 3) as { title: string; body: string }[];

  let wroteBites = 0;
  let wroteQuestions = 0;

  for (const draft of draftedBites) {
    bitePos = generateKeyBetween(bitePos, null);
    const biteId = newId("bit");
    const sourceBadge = sourceItem?.sourceUrl
      ? `Inbox · ${sourceItem.sourceTitle.slice(0, 48)}`
      : "Inbox · AI approved";
    await db.insert(bites).values({
      id: biteId,
      subLessonId: targetSubLessonId,
      title: draft.title,
      body: draft.body,
      sourceNote: sourceBadge,
      position: bitePos,
      reviewStatus: "approved",
      styleVersionId: style.id,
    });
    wroteBites += 1;

    const qRaw = await provider.complete({
      system: "Write two multiple-choice questions for this bite card. Return JSON: { questions: [{ prompt, choices: [{id, text}], correctChoiceId, explanation }] }.",
      user: `TASK: questions\nBITE: ${draft.title}\nBODY: ${draft.body}\nWrite two multiple-choice questions. Each needs four choices, one correctChoiceId, and a one-sentence explanation.`,
      temperature: Number(style.temperature) || 0.4,
      json: true,
    });
    const qDrafts = (parseJsonObject<{ questions?: AnswerDraft[] }>(qRaw).questions ?? []).slice(0, 2);

    let questionPos: string | null = null;
    for (const qDraft of qDrafts) {
      if (!qDraft.prompt || !Array.isArray(qDraft.choices) || qDraft.choices.length < 2) continue;
      const choices: Choice[] = qDraft.choices.slice(0, 4).map((c, idx) => ({
        id: c.id || ["a", "b", "c", "d"][idx] || `c${idx}`,
        text: c.text,
      }));
      const correctChoiceId = choices.some((c) => c.id === qDraft.correctChoiceId)
        ? qDraft.correctChoiceId
        : choices[0].id;
      const answer: AnswerDraft = {
        prompt: qDraft.prompt,
        choices,
        correctChoiceId,
        explanation: qDraft.explanation ?? "",
      };
      const check = await checkAnswerKey(provider, answer);
      questionPos = generateKeyBetween(questionPos, null);
      await db.insert(questions).values({
        id: newId("qst"),
        biteId,
        type: "multiple_choice",
        prompt: answer.prompt,
        choices: answer.choices,
        correctChoiceId: answer.correctChoiceId,
        explanation: answer.explanation,
        position: questionPos,
        reviewStatus: "approved",
        styleVersionId: style.id,
        answerKeyStatus: check.status,
        answerKeyNote: check.note,
      });
      wroteQuestions += 1;
    }
  }

  await db
    .update(ingestKeywords)
    .set({
      status: "approved",
      placementMode: input.placementMode,
      suggestedLessonId: input.lessonId || kw.suggestedLessonId,
      suggestedSubLessonId: targetSubLessonId,
      createdSubLessonId:
        input.placementMode === "create_sub_lesson" ? targetSubLessonId : null,
    })
    .where(eq(ingestKeywords.id, kw.id));

  invalidateCatalogCache(db);
  invalidateSyllabusIndex(db);

  return {
    ok: true as const,
    subLessonId: targetSubLessonId,
    wroteBites,
    wroteQuestions,
  };
}

export async function dismissIngestKeyword(db: AppDatabase, keywordId: string) {
  await db
    .update(ingestKeywords)
    .set({ status: "dismissed" })
    .where(eq(ingestKeywords.id, keywordId));
  return { ok: true as const };
}

export async function listIngestFeed(db: AppDatabase, limit = 25) {
  const items = await db
    .select({
      id: ingestItems.id,
      sourceType: ingestItems.sourceType,
      sourceUrl: ingestItems.sourceUrl,
      sourceTitle: ingestItems.sourceTitle,
      curatorNote: ingestItems.curatorNote,
      summary: ingestItems.summary,
      status: ingestItems.status,
      errorMessage: ingestItems.errorMessage,
      createdAt: ingestItems.createdAt,
      analyzedAt: ingestItems.analyzedAt,
    })
    .from(ingestItems)
    .orderBy(desc(ingestItems.createdAt))
    .limit(limit);

  const allKeywords = await db
    .select()
    .from(ingestKeywords)
    .orderBy(asc(ingestKeywords.createdAt));

  const byItem = new Map<string, (typeof allKeywords)[number][]>();
  for (const kw of allKeywords) {
    const list = byItem.get(kw.ingestItemId) ?? [];
    list.push(kw);
    byItem.set(kw.ingestItemId, list);
  }

  return items.map((item) => ({
    ...item,
    keywords: byItem.get(item.id) ?? [],
  }));
}
