# App Audit & Runbook Template

> Reusable skeleton for auditing and operating a Gadget + Shopify app.
> Fill in every `TODO` / `[ ]`. Seeded with findings for **enshield-shipping-protection**
> (Gadget frameworkVersion `v1.5.0`, Shopify API `2026-01`). Duplicate this file per app.

---

## 0. App Snapshot

| Field | Value |
|-------|-------|
| App name | enshield-shipping-protection |
| Application URL | https://enshield-shipping-protection.gadget.app/ |
| Gadget framework | v1.5.0 |
| Shopify API version | 2026-01 |
| Connection type | partner |
| Enabled models (sync) | shopifyOrder, shopifyProduct, shopifyProductVariant |
| Custom models | shippingInsuranceProduct, shippingInsuranceSetting, shopifyCart, shopifySync, session |
| Custom actions | createInsuranceVariants, createProductViaCurl, scheduledShopifySync, sendOrderToEnshield, sendTrackingToEnshield, setupInsuranceProduct, setupShippingInsuranceProduct, syncInsuranceProduct |
| Webhooks | routes/webhooks/cart |
| Auth model | email/password plugin (recently added) |
| Roles | shopify-app-users (`Role-Shopify-App`), unauthenticated |

---

## 1. Security & Access Audit

### 1.1 OAuth scope reconciliation  ✅ RESOLVED 2026-07-17
Both files reduced to least-privilege set (code analysis found no customer/checkout/
order-edit/listing usage in `api/`): `read_products, write_products, read_orders, write_orders`.
Original drift is recorded below for history. **Note:** this is a scope *reduction* — verify
merchants re-consent on next install/update.

Original drift (both sources previously disagreed):

| Scope | `settings.gadget.ts` | `shopify.app.toml` |
|-------|:---:|:---:|
| read_products / write_products | ✅ | ✅ |
| read_orders / write_orders | ✅ | ✅ |
| write_checkouts | ✅ | ✅ |
| read_checkouts | ✅ | ❌ |
| read_customers / write_customers | ✅ | ❌ |
| read_product_listings / write_product_listings | ✅ | ❌ |
| write_order_edits | ❌ | ✅ |

**Action:** Decide the authoritative set, make both files match, redeploy. Over-broad
scopes (customers, product_listings) should be dropped if unused; `write_order_edits`
must be added to `settings.gadget.ts` if actually needed.
`[ ]` Reconciled  `[ ]` Verified in Shopify Partners install screen

### 1.2 Auth / permissions
- `[ ]` Confirm email/password auth plugin is wired to the intended user model.
- `[ ]` Review `accessControl/permissions.gadget.ts` — every model grant is
  intentional; no accidental `create/update/delete: true` for `unauthenticated`.
- `[ ]` Confirm `.gelly` filters scope each read to the owning shop (tenant isolation).
- `[ ]` No signed-in role has broader access than the app requires.

### 1.3 Secrets & config
- `[ ]` Enshield API key/endpoint stored as Gadget environment secret, not in code.
- `[ ]` No secrets in committed files (grep the repo; check `createProductViaCurl.js`).
- `[ ]` Separate credentials for dev vs. production environments.

---

## 2. Reliability Runbook

### 2.1 Integration surfaces
| Surface | File(s) | Failure mode | Recovery |
|---------|---------|--------------|----------|
| Order → Enshield | `sendOrderToEnshield.js` | dispatch fails / Enshield down | TODO: retry policy? DLQ? |
| Tracking → Enshield | `sendTrackingToEnshield.js` | tracking missing/late | TODO |
| Scheduled Shopify sync | `scheduledShopifySync.js` | sync stalls / partial | TODO: re-run trigger |
| Cart webhook | `routes/webhooks/cart` | webhook lost / dup | TODO: idempotency key |
| Insurance product setup | `setupInsuranceProduct.js`, `createInsuranceVariants.js` | variant drift | TODO |

### 2.2 On-call playbook (fill per incident type)
- **Sync stopped:** `[ ]` check `shopifySync` records → `[ ]` inspect last error →
  `[ ]` re-trigger `scheduledShopifySync` → `[ ]` verify order counts reconcile.
- **Orders not reaching Enshield:** `[ ]` confirm secret valid → `[ ]` check action
  logs → `[ ]` replay failed orders → TODO: how to replay.
- **Webhook backlog:** `[ ]` check Gadget webhook queue → `[ ]` confirm HMAC → TODO.

### 2.3 Deploy / rollback

**Deploy path (verified against framework v1.5.0, ggt 3.0.0):**
- Local dir syncs to `revamp-dev`. App environments: `clone-dont-edit`, `revamp-dev`.
  There is NO dedicated `production` environment configured for this app.
- `ggt deploy` builds/validates against the production target and will ABORT if
  production is unconfigured (it is). Last run aborted on exactly this.

**⚠️ Production not deploy-ready — blockers (cannot be fixed from repo/CLI):**
1. Missing production Shopify app credentials. The `shopify.app.toml`
   `client_id = "ff7b9b548cd4be5e0b0d428c1afb7d0e"` is the dev app. Production needs
   its own Shopify app (Partners dashboard) connected to the prod environment.
   → Fix in: Gadget dashboard → Settings → Plugins → Shopify → Connect (prod env).
2. Production missing env vars present in revamp-dev. Only custom var the code needs
   is `ENSHIELD_API_KEY` (GADGET_* vars are auto-injected per-env, not set manually).
   → Fix in: Gadget dashboard → Settings → Environment Variables → production.
   Note: `ggt status --env=production` is blocked by Gadget; prod is dashboard-managed.

**Deploy sequence once prod is configured:**
- `[ ]` 1. Confirm scope change re-consent impact: reduced to
  `read_products, write_products, read_orders, write_orders`. Installed merchants
  re-approve on next load. Communicate before prod deploy.
- `[ ]` 2. `ggt deploy` (interactive terminal required — aborts non-interactively).
- `[ ]` Rollback: previous Gadget deploy id + how to revert. TODO (get from dashboard
  deploy history).
- `[ ]` Post-deploy smoke test: create test order, confirm Enshield receives it.

**Pre-deploy smoke test (revamp-dev) — BLOCKED, root cause found:**
Cannot run the scope-reduction smoke test on revamp-dev. Verified 2026-07-17 via
Gadget + Shopify dashboards:
- Gadget → Settings → Plugins → Shopify: scopes correct
  (`read_products, write_products, read_orders, write_orders`, API v2026-01) BUT
  "No Shopify apps connected" (connection is per-environment / "Unique to this env").
- `admin.shopify.com` for this account shows "Create your first online store" —
  **no Shopify store exists at all.** No store → no app to connect → no connection.
Unblock path (in order): (1) create a **development store** (Partners account →
Stores → Add store → Development store; free, Bogus Gateway test payments), NOT the
generic merchant "Create store" flow; (2) revamp-dev → "Connect a Shopify app" →
install on that dev store (install itself validates the 4-scope consent); (3) place a
draft order (Orders → Drafts → Create → Mark as paid).
Smoke-test procedure once connected — invoke in Gadget playground (revamp-dev):
`sendOrderToEnshield(orderId, shopId)`. Get `shopId` via
`query { shopifyShops { edges { node { id myshopifyDomain } } } }`.
PASS = log line "Successfully fetched order from Shopify" (return `{success:false}`
"skipping Enshield submission" is EXPECTED with a no-insurance test order — the
Shopify `read_orders` fetch ran before the skip, zero Enshield side effect).
FAIL = any 403 / access-denied / missing-scope error on the `order(id:...)` query.
Note: the Enshield POST hits the REAL manage.enshield.com API — a no-insurance order
avoids that write, which is why it's the recommended test.

---

## 3. Repo Hygiene  ⚠️ FINDING (open)
- Name collision: top-level `enshield-app/` (this Gadget app) vs.
  `enshield-deliverables/enshield-app/` (a separate Vite build) share a name in the
  parent `Work` repo. Decide canonical location / rename one to avoid confusion.
- `[ ]` `.gitignore` excludes `.gadget/`, `node_modules/`, secrets.

---

## 4. Sign-off
| Reviewer | Date | Scope covered |
|----------|------|---------------|
| TODO | TODO | TODO |
