import "server-only";

import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { MIGRATION_SQL } from "@/lib/headcount/db/migrationSql";
import * as schema from "@/lib/headcount/db/schema";
import { seedIfEmpty } from "@/lib/headcount/db/seed";

export type AppDatabase = PgliteDatabase<typeof schema>;

let singleton: Promise<AppDatabase> | null = null;

function statements(sql: string): string[] {
  return sql
    .split(/;\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

async function migrateSql(run: (statement: string) => Promise<unknown>) {
  for (const statement of statements(MIGRATION_SQL)) await run(statement);
}

export async function createMemoryDb(): Promise<AppDatabase> {
  const client = new PGlite();
  await client.exec(MIGRATION_SQL);
  return drizzlePglite(client, { schema });
}

async function open(): Promise<AppDatabase> {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const sql = postgres(url, { max: 1 });
    await migrateSql((statement) => sql.unsafe(statement));
    const db = drizzlePostgres(sql, { schema }) as unknown as AppDatabase;
    await seedIfEmpty(db);
    return db;
  }
  const client = new PGlite();
  await client.exec(MIGRATION_SQL);
  const db = drizzlePglite(client, { schema });
  await seedIfEmpty(db);
  return db;
}

/** 没有 DATABASE_URL 时用进程内的 PGlite。演示写入只活在当前实例里。 */
export function getDb(): Promise<AppDatabase> {
  if (!singleton) singleton = open();
  return singleton;
}
