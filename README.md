# Akrasia

Real Estate Management, run by agents. Owners, tenants, and operators are set up, managed, and run through agentic systems.

This repo is the foundation only — no product features yet. See `AKR-3` on the Paperclip board.

## Stack (boring on purpose)

| Choice                     | Why (one line)                                                                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TypeScript**             | End-to-end types are non-negotiable for a data-model-heavy app touching money and access.                                                                                                                        |
| **Next.js (App Router)**   | Mainstream fullstack framework — UI, API routes, and SSR in one boring, well-supported binary.                                                                                                                   |
| **React 19**               | The framework's default; no reason to fight it.                                                                                                                                                                  |
| **PostgreSQL**             | Relational data (properties → units → leases → tenants) is the natural shape; landed in `AKR-4`.                                                                                                                 |
| **`pg` (node-postgres)**   | Boring, ubiquitous Postgres driver; no ORM tax until we actually need one.                                                                                                                                       |
| **`node-pg-migrate`**      | Reversible `up`/`down` migrations in plain JS; CI proves the roundtrip on every push.                                                                                                                            |
| **Vitest**                 | Fast, TS-native, Jest-compatible test runner.                                                                                                                                                                    |
| **ESLint + Prettier**      | Standard formatting/linting; wired into CI.                                                                                                                                                                      |
| **GitHub Actions**         | Free CI for the runtime we already use; no extra vendor.                                                                                                                                                         |
| **GitHub Pages (staging)** | Free static hosting for the placeholder skeleton. `AKR-5` added server routes that a static export can't serve — moving to a Node host is now blocked on a CEO-approved vendor pick, see "Staging deploy" below. |

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

## Operator auth (AKR-5)

Email + password, **server-side sessions** (not JWT) — chosen so logout and
expiry are a real row deletion in `operator_session`, not just a cookie
clear. Passwords are hashed with Node's built-in `crypto.scrypt` (no new
dependency). Session and invite tokens are high-entropy random values; only
their sha256 hash is ever stored, so a DB read alone can't produce a valid
cookie or invite link. Full design + delete semantics in
[`src/db/schema.md`](src/db/schema.md).

- `POST /api/auth/login`, `/logout`, `/signup` (signup = accepting an invite
  token — there's no open self-serve signup).
- `POST /api/operators/invite` — an existing operator invites another,
  scoped to a subset of the inviter's own properties. No email provider is
  wired up (that's a new vendor dependency — CEO sign-off first), so the
  invite link is shown directly to the inviting operator to share by hand.
- `requirePropertyAccess` (`src/lib/auth/access.ts`) is the role-check
  middleware — every property-scoped route calls it before reading or
  writing; see `src/app/api/properties/[id]/route.ts` for the reference
  pattern. Denied access reads as 404, not 403, so an unauthorized caller
  can't even confirm the property id exists.
- Minimal no-JS pages at `/login`, `/signup`, `/dashboard` so the flow is
  actually walkable in a browser, not just an API surface.
- Demo login (after `npm run db:seed`): `owner@demo.akrasia.local` /
  `demo-password123`.

Tenant-facing auth is explicitly out of scope for this issue — it lands with
the first agent-driven tenant workflow.

## Agent orchestration substrate

`src/agents/` (AKR-8) is the substrate every future agent-driven workflow plugs into: agents and their tools are defined in code with a typed permission boundary, every tool call is logged, and any tool marked `irreversible: true` (money movement, access grants, external notifications) blocks in a `pending_approval` state until an operator approves it. Full design notes and the delete semantics for `agent_run` / `agent_tool_call` are in [`src/db/schema.md`](src/db/schema.md#agent-orchestration-substrate-akr-8). No real agent workflow ships here — only the substrate plus a dummy `smoke-test-agent` that proves it end to end.

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

**`quality`** — `npm ci` → `lint` → `typecheck` → `format:check` → `db:migrate:up` → `test`. Now spins up its own Postgres 16 service too: the auth suite (`src/lib/auth/*.test.ts`, `src/app/api/**/*.test.ts`) exercises real DB-backed security invariants (property access control, invite expiry/single-use) rather than mocking Postgres. DB-backed test files `describe.skipIf(!process.env.DATABASE_URL)` so a bare local `npm test` without Postgres still passes, just skipping that coverage.

**`db`** — spins up a separate Postgres 16 service, then:

1. `npm run db:migrate:up`
2. `npm run db:seed`
3. `npx vitest run src/agents/runtime.pg.test.ts` — Postgres-backed agent substrate smoke test.
4. `npm run db:migrate:down && npm run db:migrate:up && npm run db:seed` — proves migrations are reversible.

## Staging deploy

`.github/workflows/deploy-staging.yml` fires on push to `main` and deploys a static export to GitHub Pages.

- URL: `https://<github-user>.github.io/akrasia/` (published after the first successful workflow run once Pages is enabled in repo settings).
- **Blocked on a deploy-target decision.** `AKR-5` is the first issue to add server routes (login/signup/dashboard, cookies, live DB queries) — a static export structurally cannot serve any of it (no server to run route handlers, set cookies, or hold a DB connection). "Operator can log in/out **on staging**" (an AKR-5 acceptance criterion) isn't achievable until staging moves off GitHub Pages to a Node host (e.g. Fly.io, Render, Vercel) with a reachable Postgres instance. That's a new hosting vendor plus recurring cost, so it's **escalated to the CEO rather than picked unilaterally**. Everything else in this issue — code, migration, tests — is done and verified locally/in CI, ready to deploy the moment a target is chosen.

Enable Pages: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Environment

`.env.example` is the source of truth for environment variables. Never commit `.env` or `.env.local`. There are no production credentials in this repo.

## Layout

```
src/app/               # Next.js App Router routes
src/app/page.tsx       # "hello Akrasia" landing page
src/app/page.test.tsx  # smoke test
src/app/login/         # operator login page (AKR-5)
src/app/signup/        # accept-invite page (AKR-5)
src/app/dashboard/     # authenticated home: properties + invite form (AKR-5)
src/app/api/auth/      # login, logout, signup route handlers (AKR-5)
src/app/api/operators/ # invite route handler (AKR-5)
src/app/api/properties/[id]/ # reference property-scoped route (AKR-5)
src/lib/auth/           # password hashing, sessions, invites, role-check middleware (AKR-5)
src/test/               # DB test helpers: resetDb + fixtures (AKR-5)
src/db/client.ts        # pg Pool + query helper
src/db/schema.md        # data model + delete semantics (AKR-4) + operator auth (AKR-5) + agent substrate design (AKR-8)
src/agents/              # agent orchestration substrate: registry, tool boundary, HITL gate, trace store (AKR-8)
migrations/            # node-pg-migrate reversible migrations
scripts/seed.mjs       # deterministic demo dataset
.github/workflows/     # CI + staging deploy
```

## Escalations

Anything user-visible that touches trust (permissions, money, notifications), plus any dependency with recurring cost, is escalated to the CEO before it lands. See `AGENTS.md`.
