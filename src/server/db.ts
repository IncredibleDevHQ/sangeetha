import { PGlite } from "@electric-sql/pglite";
import { Pool, type PoolClient } from "pg";
import { readFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";

export interface Executor {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}
export interface Database extends Executor {
  transaction<T>(work: (tx: Executor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export function postgresDatabase(url: string): Database {
  const pool = new Pool({ connectionString: url, max: 5 });
  return {
    query: (sql, params) => pool.query(sql, params),
    async transaction(work) {
      const client: PoolClient = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
export function localDatabase(directory?: string): Database {
  const client = new PGlite(directory);
  return {
    query: (sql, params) => client.query(sql, params),
    transaction: (work) =>
      client.transaction((tx) =>
        work({ query: (sql, params) => tx.query(sql, params) }),
      ),
    close: () => client.close(),
  };
}
export async function migrate(db: Database) {
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(42819017)");
    await tx.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    for (const name of (await readdir(path.join(process.cwd(), "migrations")))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      const found = await tx.query(
        "SELECT name FROM schema_migrations WHERE name = $1",
        [name],
      );
      if (found.rows.length) continue;
      const sql = await readFile(
        path.join(process.cwd(), "migrations", name),
        "utf8",
      );
      // pg prepared queries reject multi-statement commands; this migration has no procedural blocks.
      for (const statement of sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean))
        await tx.query(statement);
      await tx.query("INSERT INTO schema_migrations(name) VALUES ($1)", [name]);
    }
  });
}
const globalDb = globalThis as typeof globalThis & {
  sangeethaDb?: Promise<Database>;
};
export async function database() {
  if (!globalDb.sangeethaDb)
    globalDb.sangeethaDb = (async () => {
      let db: Database;
      if (process.env.DATABASE_URL)
        db = postgresDatabase(process.env.DATABASE_URL);
      else {
        if (process.env.NODE_ENV === "production")
          throw new Error("DATABASE_URL is required in production.");
        const dir =
          process.env.LOCAL_DATABASE_PATH ||
          path.join(process.cwd(), ".data", "development");
        await mkdir(dir, { recursive: true });
        db = localDatabase(dir);
      }
      if (process.env.NODE_ENV !== "production") await migrate(db);
      return db;
    })();
  return globalDb.sangeethaDb;
}
