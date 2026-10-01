# Deployment and identity setup

## Runtime

Build with Node.js 24, then run `NODE_ENV=production npm start`. The API serves
the built React application from `dist/web`. Place it behind an HTTPS reverse
proxy; forward the original Host header, and do not expose the internal API port.
Set `DATABASE_URL`, apply migrations with `npm run db:migrate`, and provision
each initial owner with the provisioning CLI. The CLI requires access to the
application database and is not exposed as a public API.

Use separate databases, identity clients, secrets and domain names for staging
and production. Never set `AUTH_MODE=local` in production; startup rejects it.
The local seed is disabled in production.

## School subdomains

Set `TENANT_ROOT_DOMAIN=music.example.com`, with wildcard DNS and TLS routing
`*.music.example.com` to this application. A school's immutable slug identifies
its workspace, for example `raagam.music.example.com`. `app.music.example.com`
is a central account entry point. Unknown and malformed hosts are rejected.
Only provisioned school slugs resolve. School IDs from URL paths are compared
with the resolved tenant before membership permissions are checked.

Sessions are bound to the school ID (or the central entry point) in PostgreSQL.
Cookies are HttpOnly, host-only and SameSite=Lax; production uses a Secure
`__Host-` cookie. A copied session token cannot be used on a different school
host. Accounts may be invited into multiple schools, with independent roles.
The central entry point lists only that account's memberships.

In local development, omit TENANT_ROOT_DOMAIN to use 127.0.0.1. To test tenant
hosts, configure a locally resolving domain, preserve Host through the dev proxy,
and set PUBLIC_ORIGIN to the central development origin. All writes require the
exact current workspace Origin; no wildcard CORS is enabled.

Current isolation is enforced by host/session boundaries and school-scoped
queries. PostgreSQL row-level security and dedicated databases are not currently
implemented. Future students, fees, files, jobs and caches must all carry the
school ID; file object keys and signed download authorization must be scoped to
it. Never treat a subdomain by itself as permission to read a school.

## FusionAuth / OIDC

Set `AUTH_MODE=oidc`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`,
`PUBLIC_ORIGIN=https://app.music.example.com`, and optionally
`OIDC_GOOGLE_IDP_ID`. The adapter uses discovery, Authorization Code with PKCE,
state, nonce, issuer/audience/signature checks and a recent auth_time claim.
Provider tokens stay on the backend; the browser receives an application cookie.

Use FusionAuth 1.59 or later for hosted phone OTP. Configure Google federation,
passwordless login with a form-field code strategy, an SMS Messenger, and phone
identity verification. Disable username/password login for this application if
only Google and phone are intended. Configure exact callback URLs for each
provisioned school and the central entry point; the callback path is
`/api/auth/callback`. Exact URLs are preferred. FusionAuth supports wildcard
subdomain callbacks if its URL validation policy is explicitly configured;
only use a domain fully controlled by this deployment.

The ID token must include standard `sub`, `auth_time`, `name`, verified email
or phone claims, and this application-specific **signed** claim:

```json
{
  "sangeetha_identities": [
    { "provider": "google.com", "uid": "same-as-token-sub", "label": "verified@example.com" }
  ],
  "email": "verified@example.com",
  "email_verified": true
}
```

For phone login use provider `phone`, label equal to `phone_number`, and
`phone_number_verified=true`. Emit exactly the method used in that authentication
ceremony, not every method/contact stored on a user. Configure a provider-side
ID-token customization hook using the authenticated provider context. Never
populate these fields from client parameters, unverified profile fields, or
from a user's email alone. Tokens missing this contract fail closed. The
adapter scopes principals by issuer, login method and provider subject so that
linking is an explicit application action, not an email/phone auto-merge.

Create/register invited phone users in the identity provider using a trusted
operator workflow if hosted passwordless login requires existing users. These
provider accounts alone grant no school access. Recovery of a lost final login
method is handled by the provider's verified recovery process; the application
has no bypass or unauthenticated recovery endpoint. An administrator with a
second linked method can sign in, remove a lost phone and verify a replacement.

Apply SMS destination/IP throttles, resend limits, provider abuse protection and
spend caps in the identity provider/Messenger. The application limits initiation
and invitation attempts; hosted SMS delivery attempts must be constrained at the
provider because they do not pass through this API. Confirm India delivery and
sender/template configuration with the chosen SMS provider before launch.

## Release verification

CI checks types, builds assets and runs authorization tests against PostgreSQL.
Local tests can use embedded PostgreSQL through PGlite. The repository test
suite does not prove real Google federation, real SMS delivery, provider recovery
or the provider's customization hook. Before promoting staging, verify these
with separate accounts on two real school subdomains:

- Independent Google and phone login; uninvited users have no school membership.
- Code expiry, wrong codes, replay, resend limits and provider spend caps.
- Explicit linking reaches the same application account; account takeover is rejected.
- Callback state/nonce/PKCE, wrong-host callback and exact Origin checks.
- Cross-school access and copied-cookie rejection; membership and session revocation.
- Re-verification and recovery when a phone or the final sign-in method is lost.

Live provider setup and these staging checks remain pending until credentials,
a domain and an SMS account are supplied. No live service has been deployed.
