# Akrasia

Real Estate Management, run by agents. Owners, tenants, and operators are set up, managed, and run through agentic systems.

This repo is the foundation only — no product features yet. See `AKR-3` on the Paperclip board.

## Stack (boring on purpose)

| Choice                     | Why (one line)                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| **TypeScript**             | End-to-end types are non-negotiable for a data-model-heavy app touching money and access.          |
| **Next.js (App Router)**   | Mainstream fullstack framework — UI, API routes, and SSR in one boring, well-supported binary.     |
| **React 19**               | The framework's default; no reason to fight it.                                                    |
| **PostgreSQL**             | Relational data (properties → units → leases → tenants) is the natural shape; landed in `AKR-4`.   |
| **`pg` (node-postgres)**   | Boring, ubiquitous Postgres driver; no ORM tax until we actually need one.                         |
| **`node-pg-migrate`**      | Reversible `up`/`down` migrations in plain JS; CI proves the roundtrip on every push.              |
| **Vitest**                 | Fast, TS-native, Jest-compatible test runner.                                                      |
| **ESLint + Prettier**      | Standard formatting/linting; wired into CI.                                                        |
| **GitHub Actions**         | Free CI for the runtime we already use; no extra vendor.                                           |
| **GitHub Pages (staging)** | Free static hosting for the placeholder skeleton. Will move to a Node host once `AKR-4` adds a DB. |

New dependencies require a one-line justification in this table. Adding paid infra, error tracking, analytics, or third-party payment/e-sign/credit providers requires **explicit CEO approval** — see `AGENTS.md`.

## Getting started

```bash
nvm use            # Node 22
npm install
cp .env.example .env.local
npm run dev        # http://localhost:3000
```

## Scripts

| Command                           | Description                                 |
| --------------------------------- | ------------------------------------------- |
| `npm run dev`                     | Next dev server                             |
| `npm run build`                   | Production build                            |
| `npm run start`                   | Serve the production build                  |
| `npm run lint`                    | ESLint (flat config, Next + Prettier rules) |
| `npm run typecheck`               | `tsc --noEmit`                              |
| `npm run format` / `format:check` | Prettier write / check                      |
| `npm test`                        | Vitest (once)                               |
| `npm run test:watch`              | Vitest watch mode                           |
| `npm run db:migrate:up`           | Apply pending migrations                    |
| `npm run db:migrate:down`         | Roll back the last migration                |
| `npm run db:migrate:redo`         | Down + up (fastest reversibility check)     |
| `npm run db:seed`                 | Populate the deterministic demo dataset     |

## Database

Schema lives in `migrations/` (reversible `up`/`down`, run via `node-pg-migrate`) and is documented in [`src/db/schema.md`](src/db/schema.md). The seed script in `scripts/seed.mjs` produces a deterministic demo dataset (1 landlord, 2 properties, 4 units, 2 tenants, 2 active leases, 1 open work order) — this is the fixture downstream issues should test against.

Local setup:

```bash
# Start a local Postgres however you like (Docker, Homebrew, Postgres.app, …)
# then point DATABASE_URL at it in .env.local:
DATABASE_URL=postgres://user:password@localhost:5432/akrasia

npm run db:migrate:up
npm run db:seed
```

## CI

`.github/workflows/ci.yml` runs on every push and pull request. Two parallel jobs:

**`quality`** — `npm ci` → `lint` → `typecheck` → `format:check` → `test`.

**`db`** — spins up a Postgres 16 service, then:

1. `npm run db:migrate:up`
2. `npm run db:seed`
3. `npm run db:migrate:down && npm run db:migrate:up && npm run db:seed` — proves migrations are reversible.

## Staging deploy

`.github/workflows/deploy-staging.yml` fires on push to `main` and deploys a static export to GitHub Pages.

- URL: `https://<github-user>.github.io/akrasia/` (published after the first successful workflow run once Pages is enabled in repo settings).
- Static-only for now. `AKR-4` added the DB schema but no server routes yet; when the first server-rendered page or API route lands we'll need to swap the staging target for a Node host (e.g. Fly.io, Render). Any recurring cost needs CEO sign-off first.

Enable Pages: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Environment

`.env.example` is the source of truth for environment variables. Never commit `.env` or `.env.local`. There are no production credentials in this repo.

## Layout

```
src/app/               # Next.js App Router routes
src/app/page.tsx       # "hello Akrasia" landing page
src/app/page.test.tsx  # smoke test
src/db/schema.md       # data model + delete semantics (AKR-4)
migrations/            # node-pg-migrate reversible migrations
scripts/seed.mjs       # deterministic demo dataset
.github/workflows/     # CI + staging deploy
```

## Escalations

Anything user-visible that touches trust (permissions, money, notifications), plus any dependency with recurring cost, is escalated to the CEO before it lands. See `AGENTS.md`.
