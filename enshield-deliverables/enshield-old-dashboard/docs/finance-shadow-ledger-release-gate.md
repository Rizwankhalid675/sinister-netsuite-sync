# Finance shadow-ledger release gate

Phase 4 is a read-only accounting simulation. It performs **no external accounting posting**
and **no payment initiation**. Every finance profile and journal entry must remain
`shadowMode: true`; production actions must fail closed if that invariant is absent.

The initial chart is a conservative test chart only. Before any operational posting, the
owner/CPA must approve in writing:

- legal entities, tenant-to-entity ownership, and base currencies;
- chart of accounts and posting rules for premium, refunds, claims, reserves, fees, AR, and AP;
- revenue recognition timing and gross-versus-net presentation;
- fiscal calendar, close/reopen authority, retention, tax, and FX policy;
- payment authority, bank/accounting-system ownership, reconciliation tolerances, and migration source.

Until those gates are approved, external sync, cash movement, automated payments, tax
calculation, foreign-exchange conversion, and bank feeds remain intentionally unimplemented.

