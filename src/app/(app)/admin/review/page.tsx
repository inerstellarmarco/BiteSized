import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/current";
import { continueQueueAction } from "@/lib/actions/ai";
import { AdminNav } from "@/components/admin-nav";
import { Button } from "@/components/ui/button";
import { getDb } from "@/lib/db";
import { reviewQueue } from "@/lib/generation/review";

export default async function ReviewIndexPage() {
  const profile = await requireProfile();
  if (!profile.isAdmin) redirect("/home");
  const db = await getDb();
  const queue = await reviewQueue(db);
  return (
    <div className="mx-auto max-w-2xl">
      <AdminNav current="/admin/review" />
      <h1 className="font-display text-3xl md:text-4xl">Review</h1>
      <p className="mt-1 text-sm text-muted-foreground">Learners never see a bite until it is approved. Generation continues from where it stopped.</p>
      <form action={continueQueueAction} className="mt-4">
        <Button type="submit" variant="outline">Continue generation</Button>
      </form>
      {queue.length === 0 ? <p className="mt-6">No sub-lessons are waiting.</p> : null}
      <ul className="mt-4 space-y-2">
        {queue.map((item) => (
          <li key={item.id}>
            <Link href={`/admin/review/${item.id}`} className="block rounded-xl border border-border bg-card px-4 py-3 hover:border-primary">
              <span className="text-sm text-muted-foreground">{item.lessonCode}</span>
              <span className="mt-1 block font-medium">{item.title}</span>
              <span className="text-sm text-muted-foreground">{item.pendingBites} pending bites</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
