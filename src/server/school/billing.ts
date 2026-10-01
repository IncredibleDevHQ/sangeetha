import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import type { Executor } from "../db";
import { SchoolAccess, activity, positiveAmount, type Context } from "./shared";
import { AccessError } from "../admin-service";
const keyInput = z.string().min(8).max(120);
export class BillingService extends SchoolAccess {
  async balances(tx: Executor, c: Context, household?: string) {
    return (
      await tx.query(
        `SELECT ch.*,p.name AS learner_name, (ch.amount+coalesce((SELECT sum(f.amount) FROM financial_entries f WHERE f.school_id=ch.school_id AND f.charge_id=ch.id AND f.kind='adjustment'),0)-coalesce((SELECT sum(a.amount) FROM allocations a WHERE a.school_id=ch.school_id AND a.charge_id=ch.id AND a.reversed_at IS NULL),0))::int AS due FROM charges ch LEFT JOIN learners l ON l.school_id=ch.school_id AND l.id=ch.learner_id LEFT JOIN people p ON p.school_id=l.school_id AND p.id=l.person_id WHERE ch.school_id=$1 AND ($2::uuid IS NULL OR ch.household_id=$2) ORDER BY due_on`,
        [c.schoolId, household || null],
      )
    ).rows;
  }
  async statement(c: Context, household: string) {
    if (!(await this.can(c, "finance.manage")))
      await this.require(c, "household.billing", "household", household);
    await this.exists(this.db, c, "households", household);
    const payments = (
      await this.db.query(
        `SELECT p.*, (p.amount-coalesce((SELECT sum(a.amount) FROM allocations a WHERE a.school_id=p.school_id AND a.payment_id=p.id AND a.reversed_at IS NULL),0)-coalesce((SELECT sum(f.amount) FROM financial_entries f WHERE f.school_id=p.school_id AND f.payment_id=p.id AND f.kind='refund'),0))::int AS credit FROM payments p WHERE school_id=$1 AND household_id=$2 ORDER BY created_at DESC`,
        [c.schoolId, household],
      )
    ).rows;
    return {
      charges: await this.balances(this.db, c, household),
      payments,
      allocations: (
        await this.db.query(
          "SELECT a.* FROM allocations a JOIN payments p ON p.school_id=a.school_id AND p.id=a.payment_id WHERE p.school_id=$1 AND p.household_id=$2",
          [c.schoolId, household],
        )
      ).rows,
      entries: (
        await this.db.query(
          "SELECT * FROM financial_entries WHERE school_id=$1 AND household_id=$2",
          [c.schoolId, household],
        )
      ).rows,
    };
  }
  async metadata(c: Context) {
    await this.require(c, "finance.manage");
    return {
      households: (
        await this.db.query(
          "SELECT id,name FROM households WHERE school_id=$1 AND archived_at IS NULL",
          [c.schoolId],
        )
      ).rows,
      learners: (
        await this.db.query(
          "SELECT l.id,p.name FROM learners l JOIN people p ON p.school_id=l.school_id AND p.id=l.person_id WHERE l.school_id=$1",
          [c.schoolId],
        )
      ).rows,
      enrollments: (
        await this.db.query(
          "SELECT id,learner_id,batch_id,household_id,status FROM enrollments WHERE school_id=$1",
          [c.schoolId],
        )
      ).rows,
      batches: (
        await this.db.query("SELECT id,name FROM batches WHERE school_id=$1", [
          c.schoolId,
        ])
      ).rows,
      staff: [],
    };
  }
  async overview(c: Context) {
    await this.require(c, "finance.manage");
    return {
      charges: await this.balances(this.db, c),
      payments: (
        await this.db.query(
          "SELECT * FROM payments WHERE school_id=$1 ORDER BY created_at DESC",
          [c.schoolId],
        )
      ).rows,
      plans: (
        await this.db.query("SELECT * FROM fee_plans WHERE school_id=$1", [
          c.schoolId,
        ])
      ).rows,
    };
  }
  async charge(c: Context, input: unknown) {
    await this.require(c, "finance.manage");
    const b = z
      .object({
        household: z.string().uuid(),
        learner: z.string().uuid().optional(),
        description: z.string().min(1).max(200),
        amount: z.number().int().positive(),
        due: z.iso.date(),
        key: keyInput,
      })
      .parse(input);
    return this.db.transaction(async (tx) => {
      await this.exists(tx, c, "households", b.household);
      if (b.learner) {
        const member = await tx.query(
          "SELECT 1 FROM learners l JOIN household_members m ON m.school_id=l.school_id AND m.person_id=l.person_id WHERE l.school_id=$1 AND l.id=$2 AND m.household_id=$3 AND m.ended_at IS NULL",
          [c.schoolId, b.learner, b.household],
        );
        if (!member.rows.length)
          throw new AccessError(
            "Learner does not belong to this household.",
            400,
          );
      }
      const id = randomUUID();
      const r = await tx.query(
        "INSERT INTO charges(school_id,id,household_id,learner_id,category,description,amount,due_on,key) VALUES($1,$2,$3,$4,'tuition',$5,$6,$7,$8) ON CONFLICT(school_id,key) DO NOTHING RETURNING id",
        [
          c.schoolId,
          id,
          b.household,
          b.learner || null,
          b.description,
          positiveAmount(b.amount),
          b.due,
          b.key,
        ],
      );
      if (!r.rows.length) {
        const old = (
          await tx.query(
            "SELECT * FROM charges WHERE school_id=$1 AND key=$2",
            [c.schoolId, b.key],
          )
        ).rows[0];
        if (
          old.household_id !== b.household ||
          old.learner_id !== (b.learner || null) ||
          Number(old.amount) !== b.amount ||
          old.description !== b.description ||
          new Date(String(old.due_on)).toISOString().slice(0, 10) !== b.due
        )
          throw new AccessError(
            "Charge key already belongs to different details.",
            409,
          );
      }
      if (r.rows.length)
        await activity(tx, c, "charge.created", {
          householdId: b.household,
          chargeId: id,
        });
      return {
        id:
          r.rows[0]?.id ||
          (
            await tx.query(
              "SELECT id FROM charges WHERE school_id=$1 AND key=$2",
              [c.schoolId, b.key],
            )
          ).rows[0].id,
      };
    });
  }
  async plan(c: Context, input: unknown) {
    await this.require(c, "finance.manage");
    const b = z
      .object({
        enrollment: z.string().uuid(),
        amount: z.number().int().positive(),
        concession: z.number().int().nonnegative().default(0),
        dueDay: z.number().int().min(1).max(28),
      })
      .parse(input);
    positiveAmount(b.amount);
    if (b.concession >= b.amount)
      throw new AccessError("Concession must be below the fee amount.", 400);
    await this.exists(this.db, c, "enrollments", b.enrollment);
    await this.db.query(
      "INSERT INTO fee_plans(school_id,id,enrollment_id,amount,concession,due_day) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(school_id,enrollment_id) DO UPDATE SET amount=EXCLUDED.amount,concession=EXCLUDED.concession,due_day=EXCLUDED.due_day",
      [
        c.schoolId,
        randomUUID(),
        b.enrollment,
        b.amount,
        b.concession,
        b.dueDay,
      ],
    );
  }
  async generate(c: Context, period: string) {
    await this.require(c, "finance.manage");
    z.string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .parse(period);
    return this.db.transaction(async (tx) => {
      const plans = await tx.query<{
        enrollment_id: string;
        learner_id: string;
        household_id: string;
        amount: number;
        concession: number;
        due_day: number;
      }>(
        "SELECT f.*,e.learner_id,e.household_id FROM fee_plans f JOIN enrollments e ON e.school_id=f.school_id AND e.id=f.enrollment_id WHERE f.school_id=$1 AND f.active AND e.status='active' AND e.starts_on<=(($2||'-01')::date+interval '1 month'-interval '1 day')::date AND (e.ends_on IS NULL OR e.ends_on>=($2||'-01')::date)",
        [c.schoolId, period],
      );
      let count = 0;
      for (const p of plans.rows) {
        const r = await tx.query(
          "INSERT INTO charges(school_id,id,household_id,learner_id,enrollment_id,category,description,amount,due_on,period,key) VALUES($1,$2,$3,$4,$5,'tuition',$6,$7,$8,$9,$10) ON CONFLICT(school_id,key) DO NOTHING RETURNING id",
          [
            c.schoolId,
            randomUUID(),
            p.household_id,
            p.learner_id,
            p.enrollment_id,
            "Tuition · " + period,
            p.amount - p.concession,
            period + "-" + String(p.due_day).padStart(2, "0"),
            period,
            "tuition:" + p.enrollment_id + ":" + period,
          ],
        );
        count += r.rows.length;
      }
      await activity(tx, c, "billing.generated", { period, count });
      return { count };
    });
  }
  async payment(c: Context, input: unknown) {
    const b = z
      .object({
        household: z.string().uuid(),
        amount: z.number().int().positive(),
        method: z.enum(["cash", "bank", "upi"]),
        reference: z.string().max(200).default(""),
        key: keyInput,
      })
      .parse(input);
    if (!(await this.can(c, "finance.manage")))
      await this.require(c, "household.billing", "household", b.household);
    await this.exists(this.db, c, "households", b.household);
    return this.db.transaction(async (tx) => {
      const r = await tx.query(
        "INSERT INTO payments(school_id,id,household_id,amount,method,reference,key) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(school_id,key) DO NOTHING RETURNING id",
        [
          c.schoolId,
          randomUUID(),
          b.household,
          positiveAmount(b.amount),
          b.method,
          b.reference,
          b.key,
        ],
      );
      const id =
        r.rows[0]?.id ||
        (
          await tx.query(
            "SELECT id FROM payments WHERE school_id=$1 AND key=$2",
            [c.schoolId, b.key],
          )
        ).rows[0].id;
      if (!r.rows.length) {
        const old = (
          await tx.query(
            "SELECT * FROM payments WHERE school_id=$1 AND key=$2",
            [c.schoolId, b.key],
          )
        ).rows[0];
        if (
          old.household_id !== b.household ||
          Number(old.amount) !== b.amount ||
          old.method !== b.method ||
          old.reference !== b.reference
        )
          throw new AccessError(
            "Payment key already belongs to different details.",
            409,
          );
      }
      if (r.rows.length)
        await activity(tx, c, "payment.claimed", {
          householdId: b.household,
          paymentId: id,
        });
      return { id };
    });
  }
  async verify(c: Context, payment: string) {
    await this.require(c, "finance.manage");
    await this.db.transaction(async (tx) => {
      const p = await tx.query<{ status: string }>(
        "SELECT status FROM payments WHERE school_id=$1 AND id=$2 FOR UPDATE",
        [c.schoolId, payment],
      );
      if (!p.rows.length) throw new AccessError("Payment not found.", 404);
      if (p.rows[0].status === "reversed")
        throw new AccessError("A reversed payment cannot be verified.", 409);
      await tx.query(
        "UPDATE payments SET status='verified',verified_by=$1,receipt=coalesce(receipt,$2) WHERE school_id=$3 AND id=$4",
        [c.session.accountId, "SG-" + payment, c.schoolId, payment],
      );
      await activity(tx, c, "payment.verified", { paymentId: payment });
    });
  }
  async allocate(c: Context, payment: string, input: unknown) {
    await this.require(c, "finance.manage");
    const b = z
      .object({
        key: keyInput,
        lines: z
          .array(
            z.object({
              charge: z.string().uuid(),
              amount: z.number().int().positive(),
            }),
          )
          .min(1)
          .max(100),
      })
      .parse(input);
    return this.db.transaction(async (tx) => {
      await tx.query("SELECT id FROM schools WHERE id=$1 FOR UPDATE", [
        c.schoolId,
      ]);
      const fingerprint = createHash("sha256")
        .update(JSON.stringify({ payment, lines: b.lines }))
        .digest("hex");
      const done = await tx.query<{ result: unknown; fingerprint: string }>(
        "SELECT result,fingerprint FROM import_runs WHERE school_id=$1 AND key=$2",
        [c.schoolId, "allocation:" + b.key],
      );
      if (done.rows.length) {
        if (done.rows[0].fingerprint !== fingerprint)
          throw new AccessError(
            "Allocation key already belongs to a different payment or allocation.",
            409,
          );
        return done.rows[0].result;
      }
      const p = await tx.query<{
        household_id: string;
        amount: number;
        status: string;
      }>("SELECT * FROM payments WHERE school_id=$1 AND id=$2 FOR UPDATE", [
        c.schoolId,
        payment,
      ]);
      if (!p.rows.length || p.rows[0].status !== "verified")
        throw new AccessError("Verify the payment before allocating it.", 409);
      const paid = p.rows[0];
      const used = await tx.query<{ used: number }>(
        `SELECT (coalesce((SELECT sum(amount) FROM allocations WHERE school_id=$1 AND payment_id=$2 AND reversed_at IS NULL),0)+coalesce((SELECT sum(amount) FROM financial_entries WHERE school_id=$1 AND payment_id=$2 AND kind='refund'),0))::int AS used`,
        [c.schoolId, payment],
      );
      const sum = b.lines.reduce((n, l) => n + positiveAmount(l.amount), 0);
      if (sum > paid.amount - used.rows[0].used)
        throw new AccessError("Allocation exceeds the available payment.", 409);
      if (new Set(b.lines.map((l) => l.charge)).size !== b.lines.length)
        throw new AccessError("Include each charge once.", 400);
      const balances = await this.balances(tx, c, paid.household_id),
        ids = [];
      for (const l of b.lines) {
        const ch = balances.find((ch) => ch.id === l.charge);
        if (!ch || l.amount > Number(ch.due))
          throw new AccessError(
            "Allocation exceeds the charge or belongs to another household.",
            409,
          );
        const id = randomUUID();
        ids.push(id);
        await tx.query(
          "INSERT INTO allocations(school_id,id,payment_id,charge_id,amount) VALUES($1,$2,$3,$4,$5)",
          [c.schoolId, id, payment, l.charge, l.amount],
        );
      }
      await tx.query(
        "INSERT INTO import_runs(school_id,key,result,fingerprint) VALUES($1,$2,$3,$4)",
        [
          c.schoolId,
          "allocation:" + b.key,
          JSON.stringify({ ids }),
          fingerprint,
        ],
      );
      await activity(tx, c, "payment.allocated", {
        householdId: paid.household_id,
        paymentId: payment,
      });
      return { ids };
    });
  }
  async correction(c: Context, input: unknown) {
    await this.require(c, "finance.manage");
    const b = z
      .object({
        kind: z.enum([
          "adjustment",
          "refund",
          "reverse-payment",
          "reverse-allocation",
        ]),
        id: z.string().uuid(),
        amount: z
          .number()
          .int()
          .min(-1_000_000_000)
          .max(1_000_000_000)
          .optional(),
        reason: z.string().trim().min(3).max(500),
        key: keyInput,
      })
      .parse(input);
    await this.db.transaction(async (tx) => {
      await tx.query("SELECT id FROM schools WHERE id=$1 FOR UPDATE", [
        c.schoolId,
      ]);
      if (b.kind === "reverse-allocation") {
        const r = await tx.query(
          "UPDATE allocations SET reversed_at=now(),reason=$1 WHERE school_id=$2 AND id=$3 AND reversed_at IS NULL RETURNING id",
          [b.reason, c.schoolId, b.id],
        );
        if (!r.rows.length)
          throw new AccessError(
            "Allocation not found or already reversed.",
            409,
          );
      } else if (b.kind === "reverse-payment") {
        const refunds = await tx.query(
          "SELECT id FROM financial_entries WHERE school_id=$1 AND payment_id=$2 AND kind='refund'",
          [c.schoolId, b.id],
        );
        if (refunds.rows.length)
          throw new AccessError(
            "A refunded payment cannot be fully reversed.",
            409,
          );
        await this.exists(tx, c, "payments", b.id);
        await tx.query(
          "UPDATE payments SET status='reversed' WHERE school_id=$1 AND id=$2",
          [c.schoolId, b.id],
        );
        await tx.query(
          "UPDATE allocations SET reversed_at=now(),reason=$1 WHERE school_id=$2 AND payment_id=$3 AND reversed_at IS NULL",
          [b.reason, c.schoolId, b.id],
        );
      } else {
        const old = await tx.query(
          "SELECT id FROM financial_entries WHERE school_id=$1 AND key=$2",
          [c.schoolId, b.key],
        );
        if (old.rows.length) return;
        if (!b.amount) throw new AccessError("Amount is required.", 400);
        let household: string;
        if (b.kind === "adjustment") {
          const ch = (await this.balances(tx, c)).find((ch) => ch.id === b.id);
          if (!ch) throw new AccessError("Charge not found.", 404);
          if (Number(ch.due) + b.amount < 0)
            throw new AccessError(
              "Adjustment would reduce a charge below its allocated amount.",
              409,
            );
          household = String(ch.household_id);
        } else {
          positiveAmount(b.amount);
          const p = await tx.query<{
            household_id: string;
            amount: number;
            status: string;
          }>("SELECT * FROM payments WHERE school_id=$1 AND id=$2", [
            c.schoolId,
            b.id,
          ]);
          if (!p.rows.length || p.rows[0].status !== "verified")
            throw new AccessError("Refund requires a verified payment.", 409);
          household = p.rows[0].household_id;
          const used = await tx.query<{ n: number }>(
            "SELECT (coalesce((SELECT sum(amount) FROM allocations WHERE school_id=$1 AND payment_id=$2 AND reversed_at IS NULL),0)+coalesce((SELECT sum(amount) FROM financial_entries WHERE school_id=$1 AND payment_id=$2 AND kind='refund'),0))::int AS n",
            [c.schoolId, b.id],
          );
          if (b.amount > p.rows[0].amount - used.rows[0].n)
            throw new AccessError(
              "Reverse allocations before refunding settled money.",
              409,
            );
        }
        await tx.query(
          "INSERT INTO financial_entries(school_id,id,household_id,payment_id,charge_id,kind,amount,reason,key,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
          [
            c.schoolId,
            randomUUID(),
            household,
            b.kind === "refund" ? b.id : null,
            b.kind === "adjustment" ? b.id : null,
            b.kind,
            b.amount,
            b.reason,
            b.key,
            c.session.accountId,
          ],
        );
      }
      await activity(tx, c, "billing.corrected", {
        kind: b.kind,
        recordId: b.id,
        reason: b.reason,
      });
    });
  }
}
