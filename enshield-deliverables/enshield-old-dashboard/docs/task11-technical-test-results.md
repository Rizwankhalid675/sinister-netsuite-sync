# Task 11 Pre-Production Technical Test Results

Date: 2026-07-23  
Scope: local `enshield-old-dashboard` source and the read-only CSV supplied by the team  
Environment: Windows development workstation; no Gadget sync, deployment, or live API calls

## Outcome

The configured local application test lanes, production build, browser checks, API syntax checks, and API module-load checks passed after the Task 11 fixes. Task 11 and production release remain blocked by the unconfigured checks and external/runtime gates in the go-live checklist.

## Fresh local evidence

| Check | Command | Result |
|---|---|---|
| Backend/control tests | `node --test tests/*.test.mjs` | 241 passed, 0 failed |
| UI unit/component tests | `yarn test:ui` | 25 passed, 0 failed |
| Browser tests | `yarn test:e2e` | 6 passed, 0 failed across desktop and mobile Chromium |
| Production build | `yarn build` | Passed; Vite reported one large-chunk warning |
| Lint | Not run | **BLOCKED:** the repository has no lint script or lint configuration |
| Static typecheck | Not run | **BLOCKED:** the repository has no typecheck script or project TypeScript configuration |
| JavaScript syntax | `node --check` for every `api/**/*.js` | 115 checked, 0 failed |
| API/action module load | `node --test tests/task11-module-load.test.mjs` | 115 modules load; 1 regression test passed |
| Focused security | authorization, tenant, app-user, auth-lifecycle, and dashboard suites | 47 passed before the final aggregate rerun |
| Secret scan | targeted private-key/token/credential patterns, excluding dependencies/build output | 0 matching source files |
| Dependency audit | `yarn audit --json` | 0 critical, 35 high, 17 moderate, 2 low after direct dependency upgrades |
| CSV structure/totals | PowerShell `Import-Csv` validation | 12 unique monthly rows, 0 malformed, 5 orders, value total 0 |
| Shopify/Gadget source reconciliation | Not run | **BLOCKED:** no authorized staging/live source call or same-cutoff source snapshot |

## Fixes made during verification

1. Added a regression test that dynamically imports every API/action JavaScript module.
2. Added `.js` to six relative imports in the app-role and client actions.
3. Removed runtime imports of the JSDoc-only `ActionOptions` type from thirteen generated-style actions.
4. Added a failing authorization test for the protection-variant endpoint.
5. Required Gadget's verified Shopify app-proxy/current-shop context before the endpoint performs any tenant read.
6. Changed the shop lookup to use the verified shop ID, not the client-supplied domain.
7. Removed raw request bodies, stack traces, URLs, domains, prices, and product identifiers from affected route logs.
8. Upgraded direct `react-router` and `vite` dependency ranges to audited patched releases.

## Data reconciliation result

The supplied `enshield-report-2026.csv` is structurally valid but is a legacy summary format containing only `Month`, `Orders`, and `Value`. It reports 5 orders and total value 0. The current dashboard/export adds scope, client, currency, generated timestamp, filters, and truncation metadata.

**Reconciliation status: BLOCKED / NOT RUN.** The file cannot prove source-system equality because this verification did not call Shopify or Gadget. A staging export and source snapshot taken at the same timestamp are required for record-level reconciliation.

## Known warnings and limits

- The production bundle includes a JavaScript chunk over 500 kB. This is a performance warning, not a correctness failure.
- Node reports `MODULE_TYPELESS_PACKAGE_JSON` warnings because the package does not declare ESM globally.
- Browser verification used the configured Playwright fallback because no Browser plugin was available.
- Browser tests use deterministic mocked API responses; they do not prove staging authentication, Gadget schema compatibility, Shopify connectivity, or live data correctness.
- The dependency audit is still release-blocking. Most remaining advisories are in Gadget's linked generated server/client dependency trees and require a compatible Gadget runtime/codegen refresh.
