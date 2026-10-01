import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { localDatabase, migrate } from "../src/server/db";
import { AdminService, provisionOwner } from "../src/server/admin-service";
import { CrmService } from "../src/server/school/crm";
import { LearningService } from "../src/server/school/learning";
async function main() {
  const db = localDatabase(),
    dir = await mkdtemp(tmpdir() + "/sangeetha-runtime-");
  process.env.MEDIA_PATH = dir;
  try {
    await migrate(db);
    const schoolId = await provisionOwner(
        db,
        "Audio runtime test",
        "email",
        "audio@example.test",
        "audio-runtime",
      ),
      auth = new AdminService(db),
      uid = "local|email:audio@example.test",
      login = await auth.login(
        {
          uid,
          name: "Audio test",
          authTime: Date.now() / 1000,
          email: "audio@example.test",
          emailVerified: true,
          identities: [
            { provider: "google.com", uid, label: "audio@example.test" },
          ],
        },
        "Runtime test",
      ),
      c = { schoolId, session: (await auth.session(login.token))! },
      h = await new CrmService(db).create(c, {
        name: "Test household",
        primary: 0,
        people: [
          {
            name: "Test learner",
            phone: "+12025550123",
            relationship: "Member",
            learner: true,
            level: "Beginner",
          },
        ],
      });
    const bytes = Buffer.alloc(32044);
    bytes.write("RIFF");
    bytes.writeUInt32LE(bytes.length - 8, 4);
    bytes.write("WAVEfmt ", 8);
    bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20);
    bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(8000, 24);
    bytes.writeUInt32LE(16000, 28);
    bytes.writeUInt16LE(2, 32);
    bytes.writeUInt16LE(16, 34);
    bytes.write("data", 36);
    bytes.writeUInt32LE(bytes.length - 44, 40);
    for (let i = 0; i < 16000; i++)
      bytes.writeInt16LE(
        Math.round(1500 * Math.sin((2 * Math.PI * 261.6 * i) / 8000)),
        44 + i * 2,
      );
    const learning = new LearningService(db),
      asset = await learning.reserve(c, {
        learner: h.learners[0],
        filename: "tone.wav",
        mime: "audio/wav",
        bytes: bytes.length,
      });
    await learning.chunk(c, asset.id, {
      part: 0,
      data: bytes.toString("base64"),
    });
    assert.equal((await learning.finalize(c, asset.id)).durationMs, 2000);
    assert.deepEqual((await learning.readAsset(c, asset.id)).bytes, bytes);
    console.log("Development runtime audio finalization passed.");
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
