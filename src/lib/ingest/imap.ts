import tls from "tls";
import type { AppDatabase } from "@/lib/db/types";
import { queueIngestSubmission } from "@/lib/ingest/analyze";
import { extractUrlsFromText } from "@/lib/ingest/extract";

export type ImapConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  allowedSenders: string[];
};

export function getImapConfig(): ImapConfig | null {
  const user = (process.env.INGEST_IMAP_USER ?? "").trim();
  const password = (process.env.INGEST_IMAP_PASSWORD ?? "").trim();
  if (!user || !password) return null;
  const host = (process.env.INGEST_IMAP_HOST ?? "imap.gmail.com").trim();
  const port = Number(process.env.INGEST_IMAP_PORT ?? "993") || 993;
  const allowedSenders = (process.env.INGEST_ALLOWED_SENDERS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return { host, port, user, password, allowedSenders };
}

function decodeQuotedPrintable(input: string): string {
  return input
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function parseRawEmailContent(raw: string): {
  subject: string;
  from: string;
  messageId: string;
  bodyText: string;
} {
  const splitIndex = raw.search(/\r?\n\r?\n/);
  const headerPart = splitIndex >= 0 ? raw.slice(0, splitIndex) : raw;
  const bodyPart = splitIndex >= 0 ? raw.slice(splitIndex).replace(/^\r?\n\r?\n/, "") : "";

  const unfoldedHeaders = headerPart.replace(/\r?\n[ \t]+/g, " ");
  const headerMap = new Map<string, string>();
  for (const line of unfoldedHeaders.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon > 0) {
      const key = line.slice(0, colon).trim().toLowerCase();
      const val = line.slice(colon + 1).trim();
      headerMap.set(key, val);
    }
  }

  const subject = headerMap.get("subject") ?? "";
  const from = headerMap.get("from") ?? "";
  const messageId = headerMap.get("message-id") ?? "";
  const transferEncoding = (headerMap.get("content-transfer-encoding") ?? "").toLowerCase();

  let decodedBody = bodyPart;
  if (transferEncoding.includes("quoted-printable") || /=[0-9A-Fa-f]{2}/.test(bodyPart)) {
    decodedBody = decodeQuotedPrintable(bodyPart);
  } else if (transferEncoding.includes("base64")) {
    try {
      decodedBody = Buffer.from(bodyPart.replace(/\s+/g, ""), "base64").toString("utf8");
    } catch {
      decodedBody = bodyPart;
    }
  }

  const stripped = decodedBody
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { subject, from, messageId, bodyText: stripped };
}

function quoteImapString(val: string): string {
  return `"${val.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function fetchUnreadEmailsOverImap(
  config: ImapConfig,
  maxMessages = 15,
): Promise<{ uid: string; raw: string }[]> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host: config.host,
        port: config.port,
        servername: config.host,
      },
      () => {
        // Connected; wait for server greeting
      },
    );

    socket.setTimeout(15000);
    let buffer = "";
    let stepTag = "";
    let pendingResolver: ((response: string) => void) | null = null;
    let pendingRejecter: ((err: Error) => void) | null = null;
    let greeted = false;
    let greetResolver: (() => void) | null = null;

    const cleanup = () => {
      try {
        socket.destroy();
      } catch {
        // ignore
      }
    };

    socket.on("timeout", () => {
      cleanup();
      reject(new Error("IMAP connection timed out"));
    });

    socket.on("error", (err) => {
      cleanup();
      if (pendingRejecter) pendingRejecter(err);
      else reject(err);
    });

    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      if (!greeted) {
        if (buffer.includes("\r\n")) {
          greeted = true;
          buffer = "";
          if (greetResolver) greetResolver();
        }
        return;
      }
      if (stepTag && pendingResolver) {
        const tagLineRegex = new RegExp(`(^|\\r?\\n)${stepTag} (OK|NO|BAD) .*\\r?\\n`, "i");
        const match = tagLineRegex.exec(buffer);
        if (match) {
          const out = buffer;
          buffer = "";
          const status = match[2]?.toUpperCase();
          const resolveFn = pendingResolver;
          const rejectFn = pendingRejecter;
          pendingResolver = null;
          pendingRejecter = null;
          if (status === "OK") {
            resolveFn(out);
          } else if (rejectFn) {
            rejectFn(new Error(`IMAP command ${stepTag} failed: ${match[0].trim()}`));
          }
        }
      }
    });

    const sendCommand = (tag: string, cmd: string): Promise<string> =>
      new Promise((res, rej) => {
        stepTag = tag;
        pendingResolver = res;
        pendingRejecter = rej;
        socket.write(`${tag} ${cmd}\r\n`);
      });

    (async () => {
      try {
        if (!greeted) {
          await new Promise<void>((r) => {
            greetResolver = r;
          });
        }
        await sendCommand(
          "A01",
          `LOGIN ${quoteImapString(config.user)} ${quoteImapString(config.password)}`,
        );
        await sendCommand("A02", "SELECT INBOX");
        const searchResp = await sendCommand("A03", "UID SEARCH UNSEEN");
        const searchLine = searchResp
          .split(/\r?\n/)
          .find((line) => line.startsWith("* SEARCH"));
        const uids = (searchLine?.replace("* SEARCH", "").trim().split(/\s+/).filter(Boolean) ?? [])
          .slice(-maxMessages);

        const messages: { uid: string; raw: string }[] = [];
        let cmdIdx = 4;
        for (const uid of uids) {
          const tag = `A${String(cmdIdx++).padStart(2, "0")}`;
          const fetchResp = await sendCommand(
            tag,
            `UID FETCH ${uid} (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT MESSAGE-ID CONTENT-TRANSFER-ENCODING)] BODY.PEEK[TEXT])`,
          );
          messages.push({ uid, raw: fetchResp });
          const storeTag = `A${String(cmdIdx++).padStart(2, "0")}`;
          await sendCommand(storeTag, `UID STORE ${uid} +Flags (\\Seen)`).catch(() => undefined);
        }

        await sendCommand("A99", "LOGOUT").catch(() => undefined);
        cleanup();
        resolve(messages);
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    })();
  });
}

export async function syncEmailInboxToQueue(db: AppDatabase, maxMessages = 15) {
  const config = getImapConfig();
  if (!config) {
    return {
      ok: false as const,
      configured: false,
      error:
        "Email inbox is not configured yet. Add INGEST_IMAP_USER and INGEST_IMAP_PASSWORD in Vercel Environment Variables (or .env.local).",
      queuedCount: 0,
    };
  }

  try {
    const rawMessages = await fetchUnreadEmailsOverImap(config, maxMessages);
    let queuedCount = 0;

    for (const msg of rawMessages) {
      const parsed = parseRawEmailContent(msg.raw);
      if (config.allowedSenders.length > 0) {
        const lowerFrom = parsed.from.toLowerCase();
        const allowed = config.allowedSenders.some((sender) => lowerFrom.includes(sender));
        if (!allowed) continue;
      }

      const urls = extractUrlsFromText(`${parsed.subject}\n${parsed.bodyText}`);
      const cleanNote = parsed.subject
        .replace(/^(fwd?:|re:)\s*/i, "")
        .trim();

      if (urls.length > 0) {
        for (let i = 0; i < urls.length; i++) {
          const url = urls[i];
          const dedupId = parsed.messageId ? `${parsed.messageId}#${i}` : `imap-uid-${msg.uid}#${i}`;
          const res = await queueIngestSubmission(db, {
            url,
            text: parsed.bodyText,
            curatorNote: cleanNote,
            externalMessageId: dedupId,
          });
          if (!res.duplicate) queuedCount += 1;
        }
      } else if (parsed.bodyText.trim().length > 10) {
        const dedupId = parsed.messageId || `imap-uid-${msg.uid}`;
        const res = await queueIngestSubmission(db, {
          title: cleanNote || "Emailed Note",
          text: parsed.bodyText,
          curatorNote: cleanNote,
          externalMessageId: dedupId,
        });
        if (!res.duplicate) queuedCount += 1;
      }
    }

    return {
      ok: true as const,
      configured: true,
      scannedEmails: rawMessages.length,
      queuedCount,
    };
  } catch (error) {
    return {
      ok: false as const,
      configured: true,
      error: error instanceof Error ? error.message : "IMAP sync failed.",
      queuedCount: 0,
    };
  }
}
