import { buildPackageFiles, zipPackage } from "@/lib/packages/io";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const files = await buildPackageFiles(db, { includeLearners: true, includeHistory: true, includeArchived: true });
  const zip = zipPackage(files);
  const webhook = process.env.BACKUP_WEBHOOK_URL;
  if (webhook) {
    await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/zip", "x-backup-name": `bite-sized-${new Date().toISOString()}.zip` },
      body: Buffer.from(zip),
    });
  }
  return Response.json({
    ok: true,
    files: Object.keys(files).length,
    bytes: zip.byteLength,
    delivered: Boolean(webhook),
  });
}
