import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/current";
import { listProfiles } from "@/lib/auth/profiles";
import { AdminNav } from "@/components/admin-nav";
import { AdminPanel } from "@/components/admin-panel";
import { getDb } from "@/lib/db";

export default async function AdminPage() {
  const profile = await requireProfile();
  if (!profile.isAdmin) redirect("/home");
  const db = await getDb();
  const profiles = await listProfiles(db);
  const activeAdmins = profiles.filter((item) => item.isAdmin && !item.archivedAt).length;
  return (
    <div className="mx-auto max-w-2xl">
      <AdminNav current="/admin" />
      <h1 className="font-display text-4xl">Family</h1>
      <p className="mt-1 text-sm text-muted-foreground">Up to three profiles. Admin is a right, not a separate kind of person.</p>
      <div className="mt-6">
        <AdminPanel
          currentId={profile.id}
          singleAdmin={activeAdmins < 2}
          profiles={profiles.map((item) => ({
            id: item.id,
            name: item.name,
            isAdmin: item.isAdmin,
            archived: Boolean(item.archivedAt),
          }))}
        />
      </div>
    </div>
  );
}
