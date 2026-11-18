import { describe, expect, it } from "vitest";
import { isSchemaReady, MIGRATION_LOCK_KEY, migrateWithLock, resolvePostgresEnv } from "@/lib/db";
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
      unsafe: async () => [{ has_jobs: true, has_ingest: true, has_col: true }],
    };
    const unreadyClient = {
      unsafe: async () => [{ has_jobs: false, has_ingest: false, has_col: false }],
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

  it("resolves pooled and unpooled Neon connection strings via @neon/env parseEnv", () => {
    const prevPooled = process.env.DATABASE_URL;
    const prevUnpooled = process.env.DATABASE_URL_UNPOOLED;
    try {
      process.env.DATABASE_URL = "postgresql://user:pass@ep-example-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require";
      process.env.DATABASE_URL_UNPOOLED = "postgresql://user:pass@ep-example.us-east-2.aws.neon.tech/neondb?sslmode=require";
      expect(resolvePostgresEnv()).toEqual({
        databaseUrl: "postgresql://user:pass@ep-example-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require",
        databaseUrlUnpooled: "postgresql://user:pass@ep-example.us-east-2.aws.neon.tech/neondb?sslmode=require",
      });

      delete process.env.DATABASE_URL_UNPOOLED;
      expect(resolvePostgresEnv()).toEqual({
        databaseUrl: "postgresql://user:pass@ep-example-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require",
        databaseUrlUnpooled: null,
      });

      delete process.env.DATABASE_URL;
      expect(resolvePostgresEnv()).toEqual({
        databaseUrl: null,
        databaseUrlUnpooled: null,
      });
    } finally {
      if (prevPooled === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prevPooled;
      if (prevUnpooled === undefined) delete process.env.DATABASE_URL_UNPOOLED;
      else process.env.DATABASE_URL_UNPOOLED = prevUnpooled;
    }
  });
});
