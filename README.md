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

## Nginx Configuration

Nginx is used to serve the documentation/presentation page at your domain.

### Step 1 — Create the web root

```bash
sudo mkdir -p /var/www/sinister-diesel
```

Copy the presentation HTML:

```bash
sudo cp /opt/sinister-diesel-sync/Sinister_Diesel_Sync_Presentation.html /var/www/sinister-diesel/index.html
```

### Step 2 — Create the Nginx site config

```bash
sudo nano /etc/nginx/sites-available/sinister-diesel
```

Paste the following (replace `your-domain.com` with your actual domain):

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    root /var/www/sinister-diesel;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";

    access_log /var/log/nginx/sinister-diesel-access.log;
    error_log  /var/log/nginx/sinister-diesel-error.log;
}
```

### Step 3 — Enable the site

```bash
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

Your documentation page is now live at `http://your-domain.com`.

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

| Task | Command |
|---|---|
| Start service | `pm2 start ecosystem.config.js` |
| Stop service | `pm2 stop sinister-diesel-sync` |
| Restart service | `pm2 restart sinister-diesel-sync` |
| View live logs | `pm2 logs sinister-diesel-sync` |
| Check status | `pm2 status` |
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
| Duplicate orders in NS | Do not delete `logs/synced_orders.json` |
| Nginx 502 Bad Gateway | The Node service is not running — check `pm2 status` |
| Nginx 404 | Check `/var/www/sinister-diesel/index.html` exists |
| Permission denied on `.env` | Run `chmod 600 .env` |

---

## Project Structure

```
/opt/sinister-diesel-sync/
├── index.js                    ← Main entry point, runs all 5 flows every 5 min
├── miva.js                     ← Miva API client
├── netsuite.js                 ← NetSuite REST API client (TBA OAuth 1.0a)
├── logger.js                   ← Logging
├── ecosystem.config.js         ← PM2 process config
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
