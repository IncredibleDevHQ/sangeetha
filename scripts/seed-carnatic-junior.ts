import { readFile } from "node:fs/promises";
import { database } from "../src/server/db";
import { LearningService, chunkSize } from "../src/server/school/learning";
import type { Context } from "../src/server/school/shared";

// Explicit local demo command. Stop the local API before opening its PGlite database.
async function main() {
  if (process.env.NODE_ENV === "production" || process.env.DATABASE_URL)
    throw Error(
      "This demo seed is restricted to the local development database.",
    );
  const db = await database();
  try {
    const owners = (
      await db.query<{ school_id: string; account_id: string }>(
        "SELECT school_id,account_id FROM memberships WHERE role='owner' AND revoked_at IS NULL ORDER BY school_id,account_id LIMIT 2",
      )
    ).rows;
    if (owners.length !== 1)
      throw Error("Demo seed requires exactly one local school owner.");
    // Trusted local seed context; no login token is created or persisted.
    const c = {
      schoolId: owners[0].school_id,
      session: { accountId: owners[0].account_id },
    } as Context;
    const learning = new LearningService(db);
    const notes = await readFile(
      "demo/carnatic-junior/music-notes.txt",
      "utf8",
    );
    const demoCues = [
      "S",
      "R₁",
      "G₃",
      "M₁",
      "P",
      "D₁",
      "N₃",
      "Ṡ",
      "Ṡ",
      "N₃",
      "D₁",
      "P",
      "M₁",
      "G₃",
      "R₁",
      "S",
    ].map((note, i) => ({
      note,
      start: i * 0.5,
      end: (i + 1) * 0.5,
      beat: String((i % 8) + 1),
    }));
    const lessons = [
      {
        title: "Welcome: listen, sing, practise",
        module: "Getting started",
        instructions:
          "Demo lesson. Find a comfortable seated posture and a pitch that suits your voice with your teacher. Listen first, then sing a gentle, steady Sa. Work through these four lessons at your own pace. The synthetic audio is only a reference; it does not teach vocal technique or gamaka.",
        notes:
          "Practice routine\n1. Listen carefully.\n2. Repeat with your teacher.\n3. Practise slowly.\n4. Move on when you feel ready.",
        files: ["music-notes.txt"],
      },
      {
        title: "Meet the seven swaras",
        module: "Swara foundations",
        instructions:
          "Demo lesson. Listen to the synthesized ascending and descending scale. Say the swara names slowly, then practise singing with your teacher. The fixed-pitch, equal-tempered sample is not a substitute for your teacher’s intonation and ornamentation.",
        notes:
          "Mayamalavagowla reference\nS R1 G3 M1 | P D1 N3 S (upper)\nS (upper) N3 D1 P | M1 G3 R1 S\n\nShort names: Sa Ri Ga Ma Pa Da Ni",
        files: ["swara-demo.wav", "music-notes.txt"],
      },
      {
        title: "Keep an eight-count pulse",
        module: "Rhythm foundations",
        instructions:
          "Demo lesson. Watch the eight boxes light up from left to right, one per second. Count 1 to 8 evenly, then repeat. This silent animation is a counting aid; ask your teacher to demonstrate the Adi tala hand gestures.",
        notes:
          "Adi tala: 4 + 2 + 2\nCounts: 1 2 3 4 | 5 6 | 7 8\nMaintain the same pace throughout.",
        files: ["eight-count-demo.mp4"],
      },
      {
        title: "First swara practice",
        module: "Putting it together",
        instructions:
          "Demo lesson. Practise the ascending and descending pattern slowly, one swara per count. Repeat each direction three times with a steady pulse. Use the notes and reference audio, and ask your teacher before increasing speed.",
        notes: notes,
        files: ["swara-demo.wav", "music-notes.txt"],
      },
    ];
    for (const [index, lesson] of lessons.entries()) {
      const existing = (
        await db.query<{ id: string }>(
          "SELECT id FROM curriculum_lessons WHERE school_id=$1 AND curriculum='Carnatic Junior' AND position=$2",
          [c.schoolId, index + 1],
        )
      ).rows[0];
      const { id } =
        existing ||
        (await learning.createLesson(c, {
          curriculum: "Carnatic Junior",
          position: index + 1,
          title: lesson.title,
          module: lesson.module,
          level: "Beginner",
          raga: index === 1 || index === 3 ? "Mayamalavagowla" : "",
          tala: index >= 2 ? "Adi" : "",
          instructions: lesson.instructions,
          musicNotes: lesson.notes,
          published: false,
        }));
      for (const filename of lesson.files) {
        const found = (
          await db.query(
            "SELECT id FROM media_assets WHERE school_id=$1 AND lesson_id=$2 AND filename=$3 AND status='ready'",
            [c.schoolId, id, filename],
          )
        ).rows;
        if (found.length) {
          if (filename.endsWith(".wav"))
            await learning.saveScore(c, String(found[0].id), {
              cues: demoCues,
            });
          continue;
        }
        const bytes = await readFile("demo/carnatic-junior/" + filename);
        const mime = filename.endsWith(".wav")
          ? "audio/wav"
          : filename.endsWith(".mp4")
            ? "video/mp4"
            : "text/plain";
        const asset = await learning.reserve(c, {
          lesson: id,
          filename,
          mime,
          bytes: bytes.length,
        });
        for (let part = 0; part < asset.chunks; part++)
          await learning.chunk(c, asset.id, {
            part,
            data: bytes
              .subarray(part * chunkSize, (part + 1) * chunkSize)
              .toString("base64"),
          });
        await learning.finalize(c, asset.id);
        if (filename.endsWith(".wav"))
          await learning.saveScore(c, asset.id, { cues: demoCues });
      }
      if (!existing) await learning.publish(c, id, true);
    }
    console.log(
      "Carnatic Junior: four demo lessons with private audio, video and music notes are available.",
    );
  } finally {
    await db.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
