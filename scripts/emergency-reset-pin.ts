import { emergencyResetPin } from "../src/lib/auth/profiles";
import { createDatabase } from "../src/lib/db/index";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const name = arg("name");
  const pin = arg("pin");
  if (!name || !pin) {
    console.error('Usage: npm run emergency-reset -- --name "Eric" --pin "a-new-passphrase"');
    process.exit(1);
  }
  const opened = await createDatabase({ seed: true });
  try {
    const id = await emergencyResetPin(opened.db, name, pin);
    console.log(`Reset the PIN for profile ${id} (${name}). Lockout cleared. The old PIN no longer works.`);
  } finally {
    await opened.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
