import { asc, isNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin-nav";
import { Button } from "@/components/ui/button";
import {
  analyzeSingleItemAction,
  approveIngestKeywordAction,
  dismissIngestKeywordAction,
  submitIngestSourceAction,
  syncAndProcessInboxBatchAction,
} from "@/lib/actions/ingest";
import { requireProfile } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { lessons, subLessons } from "@/lib/db/schema";
import { listIngestFeed } from "@/lib/ingest/analyze";
import { getImapConfig } from "@/lib/ingest/imap";

const VERDICT_META: Record<
  string,
  { label: string; className: string }
> = {
  missing_recommended: {
    label: "Missing · Recommended",
    className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30",
  },
  already_covered: {
    label: "Already Covered",
    className: "bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-500/30",
  },
  esoteric_skip: {
    label: "Esoteric · Skip Recommended",
    className: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
  },
  off_topic: {
    label: "Off-Topic",
    className: "bg-muted text-muted-foreground border-border",
  },
};

export default async function AdminInboxPage() {
  const profile = await requireProfile();
  if (!profile.isAdmin) redirect("/home");

  const db = await getDb();
  const [feed, lessonRows, subLessonRows] = await Promise.all([
    listIngestFeed(db, 25),
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
  ]);

  const imapConfig = getImapConfig();
  const queuedCount = feed.filter((item) => item.status === "queued").length;

  return (
    <div className="mx-auto max-w-3xl space-y-6" data-testid="admin-inbox-page">
      <AdminNav current="/admin/inbox" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl md:text-4xl">Syllabus Inbox</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Drop a YouTube video, X post, or email batch. Gemini compares every concept against your 50-module syllabus and 1,794 bite cards before you approve placement.
          </p>
        </div>
        <form action={syncAndProcessInboxBatchAction}>
          <Button type="submit" variant="secondary" data-testid="sync-inbox-batch">
            Sync Email &amp; Process Batch ({queuedCount} queued)
          </Button>
        </form>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium text-lg">Add YouTube Video, X Post, or Note</h2>
          <span className="text-xs text-muted-foreground">
            {imapConfig
              ? `Email inbox connected (${imapConfig.user})`
              : "Email sync optional: set INGEST_IMAP_USER & INGEST_IMAP_PASSWORD"}
          </span>
        </div>

        <form action={submitIngestSourceAction} className="space-y-3">
          <div>
            <label className="block text-sm font-medium">
              YouTube or X (Twitter) URL
              <input
                type="url"
                name="url"
                placeholder="https://www.youtube.com/watch?v=... or https://x.com/.../status/..."
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                data-testid="ingest-url-input"
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              Curator Note <span className="text-muted-foreground">(optional hint)</span>
              <input
                type="text"
                name="curatorNote"
                placeholder="e.g. Check the KV cache section (optional)"
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                data-testid="ingest-note-input"
              />
            </label>

            <label className="block text-sm">
              When to analyze
              <select
                name="analyzeNow"
                defaultValue="true"
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="true">Analyze immediately against syllabus</option>
                <option value="false">Save to weekly queue (analyze in batch)</option>
              </select>
            </label>
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Or paste raw transcript / X thread text (optional fallback)
            </summary>
            <textarea
              name="text"
              rows={3}
              placeholder="Paste thread text, article excerpt, or video transcript here..."
              className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              data-testid="ingest-text-input"
            />
          </details>

          <div className="flex justify-end">
            <Button type="submit" data-testid="submit-ingest">
              Submit Source
            </Button>
          </div>
        </form>
      </section>

      {feed.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No sources in your inbox yet. Paste a YouTube or X link above or sync your email inbox to get started.
        </p>
      ) : (
        <div className="space-y-5">
          {feed.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-border bg-card p-5 space-y-4"
              data-testid="ingest-item-card"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium uppercase">
                      {item.sourceType.replace("_", " ")}
                    </span>
                    <span className="text-xs text-muted-foreground">{item.status}</span>
                  </div>
                  <h3 className="font-medium text-base">
                    {item.sourceUrl ? (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-border underline-offset-4 hover:decoration-foreground"
                      >
                        {item.sourceTitle}
                      </a>
                    ) : (
                      item.sourceTitle
                    )}
                  </h3>
                  {item.curatorNote ? (
                    <p className="text-xs text-muted-foreground">
                      Note: {item.curatorNote}
                    </p>
                  ) : null}
                </div>

                {item.status !== "analyzed" ? (
                  <form action={analyzeSingleItemAction}>
                    <input type="hidden" name="itemId" value={item.id} />
                    <Button type="submit" size="sm" variant="secondary">
                      Analyze Now
                    </Button>
                  </form>
                ) : null}
              </div>

              {item.errorMessage ? (
                <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {item.errorMessage}
                </p>
              ) : null}

              {item.summary ? (
                <p className="text-sm text-muted-foreground">{item.summary}</p>
              ) : null}

              {item.keywords.length > 0 ? (
                <ul className="space-y-3 pt-1">
                  {item.keywords.map((kw) => {
                    const badge = VERDICT_META[kw.verdict] ?? VERDICT_META.missing_recommended;
                    return (
                      <li
                        key={kw.id}
                        className="rounded-xl border border-border bg-background/60 p-4 space-y-2.5"
                        data-testid="ingest-keyword-row"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-sm">{kw.keyword}</span>
                            <span
                              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          </div>
                          {kw.status === "approved" ? (
                            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                              ✓ Approved{" "}
                              {kw.suggestedSubLessonId ? (
                                <Link
                                  href={`/learn/${kw.suggestedSubLessonId}`}
                                  className="underline ml-1"
                                >
                                  Open Sub-Lesson →
                                </Link>
                              ) : null}
                            </span>
                          ) : kw.status === "dismissed" ? (
                            <span className="text-xs text-muted-foreground">Dismissed</span>
                          ) : null}
                        </div>

                        {kw.definition ? (
                          <p className="text-sm">{kw.definition}</p>
                        ) : null}

                        {kw.verdictReason ? (
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">AI Assessment:</span>{" "}
                            {kw.verdictReason}
                            {kw.matchedCardTitle ? ` (Matched card: "${kw.matchedCardTitle}")` : ""}
                          </p>
                        ) : null}

                        {kw.status === "pending" ? (
                          <div className="flex flex-wrap items-end justify-between gap-3 pt-2 border-t border-border/60">
                            <form
                              action={approveIngestKeywordAction}
                              className="flex flex-wrap items-end gap-2"
                            >
                              <input type="hidden" name="keywordId" value={kw.id} />
                              <label className="text-xs">
                                Action
                                <select
                                  name="placementMode"
                                  defaultValue={kw.placementMode}
                                  className="mt-1 block rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
                                  data-testid="keyword-placement-mode"
                                >
                                  <option value="append_to_sub_lesson">
                                    Append cards to existing Sub-Lesson leaf
                                  </option>
                                  <option value="create_sub_lesson">
                                    Create new Sub-Lesson under Lesson branch
                                  </option>
                                </select>
                              </label>

                              <label className="text-xs">
                                Sub-Lesson (for Append)
                                <select
                                  name="subLessonId"
                                  defaultValue={kw.suggestedSubLessonId ?? ""}
                                  className="mt-1 block max-w-[230px] rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
                                  data-testid="keyword-sublesson-select"
                                >
                                  {subLessonRows.map((sub) => (
                                    <option key={sub.id} value={sub.id}>
                                      {sub.title}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="text-xs">
                                Lesson (for New Sub-Lesson)
                                <select
                                  name="lessonId"
                                  defaultValue={kw.suggestedLessonId ?? ""}
                                  className="mt-1 block max-w-[210px] rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
                                  data-testid="keyword-lesson-select"
                                >
                                  {lessonRows.map((les) => (
                                    <option key={les.id} value={les.id}>
                                      {les.code} {les.title}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <Button
                                type="submit"
                                size="sm"
                                data-testid="approve-ingest-keyword"
                              >
                                Approve &amp; Generate Cards
                              </Button>
                            </form>

                            <form action={dismissIngestKeywordAction}>
                              <input type="hidden" name="keywordId" value={kw.id} />
                              <Button
                                type="submit"
                                size="sm"
                                variant="ghost"
                                data-testid="dismiss-ingest-keyword"
                              >
                                Dismiss
                              </Button>
                            </form>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
