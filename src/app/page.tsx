import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth/current";
import { listProfiles } from "@/lib/auth/profiles";
import { SignInForm } from "@/components/sign-in-form";
import { getDb } from "@/lib/db";

export default async function SignInPage() {
  const session = await getSessionProfile();
  if (session) redirect("/home");
  let profiles: Awaited<ReturnType<typeof listProfiles>> = [];
  let dbError: string | null = null;
  try {
    const db = await getDb();
    profiles = (await listProfiles(db)).filter((profile) => !profile.archivedAt);
  } catch (error) {
    dbError = error instanceof Error ? error.message : "Database connection failed.";
  }
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <p className="font-display text-4xl italic leading-none">Bite Sized</p>
      <h1 className="mt-3 text-lg">Short cards for a long course.</h1>
      <p className="mt-1 text-sm text-muted-foreground">Choose who is learning. The subject lives in the course, not in the app.</p>
      {dbError ? (
        <p className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Database is waking up or unavailable: {dbError}
        </p>
      ) : null}
      <div className="mt-8">
        <SignInForm
          profiles={profiles.map((profile) => ({
            id: profile.id,
            name: profile.name,
            isAdmin: profile.isAdmin,
          }))}
        />
      </div>
    </main>
  );
}
