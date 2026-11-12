import { createDatabase } from "../src/lib/db/index";
import { importPackageFromDir } from "../src/lib/packages/io";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const from = arg("from");
  if (!from) {
    console.error("Usage: npm run restore -- --from backups/<stamp>");
    process.exit(1);
  }
  const opened = await createDatabase({ seed: false });
  try {
    await importPackageFromDir(opened.db, from, {
      replace: true,
      includeLearners: true,
      includeHistory: true,
    });
    console.log(`Restored from ${from}. Everyone needs to sign in again.`);
  } finally {
    await opened.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
