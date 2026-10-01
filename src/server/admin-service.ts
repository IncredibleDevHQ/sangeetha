import { createHash, randomBytes, randomUUID } from "node:crypto";
import { schoolSlug } from "./tenancy";
import type { Database, Executor } from "./db";
import {
  isRecentAuth,
  normalizeDestination,
  permits,
  type Capability,
  type Role,
} from "../core/access";

export class AccessError extends Error {
  constructor(
    message: string,
    public status = 403,
  ) {
    super(message);
  }
}
export type VerifiedIdentity = {
  uid: string;
  name: string;
  authTime: number;
  email?: string;
  emailVerified: boolean;
  phone?: string;
  identities: {
    provider: "google.com" | "phone";
    uid: string;
    label: string;
  }[];
};
export type Session = {
  accountId: string;
  displayName: string;
  tokenHash: string;
  authTime: Date;
};
export type School = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  role: Role;
};
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

async function audit(
  tx: Executor,
  actor: string | null,
  school: string | null,
  action: string,
  details: Record<string, unknown> = {},
) {
  await tx.query(
    "INSERT INTO audit_events(id, actor_id, school_id, action, details) VALUES ($1,$2,$3,$4,$5)",
    [randomUUID(), actor, school, action, JSON.stringify(details)],
  );
}
export class AdminService {
  constructor(private db: Database) {}
  async login(identity: VerifiedIdentity, device: string, tenantId?: string) {
    if (!isRecentAuth(identity.authTime))
      throw new AccessError("Please sign in again to continue.", 401);
    if (!identity.identities.length)
      throw new AccessError("Use Google or phone to sign in.", 401);
    const token = randomBytes(32).toString("base64url");
    const accountId = await this.db.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        identity.uid,
      ]);
      let found = await tx.query<{ account_id: string }>(
        "SELECT account_id FROM principal_aliases WHERE principal_key=$1",
        [identity.uid],
      );
      if (!found.rows.length) {
        const newId = randomUUID();
        await tx.query("INSERT INTO accounts(id,display_name) VALUES($1,$2)", [
          newId,
          identity.name || "School administrator",
        ]);
        await tx.query(
          "INSERT INTO principal_aliases(principal_key,account_id) VALUES($1,$2)",
          [identity.uid, newId],
        );
        found = { rows: [{ account_id: newId }] };
      }
      const id = found.rows[0].account_id;
      await tx.query("SELECT id FROM accounts WHERE id=$1 FOR UPDATE", [id]);
      await this.syncIdentities(tx, id, identity);
      const destinations: string[] = [];
      if (
        identity.emailVerified &&
        identity.email &&
        identity.identities.some((i) => i.provider === "google.com")
      )
        destinations.push(`email:${identity.email.toLowerCase()}`);
      if (identity.phone) destinations.push(`phone:${identity.phone}`);
      if (destinations.length) {
        const invites = await tx.query<{
          id: string;
          school_id: string;
          role: Role;
        }>(
          "SELECT id,school_id,role FROM invitations WHERE channel || ':' || destination = ANY($1::text[]) AND expires_at > now() AND claimed_at IS NULL AND revoked_at IS NULL AND ($2::uuid IS NULL OR school_id=$2) FOR UPDATE",
          [destinations, tenantId || null],
        );
        for (const invite of invites.rows) {
          // A revoked membership requires a new invitation; do not resurrect it from an old login.
          await tx.query(
            "INSERT INTO memberships(school_id,account_id,role) VALUES ($1,$2,$3) ON CONFLICT(school_id,account_id) DO UPDATE SET revoked_at=NULL, role=CASE WHEN memberships.role='owner' THEN 'owner' ELSE EXCLUDED.role END",
            [invite.school_id, id, invite.role],
          );
          await tx.query(
            "UPDATE invitations SET claimed_at=now(),claimed_by=$1 WHERE id=$2",
            [id, invite.id],
          );
          await audit(tx, id, invite.school_id, "invitation.accepted", {
            invitationId: invite.id,
          });
        }
      }
      if(destinations.length){
        const grants=await tx.query<{id:string;school_id:string;capability:string;resource_type:string;resource_id:string;invited_by:string}>("SELECT * FROM capability_invitations WHERE channel || ':' || destination=ANY($1::text[]) AND expires_at>now() AND claimed_at IS NULL AND revoked_at IS NULL AND ($2::uuid IS NULL OR school_id=$2) FOR UPDATE",[destinations,tenantId||null]);
        for(const grant of grants.rows){
          await tx.query("INSERT INTO school_grants(school_id,id,account_id,capability,resource_type,resource_id,granted_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",[grant.school_id,randomUUID(),id,grant.capability,grant.resource_type,grant.resource_id,grant.invited_by]);
          await tx.query("UPDATE capability_invitations SET claimed_at=now(),claimed_by=$1 WHERE school_id=$2 AND id=$3",[id,grant.school_id,grant.id]);
          await audit(tx,id,grant.school_id,"grant.accepted",{invitationId:grant.id});
        }
      }
      await tx.query(
        "INSERT INTO sessions(token_hash,account_id,auth_time,expires_at,device_label,school_id) VALUES ($1,$2,$3,now()+interval '5 days',$4,$5)",
        [
          hashToken(token),
          id,
          new Date(identity.authTime * 1000),
          device.slice(0, 160),
          tenantId || null,
        ],
      );
      await audit(tx, id, null, "session.created");
      return id;
    });
    return { token, accountId };
  }
  private async syncIdentities(
    tx: Executor,
    accountId: string,
    identity: VerifiedIdentity,
  ) {
    if (!identity.identities.length)
      throw new AccessError("Keep at least one sign-in method.");

    for (const item of identity.identities) {
      const old = await tx.query<{ provider_uid: string }>(
        "SELECT provider_uid FROM auth_identities WHERE account_id=$1 AND provider=$2",
        [accountId, item.provider],
      );
      if (old.rows.length && old.rows[0].provider_uid !== item.uid)
        throw new AccessError(
          "Remove the existing method before adding a replacement.",
          409,
        );
      await tx.query(
        "INSERT INTO auth_identities(account_id,provider,provider_uid,label) VALUES ($1,$2,$3,$4) ON CONFLICT(account_id,provider) DO UPDATE SET provider_uid=EXCLUDED.provider_uid,label=EXCLUDED.label,updated_at=now()",
        [accountId, item.provider, item.uid, item.label],
      );
    }
  }
  async session(
    token: string | undefined,
    tenantId?: string,
  ): Promise<Session | null> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const { rows } = await this.db.query<{
      account_id: string;
      display_name: string;
      token_hash: string;
      auth_time: Date;
    }>(
      "SELECT s.account_id,a.display_name,s.token_hash,s.auth_time FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > now() AND s.school_id IS NOT DISTINCT FROM $2::uuid",
      [hashToken(token), tenantId || null],
    );
    const row = rows[0];
    return row
      ? {
          accountId: row.account_id,
          displayName: row.display_name,
          tokenHash: row.token_hash,
          authTime: new Date(row.auth_time),
        }
      : null;
  }
  async schools(session: Session): Promise<School[]> {
    return (await this.db.query<School>(`SELECT s.id,s.name,s.slug,s.timezone,m.role FROM schools s JOIN memberships m ON m.school_id=s.id WHERE m.account_id=$1 AND m.revoked_at IS NULL UNION SELECT s.id,s.name,s.slug,s.timezone,'member' AS role FROM schools s WHERE EXISTS(SELECT 1 FROM school_grants g WHERE g.school_id=s.id AND g.account_id=$1 AND g.revoked_at IS NULL) AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.school_id=s.id AND m.account_id=$1 AND m.revoked_at IS NULL) ORDER BY name`,[session.accountId])).rows;
  }
  async authorize(session: Session, schoolId: string, capability: Capability) {
    const school = (await this.schools(session)).find((s) => s.id === schoolId);
    if (!school || !permits(school.role, capability))
      throw new AccessError("You do not have access to this action.");
    return school;
  }
  async account(session: Session) {
    const identities = await this.db.query<{ provider: string; label: string }>(
      "SELECT provider,label FROM auth_identities WHERE account_id=$1 ORDER BY provider",
      [session.accountId],
    );
    const sessions = await this.db.query<{
      token_hash: string;
      created_at: Date;
      device_label: string;
    }>(
      "SELECT token_hash,created_at,device_label FROM sessions WHERE account_id=$1 AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC",
      [session.accountId],
    );
    return {
      displayName: session.displayName,
      identities: identities.rows,
      sessions: sessions.rows.map((s) => ({
        id: s.token_hash,
        createdAt: new Date(s.created_at).toISOString(),
        device: s.device_label,
        current: s.token_hash === session.tokenHash,
      })),
    };
  }
  async updateName(session: Session, name: string) {
    await this.db.transaction(async (tx) => {
      await tx.query("UPDATE accounts SET display_name=$1 WHERE id=$2", [
        name,
        session.accountId,
      ]);
      await audit(tx, session.accountId, null, "account.name_updated");
    });
  }
  async updateIdentities(session: Session, identity: VerifiedIdentity) {
    if (
      !isRecentAuth(session.authTime.getTime() / 1000) ||
      !isRecentAuth(identity.authTime)
    )
      throw new AccessError(
        "Verify your existing account before changing sign-in methods.",
        401,
      );
    await this.db.transaction(async (tx) => {
      await tx.query("SELECT id FROM accounts WHERE id=$1 FOR UPDATE", [
        session.accountId,
      ]);
      const existing = await tx.query<{ account_id: string }>(
        "SELECT account_id FROM principal_aliases WHERE principal_key=$1",
        [identity.uid],
      );
      if (
        existing.rows.length &&
        existing.rows[0].account_id !== session.accountId
      )
        throw new AccessError(
          "This sign-in method belongs to another account. Accounts cannot be merged.",
          409,
        );
      await tx.query(
        "INSERT INTO principal_aliases(principal_key,account_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [identity.uid, session.accountId],
      );
      await this.syncIdentities(tx, session.accountId, identity);
      await tx.query(
        "UPDATE sessions SET revoked_at=now() WHERE account_id=$1 AND token_hash<>$2 AND revoked_at IS NULL",
        [session.accountId, session.tokenHash],
      );
      await tx.query("UPDATE sessions SET auth_time=$1 WHERE token_hash=$2", [
        new Date(identity.authTime * 1000),
        session.tokenHash,
      ]);
      await audit(tx, session.accountId, null, "account.identities_updated", {
        providers: identity.identities.map((i) => i.provider),
      });
    });
  }
  async unlink(session: Session, provider: string) {
    if (!isRecentAuth(session.authTime.getTime() / 1000))
      throw new AccessError(
        "Sign in again before changing your login methods.",
        401,
      );
    await this.db.transaction(async (tx) => {
      await tx.query("SELECT id FROM accounts WHERE id=$1 FOR UPDATE", [
        session.accountId,
      ]);
      const methods = await tx.query<{
        provider: string;
        provider_uid: string;
      }>(
        "SELECT provider,provider_uid FROM auth_identities WHERE account_id=$1",
        [session.accountId],
      );
      const method = methods.rows.find((i) => i.provider === provider);
      if (!method || methods.rows.length < 2)
        throw new AccessError("Keep at least one sign-in method.");
      await tx.query(
        "DELETE FROM principal_aliases WHERE account_id=$1 AND principal_key=$2",
        [session.accountId, method.provider_uid],
      );
      await tx.query(
        "DELETE FROM auth_identities WHERE account_id=$1 AND provider=$2",
        [session.accountId, provider],
      );
      await tx.query(
        "UPDATE sessions SET revoked_at=now() WHERE account_id=$1 AND token_hash<>$2",
        [session.accountId, session.tokenHash],
      );
      await audit(tx, session.accountId, null, "account.method_removed", {
        provider,
      });
    });
  }
  async logout(session: Session, others = false) {
    await this.db.transaction(async (tx) => {
      await tx.query(
        others
          ? "UPDATE sessions SET revoked_at=now() WHERE account_id=$1 AND token_hash<>$2 AND revoked_at IS NULL"
          : "UPDATE sessions SET revoked_at=now() WHERE account_id=$1 AND token_hash=$2 AND revoked_at IS NULL",
        [session.accountId, session.tokenHash],
      );
      await audit(
        tx,
        session.accountId,
        null,
        others ? "sessions.others_revoked" : "session.revoked",
      );
    });
  }
  async team(session: Session, schoolId: string) {
    await this.authorize(session, schoolId, "team.manage");
    const members = await this.db.query(
      "SELECT a.id,a.display_name,m.role FROM memberships m JOIN accounts a ON a.id=m.account_id WHERE m.school_id=$1 AND m.revoked_at IS NULL ORDER BY m.created_at",
      [schoolId],
    );
    const invitations = await this.db.query(
      "SELECT id,channel,destination,expires_at FROM invitations WHERE school_id=$1 AND claimed_at IS NULL AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC",
      [schoolId],
    );
    return { members: members.rows, invitations: invitations.rows };
  }
  async invite(
    session: Session,
    schoolId: string,
    channel: "email" | "phone",
    value: string,
  ) {
    await this.authorize(session, schoolId, "team.manage");
    const destination = normalizeDestination(channel, value);
    await this.db.transaction(async (tx) => {
      // Serialise governance changes with membership revocation.
      const membership = await tx.query<{ role: Role }>(
        "SELECT role FROM memberships WHERE school_id=$1 AND account_id=$2 AND revoked_at IS NULL FOR UPDATE",
        [schoolId, session.accountId],
      );
      if (membership.rows[0]?.role !== "owner")
        throw new AccessError("Owner access is required.");
      const id = randomUUID();
      await tx.query(
        "UPDATE invitations SET revoked_at=now() WHERE school_id=$1 AND channel=$2 AND destination=$3 AND claimed_at IS NULL AND revoked_at IS NULL",
        [schoolId, channel, destination],
      );
      await tx.query(
        "INSERT INTO invitations(id,school_id,channel,destination,role,invited_by,expires_at) VALUES($1,$2,$3,$4,'admin',$5,now()+interval '7 days')",
        [id, schoolId, channel, destination, session.accountId],
      );
      await audit(tx, session.accountId, schoolId, "admin.invited", {
        invitationId: id,
        channel,
      });
    });
  }
  async revokeMember(session: Session, schoolId: string, accountId: string) {
    await this.authorize(session, schoolId, "team.manage");
    await this.db.transaction(async (tx) => {
      const actor = await tx.query<{ role: Role }>(
        "SELECT role FROM memberships WHERE school_id=$1 AND account_id=$2 AND revoked_at IS NULL FOR UPDATE",
        [schoolId, session.accountId],
      );
      if (actor.rows[0]?.role !== "owner")
        throw new AccessError("Owner access is required.");
      const changed = await tx.query(
        "UPDATE memberships SET revoked_at=now() WHERE school_id=$1 AND account_id=$2 AND role='admin' AND revoked_at IS NULL RETURNING account_id",
        [schoolId, accountId],
      );
      if (!changed.rows.length)
        throw new AccessError(
          "An owner cannot be removed through this action.",
        );
      await audit(tx, session.accountId, schoolId, "admin.access_revoked", {
        accountId,
      });
    });
  }
  async revokeInvite(session: Session, schoolId: string, id: string) {
    await this.authorize(session, schoolId, "team.manage");
    await this.db.transaction(async (tx) => {
      const actor = await tx.query<{ role: Role }>(
        "SELECT role FROM memberships WHERE school_id=$1 AND account_id=$2 AND revoked_at IS NULL FOR UPDATE",
        [schoolId, session.accountId],
      );
      if (actor.rows[0]?.role !== "owner")
        throw new AccessError("Owner access is required.");
      await tx.query(
        "UPDATE invitations SET revoked_at=now() WHERE school_id=$1 AND id=$2 AND claimed_at IS NULL",
        [schoolId, id],
      );
      await audit(tx, session.accountId, schoolId, "invitation.revoked", {
        invitationId: id,
      });
    });
  }
  async limit(key: string, maximum: number, seconds: number) {
    const { rows } = await this.db.query<{ count: number }>(
      "INSERT INTO request_limits(key,count,expires_at) VALUES($1,1,now()+$2*interval '1 second') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN request_limits.expires_at<now() THEN 1 ELSE request_limits.count+1 END, expires_at=CASE WHEN request_limits.expires_at<now() THEN EXCLUDED.expires_at ELSE request_limits.expires_at END RETURNING count",
      [hashToken(key), seconds],
    );
    if (rows[0].count > maximum)
      throw new AccessError(
        "Too many attempts. Please try again shortly.",
        429,
      );
  }
}
export async function provisionOwner(
  db: Database,
  schoolName: string,
  channel: "email" | "phone",
  value: string,
  subdomain = schoolName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, ""),
) {
  const destination = normalizeDestination(channel, value);
  const slug = schoolSlug(subdomain);
  return db.transaction(async (tx) => {
    const id = randomUUID();
    await tx.query("INSERT INTO schools(id,name,slug) VALUES($1,$2,$3)", [
      id,
      schoolName,
      slug,
    ]);
    await tx.query(
      "INSERT INTO invitations(id,school_id,channel,destination,role,expires_at) VALUES($1,$2,$3,$4,'owner',now()+interval '7 days')",
      [randomUUID(), id, channel, destination],
    );
    await audit(tx, null, id, "school.provisioned", { channel });
    return id;
  });
}
