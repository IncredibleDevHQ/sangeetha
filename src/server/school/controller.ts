import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Body,
  Param,
  Inject,
} from "@nestjs/common";
import type { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { AdminService, AccessError } from "../admin-service";
import { TenantResolver } from "../tenancy";
import { CrmService } from "./crm";
import { ScheduleService } from "./schedule";
import { BillingService } from "./billing";
import { GrantService } from "./grants";
import { LearningService } from "./learning";
import { AssessmentService } from "./assessments";
import { EventService } from "./events";
import { PortalService } from "./portal";
import { AutomationService } from "./automation";
import { PaymentLinkService } from "./payments";
import type { Context } from "./shared";
export class SchoolRuntime {
  constructor(
    readonly crm: CrmService,
    readonly schedule: ScheduleService,
    readonly billing: BillingService,
    readonly grants: GrantService,
    readonly learning: LearningService,
    readonly assessments: AssessmentService,
    readonly events: EventService,
    readonly portal: PortalService,
    readonly automation: AutomationService,
    readonly paymentLinks: PaymentLinkService,
  ) {}
}
@Controller("api/schools/:school")
export class SchoolApi {
  constructor(
    @Inject(AdminService) readonly auth: AdminService,
    @Inject(TenantResolver) readonly tenants: TenantResolver,
    @Inject(SchoolRuntime) readonly domain: SchoolRuntime,
  ) {}
  async context(req: FastifyRequest, school: string): Promise<Context> {
    z.string().uuid().parse(school);
    this.tenants.assert(req.tenant, school);
    const session = await this.auth.session(
      req.cookies[
        process.env.NODE_ENV === "production" ? "__Host-sangeetha" : "sangeetha"
      ],
      req.tenant?.id,
    );
    if (!session) throw new AccessError("Please sign in.", 401);
    if (!(await this.auth.schools(session)).some((s) => s.id === school))
      throw new AccessError("School access is required.");
    return { schoolId: school, session };
  }
  @Get("views/:view") async view(
    @Req() req: FastifyRequest,
    @Param("school") school: string,
    @Param("view") view: string,
  ) {
    const c = await this.context(req, school),
      q = req.query as Record<string, string>,
      d = this.domain;
    switch (view) {
      case "bootstrap":
        return {
          capabilities: await d.crm.capabilities(c),
          scopes: (
            await d.crm.db.query(
              "SELECT capability,resource_type,resource_id FROM school_grants WHERE school_id=$1 AND account_id=$2 AND revoked_at IS NULL",
              [school, c.session.accountId],
            )
          ).rows,
        };
      case "households":
        return d.crm.list(c, q.q);
      case "household":
        return d.crm.detail(c, z.string().uuid().parse(q.id));
      case "roster":
        return d.crm.roster(c);
      case "schedule":
        return d.schedule.list(c);
      case "billing-metadata":
        return d.billing.metadata(c);
      case "billing":
        return d.billing.overview(c);
      case "statement":
        return d.billing.statement(c, z.string().uuid().parse(q.id));
      case "grants":
        return d.grants.list(c);
      case "library":
        return d.learning.library(c);
      case "tests":
        return d.assessments.list(c);
      case "annotations":
        return d.assessments.annotations(c, z.string().uuid().parse(q.id));
      case "dataset":
        return d.assessments.exportLabels(c);
      case "portal":
        return d.portal.view(c);
      case "family-events":
        return d.events.family(c);
      case "events":
        return d.events.list(c);
      case "event-accounts":
        return d.events.accounts(c, z.string().uuid().parse(q.id));
      case "messages":
        return d.automation.messages(c);
      case "reports":
        return d.automation.reports(c);
      case "integrations":
        return d.automation.settings(c);
      case "payment-links":
        return d.paymentLinks.list(c);
      case "upload-status":
        return d.learning.uploadStatus(c, z.string().uuid().parse(q.id));
      case "saved-views":
        await d.crm.require(c, "crm.manage");
        return (
          await d.crm.db.query(
            "SELECT * FROM saved_views WHERE school_id=$1 AND account_id=$2",
            [school, c.session.accountId],
          )
        ).rows;
      default:
        throw new AccessError("View not found.", 404);
    }
  }
  @Get("media/:asset") async media(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param("school") school: string,
    @Param("asset") asset: string,
  ) {
    const c = await this.context(req, school),
      data = await this.domain.learning.readAsset(
        c,
        z.string().uuid().parse(asset),
      );
    reply
      .header("Accept-Ranges", "bytes")
      .header("Cache-Control", "private, no-store")
      .header("Content-Disposition", "inline");
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) return reply.status(416).send();
      const start = Number(match[1]),
        end = match[2] ? Number(match[2]) : data.bytes.length - 1;
      if (start > end || end >= data.bytes.length)
        return reply
          .status(416)
          .header("Content-Range", "bytes */" + data.bytes.length)
          .send();
      return reply
        .status(206)
        .type(data.mime)
        .header("Content-Range", `bytes ${start}-${end}/${data.bytes.length}`)
        .send(data.bytes.subarray(start, end + 1));
    }
    return reply.type(data.mime).send(data.bytes);
  }
  @Post("commands/:command") async command(
    @Req() req: FastifyRequest,
    @Param("school") school: string,
    @Param("command") command: string,
    @Body() body: unknown,
  ) {
    const c = await this.context(req, school),
      d = this.domain,
      b = z.record(z.string(), z.unknown()).parse(body),
      id = () => z.string().uuid().parse(b.id);
    await this.auth.limit(
      (command === "media.chunk" ? "upload-chunks:" : "commands:") +
        c.session.accountId,
      command === "media.chunk" ? 2400 : 600,
      600,
    );
    switch (command) {
      case "household.create":
        return d.crm.create(c, b as never);
      case "household.update":
        return d.crm.update(c, id(), b);
      case "person.update":
        return d.crm.person(c, id(), b);
      case "guardian.relationship":
        return d.crm.relationship(c, b);
      case "test.update":
        return d.assessments.update(c, id(), b);
      case "review.score":
        return d.assessments.score(c, id(), b.scores);
      case "learner.transfer":
        return d.crm.transfer(c, b);
      case "enrollment.status":
        return d.crm.enrollmentStatus(c, id(), z.string().parse(b.status));
      case "household.note":
        return d.crm.note(c, id(), z.string().parse(b.text));
      case "household.task":
        return d.crm.task(c, id(), b);
      case "task.complete":
        return d.crm.completeTask(c, id());
      case "batch.create":
        return d.crm.batch(c, b);
      case "learner.enroll":
        return d.crm.enroll(c, b);
      case "import.preview":
        return d.crm.importPreview(c, b.rows);
      case "import.commit":
        return d.crm.importCommit(
          c,
          z.string().min(8).max(120).parse(b.key),
          b.rows,
        );
      case "view.save":
        return d.crm.saveView(c, b);
      case "class.create":
        return d.schedule.create(c, b);
      case "class.update":
        return d.schedule.update(c, id(), b);
      case "class.attendance":
        return d.schedule.mark(c, id(), b);
      case "billing.charge":
        return d.billing.charge(c, b);
      case "billing.plan":
        return d.billing.plan(c, b);
      case "billing.generate":
        return d.billing.generate(c, z.string().parse(b.period));
      case "billing.payment":
        return d.billing.payment(c, b);
      case "billing.verify":
        return d.billing.verify(c, id());
      case "billing.allocate":
        return d.billing.allocate(c, id(), b);
      case "billing.correct":
        return d.billing.correction(c, b);
      case "lesson.create":
        return d.learning.createLesson(c, b);
      case "lesson.publish":
        return d.learning.publish(c, id(), z.boolean().parse(b.published));
      case "practice.create":
        return d.learning.practice(c, b);
      case "practice.complete":
        return d.learning.completePractice(c, id());
      case "media.reserve":
        return d.learning.reserve(c, b);
      case "media.chunk":
        return d.learning.chunk(c, id(), b);
      case "media.finalize":
        return d.learning.finalize(c, id());
      case "taxonomy.create":
        return d.assessments.taxonomy(c, b.labels);
      case "test.create":
        return d.assessments.create(c, b);
      case "test.submit":
        return d.assessments.submit(c, b);
      case "review.annotate":
        return d.assessments.annotate(c, b);
      case "review.moderate":
        return d.assessments.moderate(c, id(), b.publish === true);
      case "dataset.consent":
        return d.assessments.consent(c, b);
      case "event.create":
        return d.events.create(c, b);
      case "event.register":
        return d.events.register(c, b);
      case "event.programme":
        return d.events.programme(c, b);
      case "event.expense":
        return d.events.expense(c, b);
      case "event.cancel":
        return d.events.cancel(c, id());
      case "message.announce":
        return d.automation.announce(c, b);
      case "messages.refresh":
        return d.automation.refresh(c);
      case "message.manual":
        return d.automation.manual(c, id());
      case "message.retry":
        return d.automation.retry(c, id());
      case "message.reconcile":
        return d.automation.reconcile(c, b);
      case "integrations.update":
        return d.automation.settings(c, b);
      case "payment-link.create":
        return d.paymentLinks.create(c, b);
      case "payment-link.reconcile":
        return d.paymentLinks.reconcile(c, b);
      case "grant.invite":
        return d.grants.invite(c, b);
      case "grant.revoke":
        return d.grants.revoke(c, id(), b.invitation === true);
      default:
        throw new AccessError("Command not found.", 404);
    }
  }
}
