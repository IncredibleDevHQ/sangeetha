import { beforeEach, afterEach, it, expect } from "vitest";
import {
  localDatabase,
  postgresDatabase,
  migrate,
  type Database,
} from "../src/server/db";
import { AdminService, provisionOwner } from "../src/server/admin-service";
import { CrmService } from "../src/server/school/crm";
import { ScheduleService } from "../src/server/school/schedule";
import { BillingService } from "../src/server/school/billing";
import { GrantService } from "../src/server/school/grants";
import type { Context } from "../src/server/school/shared";
let db: Database,
  c: Context,
  crm: CrmService,
  schedule: ScheduleService,
  billing: BillingService;
beforeEach(async () => {
  db = process.env.TEST_DATABASE_URL
    ? postgresDatabase(process.env.TEST_DATABASE_URL)
    : localDatabase();
  if (process.env.TEST_DATABASE_URL)
    await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  await migrate(db);
  const schoolId = await provisionOwner(
      db,
      "School One",
      "email",
      "teacher@example.test",
      "school-one",
    ),
    auth = new AdminService(db),
    uid = "local|email:teacher@example.test",
    login = await auth.login(
      {
        uid,
        name: "Teacher",
        authTime: Date.now() / 1000,
        email: "teacher@example.test",
        emailVerified: true,
        identities: [
          { provider: "google.com", uid, label: "teacher@example.test" },
        ],
      },
      "Tests",
    );
  c = { schoolId, session: (await auth.session(login.token))! };
  crm = new CrmService(db);
  schedule = new ScheduleService(db);
  billing = new BillingService(db);
}, 30000);
afterEach(async () => {
  await db.close();
});
const family = () => ({
  name: "Iyer household",
  primary: 0,
  people: [
    {
      name: "Lakshmi",
      phone: "9876543210",
      relationship: "Mother",
      learner: true,
      level: "Intermediate",
    },
    { name: "Arjun", relationship: "Son", learner: true, level: "Beginner" },
  ],
});
it("creates two distinct learners, one contact, and checks versioned contact changes", async () => {
  const h = await crm.create(c, family());
  expect(h.learners).toHaveLength(2);
  const detail = await crm.detail(c, h.id);
  expect(detail.people).toHaveLength(2);
  expect(detail.household.primary_person_id).toBe(h.people[0]);
  await expect(
    crm.update(c, h.id, {
      name: "Iyer",
      primary: h.people[1],
      billing: h.people[0],
      version: 1,
    }),
  ).rejects.toThrow("contact route");
  await crm.update(c, h.id, {
    name: "Iyer",
    primary: h.people[0],
    billing: h.people[0],
    version: 1,
  });
  await expect(
    crm.update(c, h.id, {
      name: "Iyer",
      primary: h.people[0],
      billing: h.people[0],
      version: 1,
    }),
  ).rejects.toThrow("changed");
});
it("keeps equal shared phone routes as distinct people and imports idempotently", async () => {
  const data = family();
  data.people[1].phone = "9876543210";
  const first = await crm.importCommit(c, "import-key-123", [data]),
    second = await crm.importCommit(c, "import-key-123", [data]);
  expect(second).toEqual(first);
  expect(await crm.list(c)).toHaveLength(1);
  expect((await db.query("SELECT id FROM people")).rows).toHaveLength(2);
});
it("keeps learner attendance independent and invalidates rescheduled reminders", async () => {
  const h = await crm.create(c, family()),
    batch = (
      await crm.batch(c, { name: "Monday", course: "Carnatic", capacity: 3 })
    ).id as string;
  for (const learner of h.learners)
    await crm.enroll(c, {
      learner,
      batch,
      household: h.id,
      starts: "2026-01-01",
    });
  const classes = await schedule.create(c, {
    batch,
    teacher: c.session.accountId,
    starts: "2026-10-05T10:00:00+05:30",
    ends: "2026-10-05T11:00:00+05:30",
    repeatWeeks: 2,
  });
  expect(classes.ids).toHaveLength(2);
  await schedule.mark(c, classes.ids[0], {
    entries: [
      { learner: h.learners[0], status: "present" },
      { learner: h.learners[1], status: "absent" },
    ],
  });
  expect(
    (await db.query("SELECT * FROM attendance")).rows
      .map((x) => x.status)
      .sort(),
  ).toEqual(["absent", "present"]);
  await expect(
    schedule.create(c, {
      batch,
      teacher: c.session.accountId,
      starts: "2026-10-05T10:30:00+05:30",
      ends: "2026-10-05T11:30:00+05:30",
    }),
  ).rejects.toThrow("conflicts");
  await schedule.update(c, classes.ids[0], {
    starts: "2026-10-06T10:00:00+05:30",
    ends: "2026-10-06T11:00:00+05:30",
    teacher: c.session.accountId,
    location: "Studio",
    status: "scheduled",
    version: 1,
  });
  const messages = (
    await db.query("SELECT * FROM communications WHERE occurrence_id=$1", [
      classes.ids[0],
    ])
  ).rows;
  expect(messages.map((m) => m.status).sort()).toEqual(["cancelled", "queued"]);
  expect(
    (
      await db.query("SELECT version FROM class_occurrences WHERE id=$1", [
        classes.ids[1],
      ])
    ).rows[0].version,
  ).toBe(1);
});
it("allocates one INR 2000 payment to INR 1500 mother and INR 500 son, leaving INR 500 due", async () => {
  const h = await crm.create(c, family());
  const mother = await billing.charge(c, {
      household: h.id,
      learner: h.learners[0],
      description: "Mother tuition",
      amount: 150000,
      due: "2026-10-10",
      key: "mother-charge-1",
    }),
    son = await billing.charge(c, {
      household: h.id,
      learner: h.learners[1],
      description: "Son tuition",
      amount: 100000,
      due: "2026-10-10",
      key: "son-charge-1",
    }),
    payment = await billing.payment(c, {
      household: h.id,
      amount: 200000,
      method: "upi",
      reference: "Test",
      key: "payment-key-1",
    });
  const body = {
    key: "allocation-key-1",
    lines: [
      { charge: mother.id, amount: 150000 },
      { charge: son.id, amount: 50000 },
    ],
  };
  await expect(billing.allocate(c, String(payment.id), body)).rejects.toThrow(
    "Verify",
  );
  await billing.verify(c, String(payment.id));
  const result = await billing.allocate(c, String(payment.id), body);
  expect(await billing.allocate(c, String(payment.id), body)).toEqual(result);
  const statement = await billing.statement(c, h.id);
  expect(statement.charges.map((ch) => ch.due).sort()).toEqual([0, 50000]);
  expect(statement.payments[0].credit).toBe(0);
  await expect(
    billing.allocate(c, String(payment.id), {
      key: "allocation-key-2",
      lines: [{ charge: son.id, amount: 1 }],
    }),
  ).rejects.toThrow("available");
  await billing.correction(c, {
    kind: "reverse-payment",
    id: payment.id,
    reason: "Wrong receipt",
    key: "reverse-key-1",
  });
  expect(
    (await billing.statement(c, h.id)).charges.map((ch) => ch.due).sort(),
  ).toEqual([100000, 150000]);
});
it("prevents tenant reference crossing and teaching grants from granting finance", async () => {
  const h = await crm.create(c, family()),
    other = await provisionOwner(
      db,
      "School Two",
      "email",
      "other@example.test",
      "school-two",
    );
  await expect(crm.detail({ ...c, schoolId: other }, h.id)).rejects.toThrow(
    "permission",
  );
  const uid = "local|email:assistant@example.test",
    auth = new AdminService(db);
  const login = await auth.login(
    {
      uid,
      name: "Assistant",
      authTime: Date.now() / 1000,
      email: "assistant@example.test",
      emailVerified: true,
      identities: [
        { provider: "google.com", uid, label: "assistant@example.test" },
      ],
    },
    "Tests",
  );
  const assistant = {
      schoolId: c.schoolId,
      session: (await auth.session(login.token))!,
    },
    batch = await crm.batch(c, {
      name: "Batch",
      course: "Carnatic",
      capacity: 10,
    });
  await new GrantService(db).invite(c, {
    channel: "email",
    destination: "assistant@example.test",
    capability: "classes.teach",
    resource: batch.id,
  });
  await auth.login(
    {
      uid,
      name: "Assistant",
      authTime: Date.now() / 1000,
      email: "assistant@example.test",
      emailVerified: true,
      identities: [
        { provider: "google.com", uid, label: "assistant@example.test" },
      ],
    },
    "Tests",
  );
  expect(
    await crm.can(assistant, "classes.teach", "batch", String(batch.id)),
  ).toBe(true);
  await expect(billing.overview(assistant)).rejects.toThrow("permission");
});

import { createHmac, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { vi } from "vitest";
import { LearningService, chunkSize } from "../src/server/school/learning";
import { AssessmentService } from "../src/server/school/assessments";
import { PortalService } from "../src/server/school/portal";
import { EventService } from "../src/server/school/events";
import {
  AutomationService,
  dispatchMessages,
  validSignature,
} from "../src/server/school/automation";
import { PaymentLinkService } from "../src/server/school/payments";
import { snapshot, restore } from "../src/server/backup";
import { parseCsv, csvExport } from "../src/core/csv";
let mediaPath: string;
beforeEach(async () => {
  mediaPath = await mkdtemp(tmpdir() + "/sangeetha-test-");
  process.env.MEDIA_PATH = mediaPath;
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.RAZORPAY_KEYS_JSON;
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_GRAPH_VERSION;
  delete process.env.MEDIA_PATH;
  await rm(mediaPath, { recursive: true, force: true });
});
function wav(seconds = 1) {
  const bytes = Buffer.alloc(44 + 8000 * 2 * seconds);
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
  return bytes;
}
async function account(
  email: string,
  capabilities: { capability: string; resource: string }[],
) {
  for (const g of capabilities)
    await new GrantService(db).invite(c, {
      channel: "email",
      destination: email,
      ...g,
    });
  const auth = new AdminService(db),
    uid = "local|email:" + email,
    login = await auth.login(
      {
        uid,
        name: email,
        authTime: Date.now() / 1000,
        email,
        emailVerified: true,
        identities: [{ provider: "google.com", uid, label: email }],
      },
      "Tests",
    );
  return { schoolId: c.schoolId, session: (await auth.session(login.token))! };
}
async function recording(context: Context, learner: string, seconds = 1) {
  const svc = new LearningService(db),
    bytes = wav(seconds),
    a = await svc.reserve(context, {
      learner,
      filename: "test.wav",
      mime: "audio/wav",
      bytes: bytes.length,
    });
  for (let part = 0; part < a.chunks; part++)
    await svc.chunk(context, a.id, {
      part,
      data: bytes
        .subarray(part * chunkSize, (part + 1) * chunkSize)
        .toString("base64"),
    });
  await svc.finalize(context, a.id);
  return a.id;
}
it("resumes private audio, verifies duration and blocks downloads after grant revocation", async () => {
  const h = await crm.create(c, family()),
    learner = await account("learner@example.test", [
      { capability: "portal.learn", resource: h.learners[1] },
    ]),
    svc = new LearningService(db),
    bytes = wav(20),
    asset = await svc.reserve(learner, {
      learner: h.learners[1],
      filename: "long.wav",
      mime: "audio/wav",
      bytes: bytes.length,
    });
  await svc.chunk(learner, asset.id, {
    part: 0,
    data: bytes.subarray(0, chunkSize).toString("base64"),
  });
  await expect(svc.finalize(learner, asset.id)).rejects.toThrow("incomplete");
  expect((await svc.uploadStatus(learner, asset.id)).parts).toEqual([0]);
  const altered = Buffer.from(bytes.subarray(0, chunkSize));
  altered[100] = 1;
  await expect(
    svc.chunk(learner, asset.id, { part: 0, data: altered.toString("base64") }),
  ).rejects.toThrow("different bytes");
  await svc.chunk(learner, asset.id, {
    part: 1,
    data: bytes.subarray(chunkSize).toString("base64"),
  });
  expect((await svc.finalize(learner, asset.id)).durationMs).toBe(20000);
  expect((await svc.readAsset(learner, asset.id)).bytes).toEqual(bytes);
  await expect(
    svc.readAsset({ ...learner, schoolId: randomUUID() }, asset.id),
  ).rejects.toThrow("not available");
  await db.query(
    "UPDATE school_grants SET revoked_at=now() WHERE account_id=$1",
    [learner.session.accountId],
  );
  await expect(svc.readAsset(learner, asset.id)).rejects.toThrow("access");
});
it("keeps draft reviews private, annotations versioned and exports only verified consented labels", async () => {
  const h = await crm.create(c, family()),
    learner = await account("student@example.test", [
      { capability: "portal.learn", resource: h.learners[0] },
    ]),
    svc = new AssessmentService(db),
    tax = await svc.taxonomy(c, ["Shruti", "Rhythm"]),
    test = await svc.create(c, {
      title: "Swaras",
      instructions: "Sing swaras",
      due: "2099-10-10T10:00:00Z",
      taxonomy: tax.version,
      learners: h.learners,
      rubric: [{ name: "Pitch", max: 10 }],
    }),
    reviewer = await account("reviewer@example.test", [
      { capability: "assessments.review", resource: test.id },
    ]),
    asset = await recording(learner, h.learners[0]),
    v = await svc.submit(learner, {
      test: test.id,
      learner: h.learners[0],
      assets: [asset],
    });
  const body = {
    submission: v.id,
    asset,
    kind: "interval",
    start: 100,
    end: 700,
    label: "Shruti",
    comment: "Hold the tonic",
    exercise: "Sustain Sa",
  };
  await expect(svc.annotate(reviewer, { ...body, end: 1500 })).rejects.toThrow(
    "duration",
  );
  await svc.annotate(reviewer, body);
  await svc.score(reviewer, v.id, { Pitch: 7 });
  expect(await svc.annotations(learner, v.id)).toEqual([]);
  expect(
    (await new PortalService(db).view(learner)).submissions[0].scores,
  ).toBeNull();
  await expect(svc.moderate(reviewer, v.id, true)).rejects.toThrow(
    "permission",
  );
  await svc.moderate(c, v.id, true);
  expect(await svc.annotations(learner, v.id)).toHaveLength(1);
  await expect(svc.annotate(reviewer, body)).rejects.toThrow("immutable");
  const v2 = await svc.submit(learner, {
    test: test.id,
    learner: h.learners[0],
    assets: [asset],
  });
  expect(v2.version).toBe(2);
  expect(await svc.annotations(learner, v2.id)).toEqual([]);
  expect(await svc.exportLabels(c)).toEqual([]);
  await expect(
    svc.consent(c, {
      learner: h.learners[0],
      purpose: "label-export",
      allowed: true,
    }),
  ).rejects.toThrow("explicit");
  for (const purpose of ["recording-reuse", "label-export"])
    await svc.consent(learner, {
      learner: h.learners[0],
      purpose,
      allowed: true,
    });
  expect(await svc.exportLabels(c)).toHaveLength(1);
  await svc.consent(learner, {
    learner: h.learners[0],
    purpose: "label-export",
    allowed: false,
  });
  expect(await svc.exportLabels(c)).toEqual([]);
  const outsider = await account("outsider@example.test", [
    { capability: "portal.learn", resource: h.learners[1] },
  ]);
  await expect(svc.annotations(outsider, v.id)).rejects.toThrow("permission");
});
it("allows teaching assigned material but denies other batches and finance", async () => {
  const h = await crm.create(c, family()),
    batch = await crm.batch(c, {
      name: "Beginner",
      course: "Carnatic",
      capacity: 10,
    }),
    other = await crm.batch(c, {
      name: "Other",
      course: "Carnatic",
      capacity: 10,
    });
  await crm.enroll(c, {
    learner: h.learners[0],
    batch: batch.id,
    household: h.id,
    starts: "2026-01-01",
  });
  const teacher = await account("teacher2@example.test", [
      { capability: "classes.teach", resource: batch.id },
    ]),
    learner = await account("family@example.test", [
      { capability: "portal.learn", resource: h.learners[0] },
    ]),
    learning = new LearningService(db),
    lesson = await learning.createLesson(teacher, {
      batch: batch.id,
      title: "Sa",
      level: "Beginner",
      module: "Swara",
      published: false,
    });
  expect((await learning.library(learner)).lessons).toHaveLength(0);
  await learning.publish(teacher, lesson.id, true);
  expect((await learning.library(learner)).lessons).toHaveLength(1);
  await expect(
    learning.createLesson(teacher, {
      batch: other.id,
      title: "Other",
      level: "Beginner",
      module: "Swara",
    }),
  ).rejects.toThrow("permission");
  await expect(billing.overview(teacher)).rejects.toThrow("permission");
  expect(
    (await new PortalService(db).view(teacher)).teachingLearners,
  ).toHaveLength(1);
});
it("deduplicates per-household event contributions and keeps event collections separate from tuition", async () => {
  const h = await crm.create(c, family()),
    svc = new EventService(db);
  for (const basis of ["person", "household"]) {
    const event = await svc.create(c, {
      title: basis,
      starts: "2099-01-01T10:00:00Z",
      venue: "Hall",
      basis,
      contribution: 50000,
    });
    await svc.register(c, {
      event: event.id,
      household: h.id,
      people: h.people,
    });
    await svc.register(c, {
      event: event.id,
      household: h.id,
      people: h.people,
    });
    const accounts = await svc.accounts(c, event.id);
    expect(accounts.charges).toHaveLength(basis === "person" ? 2 : 1);
    expect(accounts.received).toBe(0);
  }
  expect((await svc.list(c)).registrations).toHaveLength(4);
});
it("invalidates paid-fee notices, changed contacts and opt-outs before sharing", async () => {
  const h = await crm.create(c, family()),
    svc = new AutomationService(db),
    charge = await billing.charge(c, {
      household: h.id,
      description: "Tuition",
      amount: 10000,
      due: "2026-10-10",
      key: "fee-reminder-123",
    });
  await svc.refresh(c);
  let notices = await svc.messages(c);
  expect(notices).toHaveLength(1);
  expect((await svc.manual(c, String(notices[0].id))).url).toContain(
    "wa.me/919876543210",
  );
  const p = await billing.payment(c, {
    household: h.id,
    amount: 10000,
    method: "cash",
    key: "paid-reminder-123",
  });
  await billing.verify(c, String(p.id));
  await billing.allocate(c, String(p.id), {
    key: "paid-allocation-123",
    lines: [{ charge: charge.id, amount: 10000 }],
  });
  expect(await svc.manual(c, String(notices[0].id))).toEqual({
    cancelled: true,
  });
  await crm.person(c, h.people[0], {
    name: "Lakshmi",
    phone: "9876543210",
    optOut: true,
  });
  await svc.refresh(c);
  expect(
    (await svc.messages(c)).filter((n) => n.status === "queued"),
  ).toHaveLength(0);
});
it("settles only signed captured payments and deduplicates callbacks and provider payment IDs", async () => {
  const h = await crm.create(c, family()),
    charge = await billing.charge(c, {
      household: h.id,
      description: "Tuition",
      amount: 10000,
      due: "2026-10-10",
      key: "gateway-fee-123",
    }),
    svc = new PaymentLinkService(db);
  process.env.RAZORPAY_KEYS_JSON = JSON.stringify({
    [c.schoolId]: { keyId: "test", secret: "test", webhookSecret: "secret" },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: "plink_test",
            short_url: "https://rzp.io/test",
          }),
          { status: 200 },
        ),
    ),
  );
  const link = await svc.create(c, {
    household: h.id,
    charges: [charge.id],
    key: "gateway-link-123",
  });
  const raw = Buffer.from(
      JSON.stringify({
        event: "payment_link.paid",
        payload: {
          payment_link: {
            entity: {
              id: "plink_test",
              reference_id: link.id,
              amount_paid: 10000,
            },
          },
          payment: {
            entity: {
              id: "pay_test",
              status: "captured",
              amount: 10000,
              currency: "INR",
            },
          },
        },
      }),
    ),
    signature = createHmac("sha256", "secret").update(raw).digest("hex");
  await expect(svc.webhook(raw, "bad", "event1")).rejects.toThrow("signature");
  await svc.webhook(raw, signature, "event1");
  expect(await svc.webhook(raw, signature, "event1")).toEqual({
    duplicate: true,
  });
  await svc.webhook(raw, signature, "event2");
  expect((await billing.statement(c, h.id)).charges[0].due).toBe(0);
  expect((await billing.statement(c, h.id)).payments).toHaveLength(1);
  expect(validSignature(Buffer.from("{}"), signature, "secret")).toBe(false);
});
it("quarantines ambiguous provider outcomes and never blindly retries them", async () => {
  const h = await crm.create(c, family());
  await billing.charge(c, {
    household: h.id,
    description: "Tuition",
    amount: 10000,
    due: "2026-10-10",
    key: "worker-fee-123",
  });
  const svc = new AutomationService(db);
  await svc.refresh(c);
  await svc.settings(c, {
    enabled: true,
    phoneId: "12345",
    template: "school_notice",
    dailyLimit: 10,
  });
  process.env.WHATSAPP_TOKEN = "mock";
  process.env.WHATSAPP_GRAPH_VERSION = "v-test";
  const fetchMock = vi.fn(async () => {
    throw Error("timeout after send");
  });
  vi.stubGlobal("fetch", fetchMock);
  expect((await dispatchMessages(db)).processed).toBe(1);
  const notices = await svc.messages(c);
  expect(notices[0].status).toBe("unknown");
  await expect(svc.retry(c, String(notices[0].id))).rejects.toThrow(
    "Reconcile",
  );
  await dispatchMessages(db);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("round-trips quoted CSV and escapes spreadsheet formulas", () => {
  expect(parseCsv('household,name\n"Iyer, home","Arjun ""A"""\n')).toEqual([
    ["household", "name"],
    ["Iyer, home", 'Arjun "A"'],
  ]);
  expect(parseCsv(csvExport([["=CMD()", "Line\nbreak", 'a"b']]))).toEqual([
    ["'=CMD()", "Line\nbreak", 'a"b'],
  ]);
});
it("restores a 200-learner snapshot and preserves household statements without live sessions", async () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({
    ...family(),
    name: "Household " + i,
  }));
  await crm.importCommit(c, "scale-import-123", rows);
  const roster = await crm.roster(c);
  expect(roster.learners).toHaveLength(200);
  const household = String((await crm.list(c))[0].id);
  await billing.charge(c, {
    household,
    description: "Opening balance",
    amount: 150000,
    due: "2026-10-10",
    key: "restore-charge-123",
  });
  const original = await billing.statement(c, household),
    dump = await snapshot(db),
    target = localDatabase();
  try {
    await migrate(target);
    await restore(target, dump);
    expect(
      (await new BillingService(target).statement(c, household)).charges,
    ).toEqual(original.charges);
    expect((await target.query("SELECT * FROM learners")).rows).toHaveLength(
      200,
    );
    expect((await target.query("SELECT * FROM sessions")).rows).toHaveLength(0);
    await expect(restore(target, dump)).rejects.toThrow("empty");
    const envelope = JSON.parse(dump);
    envelope.payload += " ";
    await expect(restore(target, JSON.stringify(envelope))).rejects.toThrow(
      "checksum",
    );
  } finally {
    await target.close();
  }
}, 30000);

it("queues a common announcement once per household and rejects reusing its key for other text", async () => {
  const h = await crm.create(c, family()),
    svc = new AutomationService(db),
    body = {
      households: [h.id, h.id],
      message: "Recital invitation for your whole household",
      key: "common-notice-123",
    };
  await svc.announce(c, body);
  await svc.announce(c, body);
  expect(await svc.messages(c)).toHaveLength(1);
  await expect(
    svc.announce(c, { ...body, message: "Different message" }),
  ).rejects.toThrow("different recipients or text");
});
it("rejects idempotency keys reused for different money or import data", async () => {
  const h = await crm.create(c, family()),
    body = {
      household: h.id,
      description: "Tuition",
      amount: 10000,
      due: "2026-10-10",
      key: "invariant-charge-123",
    };
  await billing.charge(c, body);
  await expect(billing.charge(c, { ...body, amount: 20000 })).rejects.toThrow(
    "different details",
  );
  const p = {
    household: h.id,
    amount: 10000,
    method: "upi",
    key: "invariant-payment-123",
  };
  await billing.payment(c, p);
  await expect(billing.payment(c, { ...p, amount: 20000 })).rejects.toThrow(
    "different details",
  );
  await crm.importCommit(c, "invariant-import-123", [family()]);
  await expect(
    crm.importCommit(c, "invariant-import-123", [
      { ...family(), name: "Other household" },
    ]),
  ).rejects.toThrow("different rows");
});

it("orders curricula, protects lesson edits, and tracks each learner independently", async () => {
  const h = await crm.create(c, family());
  const learning = new LearningService(db);
  const later = await learning.createLesson(c, {
    curriculum: "Carnatic Junior",
    position: 2,
    title: "Second",
    level: "Beginner",
    module: "Swaras",
    musicNotes: "S R G M",
    published: true,
  });
  const first = await learning.createLesson(c, {
    curriculum: "Carnatic Junior",
    position: 1,
    title: "First",
    level: "Beginner",
    module: "Foundations",
    published: true,
  });
  const draft = await learning.createLesson(c, {
    curriculum: "Carnatic Junior",
    position: 3,
    title: "Draft",
    level: "Beginner",
    module: "Foundations",
  });
  const parent = await account(
    "curriculum-family@example.test",
    h.learners.map((resource) => ({ capability: "portal.learn", resource })),
  );
  const library = await learning.library(parent);
  expect(library.lessons.map((l) => l.id)).toEqual([first.id, later.id]);
  expect(library.lessons[0].eligible_learners).toEqual([h.learners[1]]);
  await learning.completeLesson(parent, {
    lesson: first.id,
    learner: h.learners[1],
    completed: true,
  });
  await learning.completeLesson(parent, {
    lesson: first.id,
    learner: h.learners[1],
    completed: true,
  });
  expect((await learning.library(parent)).progress).toHaveLength(1);
  await expect(
    learning.completeLesson(parent, {
      lesson: first.id,
      learner: h.learners[0],
      completed: true,
    }),
  ).rejects.toThrow("not available");
  await expect(
    learning.completeLesson(parent, {
      lesson: draft.id,
      learner: h.learners[1],
      completed: true,
    }),
  ).rejects.toThrow("not available");
  await expect(
    learning.updateLesson(parent, first.id, {
      title: "Changed",
      curriculum: "Other",
      position: 1,
      instructions: "",
      musicNotes: "",
    }),
  ).rejects.toThrow("access");
  await learning.updateLesson(c, later.id, {
    title: "Start here",
    curriculum: "Carnatic Junior",
    position: 1,
    instructions: "Listen",
    musicNotes: "S R1 G3 M1",
  });
  expect(
    (await learning.library(parent)).lessons.find((l) => l.id === later.id),
  ).toMatchObject({ title: "Start here", music_notes: "S R1 G3 M1" });
  await learning.completeLesson(parent, {
    lesson: first.id,
    learner: h.learners[1],
    completed: false,
  });
  expect((await learning.library(parent)).progress).toHaveLength(0);
  const outsider = await account("no-curriculum@example.test", []);
  await expect(
    learning.completeLesson(outsider, {
      lesson: first.id,
      learner: h.learners[1],
      completed: true,
    }),
  ).rejects.toThrow("permission");
});

it("validates lesson video and notes while retaining private access and audio-only tests", async () => {
  const learning = new LearningService(db);
  const h = await crm.create(c, family());
  const lesson = await learning.createLesson(c, {
    title: "Materials",
    level: "Beginner",
    module: "Demo",
    published: true,
  });
  const parent = await account("materials@example.test", [
    { capability: "portal.learn", resource: h.learners[1] },
  ]);
  const { readFile } = await import("node:fs/promises");
  for (const [filename, mime] of [
    ["eight-count-demo.mp4", "video/mp4"],
    ["music-notes.txt", "text/plain"],
  ]) {
    const bytes = await readFile("demo/carnatic-junior/" + filename);
    const a = await learning.reserve(c, {
      lesson: lesson.id,
      filename,
      mime,
      bytes: bytes.length,
    });
    for (let part = 0; part < a.chunks; part++)
      await learning.chunk(c, a.id, {
        part,
        data: bytes
          .subarray(part * chunkSize, (part + 1) * chunkSize)
          .toString("base64"),
      });
    await learning.finalize(c, a.id);
    expect((await learning.readAsset(parent, a.id)).bytes).toEqual(bytes);
    await learning.publish(c, lesson.id, false);
    await expect(learning.readAsset(parent, a.id)).rejects.toThrow("access");
    await learning.publish(c, lesson.id, true);
  }
  const invalid = Buffer.from("<html>This is not a PDF</html>");
  const a = await learning.reserve(c, {
    lesson: lesson.id,
    filename: "fake.pdf",
    mime: "application/pdf",
    bytes: invalid.length,
  });
  await learning.chunk(c, a.id, { part: 0, data: invalid.toString("base64") });
  await expect(learning.finalize(c, a.id)).rejects.toThrow("do not match");
  await expect(
    learning.reserve(parent, {
      learner: h.learners[1],
      filename: "test.mp4",
      mime: "video/mp4",
      bytes: 100,
    }),
  ).rejects.toThrow("audio recordings");
  await expect(
    learning.reserve(parent, {
      lesson: lesson.id,
      filename: "notes.txt",
      mime: "text/plain",
      bytes: 100,
    }),
  ).rejects.toThrow("access");
  const otherSchool = await provisionOwner(
    db,
    "Other media school",
    "email",
    "other-media@example.test",
    "other-media",
  );
  const other = { ...c, schoolId: otherSchool };
  await expect(learning.readAsset(other, a.id)).rejects.toThrow(
    "not available",
  );
});

it("persists per-recording note timing with teacher-only access and duration validation", async () => {
  const learning = new LearningService(db),
    h = await crm.create(c, family());
  const lesson = await learning.createLesson(c, {
    title: "Timed swaras",
    module: "Swaras",
    level: "Beginner",
    published: true,
  });
  const bytes = wav(1),
    asset = await learning.reserve(c, {
      lesson: lesson.id,
      filename: "scale.wav",
      mime: "audio/wav",
      bytes: bytes.length,
    });
  await learning.chunk(c, asset.id, {
    part: 0,
    data: bytes.toString("base64"),
  });
  await learning.finalize(c, asset.id);
  const parent = await account("score-parent@example.test", [
    { capability: "portal.learn", resource: h.learners[1] },
  ]);
  const cues = [
    { note: "S", start: 0, end: 0.5, beat: "1", barStart: true },
    { note: "R₁", start: 0.5, end: 1, beat: "2" },
  ];
  await expect(learning.saveScore(parent, asset.id, { cues })).rejects.toThrow(
    "access",
  );
  await learning.saveScore(c, asset.id, { cues });
  expect((await learning.library(parent)).assets[0].note_cues).toEqual(cues);
  await expect(
    learning.saveScore(c, asset.id, {
      cues: [{ note: "S", start: 0, end: 2 }],
    }),
  ).rejects.toThrow("duration");
  await expect(
    learning.saveScore(c, asset.id, { cues: [cues[1], cues[0]] }),
  ).rejects.toThrow("ordered");
  await expect(
    learning.saveScore(c, asset.id, { cues: [{ note: "", start: 0, end: 1 }] }),
  ).rejects.toThrow();
  await expect(
    learning.saveScore({ ...c, schoolId: crypto.randomUUID() }, asset.id, {
      cues,
    }),
  ).rejects.toThrow("not found");
  await learning.saveScore(c, asset.id, { cues: [] });
  expect((await learning.library(parent)).assets[0].note_cues).toEqual([]);
});
