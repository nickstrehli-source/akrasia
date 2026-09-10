# Core data model (AKR-4) + operator auth (AKR-5) + agent substrate (AKR-8)

Boring Postgres. Migrations live in `../../migrations/`, are run by
`node-pg-migrate`, and every migration file exports both `up` and `down`.
CI applies the migration up, seeds, then rolls back and re-applies to prove
reversibility.

## Entities

```
operator ──< operator_property >── property ──< unit
   │                                  │           │
   │                                  │           └──< lease >── tenant
   │                                  │                   │
   │                                  │                   └──< payment
   │                                  │
   └── (assigned_operator) ── work_order ──(property, optional unit, optional tenant)
```

### operator

Owner or manager staff. Global identity (email + name). Per-property permission
lives on `operator_property.role` — not on `operator` itself. `password_hash`
(AKR-5) is `salt:scryptHash` hex, produced by `src/lib/auth/password.ts`
(Node's built-in `crypto.scrypt` — no new dependency). Defaults to `""`,
which never verifies against any password; an operator only gets a real hash
by accepting an invite or being seeded directly.

### operator_session (AKR-5)

Server-side session, looked up by `token_hash` (sha256 of the raw token —
only the hash is ever persisted). The raw token lives in the
`akrasia_session` cookie (httpOnly, `secure` in production, `sameSite=lax`).
Chose DB-backed sessions over JWTs specifically so logout/expiry is a real
row deletion, not just a client-side cookie clear — see
`src/lib/auth/session.ts`.

### operator_invite (AKR-5)

Single-use, expiring invite from one operator to another. `property_ids` is
a snapshot of the properties being granted, validated at invite-creation
time against the inviter's own `operator_property` rows (an inviter can
never grant access to a property they don't have themselves). `accepted_at`
is set exactly once, inside a transaction that `SELECT ... FOR UPDATE`s the
invite row — that row lock is what makes "single-use" hold under concurrent
accept attempts, not just an application-level check. See
`src/lib/auth/invite.ts`.

### property

A building or parcel owned by exactly one operator (`owner_operator_id`, FK
RESTRICT). Address fields are flat text for now; structured geocoding is out
of scope.

### operator_property

Join table scoping an operator's permissions to specific properties. Composite
PK `(operator_id, property_id)` with `role` (`owner` | `manager`). CASCADE
on both FKs — this row is metadata, not a business record, so deleting
the underlying operator or property cleans it up.

### unit

An individual rentable slot inside a property. `(property_id, label)` is
unique so the same unit label ("1A") can exist across different properties
but not within one.

### tenant

A person renting a unit. Email is unique. Not tied to a specific unit —
that relationship is expressed through `lease`.

### lease

The contract binding a tenant to a unit for a time window. `status` is
`pending` | `active` | `ended`. A partial unique index
(`lease_active_unit_unique`) enforces **at most one active, non-deleted
lease per unit** — that index is how "unit's current tenant" is derived.

Money is stored as `bigint` cents; no floats. `end_date` is nullable to
allow open-ended / month-to-month leases.

### work_order

Maintenance ticket scoped to a property, optionally to a unit and/or a
reporting tenant. `assigned_operator_id` may be null (unassigned).
Status: `open` | `in_progress` | `closed` | `cancelled`.

### payment

**Immutable ledger.** No `deleted_at` — corrections happen by posting a
compensating entry (e.g. a `refund` or `adjustment`). `amount_cents` is
always positive (CHECK constraint); `direction` distinguishes inbound
(tenant → landlord) from outbound (landlord → tenant). `lease_id`
FK uses RESTRICT so a lease with historical payments can't be hard-deleted.

### agent_run

Trace record for one agent invocation, scoped to the `operator_id` +
`property_id` it acted on behalf of (both required — every agent run has an
owner and a property boundary). `status` is `running` | `awaiting_approval`
| `completed` | `failed` | `rejected`. `input` is the JSON the caller passed
to `runAgent`; keep it free of raw tenant PII (redact before storing — see
AGENTS.md non-goals).

### agent_tool_call

Log of every tool call an agent makes, one row per call — this **is** the
tool boundary's audit trail, including calls blocked by the permission
boundary (agent called a tool outside its registered `tools` list) and
irreversible calls awaiting a decision. `status` is `pending_approval` |
`completed` | `failed` | `rejected`. `irreversible` mirrors the tool
definition at call time. For a `pending_approval` row, `output` is null and
the underlying tool handler has **not** run — see "Agent orchestration
substrate" below.

## Agent orchestration substrate (AKR-8)

Code lives in `src/agents/`. Agents are defined in code (`defineAgent`) with
a fixed list of tools (`defineTool`) they're allowed to call — that list is
the permission boundary, enforced in `runAgent` (`src/agents/runtime.ts`),
not just documentation. Agent code can only act through
`ctx.callTool(name, input)`; it never touches the database directly.

Any tool with `irreversible: true` (money movement, access grants/revokes,
external notifications) never executes inline. The call is logged as
`agent_tool_call.status = 'pending_approval'` and the run ends in
`awaiting_approval` — the handler only runs once an operator calls
`approveToolCall`, which executes it for real and commits the run. This is
the HITL confirmation gate.

`src/agents/store.ts` defines the `TraceStore` persistence interface;
`PgTraceStore` is the real implementation, `MemoryTraceStore` backs unit
tests so orchestration logic is verified without a live Postgres instance.
`src/agents/runtime.pg.test.ts` is the Postgres-backed smoke test — it runs
the dummy `smoke-test-agent` end to end and is wired into the CI `db` job.

**Known scope limit:** approval executes the gated tool and ends the run —
it does not resume further agent code after the pause. Multi-step
resumption after a mid-run approval is a follow-up for whenever a real
multi-step agent workflow needs it (out of scope for this issue; see
AGENTS.md non-goals — no real agent workflow ships here, only the
substrate + a dummy smoke-test agent).

## Delete semantics

| Table               | Deletion              | Notes                                                                                                            |
| ------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `operator`          | Soft (`deleted_at`)   | RESTRICT FKs from `property.owner_operator_id`                                                                   |
| `property`          | Soft (`deleted_at`)   | RESTRICT FKs from `unit`, `work_order`                                                                           |
| `unit`              | Soft (`deleted_at`)   | RESTRICT FKs from `lease`, `work_order`                                                                          |
| `tenant`            | Soft (`deleted_at`)   | RESTRICT FK from `lease`; SET NULL from `work_order`                                                             |
| `lease`             | Soft (`deleted_at`)   | RESTRICT FK from `payment`                                                                                       |
| `work_order`        | Soft (`deleted_at`)   | No children                                                                                                      |
| `operator_property` | Hard delete, CASCADE  | Pure permission edge — no history to preserve                                                                    |
| `payment`           | **No delete**         | Immutable ledger; post a compensating entry to reverse a payment                                                 |
| `operator_session`  | Hard delete on logout | No history to preserve                                                                                           |
| `operator_invite`   | No delete (yet)       | Rows accumulate in accepted/expired state; a cleanup job is a future nice-to-have, not a correctness requirement |
| `agent_run`         | **No delete**         | Append-only trace log                                                                                            |
| `agent_tool_call`   | **No delete**         | Append-only tool call log; status transitions in place                                                           |

App-layer queries against soft-deleted tables MUST filter
`deleted_at IS NULL` unless explicitly building an audit view.

## Escalations deferred from this issue

Per AGENTS.md, these need CEO sign-off before implementation and were
intentionally left out of AKR-4:

- Real payment rail integration (Stripe / ACH / etc.)
- Credit / background-check fields on `tenant`
- E-sign document storage on `lease`
