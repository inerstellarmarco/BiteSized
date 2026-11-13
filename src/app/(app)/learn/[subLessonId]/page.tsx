import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/current";
import { loadCatalog, loadLearnCards, nextSubLesson } from "@/lib/content/catalog";
import { nextSubLessonHref } from "@/lib/quiz/score-tone";
import { learnerCursors } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { learnOverlay } from "@/lib/ai/view";
import { LearnDeck } from "@/components/learn-deck";
import { getDb } from "@/lib/db";

export default async function LearnPage({ params }: { params: Promise<{ subLessonId: string }> }) {
  const { subLessonId } = await params;
  const profile = await requireProfile();
  const db = await getDb();
  const detail = await loadLearnCards(db, subLessonId);
  if (!detail) notFound();
  const [cursor] = await db.select().from(learnerCursors).where(eq(learnerCursors.profileId, profile.id));
  const found = cursor?.subLessonId === subLessonId && cursor.biteId ? detail.bites.findIndex((bite) => bite.id === cursor.biteId) : -1;
  const overlay = await learnOverlay(db, profile.id, detail.bites.map((bite) => bite.id));
  const catalog = await loadCatalog(db, profile.id);
  const upcoming = catalog ? nextSubLesson(catalog, subLessonId) : null;
  return (
    <div>
      <p className="mb-3 text-sm">
        <Link href="/course" className="text-muted-foreground underline-offset-4 hover:underline">
          Course
        </Link>
      </p>
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
        }))}
        initialIndex={found >= 0 ? found : 0}
        isAdmin={profile.isAdmin}
        remaining={overlay.remaining}
        limit={overlay.limit}
      />
    </div>
  );
}
