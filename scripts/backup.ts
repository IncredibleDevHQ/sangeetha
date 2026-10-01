import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { database, migrate } from "../src/server/db";
import { snapshot, restore } from "../src/server/backup";
async function main() {
  const [action, file] = process.argv.slice(2);
  if (!["create", "restore"].includes(action) || !file)
    throw Error(
      "Usage: npm run backup -- create|restore /absolute/path/backup.json",
    );
  const db = await database();
  try {
    if (action === "create") {
      await writeFile(file, await snapshot(db), { mode: 0o600, flag: "wx" });
      console.log(
        "Database snapshot created. Back up private media separately.",
      );
    } else {
      await migrate(db);
      console.log(await restore(db, await readFile(file, "utf8")));
      console.log(
        "Restore complete. Sessions were excluded; all users must sign in again. Restore media to its original storage keys.",
      );
    }
  } finally {
    await db.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
