import { createHash } from "node:crypto";
import { z } from "zod";
import type { Database, Executor } from "./db";
const excluded = new Set(["sessions", "auth_flows", "request_limits"]);
async function tables(tx: Executor) {
  return (
    await tx.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).rows
    .map((r) => r.tablename)
    .filter((t) => !excluded.has(t));
}
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
export async function snapshot(db: Database) {
  return db.transaction(async (tx) => {
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    const records: Record<string, unknown[]> = {};
    for (const table of await tables(tx))
      records[table] = (await tx.query("SELECT * FROM " + quote(table))).rows;
    const payload = JSON.stringify({
      version: 1,
      createdAt: new Date().toISOString(),
      records,
    });
    return JSON.stringify({
      sha256: createHash("sha256").update(payload).digest("hex"),
      payload,
    });
  });
}
export async function restore(db: Database, input: string) {
  const envelope = z
    .object({ sha256: z.string(), payload: z.string() })
    .parse(JSON.parse(input));
  if (
    createHash("sha256").update(envelope.payload).digest("hex") !==
    envelope.sha256
  )
    throw Error("Backup checksum mismatch.");
  const data = z
    .object({
      version: z.literal(1),
      createdAt: z.string(),
      records: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
    })
    .parse(JSON.parse(envelope.payload));
  await db.transaction(async (tx) => {
    const names = await tables(tx);
    if (
      JSON.stringify(names) !== JSON.stringify(Object.keys(data.records).sort())
    )
      throw Error(
        "Backup schema differs from target. Use the matching application version.",
      );
    for (const name of names) {
      if (name === "schema_migrations") continue;
      const count = (
        await tx.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM " + quote(name),
        )
      ).rows[0].n;
      if (count)
        throw Error("Restore requires an empty, migrated target database.");
    }
    const current = (
      await tx.query<{ name: string }>(
        "SELECT name FROM schema_migrations ORDER BY name",
      )
    ).rows.map((r) => r.name);
    if (
      JSON.stringify(current) !==
      JSON.stringify(data.records.schema_migrations.map((r) => r.name).sort())
    )
      throw Error("Backup migration versions differ.");
    const edges = (
      await tx.query<{ source: string; target: string }>(
        "SELECT c.conrelid::regclass::text AS source,c.confrelid::regclass::text AS target FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE c.contype='f' AND NOT c.condeferrable AND n.nspname='public'",
      )
    ).rows;
    const done = new Set(["schema_migrations", ...excluded]),
      pending = new Set(names.filter((n) => n !== "schema_migrations"));
    await tx.query("SET CONSTRAINTS ALL DEFERRED");
    while (pending.size) {
      const ready = [...pending].filter((n) =>
        edges
          .filter((e) => e.source === n && e.target !== n)
          .every((e) => done.has(e.target)),
      );
      if (!ready.length)
        throw Error("Backup has a cyclic immediate foreign key dependency.");
      for (const name of ready) {
        if (data.records[name].length)
          await tx.query(
            "INSERT INTO " +
              quote(name) +
              " SELECT * FROM jsonb_populate_recordset(NULL::" +
              quote(name) +
              ",$1::jsonb)",
            [JSON.stringify(data.records[name])],
          );
        pending.delete(name);
        done.add(name);
      }
    }
  });
  return {
    createdAt: data.createdAt,
    tables: Object.keys(data.records).length,
  };
}
