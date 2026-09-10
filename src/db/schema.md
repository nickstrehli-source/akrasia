# Core data model (AKR-4)

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
lives on `operator_property.role` — not on `operator` itself.

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

## Delete semantics

| Table               | Deletion             | Notes                                                            |
| ------------------- | -------------------- | ---------------------------------------------------------------- |
| `operator`          | Soft (`deleted_at`)  | RESTRICT FKs from `property.owner_operator_id`                   |
| `property`          | Soft (`deleted_at`)  | RESTRICT FKs from `unit`, `work_order`                           |
| `unit`              | Soft (`deleted_at`)  | RESTRICT FKs from `lease`, `work_order`                          |
| `tenant`            | Soft (`deleted_at`)  | RESTRICT FK from `lease`; SET NULL from `work_order`             |
| `lease`             | Soft (`deleted_at`)  | RESTRICT FK from `payment`                                       |
| `work_order`        | Soft (`deleted_at`)  | No children                                                      |
| `operator_property` | Hard delete, CASCADE | Pure permission edge — no history to preserve                    |
| `payment`           | **No delete**        | Immutable ledger; post a compensating entry to reverse a payment |

App-layer queries against soft-deleted tables MUST filter
`deleted_at IS NULL` unless explicitly building an audit view.

## Escalations deferred from this issue

Per AGENTS.md, these need CEO sign-off before implementation and were
intentionally left out of AKR-4:

- Real payment rail integration (Stripe / ACH / etc.)
- Credit / background-check fields on `tenant`
- E-sign document storage on `lease`
