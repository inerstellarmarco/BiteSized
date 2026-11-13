import { describe, expect, it } from "vitest";
import { MIGRATION_LOCK_KEY, migrateWithLock } from "@/lib/db";
import { MIGRATION_SQL } from "@/lib/db/sql";

describe("migration lock", () => {
  it("takes the advisory lock inside one transaction before running the migration SQL", async () => {
    const events: string[] = [];
    const tx = {
      unsafe: async (query: string) => {
        events.push(query);
        return [];
      },
    };
    const client = {
      begin: async (run: (sql: typeof tx) => Promise<unknown>) => {
        events.push("BEGIN");
        try {
          await run(tx);
          events.push("COMMIT");
        } catch (error) {
          events.push("ROLLBACK");
          throw error;
        }
      },
    };

    await migrateWithLock(client as never);

    expect(events).toEqual(["BEGIN", `SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`, MIGRATION_SQL, "COMMIT"]);
  });

  it("lets a failing migration roll back (releasing the lock) and reports the error", async () => {
    const client = {
      begin: async (run: (sql: { unsafe: (query: string) => Promise<unknown> }) => Promise<unknown>) =>
        run({
          unsafe: async (query: string) => {
            if (query === MIGRATION_SQL) throw new Error("boom");
            return [];
          },
        }),
    };
    await expect(migrateWithLock(client as never)).rejects.toThrow("boom");
  });
});
