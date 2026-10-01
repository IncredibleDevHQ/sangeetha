# Sangeetha

A music-school workspace for households, students, classes, fees and learning.

The first development release includes administrator accounts, invite-only
school access, school subdomains, team management and revocable sessions.
Households and student records are the next phase.

## Run locally

Use Node.js 22.12 or later (Node.js 24 recommended).

```sh
npm ci
cp .env.example .env
npm run dev
```

Open http://127.0.0.1:5173. The explicitly labelled local simulator uses
`teacher@example.test` for the seeded school owner and displays a disposable
verification code. It does **not** authenticate with Google or deliver SMS.
Local storage uses PGlite; configure `DATABASE_URL` for a PostgreSQL server.

```sh
npm run check
npm test
npm run build
npm run provision -- "My Music School" email teacher@example.com my-music-school
```

Owner provisioning creates a school and a seven-day invitation. Additional
administrators are invited inside that school. Invitations are recorded, but
this release does not send email or WhatsApp invitation messages.

For live identity and hosting configuration, see [deployment notes](docs/deployment.md).
Google and SMS integration must be verified against the configured provider
before a school uses this release with real accounts.
