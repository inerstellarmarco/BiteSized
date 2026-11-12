import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/current";
import { AdminNav } from "@/components/admin-nav";
import { ReviewPanel } from "@/components/review-panel";
import { getDb } from "@/lib/db";
import { loadReview } from "@/lib/generation/review";

export default async function ReviewSubLessonPage({ params }: { params: Promise<{ subLessonId: string }> }) {
  const profile = await requireProfile();
  if (!profile.isAdmin) redirect("/home");
  const { subLessonId } = await params;
  const detail = await loadReview(await getDb(), subLessonId);
  if (!detail) notFound();
  return (
    <div className="mx-auto max-w-2xl">
      <AdminNav current="/admin/review" />
      <p className="text-sm text-muted-foreground">
        <Link href="/admin/review" className="underline-offset-4 hover:underline">Review</Link>
        {detail.lesson ? ` · ${detail.lesson.code}` : ""}
        {detail.levelTag ? ` · ${detail.levelTag}` : ""}
      </p>
      <h1 className="font-display text-4xl">{detail.subLesson.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{detail.categoryTitle}</p>
      <div className="mt-6">
        <ReviewPanel
          subLessonId={subLessonId}
          bites={detail.bites.map((bite) => ({
            id: bite.id,
            title: bite.title,
            body: bite.body,
            sourceNote: bite.sourceNote,
            styleVersionId: bite.styleVersionId,
            questions: bite.questions.map((question) => ({
              id: question.id,
              prompt: question.prompt,
              choices: question.choices,
              correctChoiceId: question.correctChoiceId,
              explanation: question.explanation,
              answerKeyStatus: question.answerKeyStatus,
              answerKeyNote: question.answerKeyNote,
            })),
          }))}
        />
      </div>
    </div>
  );
}
