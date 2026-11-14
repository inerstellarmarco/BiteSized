import { describe, expect, it } from "vitest";
import { isSchemaReady, MIGRATION_LOCK_KEY, migrateWithLock } from "@/lib/db";
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

  it("detects when the schema is already migrated so cold starts skip DDL locks", async () => {
    const readyClient = {
      unsafe: async () => [{ has_jobs: true, has_col: true }],
    };
    const unreadyClient = {
      unsafe: async () => [{ has_jobs: false, has_col: false }],
    };
    const failingClient = {
      unsafe: async () => {
        throw new Error("connection hiccup");
      },
    };
    expect(await isSchemaReady(readyClient as never)).toBe(true);
    expect(await isSchemaReady(unreadyClient as never)).toBe(false);
    expect(await isSchemaReady(failingClient as never)).toBe(false);
  });
});
