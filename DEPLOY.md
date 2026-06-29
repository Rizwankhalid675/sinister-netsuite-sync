# Sinister Diesel Sync — Linux Deployment Guide

## Step 1 — Create Your Server

1. Sign up at **cloud.oracle.com** (Always Free) or **digitalocean.com** ($6/mo)
2. Create an **Ubuntu 24.04** server
3. Note your server's IP address

---

## Step 2 — Upload Files to Server

From your Windows machine, open PowerShell and run:

```bash
scp -r "C:\Users\admin\OneDrive\Desktop\Work\sinister-netsuite-sync-linux\*" root@YOUR_SERVER_IP:/opt/sinister-diesel-sync/
```

---

## Step 3 — SSH Into Your Server

```bash
ssh root@YOUR_SERVER_IP
```

---

## Step 4 — Run the Setup Script

```bash
cd /opt/sinister-diesel-sync
bash setup.sh
```

This automatically installs:
- Node.js 20
- PM2 (keeps the sync running 24/7, restarts on crash)
- Nginx (serves the documentation page)

---

## Step 5 — Add Your Credentials

```bash
nano /opt/sinister-diesel-sync/.env
```

Fill in your real values (copy from the Windows `.env` file):
```
MIVA_API_TOKEN=...
NETSUITE_CONSUMER_KEY=...
NETSUITE_CONSUMER_SECRET=...
NETSUITE_TOKEN_ID=...
NETSUITE_TOKEN_SECRET=...
```

Press `CTRL+X` → `Y` → `Enter` to save.

---

## Step 6 — Start the Sync Service

```bash
pm2 start /opt/sinister-diesel-sync/ecosystem.config.js
pm2 save
```

---

## Step 7 — Verify It's Running

```bash
pm2 status
pm2 logs sinister-diesel-sync
```

You should see the sync starting and logs flowing every 5 minutes.

---

## Optional — Add SSL & Custom Domain

1. Point your domain DNS A record → your server IP
2. Update `nginx.conf` — replace `your-domain.com` with your real domain
3. Run:
```bash
sudo nginx -t && sudo systemctl reload nginx
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

SSL is now active and auto-renews.

---

## Daily Commands Reference

| Task | Command |
|---|---|
| Check status | `pm2 status` |
| View live logs | `pm2 logs sinister-diesel-sync` |
| Restart service | `pm2 restart sinister-diesel-sync` |
| Stop service | `pm2 stop sinister-diesel-sync` |
| Start service | `pm2 start sinister-diesel-sync` |
| Reload Nginx | `sudo systemctl reload nginx` |

---

## Folder Structure on Server

```
/opt/sinister-diesel-sync/     ← Sync service lives here
    index.js
    miva.js
    netsuite.js
    logger.js
    ecosystem.config.js
    .env                       ← Your credentials (keep private)
    flows/
    logs/
        sync.log
        synced_orders.json
        synced_invoices.json

/var/www/sinister-diesel/      ← Documentation page served by Nginx
    index.html
```
