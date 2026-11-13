import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/current";
import { flattenSubLessons, loadCatalog } from "@/lib/content/catalog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getDb } from "@/lib/db";

export default async function StudyPage({ params }: { params: Promise<{ subLessonId: string }> }) {
  const { subLessonId } = await params;
  const profile = await requireProfile();
  const db = await getDb();
  const catalog = await loadCatalog(db, profile.id);
  const subLesson = catalog ? flattenSubLessons(catalog).find((item) => item.id === subLessonId) : undefined;
  if (!subLesson) notFound();
  const ratio = subLesson.biteCount === 0 ? 0 : (subLesson.seenCount / subLesson.biteCount) * 100;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <p className="text-sm text-muted-foreground">
        {subLesson.lessonCode} · {subLesson.lessonTitle}
      </p>
      <h1 className="font-display text-3xl md:text-4xl leading-tight">{subLesson.title}</h1>
      <p className="text-sm text-muted-foreground">
        {subLesson.seenCount} of {subLesson.biteCount} bites read · {subLesson.questionCount} quiz questions
      </p>
      <Progress value={ratio} aria-label="Sub-lesson progress" />
      {subLesson.biteCount === 0 ? (
        <div className="space-y-3 rounded-2xl border border-dashed border-border bg-card p-4">
          <p className="font-medium">Coming soon</p>
          <p className="text-sm text-muted-foreground">This lesson is in the outline but has no content yet.</p>
          <Button asChild variant="outline">
            <Link href="/course">Back to the course</Link>
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Learn and quiz are separate. Opening the cards does not start a quiz.</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href={`/learn/${subLesson.id}`}>Learn</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/quiz/${subLesson.id}`}>Quiz</Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
