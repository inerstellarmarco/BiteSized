import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth/current";
import { listProfiles } from "@/lib/auth/profiles";
import { SignInForm } from "@/components/sign-in-form";
import { getDb } from "@/lib/db";

export default async function SignInPage() {
  const session = await getSessionProfile();
  if (session) redirect("/home");
  const db = await getDb();
  const profiles = (await listProfiles(db)).filter((profile) => !profile.archivedAt);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <p className="font-display text-4xl italic leading-none">Bite Sized</p>
      <h1 className="mt-3 text-lg">Short cards for a long course.</h1>
      <p className="mt-1 text-sm text-muted-foreground">Choose who is learning. The subject lives in the course, not in the app.</p>
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
