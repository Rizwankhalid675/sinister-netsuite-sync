# Sinister Diesel Sync — Linux Deployment

A custom Node.js integration that syncs **Miva** (storefront) ↔ **NetSuite** (ERP) every 5 minutes, running as a background service on Linux via PM2.

**Replaces:** Celigo middleware ($17,797/year)
**Stack:** Node.js · PM2 · Nginx · Miva JSON API · NetSuite REST API (TBA OAuth 1.0a)

---

## What It Does

| Flow | Direction | Description |
|---|---|---|
| Orders | Miva → NetSuite | New orders become Sales Orders in NS automatically |
| Shipments | NetSuite → Miva | Tracking numbers pushed back to Miva when shipped |
| Deposits & Invoices | NetSuite | Creates deposit, generates invoice after fulfillment, auto-closes it |
| Product IDs | Miva ↔ NetSuite | Keeps Miva Product IDs linked on NS inventory items |
| Customers | Miva → NetSuite | Syncs customer records to NetSuite |

---

## Requirements

- Ubuntu 22.04 or 24.04
- Node.js 20+
- PM2
- Nginx
- A NetSuite account with Token-Based Authentication (TBA) enabled
- A Miva store with API access

---

## Step 1 — Server Setup

SSH into your Linux server and run:

```bash
sudo apt update && sudo apt upgrade -y
```

Install Node.js 20:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify:

```bash
node -v   # should be v20.x.x
npm -v
```

Install PM2 globally:

```bash
sudo npm install -g pm2
```

Install Nginx:

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## Step 2 — Upload & Install the Project

**Option A — Clone from GitHub:**

```bash
git clone https://github.com/Rizwankhalid675/sinister-netsuite-sync.git /opt/sinister-diesel-sync
```

**Option B — Upload from your Windows machine:**

```bash
scp -r /path/to/sinister-netsuite-sync-linux/* root@YOUR_SERVER_IP:/opt/sinister-diesel-sync/
```

Then install dependencies:

```bash
cd /opt/sinister-diesel-sync
npm install
```

---

## Step 3 — Configure Credentials

Copy the example env file:

```bash
cp /opt/sinister-diesel-sync/.env.example /opt/sinister-diesel-sync/.env
```

Edit it with your real credentials:

```bash
nano /opt/sinister-diesel-sync/.env
```

Fill in the values:

```env
# ─── MIVA ───────────────────────────────────────────
MIVA_STORE_URL=https://sinisterdiesel.com/mm5/json.mvc
MIVA_API_TOKEN=your_miva_api_token_here
MIVA_STORE_CODE=SD

# ─── NETSUITE ────────────────────────────────────────
NETSUITE_ACCOUNT_ID=your_account_id
NETSUITE_CONSUMER_KEY=your_consumer_key
NETSUITE_CONSUMER_SECRET=your_consumer_secret
NETSUITE_TOKEN_ID=your_token_id
NETSUITE_TOKEN_SECRET=your_token_secret

# ─── SYNC SETTINGS ───────────────────────────────────
SYNC_INTERVAL_MINUTES=5
LOG_LEVEL=info
```

Press `CTRL+X` → `Y` → `Enter` to save.

Secure the file so only your user can read it:

```bash
chmod 600 /opt/sinister-diesel-sync/.env
```

---

## Step 4 — Create Logs Directory

```bash
mkdir -p /opt/sinister-diesel-sync/logs
```

If you are migrating from Windows and want to carry over existing synced order history (to prevent duplicate records in NetSuite), copy your tracking files:

```bash
# Upload from Windows machine
scp logs/synced_orders.json root@YOUR_SERVER_IP:/opt/sinister-diesel-sync/logs/
scp logs/synced_invoices.json root@YOUR_SERVER_IP:/opt/sinister-diesel-sync/logs/
scp logs/synced_customers.json root@YOUR_SERVER_IP:/opt/sinister-diesel-sync/logs/
```

> **Important:** If you skip this step and start fresh, the service will try to re-sync all orders from the last 24 hours. Existing orders already in NetSuite will be skipped automatically via the external ID check, but it is safer to copy the tracking files.

---

## Step 5 — Start the Service with PM2

```bash
pm2 start /opt/sinister-diesel-sync/ecosystem.config.js
```

Save the PM2 process list so it restarts after a server reboot:

```bash
pm2 save
```

Set PM2 to start on boot:

```bash
pm2 startup
```

Copy and run the command it outputs (it will look like `sudo env PATH=...`).

---

## Step 6 — Verify It Is Running

Check status:

```bash
pm2 status
```

Watch live logs:

```bash
pm2 logs sinister-diesel-sync
```

You should see output like:

```
[INFO] Sinister Diesel → NetSuite Sync Started
[INFO] Running Flow 1: Orders → NetSuite...
[INFO] Found 3 orders to check
[INFO] ✅ Order 2763009 → NetSuite Sales Order 3422252
[INFO] Running Flow 2: Shipments → Miva...
[INFO] ✅ All flows completed successfully
```

---

## Live Dashboard

The repo includes a live dashboard (`dashboard.html`) that shows real-time sync logs, stats, and flow health. It's served by Nginx as static HTML and talks to a small Node API (`dashboard-server.js`, port 3001) for log/stat data. Both run under PM2 alongside the sync service — see `ecosystem.config.js`.

The dashboard is password-protected via Nginx HTTP Basic Auth (see Step 2 below) and the API enforces a 30 requests/minute per-IP rate limit.

## Nginx Configuration

Nginx serves the dashboard as the site root and reverse-proxies `/api/` calls to the dashboard API on port 3001. The repo's `nginx.conf` is the source of truth — copy it into place rather than hand-writing a config.

### Step 1 — Create the web root and deploy the dashboard

```bash
sudo mkdir -p /var/www/sinister-diesel
sudo cp /opt/sinister-diesel-sync/dashboard.html /var/www/sinister-diesel/index.html
```

### Step 2 — Set up password protection

```bash
sudo apt install -y apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd sinister
```

You'll be prompted to set a password (current credentials: username `sinister`, password `SD2026!sync`).

### Step 3 — Install the Nginx site config

```bash
sudo cp /opt/sinister-diesel-sync/nginx.conf /etc/nginx/sites-available/sinister-diesel
sudo ln -s /etc/nginx/sites-available/sinister-diesel /etc/nginx/sites-enabled/sinister-diesel
sudo rm -f /etc/nginx/sites-enabled/default
```

Test the config:

```bash
sudo nginx -t
```

Reload Nginx:

```bash
sudo systemctl reload nginx
```

The dashboard is now live at `http://your-server-ip` (prompts for the Basic Auth credentials above).

### Deploying dashboard changes

The dashboard is edited locally, committed to git, then pulled and copied into the web root on the server:

```bash
cd /opt/sinister-diesel-sync
sudo git pull
sudo cp dashboard.html /var/www/sinister-diesel/index.html
```

`dashboard.html` is saved as UTF-16 (Windows default) — if editing on Linux, watch for encoding issues.

---

## Step 7 — Add SSL (HTTPS) — Optional but Recommended

Install Certbot:

```bash
sudo apt install certbot python3-certbot-nginx -y
```

Get a free SSL certificate (replace with your real domain):

```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

Follow the prompts. SSL is now active and auto-renews every 90 days.

Your site will be available at `https://your-domain.com`.

---

## PM2 Command Reference

`ecosystem.config.js` runs two PM2 apps: `sinister-diesel-sync` (the sync flows) and `dashboard-api` (the dashboard's data API on port 3001).

| Task | Command |
|---|---|
| Start everything | `pm2 start ecosystem.config.js` |
| Stop sync service | `pm2 stop sinister-diesel-sync` |
| Restart sync service | `pm2 restart sinister-diesel-sync` |
| Restart dashboard API | `pm2 restart dashboard-api` |
| View live logs | `pm2 logs sinister-diesel-sync` |
| Check status (both apps) | `pm2 status` |
| View last 100 log lines | `pm2 logs sinister-diesel-sync --lines 100` |

---

## Nginx Command Reference

| Task | Command |
|---|---|
| Test config | `sudo nginx -t` |
| Reload Nginx | `sudo systemctl reload nginx` |
| Restart Nginx | `sudo systemctl restart nginx` |
| Check Nginx status | `sudo systemctl status nginx` |
| View access logs | `sudo tail -f /var/log/nginx/sinister-diesel-access.log` |
| View error logs | `sudo tail -f /var/log/nginx/sinister-diesel-error.log` |

---

## Log Files

| File | Description |
|---|---|
| `logs/sync.log` | Full timestamped activity log for every sync run |
| `logs/synced_orders.json` | Tracks which Miva orders are already in NetSuite |
| `logs/synced_invoices.json` | Tracks deposit and invoice status per order |
| `logs/synced_customers.json` | Tracks synced customer records |

Log symbols:
- `✅` — Success
- `⚠️` — Warning (non-critical, logged and skipped)
- `❌` — Error (needs attention)

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Service not running | `pm2 start ecosystem.config.js` |
| Auth errors (401/403) | Update `.env` with new NetSuite token credentials |
| Orders not syncing | Check `logs/sync.log` for the specific order ID |
| Duplicate orders in NS | Do not delete `logs/synced_orders.json`. Also confirm the sync is **not running on two machines at once** (e.g. Windows service + Linux PM2) — running both against the same NetSuite account causes duplicate Sales Orders since each has its own tracking file. |
| Dashboard shows "API UNREACHABLE" | `dashboard-api` PM2 process is down — check `pm2 status` and `pm2 logs dashboard-api` |
| Dashboard flows stuck on IDLE / Last sync shows — | Sync service isn't writing to `logs/sync.log`, or log format changed — check `pm2 logs sinister-diesel-sync` |
| Nginx 502 Bad Gateway | The Node service is not running — check `pm2 status` |
| Nginx 404 | Check `/var/www/sinister-diesel/index.html` exists |
| Permission denied on `.env` | Run `chmod 600 .env` |
| Dashboard prompts for login repeatedly | Confirm `/etc/nginx/.htpasswd` exists and credentials match what was set with `htpasswd` |

> **Important — only run the sync on one machine at a time.** If migrating from Windows to Linux (or vice versa), stop the old service before starting the new one. Running both simultaneously causes duplicate orders/invoices in NetSuite because each machine has its own independent tracking JSON files.

---

## Project Structure

```
/opt/sinister-diesel-sync/
├── index.js                    ← Main entry point, runs all 5 flows every 5 min
├── miva.js                     ← Miva API client
├── netsuite.js                 ← NetSuite REST API client (TBA OAuth 1.0a)
├── logger.js                   ← Logging
├── dashboard.html              ← Live dashboard UI (copied to /var/www/sinister-diesel/index.html)
├── dashboard-server.js         ← Dashboard API (port 3001): /api/logs, /api/stats
├── nginx.conf                  ← Source of truth for the Nginx site config
├── ecosystem.config.js         ← PM2 process config (sync service + dashboard API)
├── .env                        ← Your credentials (never share)
├── .env.example                ← Credentials template
├── flows/
│   ├── ordersToNetsuite.js     ← Flow 1: Orders
│   ├── shipmentsToMiva.js      ← Flow 2: Shipments
│   ├── invoices.js             ← Flow 3: Deposits & Invoices
│   ├── productSync.js          ← Flow 4: Product IDs
│   └── customersToNetsuite.js  ← Flow 5: Customers
└── logs/
    ├── sync.log
    ├── synced_orders.json
    ├── synced_invoices.json
    └── synced_customers.json
```

---

*Built by Rizwan Khalid — Ecommerce Coordinator, Sinister Diesel*
*Replacing Celigo middleware and saving $17,797/year*
