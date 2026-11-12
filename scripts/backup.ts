import { spawnSync } from "child_process";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { createDatabase } from "../src/lib/db/index";
import { exportPackageToDir } from "../src/lib/packages/io";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const root = arg("out") || process.env.BACKUP_EXTERNAL_DIR || path.join(process.cwd(), "backups");
  const dest = path.join(root, stamp);
  await mkdir(dest, { recursive: true });
  const opened = await createDatabase({ seed: true });
  try {
    await exportPackageToDir(opened.db, dest, {
      includeLearners: true,
      includeHistory: true,
      includeArchived: true,
    });
    const note = path.join(dest, "README.txt");
    if (process.env.DATABASE_URL) {
      const dumpPath = path.join(dest, "database.sql");
      const dump = spawnSync("pg_dump", ["--dbname", process.env.DATABASE_URL, "--file", dumpPath, "--no-owner"], {
        encoding: "utf8",
      });
      if (dump.status === 0) {
        await writeFile(note, "JSON package plus database.sql from pg_dump. Store this folder outside the database provider.\n");
      } else {
        await writeFile(
          note,
          "pg_dump did not run. The JSON package in this folder is still a full backup (course, progress, PIN hashes, history).\n" +
            (dump.stderr || dump.error?.message || "") +
            "\n",
        );
      }
    } else {
      await writeFile(
        note,
        "Local PGlite backup. This folder is the copy that lives outside the database files. It includes the course, learner progress, PIN hashes, and edit history. On Neon, set DATABASE_URL and install postgresql-client so pg_dump also writes database.sql.\n",
      );
    }
    console.log(dest);
  } finally {
    await opened.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
