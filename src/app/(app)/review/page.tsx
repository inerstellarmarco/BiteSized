import { PageHeader } from "@/components/page-header";
import { SpacedReviewRunner } from "@/components/spaced-review-runner";
import { requireProfile } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { spacedQueue } from "@/lib/quiz/spaced";

export default async function SpacedReviewPage() {
  const profile = await requireProfile();
  const db = await getDb();
  const queue = await spacedQueue(db, profile.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        eyebrow="Spaced repetition"
        title="Due reviews"
        description="Questions you missed come back after 1, 3, 7, and 21 days so they stick."
      />
      <SpacedReviewRunner due={queue.due} upcoming={queue.upcoming} />
    </div>
  );
}
