import type { PgliteDatabase } from "drizzle-orm/pglite";
import type * as schema from "@/lib/db/schema";

export type AppDatabase = PgliteDatabase<typeof schema>;
