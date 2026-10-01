import { beforeAll, afterAll, it, expect } from "vitest";
import { createServer, type Server } from "node:http";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { localDatabase, migrate, type Database } from "../src/server/db";
import { IdentityAdapter, fromClaims, localMode } from "../src/server/identity";
let server: Server,
  db: Database,
  adapter: IdentityAdapter,
  issuer: string,
  token: string,
  tokenBody: string;
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
beforeAll(async () => {
  db = localDatabase();
  await migrate(db);
  keys = await generateKeyPair("RS256");
  const jwk = await exportJWK(keys.publicKey);
  server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/.well-known/openid-configuration") {
      res.end(
        JSON.stringify({
          issuer,
          authorization_endpoint: issuer + "/authorize",
          token_endpoint: issuer + "/token",
          jwks_uri: issuer + "/jwks",
        }),
      );
    } else if (req.url === "/jwks") {
      res.end(
        JSON.stringify({
          keys: [{ ...jwk, kid: "test-key", alg: "RS256", use: "sig" }],
        }),
      );
    } else if (req.url === "/token") {
      tokenBody = "";
      for await (const chunk of req) tokenBody += chunk;
      res.end(JSON.stringify({ id_token: token }));
    } else {
      res.statusCode = 404;
      res.end("{}");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  issuer = "http://127.0.0.1:" + (server.address() as { port: number }).port;
  process.env.OIDC_ISSUER = issuer;
  process.env.OIDC_CLIENT_ID = "test-client";
  process.env.OIDC_CLIENT_SECRET = "test-secret";
  process.env.PUBLIC_ORIGIN = "http://app.music.test";
  adapter = new IdentityAdapter(db);
}, 30000);
afterAll(async () => {
  await db.close();
  await new Promise<void>((resolve, reject) =>
    server.close((e) => (e ? reject(e) : resolve())),
  );
});
async function sign(nonce: string, audience = "test-client") {
  return new SignJWT({
    nonce,
    auth_time: Math.floor(Date.now() / 1000),
    email: "teacher@example.test",
    email_verified: true,
    sangeetha_identities: [
      { provider: "google.com", uid: "subject", label: "teacher@example.test" },
    ],
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject("subject")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(keys.privateKey);
}
it("validates a signed OIDC response, uses PKCE, binds callback host and consumes state once", async () => {
  const origin = "http://school-one.music.test",
    flow = await adapter.begin("google", undefined, origin),
    url = new URL(flow.url);
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("redirect_uri")).toBe(
    origin + "/api/auth/callback",
  );
  const nonce = url.searchParams.get("nonce")!;
  token = await sign(nonce);
  expect(
    (await adapter.complete(flow.state, "provider-code", origin)).identity
      .email,
  ).toBe("teacher@example.test");
  expect(new URLSearchParams(tokenBody).get("code_verifier")).toHaveLength(43);
  await expect(
    adapter.complete(flow.state, "provider-code", origin),
  ).rejects.toThrow("expired");
});
it("rejects wrong nonce, wrong audience, cross-host callbacks and missing verified identity claims", async () => {
  const flow = await adapter.begin("google");
  token = await sign("wrong-nonce");
  await expect(adapter.complete(flow.state, "code")).rejects.toThrow(
    "Invalid identity",
  );
  const audienceFlow = await adapter.begin("google");
  token = await sign(
    new URL(audienceFlow.url).searchParams.get("nonce")!,
    "different-client",
  );
  await expect(adapter.complete(audienceFlow.state, "code")).rejects.toThrow(
    "Invalid identity",
  );
  const cross = await adapter.begin(
    "phone",
    undefined,
    "http://school-one.music.test",
  );
  await expect(
    adapter.complete(cross.state, "code", "http://school-two.music.test"),
  ).rejects.toThrow("different workspace");
  expect(() =>
    fromClaims(
      {
        sub: "subject",
        auth_time: Date.now() / 1000,
        email: "unverified@example.test",
        sangeetha_identities: [
          {
            provider: "google.com",
            uid: "subject",
            label: "unverified@example.test",
          },
        ],
      },
      issuer,
    ),
  ).toThrow("verified");
});
it("keeps broker subjects separate by method and disables the simulator in production", () => {
  const base = { sub: "same-subject", auth_time: Date.now() / 1000 };
  const google = fromClaims(
      {
        ...base,
        email: "teacher@example.test",
        email_verified: true,
        sangeetha_identities: [
          {
            provider: "google.com",
            uid: "same-subject",
            label: "teacher@example.test",
          },
        ],
      },
      issuer,
    ),
    phone = fromClaims(
      {
        ...base,
        phone_number: "+919876543210",
        phone_number_verified: true,
        sangeetha_identities: [
          { provider: "phone", uid: "same-subject", label: "+919876543210" },
        ],
      },
      issuer,
    );
  expect(google.uid).not.toBe(phone.uid);
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  process.env.AUTH_MODE = "local";
  expect(localMode()).toBe(false);
  process.env.NODE_ENV = saved;
});
