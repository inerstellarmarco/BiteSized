import { unzipSync, strFromU8 } from "fflate";
import { parseDocxXml, parseHtml, parseOutlineText, type Block } from "@/lib/import/parse";

export function googleDocId(input: string): string | null {
  const match = /\/document\/d\/([a-zA-Z0-9_-]+)/.exec(input.trim());
  return match?.[1] ?? null;
}

export async function fetchGoogleDocHtml(input: string): Promise<string> {
  const id = googleDocId(input);
  if (!id) throw new Error("That does not look like a Google Doc link.");
  const url = `https://docs.google.com/document/d/${id}/export?format=html`;
  let response: Response;
  try {
    response = await fetch(url, { redirect: "follow" });
  } catch {
    throw new Error("Could not reach Google Docs. Upload an HTML or Word export instead.");
  }
  if (!response.ok) {
    throw new Error("Could not download that doc. Share it as anyone with the link, or upload an HTML or Word export.");
  }
  const html = await response.text();
  const lowered = html.slice(0, 2000).toLowerCase();
  if (lowered.includes("accounts.google.com") || lowered.includes("sign in")) {
    throw new Error("That doc is not public. Share it as anyone with the link, or upload an export.");
  }
  if (!/<(h1|h2|p|body)\b/i.test(html)) {
    throw new Error("Google did not return a document. Upload an HTML or Word export instead.");
  }
  return html;
}

export function blocksFromUpload(filename: string, bytes: Uint8Array): Block[] {
  const name = filename.toLowerCase();
  if (name.endsWith(".docx")) {
    const files = unzipSync(bytes);
    const xml = files["word/document.xml"];
    if (!xml) throw new Error("That Word file has no document.xml.");
    return parseDocxXml(strFromU8(xml));
  }
  const text = new TextDecoder().decode(bytes);
  if (name.endsWith(".html") || name.endsWith(".htm") || text.includes("<h1") || text.includes("<p")) return parseHtml(text);
  return parseOutlineText(text);
}
