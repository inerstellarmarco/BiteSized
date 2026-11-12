import { createDatabase } from "../src/lib/db/index";

async function main() {
  const opened = await createDatabase({ seed: true });
  console.log("Seed checked. An empty database now has the A1 package and the first admin.");
  await opened.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
