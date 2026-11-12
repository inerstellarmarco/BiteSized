"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { addExampleAction, lockStyleAction, removeExampleAction, saveStyleAction, tryStyleAction } from "@/lib/actions/ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Example = { id: string; title: string; body: string };
type Version = { id: string; number: number; model: string; provider: string };

export function StyleEditor({
  fields,
  examples,
  versions,
  usingMock,
  model,
  cap,
}: {
  fields: { tone: string; lengthGuide: string; readingLevel: string; analogyUse: string; formatting: string; temperature: string };
  examples: Example[];
  versions: Version[];
  usingMock: boolean;
  model: string;
  cap: number;
}) {
  const router = useRouter();
  const [saveState, saveAction, saving] = useActionState(saveStyleAction, null);
  const [exampleState, exampleAction, adding] = useActionState(addExampleAction, null);
  const [tryState, tryAction, trying] = useActionState(tryStyleAction, null);
  const [lockMessage, setLockMessage] = useState<string | null>(null);

  return (
    <div className="space-y-8" data-testid="style-page">
      <p className="text-sm text-muted-foreground">
        {usingMock ? "AI is on the built-in mock because no Gemini key is set. Generation still runs, and it is deterministic." : `Live model: ${model}.`}
      </p>
      <form action={saveAction} className="space-y-3">
        <Field name="tone" label="Tone" value={fields.tone} testId="style-tone" />
        <Field name="lengthGuide" label="Length" value={fields.lengthGuide} />
        <Field name="readingLevel" label="Reading level" value={fields.readingLevel} />
        <Field name="analogyUse" label="Analogy use" value={fields.analogyUse} />
        <Field name="formatting" label="Formatting" value={fields.formatting} />
        <div>
          <Label htmlFor="temperature">Temperature</Label>
          <Input id="temperature" name="temperature" defaultValue={fields.temperature} className="mt-1 max-w-32" />
        </div>
        {saveState?.error ? <p className="text-sm text-destructive">{saveState.error}</p> : null}
        {saveState?.ok ? <p className="text-sm text-success">Draft saved. Lock it when you want generation to use this version.</p> : null}
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save draft"}</Button>
      </form>
      <section>
        <h2 className="font-display text-2xl">Style examples</h2>
        <p className="mt-1 text-sm text-muted-foreground">{examples.length} of {cap}. They are copied into the prompt when you lock a version.</p>
        <ul className="mt-3 space-y-2">
          {examples.map((example) => (
            <li key={example.id} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{example.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{example.body}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void removeExampleAction(example.id).then(() => router.refresh())}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <form action={exampleAction} className="mt-3 grid gap-2">
          <Input name="title" placeholder="Example title" required />
          <textarea name="body" required className="min-h-24 rounded-lg border border-input bg-card p-3" placeholder="A bite you want the model to imitate" />
          {exampleState?.error ? <p className="text-sm text-destructive">{exampleState.error}</p> : null}
          <Button type="submit" variant="outline" disabled={adding || examples.length >= cap}>Add example</Button>
        </form>
      </section>
      <section>
        <h2 className="font-display text-2xl">Try sample bites</h2>
        <form action={tryAction} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1">
            <Label htmlFor="topic">Topic</Label>
            <Input id="topic" name="topic" placeholder="Boiling water" className="mt-1" required />
          </div>
          <Button type="submit" disabled={trying}>{trying ? "Writing…" : "Try sample bites"}</Button>
        </form>
        {tryState?.error ? <p className="mt-2 text-sm text-destructive" data-testid="style-error">{tryState.error}</p> : null}
        <ul className="mt-3 space-y-3">
          {tryState?.samples?.map((sample) => (
            <li key={sample.title} className="rounded-xl border border-border bg-card p-4">
              <p className="font-display text-xl">{sample.title}</p>
              <p className="mt-2 text-sm">{sample.body}</p>
              {sample.questions[0] ? <p className="mt-2 text-sm text-muted-foreground">Question: {sample.questions[0].prompt}</p> : null}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-display text-2xl">Lock a version</h2>
        <p className="mt-1 text-sm text-muted-foreground">Locking saves an immutable copy: the guide, the examples, and the model settings. Later edits start the next version. Old bites stay until you regenerate them.</p>
        <Button
          type="button"
          className="mt-3"
          data-testid="lock-style"
          onClick={() => {
            void lockStyleAction().then((result) => {
              if (result && "error" in result && result.error) setLockMessage(result.error);
              else setLockMessage(`Locked style version ${result && "number" in result ? result.number : ""}.`);
              router.refresh();
            });
          }}
        >
          Lock style
        </Button>
        {lockMessage ? <p className="mt-2 text-sm">{lockMessage}</p> : null}
        <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
          {versions.map((version) => (
            <li key={version.id}>Version {version.number} · {version.provider} · {version.model}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Field({ name, label, value, testId }: { name: string; label: string; value: string; testId?: string }) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <textarea id={name} name={name} data-testid={testId} defaultValue={value} required className="mt-1 min-h-20 w-full rounded-lg border border-input bg-card p-3" />
    </div>
  );
}
