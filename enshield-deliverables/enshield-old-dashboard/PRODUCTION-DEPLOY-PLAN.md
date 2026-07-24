# Production Deploy Plan — Enshield Dashboard Revamp

> **STATUS: NOT EXECUTED. Held for explicit human approval.**
> Nothing in this document has been run. Production is untouched.

## What this deploy would ship

The revamped, RBAC-gated, animated single-shop analytics dashboard plus the
Shop Info page fix, from the `development` environment to **production**.

Changed/added files (all currently synced to `development` only):
- `web/routes/dashboard.jsx` — revamped modern dashboard UI (RBAC, motion, tabs)
- `web/routes/index.jsx` — Shop Info page; removed client-side unauthenticated
  `useFindFirst(api.shopifyShop)` read, now uses server-side `/api/shop-info`
- `api/routes/api/GET-dashboard-metrics.js` — real-data aggregation (session-scoped)
- `api/routes/api/GET-shop-info.js` — NEW server-side shop+metafields resolver
- `web/components/*` — RBAC role hook, permission model, self-contained Motion shim
- dashboard CSS (role banner/picker, reports, buttons)

## Target (verify before ANY deploy)

- Application: `enshield-shipping-protection`
- Production app URL: `enshield-shipping-protection.gadget.app`
- Production client id: `0448a292fd4a9b2f9675392592339bbf`  ← MUST match; do not deploy to any other client
- Source env: `development` (filesVersion 1407)

## Pre-flight checklist (ALL must be YES before deploy)

1. [ ] Explicit human approval given for THIS production deploy, in this session.
2. [ ] Shop Info page verified rendering in embedded Admin (no GGT_PERMISSION_DENIED).
3. [ ] Dashboard verified rendering with real session (DONE earlier — screenshot).
4. [ ] `ggt status` shows local == development, no pending diff.
5. [ ] No schema/model changes that would delete production data
       (this change is routes + web only — no model/field removals expected;
        confirm the deploy does NOT prompt for --allow-data-delete).
6. [ ] Reviewer confirms production client id above matches deploy target.

## The command (DO NOT RUN without all boxes checked)

```
cd enshield-old-dashboard
npx ggt deploy --env development
```

- This pushes development → production. It is IRREVERSIBLE for data.
- Do NOT pass `--force` (it discards environment changes silently).
- Do NOT pass `--allow-data-delete` unless a reviewer has explicitly accepted
  named data loss. This revamp should require neither.
- If the CLI prompts for charges or data deletion: STOP, do not confirm, report
  back to the human. That prompt means the deploy is doing more than expected.

## Rollback

Gadget keeps production environment history. If the deploy regresses production:
- Use the Gadget editor (production environment) to revert to the prior
  filesVersion, or re-deploy the last-known-good development snapshot.
- Document the incident and the filesVersion rolled back to.

## Post-deploy verification (after approved deploy only)

1. [ ] Load `enshield-shipping-protection.gadget.app` dashboard in a REAL
       production store's embedded Admin — confirm renders, real data, RBAC.
2. [ ] Load Shop Info page in production — confirm no permission error.
3. [ ] Confirm the live storefront shipping-protection widget/behavior is
       unaffected (this deploy did not touch storefront extension logic).
