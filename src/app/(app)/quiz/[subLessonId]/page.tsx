import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/current";
import { flattenSubLessons, loadCatalog, nextSubLesson } from "@/lib/content/catalog";
import { QuizRunner } from "@/components/quiz-runner";
import { quizQuestions } from "@/lib/quiz/attempts";
import { nextSubLessonHref } from "@/lib/quiz/score-tone";
import { getDb } from "@/lib/db";

export default async function QuizPage({ params }: { params: Promise<{ subLessonId: string }> }) {
  const { subLessonId } = await params;
  const profile = await requireProfile();
  const db = await getDb();
  const catalog = await loadCatalog(db, profile.id);
  const current = catalog ? flattenSubLessons(catalog).find((item) => item.id === subLessonId) : undefined;
  if (!catalog || !current) notFound();
  const quiz = await quizQuestions(db, subLessonId);
  const upcoming = nextSubLesson(catalog, subLessonId);
  return (
    <div>
      <p className="mb-3 text-sm">
        <Link href={`/study/${subLessonId}`} className="text-muted-foreground underline-offset-4 hover:underline">
          {current.lessonCode}
        </Link>
      </p>
      <QuizRunner
        subLessonId={subLessonId}
        title={current.title}
        lessonCode={current.lessonCode}
        questions={quiz.questions}
        skipped={quiz.skipped}
        nextHref={nextSubLessonHref(upcoming)}
        nextTitle={upcoming?.title ?? null}
        isAdmin={profile.isAdmin}
      />
    </div>
  );
}
