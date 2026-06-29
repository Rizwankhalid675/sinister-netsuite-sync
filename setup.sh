#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  Sinister Diesel Sync — Linux Setup Script
#  Run this once on a fresh Ubuntu 22.04 / 24.04 server
#  Usage: bash setup.sh
# ═══════════════════════════════════════════════════════════

set -e

echo ""
echo "════════════════════════════════════════════"
echo "  Sinister Diesel Sync — Server Setup"
echo "════════════════════════════════════════════"
echo ""

# ── 1. System update ─────────────────────────────
echo "→ Updating system packages..."
sudo apt update && sudo apt upgrade -y

# ── 2. Install Node.js 20 ────────────────────────
echo "→ Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

echo "   Node: $(node -v)"
echo "   NPM:  $(npm -v)"

# ── 3. Install PM2 ───────────────────────────────
echo "→ Installing PM2 (process manager)..."
sudo npm install -g pm2

# ── 4. Install Nginx ─────────────────────────────
echo "→ Installing Nginx..."
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx

# ── 5. Create app directory ──────────────────────
echo "→ Creating app directory..."
sudo mkdir -p /var/www/sinister-diesel
sudo mkdir -p /opt/sinister-diesel-sync/logs
sudo chown -R $USER:$USER /opt/sinister-diesel-sync
sudo chown -R $USER:$USER /var/www/sinister-diesel

# ── 6. Install project dependencies ──────────────
echo "→ Installing Node dependencies..."
cd /opt/sinister-diesel-sync
npm install

# ── 7. Setup .env ────────────────────────────────
if [ ! -f /opt/sinister-diesel-sync/.env ]; then
  echo "→ Creating .env from example..."
  cp /opt/sinister-diesel-sync/.env.example /opt/sinister-diesel-sync/.env
  echo ""
  echo "  ⚠️  IMPORTANT: Edit your .env file before starting:"
  echo "  nano /opt/sinister-diesel-sync/.env"
  echo ""
fi

# ── 8. Configure Nginx ───────────────────────────
echo "→ Configuring Nginx..."
sudo cp /opt/sinister-diesel-sync/nginx.conf /etc/nginx/sites-available/sinister-diesel
sudo ln -sf /etc/nginx/sites-available/sinister-diesel /etc/nginx/sites-enabled/sinister-diesel
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# ── 9. Copy presentation to web root ─────────────
if [ -f /opt/sinister-diesel-sync/Sinister_Diesel_Sync_Presentation.html ]; then
  cp /opt/sinister-diesel-sync/Sinister_Diesel_Sync_Presentation.html /var/www/sinister-diesel/index.html
  echo "→ Presentation copied to web root"
fi

# ── 10. Setup PM2 startup ────────────────────────
echo "→ Configuring PM2 to start on boot..."
pm2 startup | tail -1 | sudo bash || true

echo ""
echo "════════════════════════════════════════════"
echo "  Setup Complete!"
echo "════════════════════════════════════════════"
echo ""
echo "  Next steps:"
echo "  1. Edit your credentials:  nano /opt/sinister-diesel-sync/.env"
echo "  2. Start the sync service: pm2 start /opt/sinister-diesel-sync/ecosystem.config.js"
echo "  3. Save PM2 process list:  pm2 save"
echo "  4. Check logs:             pm2 logs sinister-diesel-sync"
echo ""
echo "  Optional — add SSL (replace with your domain):"
echo "  sudo apt install certbot python3-certbot-nginx -y"
echo "  sudo certbot --nginx -d your-domain.com"
echo ""
