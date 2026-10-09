import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import {
  Controller,
  Module,
  Get,
  Post,
  Delete,
  Patch,
  Req,
  Res,
  Body,
  Param,
  Inject,
  Catch,
  type ExceptionFilter,
  type ArgumentsHost,
} from "@nestjs/common";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import cookie from "@fastify/cookie";
import staticFiles from "@fastify/static";
import { type FastifyRequest, type FastifyReply } from "fastify";
import path from "node:path";
import { z } from "zod";
import { database } from "./db";
import { AdminService, AccessError, provisionOwner } from "./admin-service";
import { InputError } from "../core/access";
import { TenantResolver, type Tenant } from "./tenancy";
import { IdentityAdapter, localMode } from "./identity";
import { SchoolApi, SchoolRuntime } from "./school/controller";
import { CrmService } from "./school/crm";
import { ScheduleService } from "./school/schedule";
import { BillingService } from "./school/billing";
import { GrantService } from "./school/grants";
import { LearningService } from "./school/learning";
import { AssessmentService } from "./school/assessments";
import { EventService } from "./school/events";
import { PortalService } from "./school/portal";
import { AutomationService } from "./school/automation";
import { PaymentLinkService } from "./school/payments";
import { IntegrationApi } from "./school/webhooks";
declare module "fastify" {
  interface FastifyRequest {
    tenant: Tenant | null;
    workspaceOrigin: string;
  }
}
const production = process.env.NODE_ENV === "production";
const stateCookieName = production ? "__Host-auth-state" : "auth_state";
const cookieName = production ? "__Host-sangeetha" : "sangeetha";
const options = {
  httpOnly: true,
  secure: production,
  sameSite: "lax" as const,
  path: "/",
};
const bodySchema = z.object({
  channel: z.enum(["email", "phone"]),
  destination: z.string().min(1).max(254),
});
const idSchema = z.string().uuid();
@Catch()
class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const status =
      error instanceof AccessError
        ? error.status
        : error instanceof z.ZodError || error instanceof InputError
          ? 400
          : 500;
    if (status === 500)
      console.error(
        "Request failed:",
        error instanceof Error ? error.name : "unknown",
      );
    reply.status(status).send({
      error:
        status === 500
          ? "Something went wrong. Please try again."
          : error instanceof z.ZodError
            ? "Please check the information entered."
            : (error as Error).message,
    });
  }
}
@Controller("api")
class Api {
  constructor(
    @Inject(AdminService) private service: AdminService,
    @Inject(IdentityAdapter) private identity: IdentityAdapter,
    @Inject(TenantResolver) private tenants: TenantResolver,
  ) {}
  private async session(req: FastifyRequest) {
    const session = await this.service.session(
      req.cookies[cookieName],
      req.tenant?.id,
    );
    if (!session) throw new AccessError("Please sign in.", 401);
    return session;
  }
  private setSession(reply: FastifyReply, token: string) {
    reply.setCookie(cookieName, token, { ...options, maxAge: 5 * 86400 });
  }
  @Get("health") health() {
    return { status: "ok" };
  }
  @Get("auth/config") config(@Req() req: FastifyRequest) {
    return { mode: localMode() ? "local" : "oidc", school: req.tenant };
  }
  @Get("me") async me(@Req() req: FastifyRequest) {
    const s = await this.session(req);
    return {
      account: await this.service.account(s),
      schools: (await this.service.schools(s)).filter(
        (school) => !req.tenant || school.id === req.tenant.id,
      ),
    };
  }
  @Post("auth/local/start") async localStart(
    @Req() req: FastifyRequest,
    @Body() body: unknown,
  ) {
    const b = bodySchema.parse(body);
    await this.service.limit("local:start:ip:" + req.ip, 20, 3600);
    await this.service.limit("local:start:" + b.destination, 5, 600);
    return this.identity.localStart(b.channel, b.destination);
  }
  @Post("auth/local/complete") async localComplete(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Body() body: unknown,
  ) {
    const b = z
      .object({
        id: z.string().length(43),
        code: z.string().regex(/^\d{6}$/),
        link: z.boolean().optional(),
      })
      .parse(body);
    await this.service.limit("local:complete:" + req.ip, 30, 600);
    const identity = await this.identity.localFinish(b.id, b.code);
    if (b.link)
      await this.service.updateIdentities(await this.session(req), identity);
    else
      this.setSession(
        reply,
        (
          await this.service.login(
            identity,
            req.headers["user-agent"] || "Unknown browser",
            req.tenant?.id,
          )
        ).token,
      );
    return reply.send({ ok: true });
  }
  @Get("auth/start/:method") async start(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param("method") method: string,
  ) {
    const m = z.enum(["google", "phone"]).parse(method);
    await this.service.limit("oidc:start:" + req.ip, 30, 600);
    const query = req.query as { link?: string };
    const session = query.link === "1" ? await this.session(req) : undefined;
    const flow = await this.identity.begin(
      m,
      session?.accountId,
      req.workspaceOrigin,
    );
    reply.setCookie(stateCookieName, flow.state, { ...options, maxAge: 300 });
    return reply.redirect(flow.url);
  }
  @Get("auth/callback") async callback(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const q = z
      .object({
        code: z.string().min(1).max(2048),
        state: z.string().length(43),
      })
      .parse(req.query);
    if (req.cookies[stateCookieName] !== q.state)
      throw new AccessError("Invalid sign-in request.", 401);
    reply.clearCookie(stateCookieName, options);
    const flow = await this.identity.complete(
      q.state,
      q.code,
      req.workspaceOrigin,
    );
    if (flow.linkAccount) {
      const s = await this.session(req);
      if (s.accountId !== flow.linkAccount)
        throw new AccessError("Account changed during verification.", 401);
      await this.service.updateIdentities(s, flow.identity);
    } else
      this.setSession(
        reply,
        (
          await this.service.login(
            flow.identity,
            req.headers["user-agent"] || "Unknown browser",
            req.tenant?.id,
          )
        ).token,
      );
    return reply.redirect("/");
  }
  @Post("logout") async logout(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    await this.service.logout(await this.session(req));
    reply.clearCookie(cookieName, options);
    return reply.send({ ok: true });
  }
  @Post("account/revoke-sessions") async revokeSessions(
    @Req() req: FastifyRequest,
  ) {
    await this.service.logout(await this.session(req), true);
    return { ok: true };
  }
  @Patch("account") async name(
    @Req() req: FastifyRequest,
    @Body() body: unknown,
  ) {
    const b = z.object({ name: z.string().trim().min(2).max(80) }).parse(body);
    await this.service.updateName(await this.session(req), b.name);
    return { ok: true };
  }
  @Delete("account/methods/:provider") async unlink(
    @Req() req: FastifyRequest,
    @Param("provider") provider: string,
  ) {
    await this.service.unlink(
      await this.session(req),
      z.enum(["google.com", "phone"]).parse(provider),
    );
    return { ok: true };
  }
  @Get("schools/:school/team") async team(
    @Req() req: FastifyRequest,
    @Param("school") school: string,
  ) {
    this.tenants.assert(req.tenant, idSchema.parse(school));
    return this.service.team(await this.session(req), idSchema.parse(school));
  }
  @Post("schools/:school/invitations") async invite(
    @Req() req: FastifyRequest,
    @Param("school") school: string,
    @Body() body: unknown,
  ) {
    this.tenants.assert(req.tenant, idSchema.parse(school));
    const s = await this.session(req),
      b = bodySchema.parse(body);
    await this.service.limit("invite:" + s.accountId, 20, 3600);
    await this.service.invite(
      s,
      idSchema.parse(school),
      b.channel,
      b.destination,
    );
    return { ok: true };
  }
  @Delete("schools/:school/invitations/:id") async revokeInvite(
    @Req() req: FastifyRequest,
    @Param("school") school: string,
    @Param("id") id: string,
  ) {
    this.tenants.assert(req.tenant, idSchema.parse(school));
    await this.service.revokeInvite(
      await this.session(req),
      idSchema.parse(school),
      idSchema.parse(id),
    );
    return { ok: true };
  }
  @Delete("schools/:school/members/:id") async revokeMember(
    @Req() req: FastifyRequest,
    @Param("school") school: string,
    @Param("id") id: string,
  ) {
    this.tenants.assert(req.tenant, idSchema.parse(school));
    await this.service.revokeMember(
      await this.session(req),
      idSchema.parse(school),
      idSchema.parse(id),
    );
    return { ok: true };
  }
}
export async function createApp() {
  if (production && !process.env.TENANT_ROOT_DOMAIN)
    throw Error("Production requires TENANT_ROOT_DOMAIN.");
  if (production && process.env.AUTH_MODE !== "oidc")
    throw Error("Production requires AUTH_MODE=oidc.");
  if (
    production &&
    (!process.env.PUBLIC_ORIGIN?.startsWith("https://") ||
      !process.env.OIDC_ISSUER ||
      !process.env.OIDC_CLIENT_ID ||
      !process.env.OIDC_CLIENT_SECRET)
  )
    throw Error("Production identity configuration is incomplete.");
  const db = await database();
  if (localMode() && process.env.LOCAL_SEED === "1") {
    const r = await db.query("SELECT id FROM schools LIMIT 1");
    if (!r.rows.length)
      await provisionOwner(
        db,
        "Sangeetha Music School",
        "email",
        "teacher@example.test",
      );
  }
  const service = new AdminService(db),
    identity = new IdentityAdapter(db),
    tenants = new TenantResolver(db);
  // Explicit injection tokens keep domain services independent of Nest decorators.
  @Module({
    controllers: [Api, SchoolApi, IntegrationApi],
    providers: [
      {
        provide: SchoolRuntime,
        useValue: new SchoolRuntime(
          new CrmService(db),
          new ScheduleService(db),
          new BillingService(db),
          new GrantService(db),
          new LearningService(db),
          new AssessmentService(db),
          new EventService(db),
          new PortalService(db),
          new AutomationService(db),
          new PaymentLinkService(db),
        ),
      },
      { provide: AdminService, useValue: service },
      { provide: IdentityAdapter, useValue: identity },
      { provide: TenantResolver, useValue: tenants },
    ],
  })
  class Runtime {}
  const app = await NestFactory.create<NestFastifyApplication>(
    Runtime,
    new FastifyAdapter({ bodyLimit: 700000, trustProxy: false }),
    { logger: ["error", "warn"], rawBody: true },
  );
  await app.register(cookie);
  app
    .getHttpAdapter()
    .getInstance()
    .addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        req.tenant = await tenants.resolve(req.headers.host || "");
      } catch (e) {
        reply
          .status(e instanceof AccessError ? e.status : 500)
          .send({ error: (e as Error).message });
        return;
      }
      req.workspaceOrigin = production
        ? "https://" + req.hostname
        : req.tenant
          ? "http://" + req.headers.host
          : process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5173";
      reply
        .header("Cache-Control", "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .header("Referrer-Policy", "no-referrer")
        .header("X-Frame-Options", "DENY");
      if (production)
        reply.header(
          "Content-Security-Policy",
          // Brand artwork is self-contained SVG whose motion lives in an inline <style>; it loads nothing and runs no script.
          req.url.startsWith("/art/") && req.url.split("?")[0].endsWith(".svg")
            ? "default-src 'none'; style-src 'unsafe-inline'; img-src data:"
            : "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        );
      if (
        !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
        !req.url.startsWith("/api/integrations/")
      ) {
        const origin = req.workspaceOrigin;
        if (req.headers.origin !== origin) {
          reply.status(403).send({ error: "Invalid request origin." });
          return;
        }
        if (!req.headers["content-type"]?.startsWith("application/json")) {
          reply.status(415).send({ error: "JSON requests are required." });
          return;
        }
      }
    });
  app.useGlobalFilters(new Errors());
  if (production) {
    await app.register(staticFiles, {
      root: path.join(process.cwd(), "dist/web"),
      prefix: "/",
      index: "index.html",
    });
  }
  app.enableShutdownHooks();
  return { app, db };
}
if (require.main === module) {
  createApp()
    .then(({ app }) =>
      app.listen(
        Number(process.env.PORT || 3001),
        process.env.HOST || "127.0.0.1",
      ),
    )
    .then(() =>
      console.log(
        "API listening on http://127.0.0.1:" + (process.env.PORT || 3001),
      ),
    )
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
}
