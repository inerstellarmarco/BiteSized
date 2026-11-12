"use client";

import { useActionState } from "react";
import { startImportAction } from "@/lib/actions/ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ImportStart() {
  const [state, action, pending] = useActionState(startImportAction, null);
  return (
    <form action={action} className="mt-6 grid gap-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <Label htmlFor="link">Google Doc link</Label>
        <Input id="link" name="link" placeholder="https://docs.google.com/document/d/…" className="mt-1" />
      </div>
      <div>
        <Label htmlFor="file">Or upload HTML, .docx, or outline text</Label>
        <Input id="file" name="file" type="file" accept=".html,.htm,.docx,.txt" data-testid="import-file" className="mt-1" />
      </div>
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Reading…" : "Read document"}</Button>
    </form>
  );
}