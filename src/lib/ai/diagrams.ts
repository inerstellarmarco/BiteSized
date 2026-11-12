const DIAGRAM_START = /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|pie|mindmap)\b/;

export function validateMermaid(source: string): { ok: boolean; reason: string } {
  const text = source.trim();
  if (!text) return { ok: false, reason: "The diagram was empty." };
  if (text.includes("```")) return { ok: false, reason: "The diagram included a code fence." };
  if (!DIAGRAM_START.test(text)) return { ok: false, reason: "The diagram did not start with a Mermaid type." };
  const opens = (text.match(/[[{(]/g) ?? []).length;
  const closes = (text.match(/[\]})]/g) ?? []).length;
  if (opens !== closes) return { ok: false, reason: "The diagram brackets do not balance, so it would not render." };
  return { ok: true, reason: "" };
}
