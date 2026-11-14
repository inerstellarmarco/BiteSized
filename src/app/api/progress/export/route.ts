import { getSessionProfile } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { buildLearnerProgressExport } from "@/lib/learner/export";

export async function GET(request: Request) {
  const profile = await getSessionProfile();
  if (!profile) return new Response("Sign in required.", { status: 401 });

  const url = new URL(request.url);
  const requestedProfileId = url.searchParams.get("profileId");
  const targetProfileId = requestedProfileId && profile.isAdmin ? requestedProfileId : profile.id;

  const db = await getDb();
  const payload = await buildLearnerProgressExport(db, targetProfileId);
  if (!payload) return new Response("Profile not found.", { status: 404 });

  const slug = payload.profile.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "learner";
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="bite-sized-progress-${slug}.json"`,
    },
  });
}
