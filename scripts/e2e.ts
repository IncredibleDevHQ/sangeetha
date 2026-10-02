import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Actual HTTP journeys against a fresh local database. No provider sends or payments.
async function main() {
  if (process.env.NODE_ENV === "production" || process.env.DATABASE_URL)
    throw Error("E2E runs require an isolated local database.");
  const run = randomUUID(),
    root = path.resolve(".data/e2e/" + run);
  await mkdir(root, { recursive: true });
  process.env.AUTH_MODE = "local";
  process.env.LOCAL_SEED = "1";
  process.env.LOCAL_DATABASE_PATH = root + "/db";
  process.env.MEDIA_PATH = root + "/media";
  delete process.env.TENANT_ROOT_DOMAIN;
  process.env.PUBLIC_ORIGIN = "http://localhost:5181";
  const { createApp } = await import("../src/server/main");
  const { app, db } = await createApp();
  await app.register((await import("@fastify/static")).default, {
    root: path.resolve("dist/web"),
    prefix: "/",
    index: "index.html",
  });
  await app.listen(5181, "127.0.0.1");
  const base = "http://localhost:5181";
  type Actor = { name: string; cookie: string; id?: string };
  const checks: { name: string; status: string }[] = [];
  let school = "";
  const anon: Actor = { name: "anonymous", cookie: "" };
  async function request(
    actor: Actor,
    method: string,
    url: string,
    body?: unknown,
    expected = method === "POST" ? 201 : 200,
    headers: Record<string, string> = {},
  ) {
    const res = await fetch(base + url, {
      method,
      headers: {
        origin: base,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(actor.cookie ? { cookie: actor.cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const data = text
      ? res.headers.get("content-type")?.includes("json")
        ? JSON.parse(text)
        : text
      : {};
    assert.equal(
      res.status,
      expected,
      `${actor.name} ${method} ${url}: ${text}`,
    );
    checks.push({
      name: `${actor.name}: ${method} ${url.replace(school, "{school}")}`,
      status: "pass",
    });
    return { data, res };
  }
  const cmd = async (
    actor: Actor,
    action: string,
    body: unknown = {},
    status = 201,
  ) =>
    (
      await request(
        actor,
        "POST",
        `/api/schools/${school}/commands/${action}`,
        body,
        status,
      )
    ).data;
  const view = async (actor: Actor, name: string, query = "", status = 200) =>
    (
      await request(
        actor,
        "GET",
        `/api/schools/${school}/views/${name}${query}`,
        undefined,
        status,
      )
    ).data;
  function verify(name: string, condition: unknown) {
    assert.ok(condition, name);
    checks.push({ name, status: "pass" });
  }
  async function login(name: string, destination: string, channel = "email") {
    const actor: Actor = { name, cookie: "" };
    const start = (
      await request(actor, "POST", "/api/auth/local/start", {
        channel,
        destination,
      })
    ).data;
    const complete = await request(
      actor,
      "POST",
      "/api/auth/local/complete",
      start,
    );
    actor.cookie = complete.res.headers.getSetCookie()[0].split(";")[0];
    const me = (await request(actor, "GET", "/api/me")).data;
    await request(actor, "PATCH", "/api/account", { name: "E2E " + name });
    const { AdminService } = await import("../src/server/admin-service");
    actor.id = (await new AdminService(db).session(
      actor.cookie.split("=")[1],
    ))!.accountId;
    return { actor, me };
  }
  const future = (days: number, hour = 12) => {
    const d = new Date(Date.now() + days * 86400000);
    d.setUTCHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const due = future(7).slice(0, 10);
  async function upload(
    actor: Actor,
    target: { lesson?: string; learner?: string },
    filename: string,
    mime: string,
  ) {
    const bytes = await readFile("demo/carnatic-junior/" + filename);
    const asset = await cmd(actor, "media.reserve", {
      ...target,
      filename,
      mime,
      bytes: bytes.length,
    });
    await cmd(actor, "media.finalize", { id: asset.id }, 409);
    for (let part = 0; part < asset.chunks; part++)
      await cmd(actor, "media.chunk", {
        id: asset.id,
        part,
        data: bytes
          .subarray(part * 262144, (part + 1) * 262144)
          .toString("base64"),
      });
    await view(actor, "upload-status", "?id=" + asset.id);
    await cmd(actor, "media.finalize", { id: asset.id });
    await cmd(actor, "media.finalize", { id: asset.id });
    return asset.id as string;
  }
  let failed: unknown;
  try {
    await request(anon, "GET", "/api/me", undefined, 401);
    await request(
      anon,
      "POST",
      "/api/auth/local/start",
      { channel: "email", destination: "teacher@example.test" },
      403,
      { origin: "https://wrong.test" },
    );
    const { actor: owner, me } = await login("Owner", "teacher@example.test");
    school = me.schools[0].id;
    await request(owner, "PATCH", "/api/account", { name: "E2E School Owner" });
    const h = await cmd(owner, "household.create", {
      name: "E2E Rao family",
      primary: 0,
      people: [
        {
          name: "E2E Meera",
          phone: "+1 202 555 0123",
          learner: true,
          level: "Beginner",
          relationship: "Mother",
        },
        {
          name: "E2E Arjun",
          learner: true,
          level: "Beginner",
          relationship: "Son",
        },
      ],
    });
    const unrelated = await cmd(owner, "household.create", {
      name: "E2E Other family",
      primary: 0,
      people: [
        { name: "E2E Other learner", phone: "+44 20 7946 0123", learner: true },
      ],
    });
    let detail = await view(owner, "household", "?id=" + h.id);
    verify(
      "International primary number is normalized; two separate learners",
      detail.people.find((p: any) => p.id === h.people[0]).phone ===
        "+12025550123" && h.learners.length === 2,
    );
    await cmd(owner, "household.update", {
      id: h.id,
      name: "E2E Rao family",
      primary: h.people[0],
      billing: h.people[0],
      version: detail.household.version,
    });
    await cmd(
      owner,
      "household.update",
      {
        id: h.id,
        name: "Stale",
        primary: h.people[0],
        billing: h.people[0],
        version: detail.household.version,
      },
      409,
    );
    await cmd(owner, "person.update", {
      id: h.people[0],
      name: "E2E Meera",
      phone: "+12025550123",
      email: "",
      learner: true,
      level: "Beginner",
      optOut: false,
    });
    await cmd(owner, "guardian.relationship", {
      guardian: h.people[0],
      dependant: h.people[1],
    });
    await cmd(owner, "household.note", {
      id: h.id,
      text: "E2E internal note: never show in the learner portal.",
    });
    await cmd(owner, "household.task", {
      id: h.id,
      title: "E2E call guardian",
      due,
    });
    detail = await view(owner, "household", "?id=" + h.id);
    await cmd(owner, "task.complete", { id: detail.tasks[0].id });
    await cmd(owner, "view.save", { name: "E2E families", query: "E2E" });
    await view(owner, "saved-views");
    const importRows = [
      {
        name: "E2E imported family",
        primary: 0,
        people: [
          {
            name: "E2E imported learner",
            phone: "+919876500123",
            learner: true,
          },
        ],
      },
    ];
    await cmd(owner, "import.preview", { rows: importRows });
    const imported = await cmd(owner, "import.commit", {
      rows: importRows,
      key: "e2e-import-001",
    });
    const again = await cmd(owner, "import.commit", {
      rows: importRows,
      key: "e2e-import-001",
    });
    verify(
      "Import replay is idempotent",
      JSON.stringify(imported) === JSON.stringify(again),
    );
    const batch = await cmd(owner, "batch.create", {
      name: "E2E Carnatic Junior",
      course: "Carnatic",
      capacity: 10,
    });
    const enrollments = [];
    for (const learner of h.learners)
      enrollments.push(
        await cmd(owner, "learner.enroll", {
          learner,
          batch: batch.id,
          household: h.id,
          starts: new Date().toISOString().slice(0, 10),
        }),
      );
    const invite = async (
      email: string,
      capability: string,
      resource: string,
    ) =>
      cmd(owner, "grant.invite", {
        channel: "email",
        destination: email,
        capability,
        resource,
      });
    await invite("student@example.test", "portal.learn", h.learners[1]);
    for (const learner of h.learners)
      await invite("parent@example.test", "portal.learn", learner);
    await invite("parent@example.test", "household.billing", h.id);
    await invite("tutor@example.test", "classes.teach", batch.id);
    await invite("finance@example.test", "finance.manage", school);
    await invite("creator@example.test", "curriculum.manage", school);
    const { actor: creator } = await login(
      "Curriculum Creator",
      "creator@example.test",
    );
    verify(
      "Creator receives explicit curriculum capability",
      (await view(creator, "bootstrap")).capabilities.includes(
        "curriculum.manage",
      ),
    );
    await view(creator, "households", "", 403);
    await view(creator, "billing", "", 403);
    verify(
      "Creator sees no assigned reviews",
      (await view(creator, "tests")).submissions.length === 0,
    );
    const structured = await cmd(creator, "lesson.create", {
      title: "E2E creator lesson",
      curriculum: "Vocal exploration",
      category: "Repertoire",
      categoryPosition: 2,
      module: "Geethams",
      blockPosition: 1,
      position: 1,
      level: "Advanced",
      published: false,
    });
    await cmd(creator, "lesson.update", {
      id: structured.id,
      title: "E2E creator lesson",
      curriculum: "Vocal exploration",
      category: "Technique",
      categoryPosition: 1,
      module: "Breath",
      blockPosition: 2,
      position: 1,
      musicNotes: "S",
      instructions: "Listen first",
    });
    verify(
      "Creator can move a lesson between categories and blocks",
      (await view(creator, "library")).lessons.find(
        (l: any) => l.id === structured.id,
      ).module === "Breath",
    );

    await request(owner, "POST", `/api/schools/${school}/invitations`, {
      channel: "email",
      destination: "admin@example.test",
    });
    const { actor: student } = await login("Student", "student@example.test");
    const { actor: parent } = await login("Parent", "parent@example.test");
    const { actor: tutor } = await login("Tutor", "tutor@example.test");
    const { actor: finance } = await login("Finance", "finance@example.test");
    const { actor: admin } = await login("Admin", "admin@example.test");
    const { actor: outsider, me: outsiderMe } = await login(
      "Outsider",
      "outsider@example.test",
    );
    verify(
      "Uninvited sign-in receives no school",
      outsiderMe.schools.length === 0,
    );
    await view(outsider, "library", "", 403);
    for (const actor of [student, parent, tutor]) {
      await view(actor, "households", "", 403);
      await view(actor, "billing", "", 403);
      await view(actor, "grants", "", 403);
    }
    await view(admin, "billing", "", 403);
    await view(admin, "households");
    await view(finance, "billing-metadata");
    await view(finance, "households", "", 403);
    const classBody = {
      batch: batch.id,
      teacher: tutor.id,
      starts: future(1),
      ends: future(1, 13),
      location: "E2E music room",
      repeatWeeks: 2,
    };
    const classes = await cmd(owner, "class.create", classBody);
    await cmd(owner, "class.create", classBody, 409);
    await cmd(tutor, "class.attendance", {
      id: classes.ids[0],
      entries: [
        { learner: h.learners[0], status: "present" },
        { learner: h.learners[1], status: "absent" },
      ],
      notes: "E2E private class note",
    });
    const schedule = await view(owner, "schedule");
    const occurrence = schedule.classes.find(
      (r: any) => r.id === classes.ids[0],
    );
    await cmd(owner, "class.update", {
      id: occurrence.id,
      starts: future(1, 14),
      ends: future(1, 15),
      teacher: tutor.id,
      location: "E2E updated room",
      status: "scheduled",
      version: occurrence.version,
    });
    const portal = await view(student, "portal");
    verify(
      "Student sees only own learner and no internal notes",
      portal.learners.length === 1 &&
        !JSON.stringify(portal).includes("E2E internal") &&
        !JSON.stringify(portal).includes("E2E private"),
    );
    verify(
      "Student sees updated class location",
      portal.classes.some((o: any) => o.location === "E2E updated room"),
    );
    verify(
      "Family sees both learners",
      (await view(parent, "portal")).learners.length === 2,
    );
    const lesson = await cmd(tutor, "lesson.create", {
      title: "E2E Swara foundations",
      raga: "Mayamalavagowla",
      tala: "Adi",
      curriculum: "Carnatic Junior",
      position: 1,
      level: "Beginner",
      module: "Foundations",
      batch: batch.id,
      instructions: "Listen, read the swaras, then practise.",
      musicNotes: "S R1 G3 M1 | P D1 N3 S (upper)",
    });
    verify(
      "Student cannot see draft lessons",
      (await view(student, "library")).lessons.length === 0,
    );
    const audio = await upload(
      tutor,
      { lesson: lesson.id },
      "swara-demo.wav",
      "audio/wav",
    );
    const video = await upload(
      tutor,
      { lesson: lesson.id },
      "eight-count-demo.mp4",
      "video/mp4",
    );
    await upload(tutor, { lesson: lesson.id }, "music-notes.txt", "text/plain");
    await request(
      student,
      "GET",
      `/api/schools/${school}/media/${audio}`,
      undefined,
      403,
    );
    await cmd(tutor, "lesson.publish", { id: lesson.id, published: true });
    await cmd(tutor, "lesson.update", {
      id: lesson.id,
      title: "E2E Swara foundations",
      raga: "Mayamalavagowla",
      tala: "Adi",
      curriculum: "Carnatic Junior",
      position: 1,
      instructions: "Listen and watch, read the notes, then practise.",
      musicNotes: "S R1 G3 M1 | P D1 N3 S (upper)",
    });
    await cmd(student, "lesson.update", { id: lesson.id }, 403);
    const cues = [
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
      start: i / 2,
      end: (i + 1) / 2,
      beat: String((i % 8) + 1),
    }));
    await cmd(tutor, "media.score", { id: audio, cues });
    await cmd(student, "media.score", { id: audio, cues }, 403);
    await cmd(
      tutor,
      "media.score",
      { id: audio, cues: [{ note: "S", start: 0, end: 9 }] },
      400,
    );
    await cmd(tutor, "media.score", { id: video, cues }, 400);
    const scoredLibrary = await view(student, "library");
    verify(
      "Student receives synchronized notes",
      scoredLibrary.assets.find((a: any) => a.id === audio).note_cues.length ===
        16,
    );
    verify(
      "Player receives raagam and thaalam",
      scoredLibrary.lessons[0].raga === "Mayamalavagowla" &&
        scoredLibrary.lessons[0].tala === "Adi",
    );

    await request(
      student,
      "GET",
      `/api/schools/${school}/media/${audio}`,
      undefined,
      206,
      { range: "bytes=0-43" },
    );
    await request(student, "GET", `/api/schools/${school}/media/${video}`);
    await cmd(student, "lesson.complete", {
      lesson: lesson.id,
      learner: h.learners[1],
      completed: true,
    });
    verify(
      "Completion persists",
      (await view(student, "library")).progress.length === 1,
    );
    verify(
      "Sibling has independent completion",
      (await view(parent, "library")).progress.every(
        (p: any) => p.learner_id === h.learners[1],
      ),
    );
    await cmd(
      student,
      "lesson.complete",
      { lesson: lesson.id, learner: h.learners[0], completed: true },
      403,
    );
    const second = await cmd(tutor, "lesson.create", {
      title: "E2E Rhythm practice",
      curriculum: "Carnatic Junior",
      position: 2,
      level: "Beginner",
      module: "Rhythm",
      batch: batch.id,
      published: true,
    });
    await cmd(tutor, "practice.create", {
      lesson: lesson.id,
      learner: h.learners[1],
      text: "E2E practise the swaras three times",
      due,
    });
    const practice = (await view(student, "portal")).practice[0];
    await cmd(student, "practice.complete", { id: practice.id });
    const taxonomy = await cmd(owner, "taxonomy.create", {
      labels: ["Shruti", "Rhythm"],
    });
    const test = await cmd(owner, "test.create", {
      title: "E2E Carnatic Junior assessment",
      instructions: "Upload one slow practice recording.",
      rubric: [{ name: "Pitch", max: 10 }],
      due: future(7),
      taxonomy: taxonomy.version,
      learners: [h.learners[1]],
      published: true,
    });
    await invite("reviewer@example.test", "assessments.review", test.id);
    const { actor: reviewer } = await login(
      "Reviewer",
      "reviewer@example.test",
    );
    const recording = await upload(
      student,
      { learner: h.learners[1] },
      "swara-demo.wav",
      "audio/wav",
    );
    const submission = await cmd(student, "test.submit", {
      test: test.id,
      learner: h.learners[1],
      assets: [recording],
    });
    await cmd(reviewer, "review.annotate", {
      submission: submission.id,
      asset: recording,
      kind: "interval",
      start: 1000,
      end: 2000,
      label: "Shruti",
      comment: "E2E: sustain Ri steadily.",
      exercise: "Repeat slowly with the reference.",
    });
    await cmd(reviewer, "review.score", {
      id: submission.id,
      scores: { Pitch: 8 },
    });
    verify(
      "Draft feedback is invisible to learner",
      (await view(student, "annotations", "?id=" + submission.id)).length === 0,
    );
    await cmd(
      reviewer,
      "review.moderate",
      { id: submission.id, publish: true },
      403,
    );
    await cmd(owner, "review.moderate", { id: submission.id, publish: true });
    verify(
      "Published timed feedback is visible",
      (await view(student, "annotations", "?id=" + submission.id))[0]
        .start_ms === 1000,
    );
    verify(
      "Export initially excludes unconsented data",
      (await view(owner, "dataset")).length === 0,
    );
    for (const purpose of ["recording-reuse", "label-export"])
      await cmd(student, "dataset.consent", {
        learner: h.learners[1],
        purpose,
        allowed: true,
      });
    verify(
      "Export includes consented verified label",
      (await view(owner, "dataset")).length === 1,
    );
    await cmd(student, "dataset.consent", {
      learner: h.learners[1],
      purpose: "label-export",
      allowed: false,
    });
    verify(
      "Consent withdrawal removes export eligibility",
      (await view(owner, "dataset")).length === 0,
    );
    const resubmission = await cmd(student, "test.submit", {
      test: test.id,
      learner: h.learners[1],
      assets: [recording],
    });
    verify(
      "Resubmission creates a new immutable version",
      resubmission.id !== submission.id,
    );
    await cmd(owner, "test.update", {
      id: test.id,
      due: future(8),
      published: true,
    });
    for (const enrollment of enrollments)
      await cmd(finance, "billing.plan", {
        enrollment: enrollment.id,
        amount: 150000,
        concession: 0,
        dueDay: 10,
      });
    const period = new Date().toISOString().slice(0, 7);
    await cmd(finance, "billing.generate", { period });
    await cmd(finance, "billing.generate", { period });
    let statement = await view(parent, "statement", "?id=" + h.id);
    verify(
      "Repeated generation produces one charge per learner",
      statement.charges.length === 2,
    );
    const pay = await cmd(parent, "billing.payment", {
      household: h.id,
      amount: 200000,
      method: "bank",
      reference: "E2E bank reference",
      key: "e2e-payment-001",
    });
    await cmd(parent, "billing.verify", { id: pay.id }, 403);
    await cmd(finance, "billing.verify", { id: pay.id });
    await cmd(finance, "billing.allocate", {
      id: pay.id,
      key: "e2e-allocation-001",
      lines: [
        { charge: statement.charges[0].id, amount: 150000 },
        { charge: statement.charges[1].id, amount: 50000 },
      ],
    });
    statement = await view(parent, "statement", "?id=" + h.id);
    verify(
      "Shared payment leaves the expected household balance",
      statement.charges.reduce((n: number, r: any) => n + Number(r.due), 0) ===
        100000,
    );
    verify(
      "Verified payment has a receipt",
      Boolean(statement.payments[0].receipt),
    );
    await view(parent, "statement", "?id=" + unrelated.id, 403);
    await cmd(finance, "billing.correct", {
      kind: "adjustment",
      id: statement.charges[1].id,
      amount: -10000,
      reason: "E2E concession",
      key: "e2e-adjustment-001",
    });
    const credit = await cmd(finance, "billing.payment", {
      household: h.id,
      amount: 10000,
      method: "cash",
      reference: "E2E credit",
      key: "e2e-credit-001",
    });
    await cmd(finance, "billing.verify", { id: credit.id });
    await cmd(finance, "billing.correct", {
      kind: "refund",
      id: credit.id,
      amount: 10000,
      reason: "E2E return credit",
      key: "e2e-refund-001",
    });
    const event = await cmd(owner, "event.create", {
      title: "E2E Junior recital",
      starts: future(10),
      venue: "School hall",
      contribution: 25000,
      basis: "household",
    });
    await cmd(parent, "event.register", {
      event: event.id,
      household: h.id,
      people: h.people,
    });
    await cmd(parent, "event.register", {
      event: event.id,
      household: h.id,
      people: h.people,
    });
    await cmd(owner, "event.programme", {
      event: event.id,
      person: h.people[1],
      performing: true,
      order: 1,
      piece: "Swaras",
      rehearsal: "Before the event",
    });
    await cmd(finance, "event.expense", {
      event: event.id,
      description: "E2E venue deposit",
      amount: 5000,
      key: "e2e-expense-001",
    });
    await view(finance, "event-accounts", "?id=" + event.id);
    verify(
      "Shared event contribution is charged once",
      (await view(parent, "statement", "?id=" + h.id)).charges.filter(
        (r: any) => r.event_id === event.id,
      ).length === 1,
    );
    await cmd(owner, "message.announce", {
      households: [h.id],
      message: "E2E school announcement",
      key: "e2e-announcement-001",
    });
    await cmd(owner, "messages.refresh");
    await view(owner, "messages");
    for (const name of [
      "bootstrap",
      "households",
      "roster",
      "schedule",
      "billing",
      "library",
      "tests",
      "events",
      "reports",
      "integrations",
      "payment-links",
      "grants",
    ])
      await view(owner, name);
    await view(parent, "family-events");
    await view(tutor, "portal");
    await view(reviewer, "tests");
    await cmd(owner, "enrollment.status", {
      id: enrollments[0].id,
      status: "paused",
    });
    await cmd(owner, "enrollment.status", {
      id: enrollments[0].id,
      status: "active",
    });
    await cmd(owner, "learner.transfer", {
      learner: h.learners[1],
      household: unrelated.id,
    });
    verify(
      "Transfer preserves historical charges",
      (await view(parent, "statement", "?id=" + h.id)).charges.length >= 2,
    );
    await cmd(owner, "learner.transfer", {
      learner: h.learners[1],
      household: h.id,
    });
    const extraCharge = await cmd(finance, "billing.charge", {
      household: unrelated.id,
      learner: unrelated.learners[0],
      description: "E2E corrected charge",
      amount: 10000,
      due,
      key: "e2e-charge-extra",
    });
    await cmd(finance, "billing.correct", {
      kind: "adjustment",
      id: extraCharge.id,
      amount: -10000,
      reason: "E2E void charge",
      key: "e2e-void-charge",
    });
    const cancelledEvent = await cmd(owner, "event.create", {
      title: "E2E cancelled workshop",
      starts: future(11),
      venue: "School hall",
      contribution: 10000,
      basis: "person",
    });
    await cmd(owner, "event.cancel", { id: cancelledEvent.id });
    await cmd(
      parent,
      "event.register",
      { event: cancelledEvent.id, household: h.id, people: h.people },
      409,
    );
    const secondOccurrence = (await view(owner, "schedule")).classes.find(
      (r: any) => r.id === classes.ids[1],
    );
    await cmd(owner, "class.update", {
      id: secondOccurrence.id,
      starts: secondOccurrence.starts_at,
      ends: secondOccurrence.ends_at,
      teacher: tutor.id,
      location: "School hall",
      status: "cancelled",
      version: secondOccurrence.version,
    });
    await cmd(owner, "class.create", {
      batch: batch.id,
      teacher: tutor.id,
      starts: future(9),
      ends: future(9, 13),
      location: "E2E make-up room",
      makeupFor: secondOccurrence.id,
    });
    await cmd(owner, "integrations.update", {
      enabled: false,
      template: "school_update",
      language: "en",
      dailyLimit: 100,
    });
    const notices = await view(owner, "messages");
    const announcement = notices.find((n: any) => n.kind === "announcement");
    const preview = await cmd(owner, "message.manual", { id: announcement.id });
    verify(
      "Manual preview resolves household contact",
      preview.url.startsWith("https://wa.me/12025550123"),
    );
    // Fault injection exercises recovery controls, without contacting a provider.
    await db.query(
      "UPDATE communications SET status='failed',attempts=1 WHERE school_id=$1 AND id=$2",
      [school, announcement.id],
    );
    await cmd(owner, "message.retry", { id: announcement.id });
    await db.query(
      "UPDATE communications SET status='unknown' WHERE school_id=$1 AND id=$2",
      [school, announcement.id],
    );
    await cmd(owner, "message.retry", { id: announcement.id }, 409);
    await cmd(owner, "message.reconcile", {
      id: announcement.id,
      status: "cancelled",
      reason: "E2E provider outcome checked; no send",
    });
    const originalKeys = {
      key: process.env.RAZORPAY_KEY_ID,
      secret: process.env.RAZORPAY_KEY_SECRET,
      json: process.env.RAZORPAY_KEYS_JSON,
    };
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_KEYS_JSON;
    await cmd(
      finance,
      "payment-link.create",
      {
        household: h.id,
        charges: [statement.charges[1].id],
        key: "e2e-unconfigured-link",
      },
      503,
    );
    await cmd(
      student,
      "payment-link.reconcile",
      { id: randomUUID(), providerId: "e2e-provider-link" },
      403,
    );
    if (originalKeys.key) process.env.RAZORPAY_KEY_ID = originalKeys.key;
    if (originalKeys.secret)
      process.env.RAZORPAY_KEY_SECRET = originalKeys.secret;
    if (originalKeys.json) process.env.RAZORPAY_KEYS_JSON = originalKeys.json;
    const temp = await invite(
      "revoked@example.test",
      "portal.learn",
      h.learners[1],
    );
    await cmd(owner, "grant.revoke", { id: temp.id, invitation: true });
    const { actor: revoked, me: revokedMe } = await login(
      "Revoked invite",
      "revoked@example.test",
    );
    verify(
      "Revoked invitation grants no access",
      revokedMe.schools.length === 0,
    );
    await request(revoked, "POST", "/api/logout", {});
    await request(revoked, "GET", "/api/me", undefined, 401);
    const grants = await view(owner, "grants");
    const reviewGrant = grants.grants.find(
      (g: any) => g.account_id === reviewer.id,
    );
    await cmd(owner, "grant.revoke", { id: reviewGrant.id });
    await request(
      reviewer,
      "GET",
      `/api/schools/${school}/media/${recording}`,
      undefined,
      403,
    );
    // Restore the reviewer through the same invite + login flow for browser testing.
    await invite("reviewer@example.test", "assessments.review", test.id);
    await login("Reviewer re-invited", "reviewer@example.test");
    await writeFile(
      root + "/fixtures.json",
      JSON.stringify(
        {
          school,
          household: h,
          batch: batch.id,
          test: test.id,
          submission: submission.id,
          resubmission: resubmission.id,
          event: event.id,
          lesson: lesson.id,
          second: second.id,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    failed = error;
    console.error(error);
  } finally {
    await writeFile(
      root + "/report.json",
      JSON.stringify(
        {
          run,
          at: new Date().toISOString(),
          checks,
          failed: failed instanceof Error ? failed.message : null,
        },
        null,
        2,
      ),
    );
    console.log(
      `${checks.length} HTTP checks passed. Report: ${root}/report.json`,
    );
    if (!failed && process.argv.includes("--serve"))
      console.log(
        "Browser test school ready at http://localhost:5181. Personas: teacher, student, parent, tutor, reviewer, finance, admin @example.test.",
      );
    else {
      await app.close();
      await db.close();
    }
    if (failed) process.exitCode = 1;
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
