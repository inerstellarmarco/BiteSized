import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  analyzeIngestItem,
  processQueuedIngestBatch,
  queueIngestSubmission,
} from "@/lib/ingest/analyze";
import { syncEmailInboxToQueue } from "@/lib/ingest/imap";

function isAuthorized(request: Request): boolean {
  const secret = (process.env.INGEST_SECRET || process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  return token.length > 0 && token === secret;
}

/**
 * GET /api/ingest — Weekly Cron / Batch endpoint.
 * Pulls unread emails from IMAP (if configured) and analyzes up to 5 queued links.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const imapResult = await syncEmailInboxToQueue(db, 15);
  const batchResult = await processQueuedIngestBatch(db, 5);
  return NextResponse.json({
    ok: true,
    imap: imapResult,
    batch: batchResult,
  });
}

/**
 * POST /api/ingest — Webhook endpoint for emailed links, Hermes bots, or shortcuts.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    url?: string;
    text?: string;
    subject?: string;
    title?: string;
    curatorNote?: string;
    messageId?: string;
    analyzeNow?: boolean;
  };

  if (!body.url && !body.text) {
    return NextResponse.json(
      { ok: false, error: "Provide at least url or text." },
      { status: 400 },
    );
  }

  const db = await getDb();
  const queued = await queueIngestSubmission(db, {
    url: body.url,
    text: body.text,
    title: body.title || body.subject,
    curatorNote: body.curatorNote || body.subject,
    externalMessageId: body.messageId,
  });

  if (body.analyzeNow !== false && !queued.duplicate) {
    const analysis = await analyzeIngestItem(db, queued.id);
    return NextResponse.json({ ok: true, id: queued.id, duplicate: false, analysis });
  }

  return NextResponse.json({ ok: true, id: queued.id, duplicate: queued.duplicate });
}
