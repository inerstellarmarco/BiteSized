import { createDatabase } from "../src/lib/db/index";

async function main() {
  const opened = await createDatabase({ seed: false });
  console.log("Migrations applied.");
  await opened.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
