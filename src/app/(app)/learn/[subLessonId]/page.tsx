import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/current";
import { loadLearnCards } from "@/lib/content/catalog";
import { learnerCursors } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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
  return (
    <div>
      <p className="mb-3 text-sm">
        <Link href="/course" className="text-muted-foreground underline-offset-4 hover:underline">
          Course
        </Link>
      </p>
      <LearnDeck
        lessonCode={detail.lesson.code}
        lessonTitle={detail.lesson.title}
        subLessonTitle={detail.subLesson.title}
        bites={detail.bites}
        initialIndex={found >= 0 ? found : 0}
      />
    </div>
  );
}
