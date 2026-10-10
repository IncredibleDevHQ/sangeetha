import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { AccessError, type VerifiedIdentity } from "./admin-service";
import type { Database } from "./db";
import { normalizeDestination } from "../core/access";
import { PLACEHOLDER_DISPLAY_NAME } from "../core/account";

export const localMode = () =>
  process.env.AUTH_MODE === "local" && process.env.NODE_ENV !== "production";
const random = () => randomBytes(32).toString("base64url");
const identityClaims = z.object({
  sub: z.string().min(1),
  auth_time: z.number(),
  name: z.string().optional(),
  sangeetha_identities: z
    .array(
      z.object({
        provider: z.enum(["google.com", "phone"]),
        uid: z.string().min(1),
        label: z.string().min(1),
      }),
    )
    .length(1),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
  phone_number: z.string().optional(),
  phone_number_verified: z.boolean().optional(),
});
// Only signed, provider-verified identities cross into the application domain.
export function fromClaims(claims: unknown, issuer: string): VerifiedIdentity {
  const c = identityClaims.parse(claims);
  const method = c.sangeetha_identities[0];
  if (method.uid !== c.sub)
    throw new AccessError(
      "Identity claim must describe this provider subject.",
      401,
    );
  if (
    method.provider === "google.com" &&
    (!c.email_verified || method.label !== c.email)
  )
    throw new AccessError(
      "Google email must be verified by the identity provider.",
      401,
    );
  if (
    method.provider === "phone" &&
    (!c.phone_number_verified || method.label !== c.phone_number)
  )
    throw new AccessError(
      "Phone must be verified by the identity provider.",
      401,
    );
  // Scope each login method separately, even when the broker uses one shared subject.
  const uid = issuer + "|" + method.provider + "|" + c.sub;
  return {
    uid,
    name: c.name || PLACEHOLDER_DISPLAY_NAME,
    authTime: c.auth_time,
    email: c.email,
    emailVerified:
      method.provider === "google.com" && c.email_verified === true,
    phone: method.provider === "phone" ? c.phone_number : undefined,
    identities: [{ ...method, uid }],
  };
}
export class IdentityAdapter {
  constructor(private db: Database) {}
  private config() {
    const { OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, PUBLIC_ORIGIN } =
      process.env;
    if (
      !OIDC_ISSUER ||
      !OIDC_CLIENT_ID ||
      !OIDC_CLIENT_SECRET ||
      !PUBLIC_ORIGIN
    )
      throw new AccessError("Live sign-in is not configured yet.", 503);
    if (
      process.env.NODE_ENV === "production" &&
      ![OIDC_ISSUER, PUBLIC_ORIGIN].every((v) => v.startsWith("https://"))
    )
      throw Error("HTTPS is required.");
    return {
      issuer: OIDC_ISSUER,
      client: OIDC_CLIENT_ID,
      secret: OIDC_CLIENT_SECRET,
      callback: PUBLIC_ORIGIN + "/api/auth/callback",
    };
  }
  private async discovery() {
    const cfg = this.config();
    const r = await fetch(
      cfg.issuer.replace(/\/$/, "") + "/.well-known/openid-configuration",
      { signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) throw new AccessError("Identity provider unavailable.", 503);
    const d = (await r.json()) as Record<string, string>;
    if (d.issuer !== cfg.issuer)
      throw new AccessError("Provider issuer mismatch.", 503);
    return { cfg, d };
  }
  async begin(
    method: "google" | "phone",
    linkAccount?: string,
    origin?: string,
  ) {
    const { cfg, d } = await this.discovery();
    if (origin) cfg.callback = origin + "/api/auth/callback";
    const state = random(),
      nonce = random(),
      verifier = random();
    await this.db.query(
      "INSERT INTO auth_flows(id,payload,expires_at) VALUES($1,$2,now()+interval '5 minutes')",
      [
        state,
        JSON.stringify({
          nonce,
          verifier,
          linkAccount,
          callback: cfg.callback,
        }),
      ],
    );
    const url = new URL(d.authorization_endpoint);
    url.search = new URLSearchParams({
      client_id: cfg.client,
      redirect_uri: cfg.callback,
      response_type: "code",
      scope: "openid profile email phone",
      state,
      nonce,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      prompt: "login",
      max_age: "0",
    }).toString();
    if (method === "google" && process.env.OIDC_GOOGLE_IDP_ID)
      url.searchParams.set("idp_hint", process.env.OIDC_GOOGLE_IDP_ID);
    return { state, url: url.toString() };
  }
  async complete(state: string, code: string, origin?: string) {
    const flows = await this.db.query<{
      payload: {
        nonce: string;
        verifier: string;
        linkAccount?: string;
        callback: string;
      };
    }>(
      "DELETE FROM auth_flows WHERE id=$1 AND expires_at>now() RETURNING payload",
      [state],
    );
    const flow = flows.rows[0]?.payload;
    if (!flow)
      throw new AccessError("Sign-in request expired. Please try again.", 401);
    const { cfg, d } = await this.discovery();
    if (
      flow.callback !== (origin ? origin + "/api/auth/callback" : cfg.callback)
    )
      throw new AccessError("Sign-in belongs to a different workspace.", 401);
    cfg.callback = flow.callback;
    const r = await fetch(d.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: cfg.callback,
        client_id: cfg.client,
        client_secret: cfg.secret,
        code_verifier: flow.verifier,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new AccessError("Provider sign-in failed.", 401);
    const result = (await r.json()) as { id_token: string };
    try {
      const { payload } = await jwtVerify(
        result.id_token,
        createRemoteJWKSet(new URL(d.jwks_uri)),
        {
          issuer: cfg.issuer,
          audience: cfg.client,
          algorithms: ["RS256", "ES256"],
          requiredClaims: ["exp", "iat", "sub", "auth_time", "nonce"],
        },
      );
      if (payload.nonce !== flow.nonce)
        throw new AccessError("Invalid sign-in response.", 401);
      return {
        identity: fromClaims(payload, cfg.issuer),
        linkAccount: flow.linkAccount,
      };
    } catch {
      throw new AccessError(
        "Invalid identity response. Please sign in again.",
        401,
      );
    }
  }
  async localStart(channel: "email" | "phone", value: string) {
    if (!localMode()) throw new AccessError("Local sign-in is disabled.", 404);
    const destination = normalizeDestination(channel, value),
      id = random();
    const code = randomBytes(3)
      .readUIntBE(0, 3)
      .toString()
      .slice(0, 6)
      .padStart(6, "0");
    await this.db.query(
      "INSERT INTO auth_flows(id,payload,expires_at) VALUES($1,$2,now()+interval '5 minutes')",
      [id, JSON.stringify({ channel, destination, code })],
    );
    return { id, code }; // Explicit local simulator: never enabled in production.
  }
  async localFinish(id: string, code: string) {
    if (!localMode()) throw new AccessError("Local sign-in is disabled.", 404);
    const r = await this.db.query<{
      payload: {
        channel: "email" | "phone";
        destination: string;
        code: string;
      };
    }>(
      "DELETE FROM auth_flows WHERE id=$1 AND expires_at>now() RETURNING payload",
      [id],
    );
    const p = r.rows[0]?.payload;
    if (!p || p.code !== code)
      throw new AccessError(
        "Incorrect or expired code. Request a new code.",
        401,
      );
    const uid = "local|" + p.channel + ":" + p.destination;
    return {
      uid,
      name: PLACEHOLDER_DISPLAY_NAME,
      authTime: Math.floor(Date.now() / 1000),
      email: p.channel === "email" ? p.destination : undefined,
      emailVerified: p.channel === "email",
      phone: p.channel === "phone" ? p.destination : undefined,
      identities: [
        {
          provider:
            p.channel === "email"
              ? ("google.com" as const)
              : ("phone" as const),
          uid,
          label: p.destination,
        },
      ],
    };
  }
}
