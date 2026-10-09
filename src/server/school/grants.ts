import { randomUUID } from "node:crypto";
import { z } from "zod";
import { normalizeDestination } from "../../core/access";
import { SchoolAccess, activity, grants, type Context } from "./shared";
export class GrantService extends SchoolAccess {
  async owner(c: Context) {
    const row = await this.db.query(
      "SELECT account_id FROM memberships WHERE school_id=$1 AND account_id=$2 AND role='owner' AND revoked_at IS NULL",
      [c.schoolId, c.session.accountId],
    );
    if (!row.rows.length) {
      const { AccessError } = await import("../admin-service");
      throw new AccessError("Only the school owner can manage scoped access.");
    }
  }
  async list(c: Context) {
    await this.owner(c);
    return {
      grants: (
        await this.db.query(
          "SELECT g.*,a.display_name,(SELECT i.label FROM auth_identities i WHERE i.account_id=a.id ORDER BY i.provider LIMIT 1) AS identity FROM school_grants g JOIN accounts a ON a.id=g.account_id WHERE g.school_id=$1 AND revoked_at IS NULL",
          [c.schoolId],
        )
      ).rows,
      invitations: (
        await this.db.query(
          "SELECT * FROM capability_invitations WHERE school_id=$1 AND claimed_at IS NULL AND revoked_at IS NULL AND expires_at>now()",
          [c.schoolId],
        )
      ).rows,
      staff: (
        await this.db.query(
          "SELECT a.id,a.display_name FROM accounts a WHERE EXISTS(SELECT 1 FROM memberships m WHERE m.school_id=$1 AND m.account_id=a.id AND m.revoked_at IS NULL) OR EXISTS(SELECT 1 FROM school_grants g WHERE g.school_id=$1 AND g.account_id=a.id AND g.revoked_at IS NULL)",
          [c.schoolId],
        )
      ).rows,
    };
  }
  async invite(c: Context, input: unknown) {
    await this.owner(c);
    const b = z
      .object({
        channel: z.enum(["email", "phone"]),
        destination: z.string(),
        capability: z.enum([
          "classes.teach",
          "assessments.review",
          "portal.learn",
          "household.billing",
          "finance.manage",
          "curriculum.manage",
        ]),
        resource: z.string().uuid(),
      })
      .parse(input);
    const types: Record<string, [string, string]> = {
      "classes.teach": ["batch", "batches"],
      "assessments.review": ["assessment", "assessments"],
      "portal.learn": ["learner", "learners"],
      "household.billing": ["household", "households"],
      "finance.manage": ["school", "schools"],
      "curriculum.manage": ["school", "schools"],
    };
    const [type, table] = types[b.capability];
    if (table !== "schools") await this.exists(this.db, c, table, b.resource);
    else if (b.resource !== c.schoolId) throw Error("Invalid school scope");
    const destination = normalizeDestination(b.channel, b.destination);
    return this.db.transaction(async (tx) => {
      const id = randomUUID();
      await tx.query(
        "INSERT INTO capability_invitations(school_id,id,channel,destination,capability,resource_type,resource_id,invited_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '7 days')",
        [
          c.schoolId,
          id,
          b.channel,
          destination,
          b.capability,
          type,
          b.resource,
          c.session.accountId,
        ],
      );
      await activity(tx, c, "grant.invited", {
        invitationId: id,
        capability: b.capability,
        resource: b.resource,
      });
      return { id };
    });
  }
  async revoke(c: Context, id: string, invitation = false) {
    await this.owner(c);
    await this.db.transaction(async (tx) => {
      await tx.query(
        `UPDATE ${invitation ? "capability_invitations" : "school_grants"} SET revoked_at=now() WHERE school_id=$1 AND id=$2`,
        [c.schoolId, id],
      );
      await activity(tx, c, "grant.revoked", { grantId: id });
    });
  }
}
