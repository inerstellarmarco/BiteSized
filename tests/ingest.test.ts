import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createProfile } from "@/lib/auth/profiles";
import { openMemoryDatabase } from "@/lib/db/memory";
import { bites, questions, subLessons } from "@/lib/db/schema";
import {
  approveIngestKeyword,
  dismissIngestKeyword,
  listIngestFeed,
  processQueuedIngestBatch,
  queueIngestSubmission,
} from "@/lib/ingest/analyze";
import {
  extractUrlsFromText,
  extractXPostId,
  extractYoutubeVideoId,
} from "@/lib/ingest/extract";
import { parseRawEmailContent } from "@/lib/ingest/imap";
import { mockProvider } from "@/lib/llm/mock";
import { importPackageFromDir, SAMPLE_PACKAGE_DIR } from "@/lib/packages/io";

describe("YouTube, X, and Email Inbox Ingestion & Syllabus Gap Analyzer", () => {
  it("parses YouTube video IDs and X post IDs from diverse URL formats", () => {
    expect(extractYoutubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeVideoId("https://youtu.be/dQw4w9WgXcQ?si=123")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeVideoId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();

    expect(extractXPostId("https://x.com/karpathy/status/1891234567890123456")).toBe(
      "1891234567890123456",
    );
    expect(extractXPostId("https://twitter.com/openai/status/1779876543210987654?s=20")).toBe(
      "1779876543210987654",
    );
    expect(extractXPostId("https://x.com/karpathy")).toBeNull();

    const urls = extractUrlsFromText(
      "Check this out: https://youtu.be/dQw4w9WgXcQ, and https://x.com/a/status/1234567890123).",
    );
    expect(urls).toEqual([
      "https://youtu.be/dQw4w9WgXcQ",
      "https://x.com/a/status/1234567890123",
    ]);
  });

  it("parses raw IMAP email headers and quoted-printable bodies", () => {
    const raw = [
      "From: Eric <eric@example.com>",
      "Subject: Fwd: Great talk on speculative decoding",
      "Message-ID: <msg-101@example.com>",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "Watch https://www.youtube.com/watch?v=3DabcDEF12345 for the KV=20cache breakdown.",
    ].join("\r\n");

    const parsed = parseRawEmailContent(raw);
    expect(parsed.subject).toBe("Fwd: Great talk on speculative decoding");
    expect(parsed.messageId).toBe("<msg-101@example.com>");
    expect(parsed.bodyText).toContain("https://www.youtube.com/watch?v=abcDEF12345");
    expect(parsed.bodyText).toContain("KV cache breakdown.");
  });

  it("analyzes a queued source, classifies keywords, and generates cards on approval in both placement modes", async () => {
    const opened = await openMemoryDatabase();
    try {
      await importPackageFromDir(opened.db, SAMPLE_PACKAGE_DIR, {
        replace: false,
        includeLearners: false,
        includeHistory: false,
      });
      await createProfile(opened.db, {
        id: "prf_eric",
        name: "Eric",
        pin: "1030",
        isAdmin: true,
      });

      const sub1 = await queueIngestSubmission(opened.db, {
        text: "Thread on Speculative Decoding, Transformer Attention, and a Vendor-Specific Beta Flag.",
        title: "Inference Optimization Thread",
        externalMessageId: "<msg-unique-1>",
      });
      expect(sub1.duplicate).toBe(false);

      const dup = await queueIngestSubmission(opened.db, {
        text: "Duplicate email",
        externalMessageId: "<msg-unique-1>",
      });
      expect(dup.duplicate).toBe(true);

      const batchRes = await processQueuedIngestBatch(opened.db, 5, mockProvider);
      expect(batchRes).toEqual({ processed: 1, failed: 0 });

      const feed = await listIngestFeed(opened.db);
      expect(feed).toHaveLength(1);
      expect(feed[0].status).toBe("analyzed");
      expect(feed[0].keywords).toHaveLength(3);

      const verdicts = feed[0].keywords.map((k) => k.verdict);
      expect(verdicts).toEqual(["missing_recommended", "already_covered", "esoteric_skip"]);

      const [recommendedKw, coveredKw, esotericKw] = feed[0].keywords;

      // 1. Dismiss the already_covered keyword
      await dismissIngestKeyword(opened.db, coveredKw.id);

      // 2. Approve the missing_recommended keyword in "append_to_sub_lesson" mode
      const targetSubLessonId = recommendedKw.suggestedSubLessonId!;
      const beforeBites = await opened.db
        .select()
        .from(bites)
        .where(eq(bites.subLessonId, targetSubLessonId));

      const appendRes = await approveIngestKeyword(opened.db, {
        keywordId: recommendedKw.id,
        placementMode: "append_to_sub_lesson",
        subLessonId: targetSubLessonId,
        profileId: "prf_eric",
        provider: mockProvider,
      });
      expect(appendRes.ok).toBe(true);
      if (appendRes.ok) {
        expect(appendRes.wroteBites).toBeGreaterThan(0);
        expect(appendRes.wroteQuestions).toBeGreaterThan(0);
      }

      const afterBites = await opened.db
        .select()
        .from(bites)
        .where(eq(bites.subLessonId, targetSubLessonId));
      expect(afterBites.length).toBeGreaterThan(beforeBites.length);

      // 3. Approve the esoteric keyword in "create_sub_lesson" mode (manual override)
      const createRes = await approveIngestKeyword(opened.db, {
        keywordId: esotericKw.id,
        placementMode: "create_sub_lesson",
        lessonId: esotericKw.suggestedLessonId!,
        profileId: "prf_eric",
        provider: mockProvider,
      });
      expect(createRes.ok).toBe(true);
      if (createRes.ok) {
        const [newSub] = await opened.db
          .select()
          .from(subLessons)
          .where(eq(subLessons.id, createRes.subLessonId));
        expect(newSub?.title).toBe("Vendor-Specific Beta Flag");

        const newSubBites = await opened.db
          .select()
          .from(bites)
          .where(eq(bites.subLessonId, createRes.subLessonId));
        expect(newSubBites.length).toBeGreaterThan(0);

        const newSubQuestions = await opened.db
          .select()
          .from(questions)
          .where(eq(questions.biteId, newSubBites[0].id));
        expect(newSubQuestions.length).toBeGreaterThan(0);
      }
    } finally {
      await opened.close();
    }
  });
});
