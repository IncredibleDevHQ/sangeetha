import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { SchoolAccess, activity, type Context } from "./shared";
import { AccessError } from "../admin-service";
export const chunkSize = 262144;
export class PrivateStorage {
  root = path.resolve(process.env.MEDIA_PATH || ".data/media");
  private location(key: string) {
    if (!/^[a-zA-Z0-9/-]+$/.test(key)) throw Error("Invalid object key");
    return path.join(this.root, key);
  }
  async put(key: string, bytes: Buffer, mime: string) {
    if (process.env.MEDIA_S3_BUCKET) {
      await new S3Client({
        region: process.env.AWS_REGION || "ap-south-1",
      }).send(
        new PutObjectCommand({
          Bucket: process.env.MEDIA_S3_BUCKET,
          Key: key,
          Body: bytes,
          ContentType: mime,
          ServerSideEncryption: "AES256",
        }),
      );
    } else {
      if (
        process.env.NODE_ENV === "production" &&
        process.env.MEDIA_STORAGE !== "filesystem"
      )
        throw new AccessError(
          "Private media storage has not been configured.",
          503,
        );
      const file = this.location(key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file + ".tmp", bytes);
      await rename(file + ".tmp", file);
    }
  }
  async get(key: string) {
    if (process.env.MEDIA_S3_BUCKET) {
      const r = await new S3Client({
        region: process.env.AWS_REGION || "ap-south-1",
      }).send(
        new GetObjectCommand({ Bucket: process.env.MEDIA_S3_BUCKET, Key: key }),
      );
      if (!r.Body) throw Error("Media unavailable");
      return Buffer.from(await r.Body.transformToByteArray());
    }
    return readFile(this.location(key));
  }
}
export class LearningService extends SchoolAccess {
  storage = new PrivateStorage();
  async lessonAccess(c: Context, id: string, write = false) {
    const r = await this.db.query<{
      batch_id: string;
      published: boolean;
      level: string;
    }>(
      "SELECT batch_id,published,level FROM curriculum_lessons WHERE school_id=$1 AND id=$2",
      [c.schoolId, id],
    );
    const lesson = r.rows[0];
    if (!lesson) throw new AccessError("Lesson not found.", 404);
    if (await this.can(c, "curriculum.manage")) return;
    if (
      lesson.batch_id &&
      (await this.can(c, "classes.teach", "batch", lesson.batch_id))
    )
      return;
    if (write || !lesson.published)
      throw new AccessError("Lesson access is required.");
    const allowed = await this.db.query(
      "SELECT g.id FROM school_grants g JOIN learners l ON l.school_id=g.school_id AND l.id=g.resource_id WHERE g.school_id=$1 AND g.account_id=$2 AND g.capability='portal.learn' AND g.resource_type='learner' AND g.revoked_at IS NULL AND (($3::uuid IS NULL AND l.level=$4) OR EXISTS(SELECT 1 FROM enrollments e WHERE e.school_id=l.school_id AND e.learner_id=l.id AND e.batch_id=$3 AND e.status='active'))",
      [c.schoolId, c.session.accountId, lesson.batch_id, lesson.level],
    );
    if (!allowed.rows.length)
      throw new AccessError("Lesson access is required.");
  }
  async saveScore(c: Context, id: string, input: unknown) {
    const b = z
      .object({
        cues: z
          .array(
            z.object({
              start: z.number().finite().min(0),
              end: z.number().finite().positive(),
              note: z.string().trim().min(1).max(120),
              beat: z.string().trim().max(40).optional(),
              barStart: z.boolean().optional(),
            }),
          )
          .max(2000),
      })
      .parse(input);
    const asset = (
      await this.db.query<{
        lesson_id: string;
        mime: string;
        status: string;
        duration_ms: number;
      }>(
        "SELECT lesson_id,mime,status,duration_ms FROM media_assets WHERE school_id=$1 AND id=$2",
        [c.schoolId, id],
      )
    ).rows[0];
    if (!asset?.lesson_id)
      throw new AccessError("Lesson recording not found.", 404);
    await this.lessonAccess(c, asset.lesson_id, true);
    if (
      asset.status !== "ready" ||
      !asset.mime.startsWith("audio/") ||
      !asset.duration_ms
    )
      throw new AccessError("Choose a ready audio recording.", 400);
    let previousEnd = 0;
    for (const cue of b.cues) {
      if (
        cue.start < previousEnd ||
        cue.end <= cue.start ||
        cue.end > Number(asset.duration_ms) / 1000
      )
        throw new AccessError(
          "Notes must be ordered, non-overlapping and within the recording duration.",
          400,
        );
      previousEnd = cue.end;
    }
    await this.db.transaction(async (tx) => {
      await tx.query(
        "UPDATE media_assets SET note_cues=$1::jsonb WHERE school_id=$2 AND id=$3",
        [JSON.stringify(b.cues), c.schoolId, id],
      );
      await activity(tx, c, "lesson.score.updated", {
        assetId: id,
        notes: b.cues.length,
      });
    });
  }
  async createLesson(c: Context, input: unknown) {
    const b = z
      .object({
        curriculum: z.string().trim().min(1).max(120).default("Lesson library"),
        position: z.number().int().min(1).max(10000).default(1),
        musicNotes: z.string().max(20000).default(""),
        category: z.string().trim().min(1).max(120).default("General"),
        categoryPosition: z.number().int().min(1).max(10000).default(1),
        blockPosition: z.number().int().min(1).max(10000).default(1),
        level: z.string().min(1).max(80),
        module: z.string().min(1).max(100),
        title: z.string().min(1).max(150),
        raga: z.string().max(100).default(""),
        tala: z.string().max(100).default(""),
        instructions: z.string().max(5000).default(""),
        batch: z.string().uuid().optional(),
        published: z.boolean().default(false),
      })
      .parse(input);
    if (!(await this.can(c, "curriculum.manage"))) {
      if (!b.batch) throw new AccessError("Select an assigned batch.");
      await this.require(c, "classes.teach", "batch", b.batch);
    }
    if (b.batch) await this.exists(this.db, c, "batches", b.batch);
    const id = randomUUID();
    await this.db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO curriculum_lessons(school_id,id,level,module,title,raga,tala,instructions,batch_id,published,curriculum,position,music_notes,category,category_position,block_position) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)",
        [
          c.schoolId,
          id,
          b.level,
          b.module,
          b.title,
          b.raga,
          b.tala,
          b.instructions,
          b.batch || null,
          b.published,
          b.curriculum,
          b.position,
          b.musicNotes,
          b.category,
          b.categoryPosition,
          b.blockPosition,
        ],
      );
      await activity(tx, c, "lesson.created", { lessonId: id });
    });
    return { id };
  }
  async updateLesson(c: Context, id: string, input: unknown) {
    await this.lessonAccess(c, id, true);
    const b = z
      .object({
        title: z.string().trim().min(1).max(150),
        curriculum: z.string().trim().min(1).max(120),
        position: z.number().int().min(1).max(10000),
        instructions: z.string().max(5000),
        musicNotes: z.string().max(20000),
        category: z.string().trim().min(1).max(120).optional(),
        categoryPosition: z.number().int().min(1).max(10000).optional(),
        module: z.string().trim().min(1).max(100).optional(),
        blockPosition: z.number().int().min(1).max(10000).optional(),
        raga: z.string().max(100).optional(),
        tala: z.string().max(100).optional(),
      })
      .parse(input);
    await this.db.transaction(async (tx) => {
      await tx.query(
        "UPDATE curriculum_lessons SET title=$1,curriculum=$2,position=$3,instructions=$4,music_notes=$5,raga=COALESCE($8,raga),tala=COALESCE($9,tala),category=COALESCE($10,category),category_position=COALESCE($11,category_position),module=COALESCE($12,module),block_position=COALESCE($13,block_position) WHERE school_id=$6 AND id=$7",
        [
          b.title,
          b.curriculum,
          b.position,
          b.instructions,
          b.musicNotes,
          c.schoolId,
          id,
          b.raga ?? null,
          b.tala ?? null,
          b.category ?? null,
          b.categoryPosition ?? null,
          b.module ?? null,
          b.blockPosition ?? null,
        ],
      );
      await activity(tx, c, "lesson.updated", { lessonId: id });
    });
  }
  async completeLesson(c: Context, input: unknown) {
    const b = z
      .object({
        lesson: z.string().uuid(),
        learner: z.string().uuid(),
        completed: z.boolean(),
      })
      .parse(input);
    await this.require(c, "portal.learn", "learner", b.learner);
    // Check this particular learner, rather than another learner on the same family account.
    const eligible = await this.db.query(
      "SELECT 1 FROM curriculum_lessons l JOIN learners s ON s.school_id=l.school_id AND s.id=$3 WHERE l.school_id=$1 AND l.id=$2 AND l.published=true AND ((l.batch_id IS NULL AND l.level=s.level) OR EXISTS(SELECT 1 FROM enrollments e WHERE e.school_id=l.school_id AND e.batch_id=l.batch_id AND e.learner_id=s.id AND e.status='active'))",
      [c.schoolId, b.lesson, b.learner],
    );
    if (!eligible.rows.length)
      throw new AccessError("This lesson is not available to this learner.");
    if (b.completed)
      await this.db.query(
        "INSERT INTO lesson_progress(school_id,learner_id,lesson_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [c.schoolId, b.learner, b.lesson],
      );
    else
      await this.db.query(
        "DELETE FROM lesson_progress WHERE school_id=$1 AND learner_id=$2 AND lesson_id=$3",
        [c.schoolId, b.learner, b.lesson],
      );
    return { ok: true };
  }
  async publish(c: Context, id: string, published: boolean) {
    await this.lessonAccess(c, id, true);
    await this.db.query(
      "UPDATE curriculum_lessons SET published=$1 WHERE school_id=$2 AND id=$3",
      [published, c.schoolId, id],
    );
  }
  async library(c: Context) {
    const lessons = (
        await this.db.query<Record<string, unknown> & { id: string }>(
          "SELECT * FROM curriculum_lessons WHERE school_id=$1 ORDER BY curriculum,category_position,category,block_position,module,position,created_at,id",
          [c.schoolId],
        )
      ).rows,
      allowed: (Record<string, unknown> & { id: string })[] = [];
    for (const lesson of lessons) {
      try {
        await this.lessonAccess(c, String(lesson.id));
        lesson.can_edit =
          (await this.can(c, "curriculum.manage")) ||
          (!!lesson.batch_id &&
            (await this.can(
              c,
              "classes.teach",
              "batch",
              String(lesson.batch_id),
            )));
        allowed.push(lesson);
      } catch (error) {
        if (!(error instanceof AccessError)) throw error;
      }
    }
    const assets = (
      await this.db.query(
        "SELECT id,lesson_id,filename,mime,bytes,duration_ms,status,note_cues FROM media_assets WHERE school_id=$1 AND lesson_id IS NOT NULL AND status='ready'",
        [c.schoolId],
      )
    ).rows;
    const eligibility = (
      await this.db.query(
        "SELECT l.id AS lesson_id,s.id AS learner_id FROM curriculum_lessons l JOIN learners s ON s.school_id=l.school_id JOIN school_grants g ON g.school_id=s.school_id AND g.resource_id=s.id AND g.resource_type='learner' AND g.capability='portal.learn' AND g.account_id=$2 AND g.revoked_at IS NULL WHERE l.school_id=$1 AND l.published=true AND ((l.batch_id IS NULL AND l.level=s.level) OR EXISTS(SELECT 1 FROM enrollments e WHERE e.school_id=l.school_id AND e.batch_id=l.batch_id AND e.learner_id=s.id AND e.status='active'))",
        [c.schoolId, c.session.accountId],
      )
    ).rows;
    return {
      progress: (
        await this.db.query(
          "SELECT p.* FROM lesson_progress p JOIN school_grants g ON g.school_id=p.school_id AND g.resource_id=p.learner_id WHERE p.school_id=$1 AND g.account_id=$2 AND g.capability='portal.learn' AND g.resource_type='learner' AND g.revoked_at IS NULL",
          [c.schoolId, c.session.accountId],
        )
      ).rows.filter((p) => allowed.some((l) => l.id === p.lesson_id)),
      lessons: allowed.map((l) => ({
        ...l,
        eligible_learners: eligibility
          .filter((e) => e.lesson_id === l.id)
          .map((e) => e.learner_id),
      })),
      assets: assets.filter((a) => allowed.some((l) => l.id === a.lesson_id)),
      batches: (
        await this.db.query(
          "SELECT id,name FROM batches WHERE school_id=$1 AND archived_at IS NULL AND ($3 OR EXISTS(SELECT 1 FROM school_grants g WHERE g.school_id=batches.school_id AND g.account_id=$2 AND g.capability='classes.teach' AND g.resource_id=batches.id AND g.revoked_at IS NULL))",
          [
            c.schoolId,
            c.session.accountId,
            await this.can(c, "curriculum.manage"),
          ],
        )
      ).rows,
    };
  }
  async learnerAccess(c: Context, id: string) {
    await this.exists(this.db, c, "learners", id);
    if (!(await this.can(c, "assessments.manage")))
      await this.require(c, "portal.learn", "learner", id);
  }
  async reserve(c: Context, input: unknown) {
    const b = z
      .object({
        filename: z.string().min(1).max(200),
        mime: z.enum([
          "audio/wav",
          "audio/mpeg",
          "audio/mp4",
          "audio/webm",
          "audio/ogg",
          "audio/flac",
          "video/mp4",
          "video/webm",
          "application/pdf",
          "image/png",
          "image/jpeg",
          "text/plain",
        ]),
        bytes: z.number().int().min(1).max(52428800),
        lesson: z.string().uuid().optional(),
        learner: z.string().uuid().optional(),
      })
      .parse(input);
    if (!!b.lesson === !!b.learner)
      throw new AccessError(
        "Choose a lesson or learner for this recording.",
        400,
      );
    if (b.lesson) await this.lessonAccess(c, b.lesson, true);
    if (b.learner) {
      if (!b.mime.startsWith("audio/"))
        throw new AccessError(
          "Test submissions must be audio recordings.",
          400,
        );
      await this.learnerAccess(c, b.learner);
    }
    return this.db.transaction(async (tx) => {
      await tx.query("SELECT id FROM schools WHERE id=$1 FOR UPDATE", [
        c.schoolId,
      ]);
      const used = await tx.query<{ bytes: number }>(
        "SELECT coalesce(sum(bytes),0)::bigint AS bytes FROM media_assets WHERE school_id=$1 AND status<>'failed'",
        [c.schoolId],
      );
      if (
        Number(used.rows[0].bytes) + b.bytes >
        Number(process.env.SCHOOL_MEDIA_QUOTA_BYTES || 1073741824)
      )
        throw new AccessError(
          "This school has reached its media storage allowance.",
          409,
        );
      const id = randomUUID(),
        chunks = Math.ceil(b.bytes / chunkSize);
      await tx.query(
        "INSERT INTO media_assets(school_id,id,owner_id,learner_id,lesson_id,filename,mime,bytes,chunks) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          c.schoolId,
          id,
          c.session.accountId,
          b.learner || null,
          b.lesson || null,
          b.filename,
          b.mime,
          b.bytes,
          chunks,
        ],
      );
      return { id, chunks, chunkSize };
    });
  }
  async own(c: Context, id: string) {
    const r = await this.db.query<{
      id: string;
      owner_id: string;
      lesson_id: string;
      learner_id: string;
      bytes: number;
      chunks: number;
      status: string;
      mime: string;
      sha256: string;
      storage_key: string;
      duration_ms: number;
    }>("SELECT * FROM media_assets WHERE school_id=$1 AND id=$2", [
      c.schoolId,
      id,
    ]);
    const a = r.rows[0];
    if (!a || a.owner_id !== c.session.accountId)
      throw new AccessError("Upload access is required.");
    if (a.lesson_id) await this.lessonAccess(c, a.lesson_id, true);
    if (a.learner_id) await this.learnerAccess(c, a.learner_id);
    return a;
  }
  async uploadStatus(c: Context, id: string) {
    const asset = await this.own(c, id);
    return {
      asset,
      parts: (
        await this.db.query(
          "SELECT part FROM media_chunks WHERE school_id=$1 AND asset_id=$2 ORDER BY part",
          [c.schoolId, id],
        )
      ).rows.map((p) => p.part),
    };
  }
  private temp(c: Context, id: string) {
    return path.join(this.storage.root, "uploads", c.schoolId, id);
  }
  async chunk(c: Context, id: string, input: unknown) {
    const a = await this.own(c, id),
      b = z
        .object({
          part: z.number().int().nonnegative(),
          data: z.string().max(350000),
        })
        .parse(input),
      bytes = Buffer.from(b.data, "base64");
    if (
      b.part >= a.chunks ||
      bytes.length !== Math.min(chunkSize, a.bytes - b.part * chunkSize)
    )
      throw new AccessError("Upload chunk size is invalid.", 400);
    const hash = createHash("sha256").update(bytes).digest("hex");
    await this.db.transaction(async (tx) => {
      const current = await tx.query<{ status: string }>(
        "SELECT status FROM media_assets WHERE school_id=$1 AND id=$2 FOR UPDATE",
        [c.schoolId, id],
      );
      if (current.rows[0].status !== "uploading")
        throw new AccessError("This recording can no longer be changed.", 409);
      const old = await tx.query<{ sha256: string }>(
        "SELECT sha256 FROM media_chunks WHERE school_id=$1 AND asset_id=$2 AND part=$3",
        [c.schoolId, id, b.part],
      );
      if (old.rows.length) {
        if (old.rows[0].sha256 !== hash)
          throw new AccessError(
            "This part already contains different bytes.",
            409,
          );
        return;
      }
      const dir = this.temp(c, id);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, String(b.part)), bytes);
      await tx.query(
        "INSERT INTO media_chunks(school_id,asset_id,part,sha256,bytes) VALUES($1,$2,$3,$4,$5)",
        [c.schoolId, id, b.part, hash, bytes.length],
      );
    });
    return { ok: true };
  }
  async finalize(c: Context, id: string) {
    const a = await this.own(c, id);
    if (a.status === "ready") return { id, durationMs: a.duration_ms };
    return this.db.transaction(async (tx) => {
      const current = await tx.query<{ status: string; duration_ms: number }>(
        "SELECT status,duration_ms FROM media_assets WHERE school_id=$1 AND id=$2 FOR UPDATE",
        [c.schoolId, id],
      );
      if (current.rows[0].status === "ready")
        return { id, durationMs: current.rows[0].duration_ms };
      const parts = await tx.query<{ part: number; sha256: string }>(
        "SELECT part,sha256 FROM media_chunks WHERE school_id=$1 AND asset_id=$2 ORDER BY part",
        [c.schoolId, id],
      );
      if (parts.rows.length !== a.chunks)
        throw new AccessError(
          "Upload is incomplete. Resume the missing parts.",
          409,
        );
      const data = [];
      for (const p of parts.rows) {
        const chunk = await readFile(
          path.join(this.temp(c, id), String(p.part)),
        );
        if (createHash("sha256").update(chunk).digest("hex") !== p.sha256)
          throw new AccessError(
            "A recording part failed integrity verification.",
            409,
          );
        data.push(chunk);
      }
      const bytes = Buffer.concat(data);
      if (bytes.length !== a.bytes)
        throw new AccessError("Recording size does not match.", 409);
      let duration: number | null = null;
      if (a.mime.startsWith("audio/")) {
        try {
          const { parseBuffer } = await import("music-metadata");
          const metadata = await parseBuffer(
            bytes,
            { mimeType: a.mime, size: bytes.length },
            { duration: true },
          );
          duration = Math.round((metadata.format.duration || 0) * 1000);
        } catch {
          throw new AccessError(
            "This file is not a supported audio recording.",
            400,
          );
        }
        if (!Number.isFinite(duration) || duration <= 0)
          throw new AccessError(
            "Recording duration could not be verified.",
            400,
          );
      } else if (a.mime === "text/plain") {
        try {
          new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          if (bytes.includes(0)) throw Error("Binary content");
        } catch {
          throw new AccessError("Music notes must be a UTF-8 text file.", 400);
        }
      } else {
        const { fileTypeFromBuffer } = await import("file-type");
        let detected;
        try {
          detected = await fileTypeFromBuffer(bytes);
        } catch {
          /* Invalid file */
        }
        if (detected?.mime !== a.mime)
          throw new AccessError(
            "The file contents do not match the selected media type.",
            400,
          );
      }
      const sha = createHash("sha256").update(bytes).digest("hex"),
        key = c.schoolId + "/" + id + "/" + sha;
      await this.storage.put(key, bytes, a.mime);
      await tx.query(
        "UPDATE media_assets SET status='ready',sha256=$1,storage_key=$2,duration_ms=$3 WHERE school_id=$4 AND id=$5",
        [sha, key, duration, c.schoolId, id],
      );
      await activity(tx, c, "recording.finalized", { assetId: id });
      return { id, durationMs: duration };
    });
  }
  async readAsset(c: Context, id: string) {
    const r = await this.db.query<{
        lesson_id: string;
        learner_id: string;
        status: string;
        storage_key: string;
        mime: string;
        filename: string;
        bytes: number;
      }>("SELECT * FROM media_assets WHERE school_id=$1 AND id=$2", [
        c.schoolId,
        id,
      ]),
      a = r.rows[0];
    if (!a || a.status !== "ready")
      throw new AccessError("Recording not available.", 404);
    if (a.lesson_id) await this.lessonAccess(c, a.lesson_id);
    else if (a.learner_id) {
      if (
        !(await this.can(c, "assessments.manage")) &&
        !(await this.can(c, "portal.learn", "learner", a.learner_id))
      ) {
        const assigned = await this.db.query(
          "SELECT 1 FROM submission_versions v JOIN school_grants g ON g.school_id=v.school_id AND g.resource_id=v.assessment_id WHERE v.school_id=$1 AND $2::uuid=ANY(v.asset_ids) AND g.account_id=$3 AND g.capability='assessments.review' AND g.revoked_at IS NULL",
          [c.schoolId, id, c.session.accountId],
        );
        if (!assigned.rows.length)
          throw new AccessError("Recording access is required.");
      }
    }
    return {
      bytes: await this.storage.get(a.storage_key),
      mime: a.mime,
      filename: a.filename,
    };
  }
  async practice(c: Context, input: unknown) {
    const b = z
      .object({
        lesson: z.string().uuid(),
        learner: z.string().uuid(),
        text: z.string().min(1).max(2000),
        due: z.iso.date(),
      })
      .parse(input);
    await this.lessonAccess(c, b.lesson, true);
    await this.exists(this.db, c, "learners", b.learner);
    if (!(await this.can(c, "curriculum.manage"))) {
      const enrolled = await this.db.query(
        "SELECT 1 FROM enrollments e JOIN curriculum_lessons l ON l.school_id=e.school_id AND l.batch_id=e.batch_id WHERE e.school_id=$1 AND l.id=$2 AND e.learner_id=$3 AND e.status='active'",
        [c.schoolId, b.lesson, b.learner],
      );
      if (!enrolled.rows.length)
        throw new AccessError("Learner is not in this lesson’s batch.");
    }
    await this.db.query(
      "INSERT INTO practice_tasks(school_id,id,learner_id,lesson_id,text,due_on) VALUES($1,$2,$3,$4,$5,$6)",
      [c.schoolId, randomUUID(), b.learner, b.lesson, b.text, b.due],
    );
  }
  /** "I practised today": one entry per learner per school day, India time. */
  async logPractice(c: Context, input: unknown) {
    const b = z.object({ learner: z.string().uuid() }).parse(input);
    await this.learnerAccess(c, b.learner);
    await this.db.query(
      "INSERT INTO practice_log(school_id,learner_id,practised_on,logged_by) VALUES($1,$2,(now() AT TIME ZONE 'Asia/Kolkata')::date,$3) ON CONFLICT DO NOTHING",
      [c.schoolId, b.learner, c.session.accountId],
    );
    return { ok: true };
  }
  async completePractice(c: Context, id: string) {
    const row = await this.db.query<{ learner_id: string }>(
      "SELECT learner_id FROM practice_tasks WHERE school_id=$1 AND id=$2",
      [c.schoolId, id],
    );
    if (!row.rows.length)
      throw new AccessError("Practice task not found.", 404);
    await this.learnerAccess(c, row.rows[0].learner_id);
    await this.db.query(
      "UPDATE practice_tasks SET completed_at=now() WHERE school_id=$1 AND id=$2",
      [c.schoolId, id],
    );
  }
}
