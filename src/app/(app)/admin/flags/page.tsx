import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/current";
import { acceptFlagAction, regenerateFlagAction } from "@/lib/actions/phase3";
import { adminFlagList } from "@/lib/ai/flags";
import { AdminNav } from "@/components/admin-nav";
import { Button } from "@/components/ui/button";
import { bites } from "@/lib/db/schema";
import { getDb } from "@/lib/db";

export default async function FlagsPage() {
  const profile = await requireProfile();
  if (!profile.isAdmin) redirect("/home");
  const db = await getDb();
  const flags = await adminFlagList(db);
  const biteIds = flags.filter((flag) => flag.targetType === "bite").map((flag) => flag.targetId);
  const biteRows = biteIds.length ? await db.select().from(bites) : [];
  return (
    <div className="mx-auto max-w-2xl" data-testid="flag-list">
      <AdminNav current="/admin/flags" />
      <h1 className="font-display text-3xl md:text-4xl">Flags</h1>
      <p className="mt-1 text-sm text-muted-foreground">Rework, factual errors, and diagrams that did not render. A heart never arrives here.</p>
      {flags.length === 0 ? <p className="mt-6">No open flags.</p> : null}
      <ul className="mt-4 space-y-4">
        {flags.map((flag) => {
          const bite = biteRows.find((row) => row.id === flag.targetId);
          return (
            <li key={flag.id} className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm uppercase tracking-wide text-muted-foreground">{flag.kind}</p>
              <p className="mt-1 font-medium">{bite?.title ?? flag.targetId}</p>
              {flag.note ? <p className="mt-1 text-sm">{flag.note}</p> : null}
              {bite ? <p className="mt-2 text-sm text-muted-foreground">{bite.body}</p> : null}
              {bite ? (
                <form action={acceptFlagAction} className="mt-3 grid gap-2">
                  <input type="hidden" name="flagId" value={flag.id} />
                  <input type="hidden" name="biteId" value={bite.id} />
                  <textarea name="body" defaultValue={bite.body} className="min-h-24 rounded-lg border border-input bg-background p-3" />
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit">Accept for everyone</Button>
                    <Button type="submit" variant="outline" formAction={regenerateFlagAction}>
                      Regenerate and accept
                    </Button>
                  </div>
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="mt-6 text-sm">
        <Link href="/admin/review" className="underline decoration-primary/50 underline-offset-4">Review queue</Link>
      </p>
    </div>
  );
}
