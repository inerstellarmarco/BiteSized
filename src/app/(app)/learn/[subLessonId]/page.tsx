import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { LearnDeck } from "@/components/learn-deck";
import { learnOverlay } from "@/lib/ai/view";
import { requireProfile } from "@/lib/auth/current";
import { loadCatalog, loadLearnCards, nextSubLesson, titleWithoutCode } from "@/lib/content/catalog";
import { unmetPrerequisites } from "@/lib/content/prerequisites";
import { getDb } from "@/lib/db";
import { learnerCursors } from "@/lib/db/schema";
import { nextSubLessonHref } from "@/lib/quiz/score-tone";

export default async function LearnPage({
  params,
  searchParams,
}: {
  params: Promise<{ subLessonId: string }>;
  searchParams?: Promise<{ bite?: string }>;
}) {
  const { subLessonId } = await params;
  const resolvedSearch = searchParams ? await searchParams : {};
  const profile = await requireProfile();
  const db = await getDb();
  const detail = await loadLearnCards(db, subLessonId);
  if (!detail) notFound();
  const [cursor] = await db.select().from(learnerCursors).where(eq(learnerCursors.profileId, profile.id));
  const requestedIndex = resolvedSearch.bite ? detail.bites.findIndex((bite) => bite.id === resolvedSearch.bite) : -1;
  const cursorIndex = cursor?.subLessonId === subLessonId && cursor.biteId ? detail.bites.findIndex((bite) => bite.id === cursor.biteId) : -1;
  const initialIndex = requestedIndex >= 0 ? requestedIndex : cursorIndex >= 0 ? cursorIndex : 0;
  const overlay = await learnOverlay(
    db,
    profile.id,
    detail.bites.map((bite) => bite.id),
  );
  const catalog = await loadCatalog(db, profile.id);
  const upcoming = catalog ? nextSubLesson(catalog, subLessonId) : null;
  const unmet = catalog ? unmetPrerequisites(catalog, detail.lesson.id) : [];

  return (
    <div>
      <p className="mb-3 text-sm">
        <Link href="/course" className="text-muted-foreground underline-offset-4 hover:underline">
          Course
        </Link>
      </p>
      {unmet.length > 0 ? (
        <aside
          data-testid="prerequisite-warning"
          className="mb-3 rounded-2xl border border-primary/40 bg-secondary px-4 py-2.5 text-xs text-foreground"
        >
          <span className="font-semibold">Heads up — skipped prerequisite{unmet.length === 1 ? "" : "s"}:</span>{" "}
          Learn{" "}
          {unmet.map((item, idx) => (
            <span key={item.id}>
              {idx > 0 ? ", " : ""}
              {item.firstSubLessonId ? (
                <Link href={`/learn/${item.firstSubLessonId}`} className="underline decoration-primary/60 underline-offset-4">
                  {item.code} {titleWithoutCode(item.code, item.title)}
                </Link>
              ) : (
                <span>
                  {item.code} {titleWithoutCode(item.code, item.title)}
                </span>
              )}
            </span>
          ))}{" "}
          first if anything here feels unfamiliar.
        </aside>
      ) : null}
      <LearnDeck
        subLessonId={subLessonId}
        nextHref={nextSubLessonHref(upcoming)}
        nextTitle={upcoming?.title ?? null}
        lessonCode={detail.lesson.code}
        lessonTitle={detail.lesson.title}
        subLessonTitle={detail.subLesson.title}
        bites={detail.bites.map((bite) => ({
          ...bite,
          personal: overlay.personal[bite.id] ?? null,
          hearted: overlay.hearts.includes(bite.id),
          privateNote: overlay.notes[bite.id] ?? "",
        }))}
        initialIndex={initialIndex}
        isAdmin={profile.isAdmin}
        remaining={overlay.remaining}
        limit={overlay.limit}
      />
    </div>
  );
}
