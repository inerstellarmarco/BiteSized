import { getSessionProfile } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { buildPackageFiles, zipPackage } from "@/lib/packages/io";

export async function GET() {
  const profile = await getSessionProfile();
  if (!profile?.isAdmin) return new Response("Admins only.", { status: 401 });
  const db = await getDb();
  const files = await buildPackageFiles(db, {
    includeLearners: false,
    includeHistory: false,
    includeArchived: false,
  });
  const zip = zipPackage(files);
  return new Response(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="bite-sized-course.zip"',
    },
  });
}
