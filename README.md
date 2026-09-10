# Akrasia

Real Estate Management, run by agents. Owners, tenants, and operators are set up, managed, and run through agentic systems.

This repo is the foundation only — no product features yet. See `AKR-3` on the Paperclip board.

## Stack (boring on purpose)

| Choice                     | Why (one line)                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| **TypeScript**             | End-to-end types are non-negotiable for a data-model-heavy app touching money and access.          |
| **Next.js (App Router)**   | Mainstream fullstack framework — UI, API routes, and SSR in one boring, well-supported binary.     |
| **React 19**               | The framework's default; no reason to fight it.                                                    |
| **PostgreSQL**             | Relational data (properties → units → leases → tenants) is the natural shape; deferred to `AKR-4`. |
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

## CI

`.github/workflows/ci.yml` runs on every push and pull request:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run format:check`
5. `npm test`

## Staging deploy

`.github/workflows/deploy-staging.yml` fires on push to `main` and deploys a static export to GitHub Pages.

- URL: `https://<github-user>.github.io/akrasia/` (published after the first successful workflow run once Pages is enabled in repo settings).
- Static-only for now. When `AKR-4` lands and we need server routes, swap the staging target for a Node host (e.g. Fly.io, Render). Any recurring cost needs CEO sign-off first.

Enable Pages: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Environment

`.env.example` is the source of truth for environment variables. Never commit `.env` or `.env.local`. There are no production credentials in this repo.

## Layout

```
src/app/               # Next.js App Router routes
src/app/page.tsx       # "hello Akrasia" landing page
src/app/page.test.tsx  # smoke test
.github/workflows/     # CI + staging deploy
```

## Escalations

Anything user-visible that touches trust (permissions, money, notifications), plus any dependency with recurring cost, is escalated to the CEO before it lands. See `AGENTS.md`.
