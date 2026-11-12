import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/current";
import { AdminNav } from "@/components/admin-nav";
import { StyleEditor } from "@/components/style-editor";
import { getDb } from "@/lib/db";
import { getLlmClient } from "@/lib/llm";
import { setCapAction } from "@/lib/actions/phase3";
import { getDailyCap } from "@/lib/ai/usage";
import { STYLE_EXAMPLE_CAP, ensureStyleDraft, listExamples, listStyleVersions } from "@/lib/style/guide";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function StylePage() {
  const profile = await requireProfile();
  if (!profile.isAdmin) redirect("/home");
  const db = await getDb();
  const draft = await ensureStyleDraft(db);
  const examples = await listExamples(db);
  const versions = await listStyleVersions(db);
  const client = getLlmClient();
  const cap = await getDailyCap(db);
  if (!draft) return null;
  return (
    <div className="mx-auto max-w-2xl">
      <AdminNav current="/admin/style" />
      <h1 className="font-display text-4xl">Locked style</h1>
      <p className="mt-1 text-sm text-muted-foreground">Admins write the house style. Generation uses the latest locked version, not the unsaved draft.</p>
      <form action={setCapAction} className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          Daily regenerations per profile
          <Input name="cap" type="number" min={1} defaultValue={cap} className="mt-1 w-28" />
        </label>
        <Button type="submit" variant="outline">Save cap</Button>
      </form>
      <div className="mt-6">
        <StyleEditor
          fields={{
            tone: draft.tone,
            lengthGuide: draft.lengthGuide,
            readingLevel: draft.readingLevel,
            analogyUse: draft.analogyUse,
            formatting: draft.formatting,
            temperature: draft.temperature,
          }}
          examples={examples.map((example) => ({ id: example.id, title: example.title, body: example.body }))}
          versions={versions.map((version) => ({ id: version.id, number: version.number, model: version.model, provider: version.provider }))}
          usingMock={client.usingMock}
          model={client.model}
          cap={STYLE_EXAMPLE_CAP}
        />
      </div>
    </div>
  );
}
