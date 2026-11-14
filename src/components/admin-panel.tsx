"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addProfileAction,
  importCourseAction,
  removeProfileAction,
  resetPinAction,
  restoreProfileAction,
  setAdminAction,
} from "@/lib/actions";
import {
  IMPORT_OUTLINE_PATH,
  IMPORT_OUTLINE_TITLE,
  looksLikeOutlineFile,
  outlineFileMessage,
} from "@/lib/packages/outline-hint";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ProfileRow = {
  id: string;
  name: string;
  isAdmin: boolean;
  archived: boolean;
};

export function AdminPanel({
  profiles,
  currentId,
  singleAdmin,
}: {
  profiles: ProfileRow[];
  currentId: string;
  singleAdmin: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [outlinePick, setOutlinePick] = useState<string | null>(null);
  const [addState, addAction, addPending] = useActionState(addProfileAction, null);
  const [importState, importAction, importPending] = useActionState(importCourseAction, null);
  const active = profiles.filter((profile) => !profile.archived);
  const archived = profiles.filter((profile) => profile.archived);

  async function run(work: Promise<{ error?: string; ok?: boolean } | null | undefined | void>) {
    setError(null);
    const result = await work;
    if (result && "error" in result && result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <div className="space-y-8">
      {singleAdmin ? (
        <aside className="rounded-2xl border border-primary/40 bg-secondary px-4 py-3 text-sm" data-testid="admin-nudge">
          You are the only admin. Add a second admin so someone else can reset a forgotten PIN. Whoever runs the server can also use the emergency reset script.
        </aside>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <section>
        <h2 className="font-display text-2xl">Profiles</h2>
        <p className="mt-1 text-sm text-muted-foreground">{active.length} of 3 in use.</p>
        <ul className="mt-4 space-y-3">
          {active.map((profile) => (
            <li key={profile.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {profile.name}{" "}
                  <span className="text-sm font-normal text-muted-foreground">{profile.isAdmin ? "Admin" : "Learner"}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <a href={`/api/progress/export?profileId=${profile.id}`} data-testid={`export-progress-${profile.name}`}>
                      Export progress
                    </a>
                  </Button>
                  {profile.isAdmin ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => void run(setAdminAction(profile.id, false))}>
                      Remove admin
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" size="sm" onClick={() => void run(setAdminAction(profile.id, true))}>
                      Make admin
                    </Button>
                  )}
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button type="button" variant="outline" size="sm" disabled={profile.id === currentId}>
                        Remove
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogTitle className="font-display text-2xl">Remove {profile.name}?</DialogTitle>
                      <DialogDescription className="mt-2 text-sm text-muted-foreground">
                        The profile is archived, not erased. Progress stays, and you can restore it while there is a free slot.
                      </DialogDescription>
                      <div className="mt-5 flex justify-end gap-2">
                        <DialogClose asChild>
                          <Button type="button" variant="outline">
                            Cancel
                          </Button>
                        </DialogClose>
                        <Button type="button" variant="destructive" onClick={() => void run(removeProfileAction(profile.id))}>
                          Remove profile
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
              {profile.id !== currentId ? <ResetForm profileId={profile.id} isAdmin={profile.isAdmin} /> : null}
            </li>
          ))}
        </ul>
      </section>
      {archived.length > 0 ? (
        <section>
          <h2 className="font-display text-2xl">Removed profiles</h2>
          <ul className="mt-3 space-y-2">
            {archived.map((profile) => (
              <li key={profile.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                <span>{profile.name}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => void run(restoreProfileAction(profile.id))}>
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <h2 className="font-display text-2xl">Add a profile</h2>
        <form action={addAction} className="mt-3 grid max-w-sm gap-3">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="pin">PIN</Label>
            <Input id="pin" name="pin" type="password" required className="mt-1" autoComplete="new-password" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isAdmin" className="h-4 w-4" />
            Admin
          </label>
          {addState?.error ? <p className="text-sm text-destructive">{addState.error}</p> : null}
          {addState?.ok ? <p className="text-sm text-success">Profile added.</p> : null}
          <Button type="submit" disabled={addPending || active.length >= 3}>
            {active.length >= 3 ? "Three profiles already" : addPending ? "Adding…" : "Add profile"}
          </Button>
        </form>
      </section>
      <section>
        <h2 className="font-display text-2xl">Course package</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Download the live course, or import a package ZIP. Import updates content and leaves family progress in place. A full backup, including progress, is the server backup script.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          For a Word outline or Google Doc, use{" "}
          <Link
            href={IMPORT_OUTLINE_PATH}
            data-testid="course-package-outline-link"
            className="font-medium text-foreground underline decoration-primary/50 underline-offset-4"
          >
            {IMPORT_OUTLINE_TITLE}
          </Link>
          .
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button asChild variant="outline">
            <a href="/api/admin/export" data-testid="export-course-package">
              Download course package
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href="/api/admin/export?learners=1" data-testid="export-course-with-learners">
              Download course + progress
            </a>
          </Button>
          <form action={importAction} className="flex flex-wrap items-center gap-2">
            <Input
              name="package"
              type="file"
              accept="application/zip,.zip"
              required
              className="max-w-xs"
              aria-label="Course package ZIP"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setOutlinePick(file && looksLikeOutlineFile(file.name) ? file.name : null);
              }}
            />
            <Button type="submit" disabled={importPending}>
              {importPending ? "Importing…" : "Import package"}
            </Button>
          </form>
        </div>
        {outlinePick && !importState?.error ? <PackageNotice message={outlineFileMessage(outlinePick)} /> : null}
        {importState?.error ? <PackageNotice message={importState.error} /> : null}
        {importState?.ok ? <p className="mt-2 text-sm text-success">Course imported.</p> : null}
      </section>
    </div>
  );
}

function PackageNotice({ message }: { message: string }) {
  const at = message.indexOf(IMPORT_OUTLINE_TITLE);
  if (at < 0) return <p className="mt-2 text-sm text-destructive">{message}</p>;
  return (
    <p className="mt-2 text-sm text-destructive" role="alert" data-testid="package-import-error">
      {message.slice(0, at)}
      <Link href={IMPORT_OUTLINE_PATH} className="underline decoration-primary/50 underline-offset-4">
        {IMPORT_OUTLINE_TITLE}
      </Link>
      {message.slice(at + IMPORT_OUTLINE_TITLE.length)}
    </p>
  );
}

function ResetForm({ profileId, isAdmin }: { profileId: string; isAdmin: boolean }) {
  const [state, action, pending] = useActionState(resetPinAction, null);
  return (
    <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
      <input type="hidden" name="profileId" value={profileId} />
      <div>
        <Label htmlFor={`reset-${profileId}`}>{isAdmin ? "New admin PIN or passphrase" : "New PIN"}</Label>
        <Input id={`reset-${profileId}`} name="pin" type="password" required className="mt-1 w-56" autoComplete="new-password" />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        Reset PIN
      </Button>
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-success">PIN reset.</p> : null}
    </form>
  );
}
