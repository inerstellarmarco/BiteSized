import { createDatabase, resolvePostgresEnv } from "../src/lib/db/index";

async function main() {
  const { databaseUrl, databaseUrlUnpooled } = resolvePostgresEnv();
  const opened = await createDatabase({
    databaseUrl: databaseUrlUnpooled ?? databaseUrl,
    databaseUrlUnpooled,
    seed: false,
  });
  console.log("Migrations applied.");
  await opened.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
