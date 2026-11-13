// Merges the written cards in content/course/source into the course package
// in content/course/package.
//
//   npm run course:build                 merge and report
//   npm run course:build -- --zip <dir>  also write import zips into <dir>
//   npm run course:build -- --skeleton <dir>  write one outline text file per module
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { strToU8, zipSync } from "fflate";
import { applySource, parseBiteSource, type SubLessonFile } from "../src/lib/packages/bite-source";

type IndexFile = {
  categories: {
    id: string;
    code: string;
    title: string;
    subCategories: {
      code: string;
      title: string;
      lessons: { code: string; title: string; subLessons: { id: string; title: string; file: string }[] }[];
    }[];
  }[];
};

const root = path.join(process.cwd(), "content", "course");
const packageDir = path.join(root, "package");
const sourceDir = path.join(root, "source");

function argAfter(flag: string): string | null {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? (process.argv[at + 1] ?? null) : null;
}

async function main() {
  const indexText = await readFile(path.join(packageDir, "index.json"), "utf8");
  const index = JSON.parse(indexText) as IndexFile;
  const fileOf = new Map<string, string>();
  for (const category of index.categories) {
    for (const subCategory of category.subCategories) {
      for (const lesson of subCategory.lessons) {
        for (const subLesson of lesson.subLessons) fileOf.set(subLesson.id, subLesson.file);
      }
    }
  }

  const sourceFiles = (await readdir(sourceDir)).filter((name) => name.endsWith(".txt")).sort();
  const seen = new Set<string>();
  for (const name of sourceFiles) {
    const text = await readFile(path.join(sourceDir, name), "utf8");
    for (const written of parseBiteSource(text, name)) {
      if (seen.has(written.id)) throw new Error(`${name}:${written.line} ${written.id} is written twice`);
      seen.add(written.id);
      const file = fileOf.get(written.id);
      if (!file) throw new Error(`${name}:${written.line} ${written.id} is not in the outline`);
      const target = path.join(packageDir, file);
      const current = JSON.parse(await readFile(target, "utf8")) as SubLessonFile;
      await writeFile(target, JSON.stringify(applySource(current, written, name), null, 2));
    }
  }

  const files: Record<string, string> = { "index.json": indexText };
  let bites = 0;
  let empty = 0;
  let questions = 0;
  const emptySubLessons: string[] = [];
  for (const [id, file] of fileOf) {
    const text = await readFile(path.join(packageDir, file), "utf8");
    files[file] = text;
    const data = JSON.parse(text) as SubLessonFile;
    let missing = 0;
    for (const bite of data.bites) {
      bites += 1;
      questions += bite.questions.length;
      if (!bite.body.trim()) missing += 1;
    }
    empty += missing;
    if (missing > 0) emptySubLessons.push(id);
  }
  console.log(`${fileOf.size} sub-lessons, ${bites} bites, ${bites - empty} written, ${empty} still empty, ${questions} questions`);
  console.log(`${emptySubLessons.length} sub-lessons still have an empty bite`);

  const skeletonDir = argAfter("--skeleton");
  if (skeletonDir) {
    await mkdir(skeletonDir, { recursive: true });
    for (const category of index.categories) {
      for (const subCategory of category.subCategories) {
        const out: string[] = [`// ${subCategory.code} ${subCategory.title}`];
        for (const lesson of subCategory.lessons) {
          for (const subLesson of lesson.subLessons) {
            const data = JSON.parse(files[subLesson.file]) as SubLessonFile;
            out.push(`@@ ${subLesson.id} | ${lesson.title} > ${subLesson.title}`);
            for (const bite of data.bites) out.push(`## ${bite.title}${bite.body.trim() ? "   // HAS BODY" : ""}`);
          }
        }
        await writeFile(path.join(skeletonDir, `${subCategory.code}.txt`), out.join("\n"));
      }
    }
  }

  const zipDir = argAfter("--zip");
  if (zipDir) {
    await mkdir(zipDir, { recursive: true });
    const pack = (entries: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(entries).map(([name, text]) => [name, strToU8(text)])));
    await writeFile(path.join(zipDir, "bite-sized-course-full.zip"), pack(files));
    for (const category of index.categories) {
      const part: Record<string, string> = {
        "index.json": JSON.stringify({ ...JSON.parse(indexText), categories: [category] }, null, 2),
      };
      for (const subCategory of category.subCategories) {
        for (const lesson of subCategory.lessons) {
          for (const subLesson of lesson.subLessons) part[subLesson.file] = files[subLesson.file];
        }
      }
      await writeFile(path.join(zipDir, `bite-sized-course-part-${category.code || category.id}.zip`), pack(part));
    }
    console.log(`zips written to ${zipDir}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
