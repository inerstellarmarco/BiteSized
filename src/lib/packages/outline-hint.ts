/** Page that reads Word, HTML, Google Doc, and plain-text outlines. */
export const IMPORT_OUTLINE_PATH = "/admin/import";
export const IMPORT_OUTLINE_TITLE = "Import a Google Doc";

const OUTLINE_FILE = /\.(docx|html?|txt)$/i;

export function looksLikeOutlineFile(name: string): boolean {
  const base = (name.split(/[/\\]/).pop() ?? name).trim();
  return OUTLINE_FILE.test(base);
}

function outlineDestination(): string {
  return `Word and Google Doc outlines go on the ${IMPORT_OUTLINE_TITLE} page (${IMPORT_OUTLINE_PATH}).`;
}

export function notACoursePackageMessage(): string {
  return `This is not a course package (no index.json inside). Packages are the ZIP files this app exports. ${outlineDestination()}`;
}

export function outlineFileMessage(fileName: string): string {
  return `${fileName} is a Word, HTML, or text outline, not a course package. ${outlineDestination()}`;
}
