import { getSessionProfile } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { buildPackageFiles, zipPackage } from "@/lib/packages/io";

export async function GET(request: Request) {
  const profile = await getSessionProfile();
  if (!profile?.isAdmin) return new Response("Admins only.", { status: 401 });
  const url = new URL(request.url);
  const includeLearners = url.searchParams.get("learners") === "1";
  const db = await getDb();
  const files = await buildPackageFiles(db, {
    includeLearners,
    includeHistory: includeLearners,
    includeArchived: includeLearners,
  });
  const zip = zipPackage(files);
  const filename = includeLearners ? "bite-sized-course-and-progress.zip" : "bite-sized-course.zip";
  return new Response(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
