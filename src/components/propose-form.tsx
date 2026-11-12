"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProposeForm({
  action,
}: {
  action: (
    prev: { error?: string; ok?: boolean } | null | undefined,
    formData: FormData,
  ) => Promise<{ error?: string; ok?: boolean } | null | undefined>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="grid gap-3">
      <div>
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required className="mt-1" data-testid="proposal-title" />
      </div>
      <div>
        <Label htmlFor="notes">Notes, if you have them</Label>
        <textarea id="notes" name="notes" className="mt-1 min-h-24 w-full rounded-lg border border-input bg-card p-3" />
      </div>
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-success">Sent for placement. An admin will confirm where it sits.</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Asking…" : "Suggest a place"}</Button>
    </form>
  );
}
