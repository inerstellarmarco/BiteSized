export type IngestSourceType = "youtube" | "x_post" | "email" | "text";

export type ExtractedSource = {
  sourceType: IngestSourceType;
  sourceUrl: string;
  canonicalYoutubeUrl?: string;
  sourceTitle: string;
  rawText: string;
};

const MAX_STORED_TEXT_CHARS = 12_000;

export function extractYoutubeVideoId(input: string): string | null {
  try {
    const url = new URL(input.trim());
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = url.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const parts = url.pathname.split("/").filter(Boolean);
      if ((parts[0] === "shorts" || parts[0] === "live" || parts[0] === "embed") && parts[1]) {
        return /^[a-zA-Z0-9_-]{11}$/.test(parts[1]) ? parts[1] : null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function extractXPostId(input: string): string | null {
  try {
    const url = new URL(input.trim());
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "x.com" && host !== "twitter.com" && host !== "mobile.twitter.com") return null;
    const match = url.pathname.match(/\/status(?:es)?\/(\d{10,25})/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function extractUrlsFromText(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>)"']+/gi) ?? [];
  const cleaned = matches.map((raw) => raw.replace(/[.,;:!?)]+$/, ""));
  return Array.from(new Set(cleaned));
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function stripHtmlTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; BiteSizedBot/1.0)",
        ...(init?.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function extractYoutubeSource(videoId: string, originalUrl: string): Promise<ExtractedSource> {
  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
  let title = `YouTube Video (${videoId})`;
  let author = "";
  const sections: string[] = [];

  try {
    const oembedRes = await fetchWithTimeout(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`,
    );
    if (oembedRes.ok) {
      const oembed = (await oembedRes.json()) as { title?: string; author_name?: string };
      if (oembed.title) title = oembed.title.trim();
      if (oembed.author_name) author = oembed.author_name.trim();
    }
  } catch {
    // Continue to watch page / Gemini native video understanding fallback
  }

  try {
    const pageRes = await fetchWithTimeout(canonicalUrl, {
      headers: { "accept-language": "en-US,en;q=0.9" },
    });
    if (pageRes.ok) {
      const html = await pageRes.text();
      const descMatch = html.match(/"shortDescription":"((?:\\.|[^"\\])*)"/);
      if (descMatch?.[1]) {
        try {
          const decodedDesc = JSON.parse(`"${descMatch[1]}"`) as string;
          if (decodedDesc.trim()) {
            sections.push(`Video Description:\n${decodedDesc.trim().slice(0, 3000)}`);
          }
        } catch {
          // Ignore malformed JSON string
        }
      }

      const tracksMatch = html.match(/"captionTracks":(\[[\s\S]*?\])/);
      if (tracksMatch?.[1]) {
        try {
          const tracks = JSON.parse(tracksMatch[1]) as { baseUrl?: string; languageCode?: string }[];
          const preferred =
            tracks.find((track) => track.languageCode?.startsWith("en")) ?? tracks[0];
          if (preferred?.baseUrl) {
            const transcriptRes = await fetchWithTimeout(preferred.baseUrl);
            if (transcriptRes.ok) {
              const xml = await transcriptRes.text();
              const lines = Array.from(xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/gi))
                .map((match) => decodeHtmlEntities(match[1] ?? "").trim())
                .filter(Boolean);
              if (lines.length > 0) {
                sections.push(`Transcript:\n${lines.join(" ")}`);
              }
            }
          }
        } catch {
          // Transcript XML optional; Gemini native fileUri also processes YouTube URLs directly
        }
      }
    }
  } catch {
    // Watch page fetch optional when Gemini native fileUri is used
  }

  const header = [
    `Title: ${title}`,
    author ? `Channel: ${author}` : "",
    `URL: ${canonicalUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const combined = [header, ...sections].join("\n\n").slice(0, MAX_STORED_TEXT_CHARS);

  return {
    sourceType: "youtube",
    sourceUrl: originalUrl || canonicalUrl,
    canonicalYoutubeUrl: canonicalUrl,
    sourceTitle: author ? `${title} (${author})` : title,
    rawText: combined,
  };
}

async function extractXPostSource(postId: string, originalUrl: string): Promise<ExtractedSource> {
  const canonicalUrl = `https://x.com/i/status/${postId}`;
  let title = `X Post (${postId})`;
  const sections: string[] = [];

  try {
    const syndicationUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${postId}&token=a`;
    const res = await fetchWithTimeout(syndicationUrl);
    if (res.ok) {
      const data = (await res.json()) as {
        text?: string;
        user?: { name?: string; screen_name?: string };
        note_tweet?: { text?: string };
        quoted_tweet?: { text?: string; user?: { screen_name?: string } };
        article?: { title?: string; preview_text?: string };
      };
      const authorName = data.user?.name ?? "";
      const handle = data.user?.screen_name ? `@${data.user.screen_name}` : "";
      if (authorName || handle) {
        title = `X Post by ${[authorName, handle].filter(Boolean).join(" ")}`;
      }
      const mainText = data.note_tweet?.text ?? data.text ?? "";
      if (mainText.trim()) {
        sections.push(`Post:\n${mainText.trim()}`);
      }
      if (data.article?.title || data.article?.preview_text) {
        sections.push(
          `Attached X Article: ${data.article.title ?? ""}\n${data.article.preview_text ?? ""}`.trim(),
        );
      }
      if (data.quoted_tweet?.text) {
        const qHandle = data.quoted_tweet.user?.screen_name ? `@${data.quoted_tweet.user.screen_name}` : "quoted post";
        sections.push(`Quoted (${qHandle}):\n${data.quoted_tweet.text.trim()}`);
      }
    }
  } catch {
    // Fall back to publish.twitter.com oEmbed
  }

  if (sections.length === 0) {
    try {
      const oembedRes = await fetchWithTimeout(
        `https://publish.twitter.com/oembed?url=${encodeURIComponent(canonicalUrl)}&omit_script=true`,
      );
      if (oembedRes.ok) {
        const oembed = (await oembedRes.json()) as { author_name?: string; html?: string };
        if (oembed.author_name) title = `X Post by ${oembed.author_name}`;
        if (oembed.html) {
          sections.push(`Post:\n${stripHtmlTags(oembed.html)}`);
        }
      }
    } catch {
      // Fall back to URL + curator notes
    }
  }

  const combined = [`Title: ${title}`, `URL: ${originalUrl || canonicalUrl}`, ...sections]
    .join("\n\n")
    .slice(0, MAX_STORED_TEXT_CHARS);

  return {
    sourceType: "x_post",
    sourceUrl: originalUrl || canonicalUrl,
    sourceTitle: title,
    rawText: combined,
  };
}

export async function extractSourceContent(input: {
  url?: string;
  text?: string;
  title?: string;
}): Promise<ExtractedSource> {
  const directUrl = input.url?.trim() ?? "";
  const bodyUrls = extractUrlsFromText(input.text ?? "");
  const primaryUrl = directUrl || bodyUrls[0] || "";

  if (primaryUrl) {
    const ytId = extractYoutubeVideoId(primaryUrl);
    if (ytId) {
      const extracted = await extractYoutubeSource(ytId, primaryUrl);
      const extraText = (input.text ?? "").replace(primaryUrl, "").trim();
      return {
        ...extracted,
        sourceTitle: input.title?.trim() || extracted.sourceTitle,
        rawText: extraText
          ? `${extracted.rawText}\n\nAdditional Context / Notes:\n${extraText}`.slice(0, MAX_STORED_TEXT_CHARS)
          : extracted.rawText,
      };
    }

    const xId = extractXPostId(primaryUrl);
    if (xId) {
      const extracted = await extractXPostSource(xId, primaryUrl);
      const extraText = (input.text ?? "").replace(primaryUrl, "").trim();
      return {
        ...extracted,
        sourceTitle: input.title?.trim() || extracted.sourceTitle,
        rawText: extraText
          ? `${extracted.rawText}\n\nAdditional Context / Notes:\n${extraText}`.slice(0, MAX_STORED_TEXT_CHARS)
          : extracted.rawText,
      };
    }
  }

  const cleanText = (input.text ?? "").trim().slice(0, MAX_STORED_TEXT_CHARS);
  const fallbackTitle =
    input.title?.trim() ||
    (primaryUrl ? primaryUrl : cleanText.split("\n")[0]?.slice(0, 80) || "Submitted Note");

  return {
    sourceType: primaryUrl ? "email" : "text",
    sourceUrl: primaryUrl,
    sourceTitle: fallbackTitle,
    rawText: cleanText || primaryUrl,
  };
}
