# Sinister Diesel Sync — System Documentation

**Service Name:** Sinister Diesel Sync
**Built By:** Rizwan Khalid (Ecommerce Coordinator)
**Purpose:** Replaces Celigo middleware ($17,797/year) with a custom, fully owned integration
**Stack:** Node.js · PM2 · Nginx · Linux (Oracle Cloud) · Miva JSON API · NetSuite REST API (TBA OAuth 1.0a)

> **Note:** This service originally ran as a Windows Service (`sinisterdieselsync.exe`). It has since been migrated to run on a Linux VM under PM2 — see [README.md](README.md) and [DEPLOY.md](DEPLOY.md) for the current deployment. Only one instance should ever run at a time; running it on both Windows and Linux simultaneously causes duplicate Sales Orders in NetSuite.

---

## What Is This?

This is a custom-built background service that automatically keeps **Miva** (our storefront) and **NetSuite** (our ERP) in sync — 24 hours a day, 7 days a week, every 5 minutes — with zero manual effort.

Every time a customer places an order on sinisterdiesel.com, the sync service picks it up, creates everything needed in NetSuite, and keeps both systems perfectly aligned.

A live dashboard (password-protected) shows real-time sync logs, flow health, and stats — see "Live Dashboard" below.

---

## How It Works — The Big Picture

```
CUSTOMER PLACES ORDER
        ↓
   Miva Storefront
        ↓
  [Every 5 Minutes]
        ↓
┌─────────────────────────────┐
│   Sinister Diesel Sync      │
│   (PM2 process on Linux)    │
│                             │
│  Flow 1 → Sales Order       │
│  Flow 2 → Shipments         │
│  Flow 3 → Deposit + Invoice │
│  Flow 4 → Product IDs       │
│  Flow 5 → Customers         │
└─────────────────────────────┘
        ↓
   NetSuite ERP
```

---

## The 5 Sync Flows

---

### Flow 1 — Orders: Miva → NetSuite

**What it does:**
When a new order is placed on Miva, this flow creates a matching Sales Order in NetSuite with every detail mapped correctly.

**What gets mapped:**
| Miva Field | NetSuite Field |
|---|---|
| Customer email | Linked NS Customer (auto-created if new) |
| Shipping address | Shipping Address |
| Billing address | Billing Address |
| Order items (SKUs) | Line items with NS Item IDs |
| Shipping cost | Shipping Cost |
| Shipping method | Ship Method (UPS Ground, 2nd Day Air, etc.) |
| Discount / promo code | Discount Item + Discount Rate (header fields) |
| Enshield Package Protection | Line item (NS Item ID 10322) |
| Phone number | Ship Phone + custom field custbody231 |
| Payment module | Custom field (Miva Payment Method) |
| Order total | Custom field (Miva Order Total) |
| Miva Order ID | Custom field (used for cross-reference) |

**Discount handling:**
- If the order has a promo/discount code, the system sets `Discount Item = "Discount Item"` (NS ID 38) and `Discount Rate = the dollar amount` (e.g., -5.04)
- NetSuite automatically deducts this from the order total
- The Discount Rate and Discount Item fields are visible on the Sales Order header for sales reps

**SKU matching:**
- Checks hardcoded overrides first (Celigo parity list)
- Then searches NetSuite by SKU
- Strips trailing suffixes to find partial matches
- Auto-creates the item in NetSuite if not found (prevents missing lines)
- Blemish items map to a generic Blemish NS item

**Customer matching:**
- Looks up customer in NetSuite by email
- If not found, auto-creates the customer so no order is ever lost

**Status on creation:** All new Sales Orders are created with status **Pending Approval (A)**

---

### Flow 2 — Shipments: NetSuite → Miva

**What it does:**
When a NetSuite Item Fulfillment is marked as shipped (status = Closed/C), this flow pushes the tracking number and carrier back to Miva so the customer gets their shipping notification.

**How it works:**
1. Queries NetSuite for fulfilled orders (Item Fulfillments with status C) in the last 24 hours
2. Looks up tracking number from the shipment packages
3. Updates the Miva order with the tracking number and carrier
4. Marks the shipment as synced so it doesn't re-process

---

### Flow 3 — Customer Deposits & Invoices

**What it does:**
This is the financial flow. It handles two things per order:

**Step 1 — Customer Deposit:**
- Created immediately when the order is first processed
- Amount = full order total (we always collect full payment upfront)
- Linked to the Sales Order
- Records the payment received from the customer

**Step 2 — Invoice:**
- Only created after the Sales Order status reaches **E** (Pending Billing/Partial) or **F** (Pending Billing — fully shipped)
- This means: the invoice is NEVER created until the order is approved AND fulfilled
- Created by transforming the Sales Order into an Invoice in NetSuite

**Step 3 — Close the Invoice:**
- After the invoice is created, the system applies the Customer Deposit to it
- This closes the invoice automatically (Balance = $0.00)
- No manual "Accept Payment" needed

**Invoice timing logic:**
```
SO Status A (Pending Approval)    → No invoice yet
SO Status B (Pending Fulfillment) → No invoice yet
SO Status E or F (Pending Billing) → ✅ Create invoice + apply deposit
SO Status G (Billed/Closed)       → Already done
```

---

### Flow 4 — Product ID Sync: Miva ↔ NetSuite

**What it does:**
Keeps the Miva Product ID linked on each NetSuite inventory item. This cross-reference field (`custitem_hb_miva_product_id`) ensures products stay connected between both systems.

**How it works:**
- Fetches all active Miva products
- Fetches all NetSuite items missing the Miva Product ID
- Matches by SKU and updates the NS item with the Miva ID

---

### Flow 5 — Customers: Miva → NetSuite

**What it does:**
Syncs customer records from Miva into NetSuite — names, emails, phone numbers, and addresses — so the customer database stays current.

---

## Live Dashboard

A password-protected dashboard at the server's URL shows real-time sync activity:

- **Stat cards** — next sync countdown, sync interval, orders synced today, service uptime
- **Live log panel** — streams the last 300 lines of `sync.log`, polling every 10 seconds, color-coded by severity
- **Flow status panel** — shows OK/IDLE for each of the 5 flows based on recent log activity
- **Recent Activity feed** — human-readable summary of the latest sync events

It's served by Nginx as static HTML (`dashboard.html` → `/var/www/sinister-diesel/index.html`) and backed by a small API (`dashboard-server.js`, port 3001) exposing `/api/logs` and `/api/stats`. The API is rate-limited (30 requests/minute/IP) and the dashboard itself sits behind HTTP Basic Auth configured in Nginx. See [README.md](README.md) for deployment and credential details.

---

## File Structure

```
sinister-netsuite-sync/
│
├── index.js                    ← Main entry point, scheduler, runs all 5 flows
├── miva.js                     ← Miva API client (orders, shipments, products)
├── netsuite.js                 ← NetSuite API client (TBA auth, REST, SuiteQL)
├── logger.js                   ← Logging to console + logs/sync.log
├── dashboard.html              ← Live dashboard UI
├── dashboard-server.js         ← Dashboard API (port 3001): /api/logs, /api/stats
├── nginx.conf                  ← Nginx site config (reverse proxy + Basic Auth)
├── ecosystem.config.js         ← PM2 config — runs sync service + dashboard API
│
├── flows/
│   ├── ordersToNetsuite.js     ← Flow 1: Miva orders → NS Sales Orders
│   ├── shipmentsToMiva.js      ← Flow 2: NS shipments → Miva tracking
│   ├── invoices.js             ← Flow 3: Deposits + Invoices
│   ├── productSync.js          ← Flow 4: Product ID sync
│   └── customersToNetsuite.js  ← Flow 5: Miva customers → NetSuite
│
├── logs/
│   ├── sync.log                ← Full activity log (every action logged with timestamp)
│   ├── synced_orders.json      ← Tracks which Miva orders are in NS (prevents duplicates)
│   ├── synced_invoices.json    ← Tracks deposit/invoice status per order
│   └── synced_customers.json   ← Tracks synced customer records
│
├── .env                        ← API credentials (never share this file)
└── package.json
```

---

## Technical Details

### Authentication

**Miva API:**
- POST to `https://sinisterdiesel.com/mm5/json.mvc`
- Header: `X-Miva-API-Authorization: MIVA {token}`
- Store Code: `SD`

**NetSuite API:**
- Token-Based Authentication (TBA) — OAuth 1.0a with HMAC-SHA256
- Application: **Sinister MFG Connector Sync**
- Role: **NetSuite Connector Web Services**
- Account ID: `4284657`
- Base URL: `https://4284657.suitetalk.api.netsuite.com/services/rest/`

### NetSuite Sales Order Status Codes
| Code | Meaning |
|---|---|
| A | Pending Approval |
| B | Pending Fulfillment |
| E | Pending Billing / Partially Shipped |
| F | Pending Billing / Fully Shipped |
| G | Billed (Closed) |

### Key NetSuite IDs
| Item | NS ID |
|---|---|
| Discount Item | 38 |
| Enshield Package Protection | 10322 |
| Sales Rep (default) | 179371 |
| Currency (USD) | 1 |
| Location | 2 |
| Nexus — California | 1 |
| Tax Code — Taxable | 12260 |
| Tax Code — Non-Taxable | -7 |
| Custom Form | 232 |

### Shipping Method Mapping
| Miva Method | NS Ship Method ID |
|---|---|
| Free Shipping | 10325 |
| UPS Ground | 8297 |
| UPS 2nd Day Air | 8298 |
| UPS Next Day Air | 8299 |
| UPS 3 Day Select | 8300 |
| USPS Priority Mail | 9316 |
| Will Call (Roseville) | 12147 |

---

## Service Management (PM2 on Linux)

**Runs on:** Oracle Cloud Always Free VM — Ubuntu 24.04, US West (San Jose)
**Sync Interval:** Every 5 minutes
**Process manager:** PM2 (auto-restarts on crash, survives server reboots)

Two PM2 apps are configured in `ecosystem.config.js`:
- `sinister-diesel-sync` — the main sync service (all 5 flows)
- `dashboard-api` — serves the live dashboard's `/api/logs` and `/api/stats` endpoints on port 3001

### Managing the Service

```bash
pm2 status                                  # view both app statuses
pm2 logs sinister-diesel-sync               # live log stream
pm2 restart sinister-diesel-sync            # restart sync service
pm2 restart dashboard-api                   # restart dashboard API
pm2 stop sinister-diesel-sync               # stop sync (does not affect dashboard)
pm2 start ecosystem.config.js               # start everything
```

### How to View Logs

SSH into the server and run:
```bash
pm2 logs sinister-diesel-sync --lines 100
```

Or read the log file directly:
```bash
tail -f /opt/sinister-diesel-sync/logs/sync.log
```

Every action is timestamped. Look for:
- `✅` = Success
- `⚠️` = Warning (non-critical)
- `❌` = Error (needs attention)

Or just open the live dashboard in a browser — it shows the same log in real time, color-coded.

---

## Duplicate Prevention

The system uses two JSON tracking files to make sure nothing is processed twice:

- **`synced_orders.json`** — Once a Miva order is created in NetSuite, its ID is stored here. Every sync cycle checks this before creating a Sales Order.
- **`synced_invoices.json`** — Tracks the deposit ID and invoice ID for each order. Once created, they are never re-created.

---

## What Replaced What (vs. Celigo)

| Feature | Celigo | Sinister Diesel Sync |
|---|---|---|
| Orders → NetSuite | ✅ | ✅ |
| Shipments → Miva | ✅ | ✅ |
| Customer Deposits | ✅ | ✅ |
| Invoice Creation | ✅ | ✅ |
| Invoice Auto-Close | ❌ Manual | ✅ Automatic |
| Discount / Promo Codes | ✅ | ✅ |
| Discount Header Fields | ❌ | ✅ |
| Auto-create Customers | ❌ | ✅ |
| Auto-create Items | ❌ | ✅ |
| Product ID Sync | ✅ | ✅ |
| Annual Cost | $17,797 | $0 |

---

## Troubleshooting Guide

| Symptom | Likely Cause | Fix |
|---|---|---|
| Order not showing in NetSuite | SKU not found, customer create failed | Check `sync.log` for that order ID |
| Invoice showing as OPEN | Deposit not applied yet | Check if deposit application ran; verify NS permissions |
| Duplicate orders | `synced_orders.json` was cleared, **or the sync was running on two machines at once** | Do not delete or edit JSON tracking files. Never run the sync on Windows and Linux simultaneously — each has its own tracking files and will both try to create the same order. |
| Service not running | Server restarted or process crashed | SSH in and run `pm2 start ecosystem.config.js`; `pm2 status` to confirm |
| Dashboard unreachable / shows "API UNREACHABLE" | `dashboard-api` PM2 process down, or Nginx not running | `pm2 logs dashboard-api`, `sudo systemctl status nginx` |
| Auth errors (401/403) | Token expired or permissions changed | Update `.env` with new token credentials |
| Wrong discount value | Miva charge type mismatch | Check order charges in Miva API response |

---

## Environment Variables (`.env`)

```
MIVA_STORE_URL        = Miva API endpoint
MIVA_API_TOKEN        = Miva authentication token
MIVA_STORE_CODE       = SD

NETSUITE_ACCOUNT_ID   = 4284657
NETSUITE_CONSUMER_KEY = (from NS integration record)
NETSUITE_CONSUMER_SECRET = (from NS integration record)
NETSUITE_TOKEN_ID     = (from NS access token)
NETSUITE_TOKEN_SECRET = (from NS access token)

SYNC_INTERVAL_MINUTES = 5
```

> **Security Note:** Never share the `.env` file. It contains API credentials for both Miva and NetSuite.

---

*Built in-house by the Sinister Diesel Ecommerce team*
*Replacing Celigo middleware and saving $17,797/year*
