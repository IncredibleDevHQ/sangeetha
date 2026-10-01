import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { normalizeDestination, normalizePhone } from "../../core/access";
import { AccessError } from "../admin-service";
import { SchoolAccess, activity, type Context } from "./shared";
import type { Executor } from "../db";
export const personInput = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().optional(),
  email: z.string().optional(),
  relationship: z.string().max(80).default("Member"),
  learner: z.boolean().default(true),
  level: z.string().max(80).default("Beginner"),
});
export const householdInput = z.object({
  name: z.string().trim().min(2).max(100),
  people: z.array(personInput).min(1).max(30),
  primary: z.number().int().min(0),
  billing: z.number().int().min(0).optional(),
});
export type HouseholdInput = z.infer<typeof householdInput>;
export class CrmService extends SchoolAccess {
  async create(c: Context, input: HouseholdInput) {
    await this.require(c, "crm.manage");
    return this.db.transaction((tx) =>
      this.createTx(tx, c, householdInput.parse(input)),
    );
  }
  async createTx(tx: Executor, c: Context, b: HouseholdInput) {
    if (
      b.primary >= b.people.length ||
      (b.billing !== undefined && b.billing >= b.people.length)
    )
      throw new AccessError("Select a household member as contact.", 400);
    const people = b.people.map((p) => ({
      ...p,
      id: randomUUID(),
      phone: p.phone ? normalizePhone(p.phone) : null,
      email: p.email ? normalizeDestination("email", p.email) : null,
    }));
    if (!people[b.primary].phone && !people[b.primary].email)
      throw new AccessError("The primary contact needs a phone or email.", 400);
    const billing = b.billing ?? b.primary;
    if (!people[billing].phone && !people[billing].email)
      throw new AccessError("The billing contact needs a phone or email.", 400);
    const id = randomUUID();
    for (const p of people)
      await tx.query(
        "INSERT INTO people(school_id,id,name,phone,email) VALUES($1,$2,$3,$4,$5)",
        [c.schoolId, p.id, p.name, p.phone, p.email],
      );
    await tx.query(
      "INSERT INTO households(school_id,id,name,primary_person_id,billing_person_id) VALUES($1,$2,$3,$4,$5)",
      [c.schoolId, id, b.name, people[b.primary].id, people[billing].id],
    );
    const learners: string[] = [];
    for (const p of people) {
      await tx.query(
        "INSERT INTO household_members(school_id,household_id,person_id,relationship) VALUES($1,$2,$3,$4)",
        [c.schoolId, id, p.id, p.relationship],
      );
      if (p.learner) {
        const learner = randomUUID();
        learners.push(learner);
        await tx.query(
          "INSERT INTO learners(school_id,id,person_id,level) VALUES($1,$2,$3,$4)",
          [c.schoolId, learner, p.id, p.level],
        );
      }
    }
    await activity(tx, c, "household.created", { householdId: id, learners });
    return { id, people: people.map((p) => p.id), learners };
  }
  async list(c: Context, q = "") {
    await this.require(c, "crm.manage");
    return (
      await this.db.query(
        `SELECT h.*,p.name AS contact_name,p.phone,p.email,(SELECT count(*)::int FROM household_members m JOIN learners l ON l.school_id=m.school_id AND l.person_id=m.person_id WHERE m.school_id=h.school_id AND m.household_id=h.id AND m.ended_at IS NULL) AS learner_count FROM households h JOIN people p ON p.school_id=h.school_id AND p.id=h.primary_person_id WHERE h.school_id=$1 AND (h.name ILIKE $2 OR EXISTS(SELECT 1 FROM household_members m JOIN people p2 ON p2.school_id=m.school_id AND p2.id=m.person_id WHERE m.school_id=h.school_id AND m.household_id=h.id AND p2.name ILIKE $2)) ORDER BY h.created_at DESC`,
        [c.schoolId, "%" + q.slice(0, 100) + "%"],
      )
    ).rows;
  }
  async detail(c: Context, id: string) {
    await this.require(c, "crm.manage");
    await this.exists(this.db, c, "households", id);
    return {
      household: (
        await this.db.query(
          "SELECT * FROM households WHERE school_id=$1 AND id=$2",
          [c.schoolId, id],
        )
      ).rows[0],
      people: (
        await this.db.query(
          "SELECT p.*,m.relationship,m.ended_at,l.id AS learner_id,l.status,l.level FROM household_members m JOIN people p ON p.school_id=m.school_id AND p.id=m.person_id LEFT JOIN learners l ON l.school_id=p.school_id AND l.person_id=p.id WHERE m.school_id=$1 AND m.household_id=$2",
          [c.schoolId, id],
        )
      ).rows,
      notes: (
        await this.db.query(
          "SELECT * FROM crm_notes WHERE school_id=$1 AND household_id=$2 ORDER BY created_at DESC",
          [c.schoolId, id],
        )
      ).rows,
      tasks: (
        await this.db.query(
          "SELECT * FROM followups WHERE school_id=$1 AND household_id=$2 ORDER BY due_on",
          [c.schoolId, id],
        )
      ).rows,
      relationships: (
        await this.db.query(
          "SELECT r.* FROM relationships r WHERE school_id=$1 AND (guardian_id IN (SELECT person_id FROM household_members WHERE school_id=$1 AND household_id=$2) OR dependant_id IN (SELECT person_id FROM household_members WHERE school_id=$1 AND household_id=$2))",
          [c.schoolId, id],
        )
      ).rows,
      activity: (
        await this.db.query(
          "SELECT action,details,created_at FROM audit_events WHERE school_id=$1 AND details->>'householdId'=$2 ORDER BY created_at DESC LIMIT 50",
          [c.schoolId, id],
        )
      ).rows,
    };
  }
  async update(c: Context, id: string, input: unknown) {
    await this.require(c, "crm.manage");
    const b = z
      .object({
        name: z.string().trim().min(2).max(100),
        primary: z.string().uuid(),
        billing: z.string().uuid(),
        version: z.number().int(),
        archive: z.boolean().optional(),
      })
      .parse(input);
    await this.db.transaction(async (tx) => {
      await this.exists(tx, c, "households", id);
      const members = await tx.query<{
        id: string;
        phone: string;
        email: string;
      }>(
        "SELECT p.id,p.phone,p.email FROM people p JOIN household_members m ON m.school_id=p.school_id AND m.person_id=p.id WHERE m.school_id=$1 AND m.household_id=$2 AND m.ended_at IS NULL",
        [c.schoolId, id],
      );
      for (const pid of [b.primary, b.billing]) {
        const p = members.rows.find((p) => p.id === pid);
        if (!p || (!p.phone && !p.email))
          throw new AccessError(
            "Choose an active member with a contact route.",
            400,
          );
      }
      const r = await tx.query(
        "UPDATE households SET name=$1,primary_person_id=$2,billing_person_id=$3,version=version+1,archived_at=CASE WHEN $4 THEN now() ELSE NULL END WHERE school_id=$5 AND id=$6 AND version=$7 RETURNING id",
        [b.name, b.primary, b.billing, !!b.archive, c.schoolId, id, b.version],
      );
      if (!r.rows.length)
        throw new AccessError(
          "This household changed. Refresh before saving.",
          409,
        );
      await activity(tx, c, "household.updated", { householdId: id });
    });
  }
  async person(c: Context, id: string, input: unknown) {
    await this.require(c, "crm.manage");
    const b = personInput
      .extend({ optOut: z.boolean().default(false) })
      .parse(input);
    const phone = b.phone ? normalizePhone(b.phone) : null,
      email = b.email ? normalizeDestination("email", b.email) : null;
    await this.db.transaction(async (tx) => {
      await this.exists(tx, c, "people", id);
      if (!phone && !email) {
        const contact = await tx.query(
          "SELECT id FROM households WHERE school_id=$1 AND archived_at IS NULL AND (primary_person_id=$2 OR billing_person_id=$2)",
          [c.schoolId, id],
        );
        if (contact.rows.length)
          throw new AccessError(
            "Replace the household contact before removing their last route.",
            409,
          );
      }
      await tx.query(
        "UPDATE people SET name=$1,phone=$2,email=$3,contact_opt_out=$4,version=version+1 WHERE school_id=$5 AND id=$6",
        [b.name, phone, email, b.optOut, c.schoolId, id],
      );
      await tx.query(
        "UPDATE learners SET level=$1 WHERE school_id=$2 AND person_id=$3",
        [b.level, c.schoolId, id],
      );
      await tx.query(
        "UPDATE communications SET status='cancelled' WHERE school_id=$1 AND person_id=$2 AND status IN ('queued','manual','failed')",
        [c.schoolId, id],
      );
      await activity(tx, c, "person.updated", { personId: id });
    });
  }
  async transfer(c: Context, input: unknown) {
    await this.require(c, "crm.manage");
    const b = z
      .object({ learner: z.string().uuid(), household: z.string().uuid() })
      .parse(input);
    await this.db.transaction(async (tx) => {
      await this.exists(tx, c, "households", b.household);
      const l = await tx.query<{ person_id: string }>(
        "SELECT person_id FROM learners WHERE school_id=$1 AND id=$2",
        [c.schoolId, b.learner],
      );
      if (!l.rows.length) throw new AccessError("Learner not found.", 404);
      await tx.query(
        "INSERT INTO household_members(school_id,household_id,person_id,relationship) VALUES($1,$2,$3,'Member') ON CONFLICT(school_id,household_id,person_id) DO UPDATE SET ended_at=NULL",
        [c.schoolId, b.household, l.rows[0].person_id],
      );
      await tx.query(
        "UPDATE enrollments SET household_id=$1 WHERE school_id=$2 AND learner_id=$3 AND status='active'",
        [b.household, c.schoolId, b.learner],
      );
      await activity(tx, c, "learner.billing_transferred", {
        householdId: b.household,
        learnerId: b.learner,
      });
    });
  }
  async relationship(c: Context, input: unknown) {
    await this.require(c, "crm.manage");
    const b = z
      .object({
        guardian: z.string().uuid(),
        dependant: z.string().uuid(),
        remove: z.boolean().default(false),
      })
      .parse(input);
    if (b.guardian === b.dependant)
      throw new AccessError("Choose two distinct people.", 400);
    await this.db.transaction(async (tx) => {
      await this.exists(tx, c, "people", b.guardian);
      await this.exists(tx, c, "people", b.dependant);
      if (b.remove)
        await tx.query(
          "DELETE FROM relationships WHERE school_id=$1 AND guardian_id=$2 AND dependant_id=$3",
          [c.schoolId, b.guardian, b.dependant],
        );
      else
        await tx.query(
          "INSERT INTO relationships(school_id,guardian_id,dependant_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
          [c.schoolId, b.guardian, b.dependant],
        );
      await activity(tx, c, "guardian.relationship_updated", {
        guardianId: b.guardian,
        dependantId: b.dependant,
      });
    });
  }
  async enrollmentStatus(c: Context, id: string, status: string) {
    await this.require(c, "crm.manage");
    z.enum(["active", "paused", "ended"]).parse(status);
    await this.db.transaction(async (tx) => {
      const row = (
        await tx.query<{ batch_id: string; starts_on: Date; status: string }>(
          "SELECT * FROM enrollments WHERE school_id=$1 AND id=$2 FOR UPDATE",
          [c.schoolId, id],
        )
      ).rows[0];
      if (!row) throw new AccessError("Enrollment not found.", 404);
      if (status === "active" && row.status !== "active") {
        const batch = (
            await tx.query<{ capacity: number }>(
              "SELECT capacity FROM batches WHERE school_id=$1 AND id=$2 FOR UPDATE",
              [c.schoolId, row.batch_id],
            )
          ).rows[0],
          count = (
            await tx.query<{ n: number }>(
              "SELECT count(*)::int AS n FROM enrollments WHERE school_id=$1 AND batch_id=$2 AND status='active'",
              [c.schoolId, row.batch_id],
            )
          ).rows[0].n;
        if (count >= batch.capacity)
          throw new AccessError("This batch is full.", 409);
      }
      await tx.query(
        "UPDATE enrollments SET status=$1,ends_on=CASE WHEN $1='ended' THEN greatest(current_date,starts_on) ELSE NULL END WHERE school_id=$2 AND id=$3",
        [status, c.schoolId, id],
      );
      await activity(tx, c, "enrollment.status_updated", {
        enrollmentId: id,
        status,
      });
    });
  }
  async note(c: Context, id: string, text: string) {
    await this.require(c, "crm.manage");
    await this.exists(this.db, c, "households", id);
    await this.db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO crm_notes(school_id,id,household_id,text,actor_id) VALUES($1,$2,$3,$4,$5)",
        [
          c.schoolId,
          randomUUID(),
          id,
          z.string().trim().min(1).max(4000).parse(text),
          c.session.accountId,
        ],
      );
      await activity(tx, c, "note.added", { householdId: id });
    });
  }
  async task(c: Context, id: string, input: unknown) {
    await this.require(c, "crm.manage");
    await this.exists(this.db, c, "households", id);
    const b = z
      .object({ title: z.string().trim().min(1).max(200), due: z.iso.date() })
      .parse(input);
    await this.db.query(
      "INSERT INTO followups(school_id,id,household_id,title,due_on) VALUES($1,$2,$3,$4,$5)",
      [c.schoolId, randomUUID(), id, b.title, b.due],
    );
  }
  async completeTask(c: Context, id: string) {
    await this.require(c, "crm.manage");
    await this.db.query(
      "UPDATE followups SET done_at=now() WHERE school_id=$1 AND id=$2",
      [c.schoolId, id],
    );
  }
  async batch(c: Context, input: unknown) {
    await this.require(c, "crm.manage");
    const b = z
        .object({
          name: z.string().trim().min(2).max(100),
          course: z.string().min(1).max(100),
          capacity: z.number().int().min(1).max(500),
        })
        .parse(input),
      id = randomUUID();
    await this.db.query(
      "INSERT INTO batches(school_id,id,name,course,capacity) VALUES($1,$2,$3,$4,$5)",
      [c.schoolId, id, b.name, b.course, b.capacity],
    );
    return { id };
  }
  async roster(c: Context) {
    await this.require(c, "crm.manage");
    return {
      staff: (
        await this.db.query(
          "SELECT DISTINCT a.id,a.display_name FROM accounts a WHERE EXISTS(SELECT 1 FROM memberships m WHERE m.school_id=$1 AND m.account_id=a.id AND m.revoked_at IS NULL) OR EXISTS(SELECT 1 FROM school_grants g WHERE g.school_id=$1 AND g.account_id=a.id AND g.capability='classes.teach' AND g.revoked_at IS NULL)",
          [c.schoolId],
        )
      ).rows,
      batches: (
        await this.db.query(
          "SELECT * FROM batches WHERE school_id=$1 AND archived_at IS NULL",
          [c.schoolId],
        )
      ).rows,
      learners: (
        await this.db.query(
          "SELECT l.*,p.name,m.household_id FROM learners l JOIN people p ON p.school_id=l.school_id AND p.id=l.person_id JOIN household_members m ON m.school_id=p.school_id AND m.person_id=p.id AND m.ended_at IS NULL WHERE l.school_id=$1 ORDER BY p.name",
          [c.schoolId],
        )
      ).rows,
      enrollments: (
        await this.db.query("SELECT * FROM enrollments WHERE school_id=$1", [
          c.schoolId,
        ])
      ).rows,
    };
  }
  async enroll(c: Context, input: unknown) {
    await this.require(c, "crm.manage");
    const b = z
      .object({
        learner: z.string().uuid(),
        batch: z.string().uuid(),
        household: z.string().uuid(),
        starts: z.iso.date(),
      })
      .parse(input);
    return this.db.transaction(async (tx) => {
      await this.exists(tx, c, "learners", b.learner);
      await this.exists(tx, c, "households", b.household);
      const batch = await tx.query<{ capacity: number }>(
        "SELECT capacity FROM batches WHERE school_id=$1 AND id=$2 AND archived_at IS NULL FOR UPDATE",
        [c.schoolId, b.batch],
      );
      if (!batch.rows.length) throw new AccessError("Batch not found.", 404);
      const n = await tx.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM enrollments WHERE school_id=$1 AND batch_id=$2 AND status='active'",
        [c.schoolId, b.batch],
      );
      if (n.rows[0].count >= batch.rows[0].capacity)
        throw new AccessError("This batch is full.", 409);
      const member = await tx.query(
        "SELECT 1 FROM learners l JOIN household_members m ON m.school_id=l.school_id AND m.person_id=l.person_id WHERE l.school_id=$1 AND l.id=$2 AND m.household_id=$3 AND m.ended_at IS NULL",
        [c.schoolId, b.learner, b.household],
      );
      if (!member.rows.length)
        throw new AccessError(
          "Learner is not a member of this billing household.",
          400,
        );
      const id = randomUUID();
      await tx.query(
        "INSERT INTO enrollments(school_id,id,learner_id,batch_id,household_id,starts_on) VALUES($1,$2,$3,$4,$5,$6)",
        [c.schoolId, id, b.learner, b.batch, b.household, b.starts],
      );
      await activity(tx, c, "learner.enrolled", {
        learnerId: b.learner,
        householdId: b.household,
      });
      return { id };
    });
  }
  async importPreview(c: Context, rows: unknown) {
    await this.require(c, "crm.manage");
    const input = z.array(z.unknown()).max(500).parse(rows),
      existing = await this.list(c);
    return input.map((r, index) => {
      const parsed = householdInput.safeParse(r),
        errors = parsed.success
          ? []
          : parsed.error.issues.map((i) => i.message);
      if (parsed.success) {
        try {
          const d = parsed.data;
          if (
            d.primary >= d.people.length ||
            (d.billing ?? d.primary) >= d.people.length
          )
            throw Error("Contact selection is outside this household.");
          for (const p of d.people) {
            if (p.phone) normalizePhone(p.phone);
            if (p.email) normalizeDestination("email", p.email);
          }
          for (const i of [d.primary, d.billing ?? d.primary])
            if (!d.people[i].phone && !d.people[i].email)
              throw Error(
                "Primary and billing contacts need a phone or email.",
              );
        } catch (e) {
          errors.push((e as Error).message);
        }
      }
      return {
        index,
        data: parsed.success ? parsed.data : null,
        errors,
        possibleDuplicate: parsed.success
          ? existing.some(
              (h) =>
                String(h.name).toLowerCase() === parsed.data.name.toLowerCase(),
            )
          : false,
      };
    });
  }
  async importCommit(c: Context, key: string, rows: unknown) {
    await this.require(c, "crm.manage");
    const data = z.array(householdInput).min(1).max(500).parse(rows);
    return this.db.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        c.schoolId + ":import:" + key,
      ]);
      const fingerprint = createHash("sha256")
        .update(JSON.stringify(data))
        .digest("hex");
      const old = await tx.query<{ result: unknown; fingerprint: string }>(
        "SELECT result,fingerprint FROM import_runs WHERE school_id=$1 AND key=$2",
        [c.schoolId, key],
      );
      if (old.rows.length) {
        if (old.rows[0].fingerprint !== fingerprint)
          throw new AccessError(
            "Import key already belongs to different rows.",
            409,
          );
        return old.rows[0].result;
      }
      const result = [];
      for (const row of data) result.push(await this.createTx(tx, c, row));
      await tx.query(
        "INSERT INTO import_runs(school_id,key,result,fingerprint) VALUES($1,$2,$3,$4)",
        [c.schoolId, key, JSON.stringify(result), fingerprint],
      );
      return result;
    });
  }
  async saveView(c: Context, input: unknown) {
    await this.require(c, "crm.manage");
    const b = z
      .object({ name: z.string().min(1).max(80), query: z.string().max(100) })
      .parse(input);
    await this.db.query(
      "INSERT INTO saved_views(school_id,id,account_id,name,filters) VALUES($1,$2,$3,$4,$5)",
      [
        c.schoolId,
        randomUUID(),
        c.session.accountId,
        b.name,
        JSON.stringify({ query: b.query }),
      ],
    );
  }
}
