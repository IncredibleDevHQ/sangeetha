import { randomUUID } from "node:crypto";
import { z } from "zod";
import { SchoolAccess, activity, type Context } from "./shared";
import { AccessError } from "../admin-service";
import type { Executor } from "../db";
const classInput = z.object({
  batch: z.string().uuid(),
  teacher: z.string().uuid(),
  starts: z.iso.datetime({ offset: true }),
  ends: z.iso.datetime({ offset: true }),
  location: z.string().max(500).default(""),
  repeatWeeks: z.number().int().min(1).max(52).default(1),
  makeupFor: z.string().uuid().optional(),
});
export class ScheduleService extends SchoolAccess {
  async list(c: Context) {
    await this.require(c, "schedule.manage");
    return {
      classes: (
        await this.db.query(
          "SELECT o.*,b.name AS batch_name,a.display_name AS teacher FROM class_occurrences o JOIN batches b ON b.school_id=o.school_id AND b.id=o.batch_id JOIN accounts a ON a.id=o.teacher_id WHERE o.school_id=$1 ORDER BY starts_at",
          [c.schoolId],
        )
      ).rows,
      attendance: (
        await this.db.query("SELECT * FROM attendance WHERE school_id=$1", [
          c.schoolId,
        ])
      ).rows,
    };
  }
  async conflicts(
    tx: Executor,
    c: Context,
    batch: string,
    teacher: string,
    starts: Date,
    ends: Date,
    exclude?: string,
  ) {
    const rows = await tx.query(
      `SELECT o.id FROM class_occurrences o WHERE o.school_id=$1 AND o.status='scheduled' AND o.id<>coalesce($6::uuid,'00000000-0000-0000-0000-000000000000') AND o.starts_at<$5 AND o.ends_at>$4 AND (o.teacher_id=$3 OR o.batch_id=$2 OR EXISTS(SELECT 1 FROM enrollments a JOIN enrollments b ON a.school_id=b.school_id AND a.learner_id=b.learner_id WHERE a.school_id=$1 AND a.batch_id=$2 AND b.batch_id=o.batch_id AND a.status='active' AND b.status='active'))`,
      [c.schoolId, batch, teacher, starts, ends, exclude || null],
    );
    if (rows.rows.length)
      throw new AccessError(
        "This time conflicts with a teacher, batch or enrolled learner.",
        409,
      );
  }
  async create(c: Context, input: unknown) {
    await this.require(c, "schedule.manage");
    const b = classInput.parse(input),
      start = new Date(b.starts),
      end = new Date(b.ends);
    if (end <= start || end.getTime() - start.getTime() > 86400000)
      throw new AccessError(
        "Choose a class duration between 1 minute and 24 hours.",
        400,
      );
    return this.db.transaction(async (tx) => {
      await tx.query("SELECT id FROM schools WHERE id=$1 FOR UPDATE", [
        c.schoolId,
      ]);
      await this.exists(tx, c, "batches", b.batch);
      const teacher = await tx.query(
        "SELECT account_id FROM memberships WHERE school_id=$1 AND account_id=$2 AND revoked_at IS NULL UNION SELECT account_id FROM school_grants WHERE school_id=$1 AND account_id=$2 AND capability='classes.teach' AND resource_type='batch' AND resource_id=$3 AND revoked_at IS NULL",
        [c.schoolId, b.teacher, b.batch],
      );
      if (!teacher.rows.length)
        throw new AccessError(
          "Assign a school teacher with batch access.",
          400,
        );
      if (b.makeupFor)
        await this.exists(tx, c, "class_occurrences", b.makeupFor);
      const series = b.repeatWeeks > 1 ? randomUUID() : null;
      if (series)
        await tx.query(
          "INSERT INTO class_series(school_id,id,batch_id,teacher_id,location) VALUES($1,$2,$3,$4,$5)",
          [c.schoolId, series, b.batch, b.teacher, b.location],
        );
      const ids = [];
      for (let i = 0; i < b.repeatWeeks; i++) {
        const starts = new Date(start.getTime() + i * 7 * 86400000),
          ends = new Date(end.getTime() + i * 7 * 86400000);
        await this.conflicts(tx, c, b.batch, b.teacher, starts, ends);
        const id = randomUUID();
        ids.push(id);
        await tx.query(
          "INSERT INTO class_occurrences(school_id,id,series_id,batch_id,teacher_id,starts_at,ends_at,location,makeup_for) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [
            c.schoolId,
            id,
            series,
            b.batch,
            b.teacher,
            starts,
            ends,
            b.location,
            b.makeupFor || null,
          ],
        );
        await this.queue(tx, c, id);
      }
      await activity(tx, c, "classes.scheduled", { occurrences: ids });
      return { ids };
    });
  }
  async update(c: Context, id: string, input: unknown) {
    await this.require(c, "schedule.manage");
    const b = z
      .object({
        starts: z.iso.datetime({ offset: true }),
        ends: z.iso.datetime({ offset: true }),
        teacher: z.string().uuid(),
        location: z.string().max(500),
        status: z.enum(["scheduled", "cancelled", "completed"]),
        version: z.number().int(),
      })
      .parse(input);
    if (new Date(b.ends) <= new Date(b.starts))
      throw new AccessError("Class must finish after it starts.", 400);
    await this.db.transaction(async (tx) => {
      await tx.query("SELECT id FROM schools WHERE id=$1 FOR UPDATE", [
        c.schoolId,
      ]);
      const old = await tx.query<{ batch_id: string }>(
        "SELECT batch_id FROM class_occurrences WHERE school_id=$1 AND id=$2 FOR UPDATE",
        [c.schoolId, id],
      );
      if (!old.rows.length) throw new AccessError("Class not found.", 404);
      const teacher = await tx.query(
        "SELECT account_id FROM memberships WHERE school_id=$1 AND account_id=$2 AND revoked_at IS NULL UNION SELECT account_id FROM school_grants WHERE school_id=$1 AND account_id=$2 AND capability='classes.teach' AND resource_id=$3 AND revoked_at IS NULL",
        [c.schoolId, b.teacher, old.rows[0].batch_id],
      );
      if (!teacher.rows.length)
        throw new AccessError("Teacher lacks school access.", 400);
      if (b.status === "scheduled")
        await this.conflicts(
          tx,
          c,
          old.rows[0].batch_id,
          b.teacher,
          new Date(b.starts),
          new Date(b.ends),
          id,
        );
      const updated = await tx.query(
        "UPDATE class_occurrences SET starts_at=$1,ends_at=$2,teacher_id=$3,location=$4,status=$5,version=version+1 WHERE school_id=$6 AND id=$7 AND version=$8 RETURNING id",
        [
          b.starts,
          b.ends,
          b.teacher,
          b.location,
          b.status,
          c.schoolId,
          id,
          b.version,
        ],
      );
      if (!updated.rows.length)
        throw new AccessError("Class changed. Refresh before saving.", 409);
      await tx.query(
        "UPDATE communications SET status='cancelled' WHERE school_id=$1 AND occurrence_id=$2 AND status IN ('queued','manual','failed')",
        [c.schoolId, id],
      );
      if (b.status === "scheduled") await this.queue(tx, c, id);
      await activity(tx, c, "class.updated", {
        occurrenceId: id,
        status: b.status,
      });
    });
  }
  async mark(c: Context, id: string, input: unknown) {
    const b = z
      .object({
        entries: z
          .array(
            z.object({
              learner: z.string().uuid(),
              status: z.enum(["present", "absent", "excused"]),
            }),
          )
          .max(500),
        notes: z.string().max(4000).optional(),
      })
      .parse(input);
    const o = await this.db.query<{
      batch_id: string;
      starts_at: Date;
      status: string;
    }>(
      "SELECT batch_id,starts_at,status FROM class_occurrences WHERE school_id=$1 AND id=$2",
      [c.schoolId, id],
    );
    if (!o.rows.length) throw new AccessError("Class not found.", 404);
    if (!(await this.can(c, "schedule.manage")))
      await this.require(c, "classes.teach", "batch", o.rows[0].batch_id);
    if (o.rows[0].status === "cancelled")
      throw new AccessError(
        "Cannot mark attendance for a cancelled class.",
        409,
      );
    await this.db.transaction(async (tx) => {
      for (const e of b.entries) {
        const allowed = await tx.query(
          "SELECT id FROM enrollments WHERE school_id=$1 AND batch_id=$2 AND learner_id=$3 AND starts_on <= $4::date AND (ends_on IS NULL OR ends_on >= $4::date)",
          [c.schoolId, o.rows[0].batch_id, e.learner, o.rows[0].starts_at],
        );
        if (!allowed.rows.length)
          throw new AccessError("Learner is not enrolled in this class.", 400);
        await tx.query(
          "INSERT INTO attendance(school_id,occurrence_id,learner_id,status,marked_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(school_id,occurrence_id,learner_id) DO UPDATE SET status=EXCLUDED.status,marked_by=EXCLUDED.marked_by,updated_at=now()",
          [c.schoolId, id, e.learner, e.status, c.session.accountId],
        );
      }
      await tx.query(
        "UPDATE class_occurrences SET notes=coalesce($1,notes) WHERE school_id=$2 AND id=$3",
        [b.notes ?? null, c.schoolId, id],
      );
      await activity(tx, c, "attendance.marked", { occurrenceId: id });
    });
  }
  async queue(tx: Executor, c: Context, id: string) {
    const r = await tx.query<{
      household_id: string;
      person_id: string;
      phone: string;
      name: string;
      learner_id: string;
      contact_version: number;
      starts_at: Date;
      location: string;
      version: number;
    }>(
      `SELECT e.household_id,h.primary_person_id AS person_id,p.phone,lp.name,l.id AS learner_id,p.version AS contact_version,o.starts_at,o.location,o.version FROM class_occurrences o JOIN enrollments e ON e.school_id=o.school_id AND e.batch_id=o.batch_id JOIN learners l ON l.school_id=e.school_id AND l.id=e.learner_id JOIN people lp ON lp.school_id=l.school_id AND lp.id=l.person_id JOIN households h ON h.school_id=e.school_id AND h.id=e.household_id JOIN people p ON p.school_id=h.school_id AND p.id=h.primary_person_id WHERE o.school_id=$1 AND o.id=$2 AND e.status='active' AND e.starts_on<=o.starts_at::date AND (e.ends_on IS NULL OR e.ends_on>=o.starts_at::date) AND h.archived_at IS NULL AND NOT p.contact_opt_out AND p.phone IS NOT NULL`,
      [c.schoolId, id],
    );
    const groups = new Map<string, typeof r.rows>();
    for (const row of r.rows) {
      const key = row.household_id;
      groups.set(key, [...(groups.get(key) || []), row]);
    }
    for (const group of groups.values()) {
      const p = group[0],
        names = group.map((p) => p.name),
        key =
          "class:" +
          p.household_id +
          ":" +
          group
            .map((r) => r.learner_id)
            .sort()
            .join("|") +
          ":" +
          id +
          ":" +
          p.version +
          ":" +
          p.phone +
          ":" +
          p.contact_version +
          ":" +
          group.map((r) => r.name).join("|");
      const message = `Music class reminder for ${names.join(" & ")}: ${new Date(p.starts_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} (IST). ${p.location}`;
      await tx.query(
        "INSERT INTO communications(school_id,id,key,household_id,person_id,occurrence_id,occurrence_version,kind,destination,subjects,message,due_at) VALUES($1,$2,$3,$4,$5,$6,$7,'class',$8,$9,$10,$11) ON CONFLICT(school_id,key) DO NOTHING",
        [
          c.schoolId,
          randomUUID(),
          key,
          p.household_id,
          p.person_id,
          id,
          p.version,
          p.phone,
          JSON.stringify(group.map((p) => p.learner_id)),
          message,
          new Date(new Date(p.starts_at).getTime() - 3600000),
        ],
      );
    }
  }
}
