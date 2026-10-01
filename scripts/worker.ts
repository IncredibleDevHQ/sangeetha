import "dotenv/config";
import { database } from "../src/server/db";
import {
  dispatchMessages,
  AutomationService,
} from "../src/server/school/automation";
import type { Context } from "../src/server/school/shared";
async function main() {
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_LOCAL_WORKER !== "1"
  )
    throw Error(
      "Local delivery worker is disabled. Use mocks for development.",
    );
  const db = await database();
  try {
    const schools = (
      await db.query<{ school_id: string; account_id: string }>(
        "SELECT s.school_id,m.account_id FROM school_integrations s JOIN memberships m ON m.school_id=s.school_id AND m.role='owner' AND m.revoked_at IS NULL WHERE s.automated_messages",
      )
    ).rows;
    for (const school of schools) {
      const context = {
        schoolId: school.school_id,
        session: { accountId: school.account_id } as Context["session"],
      };
      await new AutomationService(db).refresh(context);
    }
    console.log(await dispatchMessages(db));
  } finally {
    await db.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
