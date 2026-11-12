export type Block =
  | { kind: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { kind: "numbered"; text: string }
  | { kind: "bullet"; depth: number; text: string }
  | { kind: "paragraph"; text: string };

export type HeadingRole = "category" | "sub_category" | "lesson" | "toolkit" | "ignore";

export type LevelMapping = {
  h1: HeadingRole;
  h2: HeadingRole;
  h3: HeadingRole;
  h4: HeadingRole;
};

export const defaultMapping: LevelMapping = {
  h1: "category",
  h2: "sub_category",
  h3: "lesson",
  h4: "toolkit",
};

export type CrossLinkDraft = { targetCode: string; label: string };

export type ProposedTopic = { title: string; notes: string; crossLinks: CrossLinkDraft[] };

export type ProposedSubLesson = { title: string; topics: ProposedTopic[] };

export type ProposedLesson = {
  code: string;
  title: string;
  prerequisiteCodes: string[];
  subLessons: ProposedSubLesson[];
};

export type ProposedToolkit = {
  handsOnProjects: string[];
  toolsAndFrameworks: string[];
  learningOutcomes: string[];
};

export type ProposedSubCategory = {
  code: string;
  title: string;
  levelTag: string;
  toolkit: ProposedToolkit;
  lessons: ProposedLesson[];
};

export type ProposedCategory = {
  include: boolean;
  code: string;
  title: string;
  summary: string;
  subCategories: ProposedSubCategory[];
};

export type Proposal = {
  categories: ProposedCategory[];
  pathNotes: string[];
};

const emptyToolkit = (): ProposedToolkit => ({
  handsOnProjects: [],
  toolsAndFrameworks: [],
  learningOutcomes: [],
});

export function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

export function parseOutlineText(source: string): Block[] {
  const blocks: Block[] = [];
  for (const line of source.split(/\r?\n/)) {
    const heading = /^\[HEADING_(\d)\|\|\]\s*(.*)$/.exec(line);
    if (heading) {
      const level = Number(heading[1]);
      if (level >= 1 && level <= 4) blocks.push({ kind: "heading", level: level as 1 | 2 | 3 | 4, text: heading[2].trim() });
      continue;
    }
    const bullet = /^\[\|\d+\|\]\s*[•\-*]?\s*(.*)$/.exec(line);
    if (bullet) {
      const indent = Number(/^\[\|(\d+)\|\]/.exec(line)?.[1] ?? "36");
      const text = bullet[1].trim();
      if (text) blocks.push({ kind: "bullet", depth: indent >= 72 ? 2 : 1, text });
      continue;
    }
    const paragraph = /^\[\|\|\]\s*(.*)$/.exec(line);
    if (!paragraph) continue;
    const text = paragraph[1].trim();
    if (!text) continue;
    if (/^\d+\.\s+/.test(text)) blocks.push({ kind: "numbered", text: text.replace(/^\d+\.\s+/, "") });
    else blocks.push({ kind: "paragraph", text });
  }
  return blocks;
}

export function parseHtml(html: string): Block[] {
  const blocks: Block[] = [];
  const listStack: ("ol" | "ul")[] = [];
  const tokens = html.match(/<(\/?)(h[1-4]|p|li|ol|ul)\b[^>]*>|([^<]+)/gi) ?? [];
  type Capture = "h1" | "h2" | "h3" | "h4" | "p" | "li";
  let capture: Capture | null = null;
  let buffer = "";
  const flush = () => {
    const text = decodeEntities(buffer.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    buffer = "";
    if (!text || !capture) return;
    if (capture.startsWith("h")) {
      blocks.push({ kind: "heading", level: Number(capture[1]) as 1 | 2 | 3 | 4, text });
      return;
    }
    const list = listStack[listStack.length - 1];
    if (capture === "li" && list !== "ol" && !/^\d+\.\s+/.test(text)) {
      blocks.push({ kind: "bullet", depth: Math.max(1, listStack.length), text: text.replace(/^[•\-*]\s*/, "") });
      return;
    }
    if (capture === "li" || /^\d+\.\s+/.test(text)) {
      blocks.push({ kind: "numbered", text: text.replace(/^\d+\.\s+/, "") });
      return;
    }
    blocks.push({ kind: "paragraph", text });
  };
  for (const token of tokens) {
    const tag = /^<(\/?)(h[1-4]|p|li|ol|ul)\b/i.exec(token);
    if (tag) {
      const name = tag[2].toLowerCase();
      const closing = tag[1] === "/";
      if (name === "ol" || name === "ul") {
        if (closing) listStack.pop();
        else listStack.push(name);
        continue;
      }
      if (!closing) {
        flush();
        capture = name as Capture;
        buffer = "";
      } else {
        flush();
        capture = null;
      }
      continue;
    }
    if (capture) buffer += token;
  }
  flush();
  return blocks;
}

export function parseDocxXml(xml: string): Block[] {
  const blocks: Block[] = [];
  for (const para of xml.split(/<w:p[ >]/).slice(1)) {
    const style = /<w:pStyle[^>]*w:val="([^"]+)"/.exec(para)?.[1] ?? "";
    const text = decodeEntities([...para.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1]).join("")).trim();
    if (!text) continue;
    const heading = /^Heading([1-4])$/i.exec(style);
    if (heading) {
      blocks.push({ kind: "heading", level: Number(heading[1]) as 1 | 2 | 3 | 4, text });
    } else if (para.includes("<w:numPr") && /^\d+\.\s+/.test(text)) {
      blocks.push({ kind: "numbered", text: text.replace(/^\d+\.\s+/, "") });
    } else if (para.includes("<w:numPr")) {
      blocks.push({ kind: "bullet", depth: 1, text });
    } else if (/^\d+\.\s+/.test(text)) {
      blocks.push({ kind: "numbered", text: text.replace(/^\d+\.\s+/, "") });
    } else {
      blocks.push({ kind: "paragraph", text });
    }
  }
  return blocks;
}

export function learningPath(blocks: Block[]): Map<string, string[]> {
  const text = blocks
    .filter((block) => block.kind === "paragraph" || block.kind === "bullet")
    .map((block) => block.text)
    .join("\n");
  const match = /Learning path:\s*([^\n]+)/i.exec(text);
  const prerequisites = new Map<string, string[]>();
  if (!match) return prerequisites;
  const clause = match[1].replace(/\.\s*$/, "");
  const ordered: string[] = [];
  const electives: string[] = [];
  for (const part of clause.split(/then/i)) {
    const codes = [...part.matchAll(/\b([A-E])\b/g)].map((item) => item[1].toUpperCase());
    if (/in any order/i.test(part)) electives.push(...codes);
    else ordered.push(...codes);
  }
  ordered.forEach((code, index) => prerequisites.set(code, ordered.slice(0, index)));
  for (const code of electives) prerequisites.set(code, [...ordered]);
  return prerequisites;
}

function splitHeading(raw: string): { code: string; title: string; levelTag: string } {
  const levelMatch = /\[(Foundations|Intermediate|Advanced|Expert)\]/i.exec(raw);
  const levelTag = levelMatch ? levelMatch[1][0].toUpperCase() + levelMatch[1].slice(1).toLowerCase() : "";
  const stripped = raw.replace(/\[[^\]]+\]/g, " ").replace(/\s+/g, " ").trim();
  const track = /^Track\s+([A-Z])\b[:\s-]*(.*)$/i.exec(stripped);
  if (track) return { code: track[1].toUpperCase(), title: stripped, levelTag };
  const coded = /^([A-Z]\d+(?:\.\d+)*)\b[\s:.-]*(.*)$/.exec(stripped);
  if (coded) return { code: coded[1], title: `${coded[1]} ${coded[2]}`.trim(), levelTag };
  return { code: "", title: stripped, levelTag };
}

function linksIn(text: string): { title: string; crossLinks: CrossLinkDraft[] } {
  const crossLinks: CrossLinkDraft[] = [];
  const pattern = /\(see\s+([A-Z]\d+(?:\.\d+)?)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    crossLinks.push({ targetCode: match[1].toUpperCase(), label: `see ${match[1].toUpperCase()}` });
  }
  return { title: text.replace(pattern, "").replace(/\s+/g, " ").trim(), crossLinks };
}

function toolkitBucket(label: string): keyof ProposedToolkit | null {
  const name = label.toLowerCase();
  if (name.includes("hands-on") || name.includes("hands on") || name.includes("project")) return "handsOnProjects";
  if (name.includes("tool") || name.includes("framework")) return "toolsAndFrameworks";
  if (name.includes("outcome") || name.includes("learning")) return "learningOutcomes";
  return null;
}

function frontMatter(title: string): boolean {
  return /^(introduction|table of contents|optional capstones)$/i.test(title.trim());
}

export function propose(blocks: Block[], mapping: LevelMapping = defaultMapping): Proposal {
  const path = learningPath(blocks);
  const roleFor = (level: 1 | 2 | 3 | 4) => mapping[`h${level}`];
  const categories: ProposedCategory[] = [];
  let category: ProposedCategory | null = null;
  let subCategory: ProposedSubCategory | null = null;
  let lesson: ProposedLesson | null = null;
  let subLesson: ProposedSubLesson | null = null;
  let toolkitKey: keyof ProposedToolkit | null = null;
  let inToolkit = false;

  const ensureCategory = () => {
    if (category) return category;
    category = { include: true, code: "", title: "Imported", summary: "", subCategories: [] };
    categories.push(category);
    return category;
  };

  for (const block of blocks) {
    if (block.kind === "heading") {
      const role = roleFor(block.level);
      const split = splitHeading(block.text);
      inToolkit = role === "toolkit";
      toolkitKey = null;
      if (role === "ignore") continue;
      if (role === "category") {
        category = {
          include: !frontMatter(split.title),
          code: split.code,
          title: split.title,
          summary: "",
          subCategories: [],
        };
        categories.push(category);
        subCategory = null;
        lesson = null;
        subLesson = null;
        continue;
      }
      if (role === "sub_category") {
        const parent = ensureCategory();
        subCategory = {
          code: split.code,
          title: split.title,
          levelTag: split.levelTag,
          toolkit: emptyToolkit(),
          lessons: [],
        };
        parent.subCategories.push(subCategory);
        lesson = null;
        subLesson = null;
        continue;
      }
      if (role === "lesson") {
        if (!subCategory) {
          const parent = ensureCategory();
          subCategory = { code: "", title: parent.title, levelTag: "", toolkit: emptyToolkit(), lessons: [] };
          parent.subCategories.push(subCategory);
        }
        lesson = {
          code: split.code,
          title: split.title,
          prerequisiteCodes: path.get(category?.code ?? "") ?? [],
          subLessons: [],
        };
        subCategory.lessons.push(lesson);
        subLesson = null;
        continue;
      }
      if (role === "toolkit") continue;
    }
    if (!category?.include && category) {
      if (block.kind === "paragraph" && !category.summary) category.summary = block.text;
      continue;
    }
    if (inToolkit && subCategory && (block.kind === "bullet" || block.kind === "paragraph")) {
      const bucket = toolkitBucket(block.text);
      if (bucket && (block.kind === "bullet" ? block.depth === 1 : true) && block.text.length < 40) {
        toolkitKey = bucket;
        continue;
      }
      if (block.kind === "bullet" && toolkitKey) subCategory.toolkit[toolkitKey].push(block.text);
      continue;
    }
    if (block.kind === "numbered" && lesson) {
      subLesson = { title: block.text, topics: [] };
      lesson.subLessons.push(subLesson);
      continue;
    }
    if (block.kind === "bullet" && subLesson) {
      const linked = linksIn(block.text);
      subLesson.topics.push({ title: linked.title, notes: "", crossLinks: linked.crossLinks });
      continue;
    }
    if (block.kind === "paragraph" && category && !subCategory) category.summary = category.summary || block.text;
  }

  return {
    categories: categories.filter((item) => item.subCategories.length > 0 || item.include),
    pathNotes: [...path.entries()].map(([code, needs]) => (needs.length ? `${code} follows ${needs.join(" then ")}` : `${code} starts the path`)),
  };
}

export function countProposal(proposal: Proposal) {
  let lessons = 0;
  let subLessons = 0;
  let topics = 0;
  for (const category of proposal.categories.filter((item) => item.include)) {
    for (const sub of category.subCategories) {
      lessons += sub.lessons.length;
      for (const lesson of sub.lessons) {
        subLessons += lesson.subLessons.length;
        for (const subLesson of lesson.subLessons) topics += subLesson.topics.length;
      }
    }
  }
  return { categories: proposal.categories.filter((item) => item.include).length, lessons, subLessons, topics };
}
