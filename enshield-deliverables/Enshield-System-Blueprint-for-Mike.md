# Enshield — System Findings & Architecture Blueprint

**To:** Mike
**Re:** How the Enshield system actually works today (Gadget + DigitalOcean + Shopify + Dashboard) and what we found while investigating the revamp

---

## TL;DR

We traced the whole Enshield stack end-to-end. There are **two separate front-end surfaces** (an embedded Shopify settings app and a standalone admin dashboard), a **Gadget backend** that holds the data and business logic, a **DigitalOcean droplet** running an older/parallel dashboard, and **Shopify** as the source of truth for stores, orders, and checkout. This document explains how each piece connects so we're all working from the same mental model before we start the revamp.

---

## The Four Systems

### 1. Shopify (source of truth)
- Merchants install the **Enshield Shipping Protection** app on their Shopify stores.
- Shopify owns the raw commerce data: shops, orders, line items, carts, checkout.
- The shipping-protection product is injected at checkout so customers can add protection to an order.
- Enshield reads this data (via webhooks + sync) — it does **not** replace Shopify.

### 2. Gadget (backend / brain)
- The app **`enshield-shipping-protection`** is built on **Gadget**.
- It connects to Shopify and continuously **syncs** store data into its own models.
- **Data models it holds:**
  - `shopifyShop` — the connected stores (our "Clients")
  - `shopifyOrder` / `shopifyCart` — commerce data
  - `shippingInsuranceProduct` — the protection product per order (drives "Value in Transit")
  - `shippingInsuranceSetting` — per-store configuration
  - `shopifySync` — sync bookkeeping
  - `session` — auth/session records
- Gadget also **auto-generates an API** over these models, which is what the front ends read from.
- Access is governed by `accessControl` roles (shopify-app / signed-in / etc.).

### 3. The Front Ends (there are TWO — this was a key finding)
- **A) Embedded Shopify app (Gadget-hosted):** a **single Polaris settings page** ("Shipping Insurance Settings"). Merchant-facing. Lets a store set the learn-more URL and the desktop/mobile modal images, saved via Shopify metafields. This is small and lives inside Shopify admin.
- **B) Standalone Admin Dashboard (the dark "Insanelab" UI):** the rich internal dashboard with **Activity chart, Value in Transit, Clients, Claims, Errors, Reports**. This is a **separate app**, NOT the Gadget embedded one. This is the thing Brain wants revamped.

### 4. DigitalOcean (hosting / legacy)
- A **DigitalOcean droplet** runs a version of the dashboard/backend infrastructure.
- During investigation we accessed it (SSH keys, snapshots, clones) to understand the running production setup and confirm what data and code actually live where.
- Part of the revamp decision is whether the revamped dashboard keeps running on DO, moves fully onto Gadget's hosting, or a hybrid.

---

## How Data Flows

```
  Merchant's Shopify Store
          │  (installs Enshield app; checkout adds protection)
          ▼
  Shopify  ──webhooks / sync──►  Gadget backend
  (orders, carts,                (models: shopifyShop, shopifyOrder,
   shops, checkout)               shippingInsuranceProduct, settings…)
                                          │
                        auto-generated, access-controlled API
                                          │
                 ┌────────────────────────┴────────────────────────┐
                 ▼                                                  ▼
   A) Embedded Shopify settings          B) Standalone Admin Dashboard
      page (Polaris, in Shopify             (dark UI: Value in Transit,
      admin — 1 screen)                     Clients, Claims, Reports)
                                                      │
                                          hosted on / near DigitalOcean
```

**KPIs on the dashboard map to Gadget data like this:**
- **Clients** = connected `shopifyShop` records
- **Value in Transit** = sum of active `shippingInsuranceProduct` across open orders
- **Open Claims** = claims count (claims workflow)
- **Latest Clients table** = `shopifyShop` list with per-shop value/claims/status

---

## What This Means for the Revamp

1. **The embedded Shopify app is tiny** — basically one settings screen. Easy to modernize.
2. **The real revamp target is the standalone admin dashboard** (the dark UI). It should be rebuilt against the Gadget API so it always reflects live synced data.
3. **Gadget is the backend we build on** — we add aggregation/computed actions there for the KPIs and expose clean, access-controlled reads to the dashboard.
4. **DigitalOcean is a hosting decision** we need to settle: keep, migrate to Gadget hosting, or hybrid.

---

## Open Questions (need answers before coding)

1. **Feature list** — what specifically does Brain want to add/change in the revamp?
2. **Target surface** — revamp the standalone dashboard, the embedded Shopify app, or both?
3. **Hosting** — stay on DigitalOcean, move to Gadget, or hybrid?
4. **Where the revamped code lives** — in the existing Gadget app or a fresh project?

---

## Proposed Phased Plan

- **Phase 1 — Architecture lock-in:** confirm target surface + hosting; reuse the existing audit report as the requirements baseline.
- **Phase 2 — Backend (Gadget):** add aggregation actions for KPIs; expose a clean, access-controlled read API.
- **Phase 3 — Frontend revamp:** rebuild the admin dashboard (Activity, KPI cards, Clients, Claims, Reports) against the Gadget API; modernize the embedded Polaris settings page.
- **Phase 4 — New features:** implement Brain's feature list.

---

*Prepared from a full end-to-end trace of the Gadget app source, the DigitalOcean droplet, the Shopify connection, and both front-end surfaces.*
