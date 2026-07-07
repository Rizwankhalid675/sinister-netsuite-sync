# Sinister Diesel Sync — Linux Deployment Guide

> For full setup detail (Nginx config, password protection, troubleshooting) see [README.md](README.md). This is the quick-start path.

## Step 1 — Create Your Server

1. Sign up at **cloud.oracle.com** (Always Free — VM.Standard.E2.1.Micro) or **digitalocean.com** ($6/mo)
2. Create an **Ubuntu 24.04** server
3. Note your server's IP address
4. If using Oracle Cloud, open ports 80 and 443 in the VCN **Security List** (ingress rules) — Oracle blocks these by default and the dashboard won't load otherwise

---

## Step 2 — Get the Code on the Server

Either clone from GitHub:

```bash
sudo git clone https://github.com/Rizwankhalid675/sinister-netsuite-sync.git /opt/sinister-diesel-sync
```

or upload from Windows via SCP:

```bash
scp -i "path\to\ssh-key.key" -r "C:\Users\admin\OneDrive\Desktop\Work\sinister-netsuite-sync-linux\*" ubuntu@YOUR_SERVER_IP:/opt/sinister-diesel-sync/
```

---

## Step 3 — SSH Into Your Server

```bash
ssh -i "path\to\ssh-key.key" ubuntu@YOUR_SERVER_IP
```

On Windows, the key file must be restricted to your user only (`icacls key.key /inheritance:r /grant:r "%USERNAME%:R"`) or SSH will refuse to use it.

---

## Step 4 — Install Node.js, PM2, and Nginx

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

Then install project dependencies:

```bash
cd /opt/sinister-diesel-sync
sudo npm install
```

---

## Step 5 — Add Your Credentials

```bash
sudo nano /opt/sinister-diesel-sync/.env
```

Fill in your real values (copy from the Windows `.env` file — see `.env.example` for the full list):
```
MIVA_STORE_URL=...
MIVA_API_TOKEN=...
MIVA_STORE_CODE=SD
NETSUITE_ACCOUNT_ID=...
NETSUITE_CONSUMER_KEY=...
NETSUITE_CONSUMER_SECRET=...
NETSUITE_TOKEN_ID=...
NETSUITE_TOKEN_SECRET=...
SYNC_INTERVAL_MINUTES=5
```

Press `CTRL+X` → `Y` → `Enter` to save, then lock down the file:

```bash
sudo chmod 600 /opt/sinister-diesel-sync/.env
```

---

## Step 6 — Carry Over Tracking Files (if migrating from another machine)

**Critical:** if a sync service was already running elsewhere (e.g. on Windows), copy its tracking files over before starting the Linux service — otherwise it will re-sync everything from the last 24h and create duplicate orders/invoices in NetSuite.

```bash
scp -i "path\to\ssh-key.key" logs/synced_orders.json ubuntu@YOUR_SERVER_IP:/tmp/
scp -i "path\to\ssh-key.key" logs/synced_invoices.json ubuntu@YOUR_SERVER_IP:/tmp/
scp -i "path\to\ssh-key.key" logs/synced_customers.json ubuntu@YOUR_SERVER_IP:/tmp/
```

Then on the server:

```bash
sudo mkdir -p /opt/sinister-diesel-sync/logs
sudo cp /tmp/synced_*.json /opt/sinister-diesel-sync/logs/
```

**Then stop the old service before starting the new one.** Never run the sync on two machines at the same time — both will try to create the same orders independently.

---

## Step 7 — Start the Sync Service and Dashboard API

```bash
cd /opt/sinister-diesel-sync
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # then copy/run the command it prints
```

This starts both PM2 apps defined in `ecosystem.config.js`: `sinister-diesel-sync` (the 5 sync flows) and `dashboard-api` (serves `/api/logs` and `/api/stats` on port 3001).

---

## Step 8 — Deploy the Live Dashboard

```bash
sudo mkdir -p /var/www/sinister-diesel
sudo cp /opt/sinister-diesel-sync/dashboard.html /var/www/sinister-diesel/index.html
```

Set up password protection (the dashboard shows live sync logs, so it shouldn't be public):

```bash
sudo apt install -y apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd sinister
```

Install the Nginx site config from the repo (already configured to proxy `/api/` to the dashboard API and require Basic Auth):

```bash
sudo cp /opt/sinister-diesel-sync/nginx.conf /etc/nginx/sites-available/sinister-diesel
sudo ln -s /etc/nginx/sites-available/sinister-diesel /etc/nginx/sites-enabled/sinister-diesel
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

The dashboard is now live at `http://YOUR_SERVER_IP` behind the Basic Auth login.

---

## Step 9 — Verify Everything Is Running

```bash
pm2 status
pm2 logs sinister-diesel-sync
```

You should see both `sinister-diesel-sync` and `dashboard-api` as `online`, and log output like:

```
[INFO] Sinister Diesel → NetSuite Sync Started
[INFO] Running Flow 1: Orders → NetSuite...
[INFO] ✅ Order 2763009 → NetSuite Sales Order 3422252
[INFO] ✅ All flows completed successfully
```

---

## Optional — Add SSL & Custom Domain

1. Point your domain DNS A record → your server IP
2. Edit `/etc/nginx/sites-available/sinister-diesel` — replace `server_name _;` with your domain
3. Run:
```bash
sudo nginx -t && sudo systemctl reload nginx
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

SSL is now active and auto-renews every 90 days.

---

## Deploying Future Dashboard or Code Changes

Edit locally on Windows → commit → push → pull on the server:

```bash
# server
cd /opt/sinister-diesel-sync
sudo git pull
sudo cp dashboard.html /var/www/sinister-diesel/index.html   # only needed for dashboard changes
pm2 restart sinister-diesel-sync dashboard-api                 # only needed for backend/flow changes
```

---

## Daily Commands Reference

| Task | Command |
|---|---|
| Check status | `pm2 status` |
| View live sync logs | `pm2 logs sinister-diesel-sync` |
| View dashboard API logs | `pm2 logs dashboard-api` |
| Restart sync service | `pm2 restart sinister-diesel-sync` |
| Restart dashboard API | `pm2 restart dashboard-api` |
| Stop service | `pm2 stop sinister-diesel-sync` |
| Reload Nginx | `sudo systemctl reload nginx` |

---

## Folder Structure on Server

```
/opt/sinister-diesel-sync/      ← Sync service + dashboard source lives here
    index.js
    miva.js
    netsuite.js
    logger.js
    dashboard.html               ← source copy (deployed copy lives in /var/www)
    dashboard-server.js          ← dashboard API, port 3001
    nginx.conf                    ← source of truth for the Nginx site config
    ecosystem.config.js
    .env                          ← Your credentials (keep private)
    flows/
    logs/
        sync.log
        synced_orders.json
        synced_invoices.json
        synced_customers.json

/var/www/sinister-diesel/        ← Live dashboard served by Nginx
    index.html

/etc/nginx/.htpasswd              ← Dashboard login credentials
/etc/nginx/sites-available/sinister-diesel
```
