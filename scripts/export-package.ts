import { createDatabase } from "../src/lib/db/index";
import { exportPackageToDir } from "../src/lib/packages/io";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const out = arg("out") ?? "course-export";
  const opened = await createDatabase({ seed: true });
  try {
    await exportPackageToDir(opened.db, out, {
      includeLearners: false,
      includeHistory: false,
      includeArchived: false,
    });
    console.log(out);
  } finally {
    await opened.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
