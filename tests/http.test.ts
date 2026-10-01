import { beforeAll, afterAll, it, expect } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { Database } from "../src/server/db";
let app: NestFastifyApplication, db: Database, school: string, cookie: string;
const host = "sangeetha-music-school.music.test",
  origin = "http://" + host;
beforeAll(async () => {
  process.env.AUTH_MODE = "local";
  process.env.LOCAL_SEED = "1";
  process.env.LOCAL_DATABASE_PATH = ".data/http-tests";
  process.env.TENANT_ROOT_DOMAIN = "music.test";
  const fs = await import("node:fs/promises");
  await fs.rm(".data/http-tests", { recursive: true, force: true });
  const runtime = await (await import("../src/server/main")).createApp();
  app = runtime.app;
  db = runtime.db;
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  school = (await db.query<{ id: string }>("SELECT id FROM schools")).rows[0]
    .id;
}, 30000);
afterAll(async () => {
  await app?.close();
  await db?.close();
});
function request(
  method: "GET" | "POST" | "DELETE" | "PATCH",
  url: string,
  body?: unknown,
  extra: Record<string, string> = {},
) {
  return app.inject({
    method,
    url,
    headers: {
      host,
      origin,
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...extra,
    },
    payload: body === undefined ? undefined : JSON.stringify(body),
  });
}
it("blocks unauthenticated API calls and cross-origin writes", async () => {
  expect((await request("GET", "/api/me")).statusCode).toBe(401);
  expect(
    (
      await request(
        "POST",
        "/api/auth/local/start",
        { channel: "email", destination: "teacher@example.test" },
        { origin: "https://evil.test" },
      )
    ).statusCode,
  ).toBe(403);
});
it("issues HttpOnly host-only sessions after verification", async () => {
  const start = await request("POST", "/api/auth/local/start", {
    channel: "email",
    destination: "teacher@example.test",
  });
  expect(start.statusCode).toBe(201);
  const complete = await request(
    "POST",
    "/api/auth/local/complete",
    start.json(),
  );
  expect(complete.statusCode).toBe(201);
  const set = complete.headers["set-cookie"] as string;
  expect(set).toContain("HttpOnly");
  expect(set).toContain("SameSite=Lax");
  expect(set).not.toContain("Domain=");
  cookie = set.split(";")[0];
  const me = await request("GET", "/api/me");
  expect(me.statusCode).toBe(200);
  expect(me.json().schools[0].id).toBe(school);
});
it("checks subdomain scope before returning team data and rejects unknown hosts", async () => {
  const { provisionOwner } = await import("../src/server/admin-service");
  const other = await provisionOwner(
    db,
    "School Two",
    "email",
    "teacher@example.test",
    "school-two",
  );
  expect(
    (await request("GET", "/api/schools/" + other + "/team")).statusCode,
  ).toBe(403);
  expect(
    (
      await request("GET", "/api/me", undefined, {
        host: "school-two.music.test",
        origin: "http://school-two.music.test",
      })
    ).statusCode,
  ).toBe(401);
  expect(
    (
      await request("GET", "/api/auth/config", undefined, {
        host: "unknown.music.test",
      })
    ).statusCode,
  ).toBe(404);
});
it("runs international household and private recording workflows through HTTP", async () => {
  const command = (action: string, body: unknown) =>
    request("POST", "/api/schools/" + school + "/commands/" + action, body);
  const result = await command("household.create", {
    name: "International demo household",
    primary: 0,
    people: [
      { name: "Demo guardian", phone: "+1 202 555 0123", learner: true },
      { name: "Demo child", learner: true },
    ],
  });
  expect(result.statusCode).toBe(201);
  const household = result.json();
  expect(
    (
      await request(
        "GET",
        "/api/schools/" + school + "/views/household?id=" + household.id,
      )
    ).json().people.find((p:{name:string})=>p.name==='Demo guardian').phone,
  ).toBe("+12025550123");
  const bytes = Buffer.alloc(16044);
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
  bytes.writeUInt32LE(16000, 40);
  const asset = (
    await command("media.reserve", {
      learner: household.learners[0],
      filename: "demo.wav",
      mime: "audio/wav",
      bytes: bytes.length,
    })
  ).json();
  expect(
    (
      await command("media.chunk", {
        id: asset.id,
        part: 0,
        data: bytes.toString("base64"),
      })
    ).statusCode,
  ).toBe(201);
  expect(
    (await command("media.finalize", { id: asset.id })).json().durationMs,
  ).toBe(1000);
  const media = await request(
    "GET",
    "/api/schools/" + school + "/media/" + asset.id,
    undefined,
    { range: "bytes=0-43" },
  );
  expect(media.statusCode).toBe(206);
  expect(media.rawPayload).toEqual(bytes.subarray(0, 44));
  expect(media.headers["cache-control"]).toBe("private, no-store");
  expect(
    (
      await command("billing.charge", {
        household: household.id,
        description: "Test tuition",
        amount: 10000,
        due: "2099-01-01",
        key: "http-international-charge",
      })
    ).statusCode,
  ).toBe(201);
  const { AutomationService } = await import("../src/server/school/automation");
  const { AdminService } = await import("../src/server/admin-service");
  const session = (await new AdminService(db).session(
    cookie.split("=")[1],
    school,
  ))!;
  await new AutomationService(db).refresh({ schoolId: school, session });
  const notice = (
    await db.query<{ id: string }>(
      "SELECT id FROM communications WHERE school_id=$1",
      [school],
    )
  ).rows[0];
  await db.query(
    "UPDATE communications SET status='sent',provider_id='wamid_test' WHERE school_id=$1 AND id=$2",
    [school, notice.id],
  );
  await db.query(
    "INSERT INTO school_integrations(school_id,whatsapp_phone_id) VALUES($1,'123456')",
    [school],
  );
  process.env.WHATSAPP_APP_SECRET = "test-webhook-secret";
  const { createHmac } = await import("node:crypto");
  const raw =
    ' { \n "entry": ' +
    JSON.stringify([
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "123456" },
              statuses: [{ id: "wamid_test", status: "delivered" }],
            },
          },
        ],
      },
    ]) +
    " }";
  const signature =
    "sha256=" +
    createHmac("sha256", "test-webhook-secret").update(raw).digest("hex");
  try {
    const callback = await app.inject({
      method: "POST",
      url: "/api/integrations/whatsapp",
      headers: {
        host,
        "content-type": "application/json",
        "x-hub-signature-256": signature,
      },
      payload: raw,
    });
    expect(callback.statusCode).toBe(201);
    expect(
      (
        await db.query(
          "SELECT status FROM communications WHERE school_id=$1 AND id=$2",
          [school, notice.id],
        )
      ).rows[0].status,
    ).toBe("delivered");
    expect(
      (await request("POST", "/api/integrations/whatsapp", {})).statusCode,
    ).toBe(401);
  } finally {
    delete process.env.WHATSAPP_APP_SECRET;
  }
});
it("creates invitations, validates input and signs out", async () => {
  expect(
    (
      await request("POST", "/api/schools/" + school + "/invitations", {
        channel: "phone",
        destination: "9876543210",
      })
    ).statusCode,
  ).toBe(201);
  expect(
    (await request("GET", "/api/schools/" + school + "/team")).json()
      .invitations,
  ).toHaveLength(1);
  expect(
    (await request("PATCH", "/api/account", { name: "" })).statusCode,
  ).toBe(400);
  expect(
    (await request("PATCH", "/api/account", { name: "Music Teacher" }))
      .statusCode,
  ).toBe(200);
  expect((await request("POST", "/api/logout", {})).statusCode).toBe(201);
  expect((await request("GET", "/api/me")).statusCode).toBe(401);
});
