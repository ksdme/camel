#!/usr/bin/env bash
# deploy.sh — One-command production deployment for Camel
#
# Usage (run as root on the target Linux server):
#   sudo bash deploy/deploy.sh --url https://yourdomain.com
#   sudo bash deploy/deploy.sh --url http://1.2.3.4 --app-dir /opt/camel
#
# What it does:
#   1. Installs Node.js 20, pnpm, Encore CLI, PostgreSQL, nginx
#   2. Creates a 'camel' system user
#   3. Copies app files to APP_DIR (default: /opt/camel)
#   4. Creates + migrates a PostgreSQL database
#   5. Writes .env.backend (DATABASE_URL) and .env.frontend (VITE_API_URL)
#   6. Builds the frontend (VITE_API_URL baked in for mobile)
#   7. Configures nginx to serve frontend + proxy API to the Encore backend
#   8. Enables and starts systemd services

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; RED='\033[0;31m'; NC='\033[0m'
info()   { echo -e "${BLUE}▶  $*${NC}"; }
ok()     { echo -e "${GREEN}   ✓ $*${NC}"; }
warn()   { echo -e "${YELLOW}   ! $*${NC}"; }
die()    { echo -e "${RED}   ✗ $*${NC}" >&2; exit 1; }
banner() { echo -e "\n${BOLD}── $* ──────────────────────────────────────────────${NC}"; }

# ── Defaults ──────────────────────────────────────────────────────────────────
APP_DIR="/opt/camel"
SERVICE_USER="camel"
PUBLIC_URL=""
DB_PASSWORD=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# ── Arg parsing ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)         PUBLIC_URL="$2";  shift 2 ;;
    --app-dir)     APP_DIR="$2";     shift 2 ;;
    --db-password) DB_PASSWORD="$2"; shift 2 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

[[ $EUID -ne 0 ]] && die "Run with sudo: sudo bash deploy/deploy.sh --url https://yourdomain.com"

# ── Prompt for URL if not supplied ────────────────────────────────────────────
if [[ -z "$PUBLIC_URL" ]]; then
  echo ""
  read -rp "$(echo -e "${BOLD}Public server URL${NC} (e.g. https://example.com or http://1.2.3.4): ")" PUBLIC_URL
fi
PUBLIC_URL="${PUBLIC_URL%/}"   # strip trailing slash
[[ "$PUBLIC_URL" =~ ^https?:// ]] || die "URL must start with http:// or https://"

# Re-use existing DB password on redeploy to avoid wiping the database
if [[ -z "$DB_PASSWORD" ]]; then
  if [[ -f "$APP_DIR/.env.backend" ]] && grep -q "^DATABASE_URL" "$APP_DIR/.env.backend" 2>/dev/null; then
    DB_PASSWORD=$(grep "^DATABASE_URL" "$APP_DIR/.env.backend" \
      | sed 's|.*://[^:]*:\([^@]*\)@.*|\1|')
    info "Re-using existing database password"
  else
    DB_PASSWORD=$(openssl rand -hex 20)
  fi
fi

echo ""
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${BOLD}Camel — Production Deploy${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  App dir    : $APP_DIR"
echo "  Public URL : $PUBLIC_URL"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Helper: install a system package if absent ────────────────────────────────
apt_install() {
  dpkg -s "$1" &>/dev/null || apt-get install -y "$1"
}

# ════════════════════════════════════════════════════════════════════════════
banner "1/8  Prerequisites"
# ════════════════════════════════════════════════════════════════════════════

apt-get update -q

# Node.js 20
if ! node --version 2>/dev/null | grep -q "^v2[0-9]"; then
  info "Installing Node.js 20..."
  apt_install ca-certificates
  apt_install curl
  apt_install gnupg
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -q
  apt-get install -y nodejs
fi
ok "Node.js $(node --version)"

# pnpm — install globally and record the path for later use
if ! command -v pnpm &>/dev/null; then
  info "Installing pnpm..."
  npm install -g pnpm
fi
PNPM_BIN=$(command -v pnpm)
ok "pnpm $($PNPM_BIN --version) → $PNPM_BIN"

# PM2 — process manager (replaces per-app systemd service files)
if ! command -v pm2 &>/dev/null; then
  info "Installing PM2..."
  npm install -g pm2
fi
PM2_BIN=$(command -v pm2)
ok "PM2 $(pm2 --version) → $PM2_BIN"

# rsync (used for copying files)
apt_install rsync

# Encore CLI
if ! command -v encore &>/dev/null; then
  info "Installing Encore CLI..."
  # The official installer; ENCORE_INSTALL lets us pick the target directory
  export ENCORE_INSTALL="/usr/local"
  curl -fsSL https://encore.dev/install.sh | bash
  unset ENCORE_INSTALL
  # Fall back: if it landed in ~/.encore, symlink it
  if ! command -v encore &>/dev/null && [[ -f "$HOME/.encore/bin/encore" ]]; then
    ln -sf "$HOME/.encore/bin/encore" /usr/local/bin/encore
  fi
fi
ok "Encore CLI $(encore version 2>/dev/null | head -1 | awk '{print $NF}' || echo 'installed')"

# PostgreSQL
if ! command -v psql &>/dev/null; then
  info "Installing PostgreSQL..."
  apt_install postgresql
  apt_install postgresql-contrib
fi
systemctl enable postgresql
systemctl start postgresql
ok "PostgreSQL $(psql --version | awk '{print $3}')"

# nginx
if ! command -v nginx &>/dev/null; then
  info "Installing nginx..."
  apt_install nginx
fi
ok "nginx $(nginx -v 2>&1 | grep -oP '(?<=nginx/)[\d.]+')"

# ════════════════════════════════════════════════════════════════════════════
banner "2/8  System user"
# ════════════════════════════════════════════════════════════════════════════

if ! id "$SERVICE_USER" &>/dev/null; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
  ok "Created system user: $SERVICE_USER"
else
  ok "User already exists: $SERVICE_USER"
fi

# Allow nginx to read files owned by the camel group
NGINX_USER=$(ps aux | grep 'nginx: master' | grep -v grep | awk '{print $1}' | head -1)
NGINX_USER="${NGINX_USER:-www-data}"
usermod -aG "$SERVICE_USER" "$NGINX_USER" 2>/dev/null || true
ok "nginx ($NGINX_USER) added to group $SERVICE_USER"

# ════════════════════════════════════════════════════════════════════════════
banner "3/8  Copying application files"
# ════════════════════════════════════════════════════════════════════════════

mkdir -p "$APP_DIR"

rsync -a --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.encore' \
  "$REPO_ROOT/backend/"  "$APP_DIR/backend/"

rsync -a --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='dist' \
  --exclude='android' \
  --exclude='ios' \
  "$REPO_ROOT/frontend/" "$APP_DIR/frontend/"

chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
ok "Files synced → $APP_DIR"

# ════════════════════════════════════════════════════════════════════════════
banner "4/8  PostgreSQL database"
# ════════════════════════════════════════════════════════════════════════════

DB_NAME="camel"
DB_USER="camel"
DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"

# Create user
sudo -u postgres psql -tc "SELECT 1 FROM pg_user WHERE usename = '$DB_USER'" \
  | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"

# Update password (idempotent — handles redeploys)
sudo -u postgres psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" >/dev/null

# Create database
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" \
  | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" >/dev/null 2>&1 || true

ok "Database '$DB_NAME' ready"

# ════════════════════════════════════════════════════════════════════════════
banner "5/8  Environment files"
# ════════════════════════════════════════════════════════════════════════════

# Backend
cat > "$APP_DIR/.env.backend" <<EOF
DATABASE_URL="${DATABASE_URL}"
EOF
chmod 640 "$APP_DIR/.env.backend"
chown "root:$SERVICE_USER" "$APP_DIR/.env.backend"
ok ".env.backend → DATABASE_URL set"

# Frontend — VITE_API_URL is baked into the JS bundle at build time.
# The mobile app reads this value to know which server to call.
cat > "$APP_DIR/.env.frontend" <<EOF
VITE_API_URL=${PUBLIC_URL}
EOF
chmod 644 "$APP_DIR/.env.frontend"
chown "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/.env.frontend"
ok ".env.frontend → VITE_API_URL=$PUBLIC_URL"

# ════════════════════════════════════════════════════════════════════════════
banner "6/8  Dependencies, migrations, and frontend build"
# ════════════════════════════════════════════════════════════════════════════

# Backend: install deps + migrate
info "Installing backend dependencies..."
cd "$APP_DIR/backend"
sudo -u "$SERVICE_USER" npm install

info "Running database migrations (prisma migrate deploy)..."
# DATABASE_URL must be in the environment for Prisma
sudo -u "$SERVICE_USER" DATABASE_URL="$DATABASE_URL" npx prisma migrate deploy
ok "Migrations applied"

# Frontend: install deps + build with server URL embedded
info "Installing frontend dependencies..."
cd "$APP_DIR/frontend"
sudo -u "$SERVICE_USER" "$PNPM_BIN" install --frozen-lockfile

info "Building frontend (VITE_API_URL=$PUBLIC_URL)..."
# VITE_API_URL is picked up by Vite at build time and compiled into the bundle.
# This is what the mobile app uses to locate the server.
sudo -u "$SERVICE_USER" VITE_API_URL="$PUBLIC_URL" "$PNPM_BIN" run build
ok "Frontend built → $APP_DIR/frontend/dist/"

# Make dist/ world-readable so nginx (nginx/www-data) can serve the files
find "$APP_DIR/frontend/dist" -type d -exec chmod 750 {} +
find "$APP_DIR/frontend/dist" -type f -exec chmod 640 {} +
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/frontend/dist"

# ════════════════════════════════════════════════════════════════════════════
banner "7/8  nginx"
# ════════════════════════════════════════════════════════════════════════════

NGINX_CONF="/etc/nginx/sites-available/camel"

# Derive hostname for server_name (strip protocol and port)
SERVER_NAME=$(echo "$PUBLIC_URL" | sed -E 's|^https?://||; s|:[0-9]+$||; s|/.*||')

cat > "$NGINX_CONF" <<NGINX
# Camel — generated by deploy.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Re-run deploy.sh to update.

server {
    listen 80;
    server_name ${SERVER_NAME} _;

    # Serve the compiled React SPA from the dist/ directory
    root ${APP_DIR}/frontend/dist;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml application/xml+rss text/javascript
               image/svg+xml;

    # ── API routes → Encore backend on :4000 ─────────────────────────────────
    # These paths match the proxy config in vite.config.ts
    location ~ ^/(auth|folders|notes|tags|shares|settings)(/|\$) {
        proxy_pass         http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 30s;
        proxy_connect_timeout 10s;
    }

    # ── Static assets — long-lived cache ─────────────────────────────────────
    location ~* \.(js|css|woff2?|ttf|eot|otf|png|jpg|jpeg|gif|ico|svg|webp)\$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }

    # ── SPA fallback — all other routes serve index.html ─────────────────────
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/camel
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

nginx -t || die "nginx config test failed — check $NGINX_CONF"
systemctl enable nginx
systemctl reload nginx
ok "nginx configured → serving $PUBLIC_URL"

# ════════════════════════════════════════════════════════════════════════════
banner "8/8  PM2 process manager"
# ════════════════════════════════════════════════════════════════════════════

# Wrapper script: sources .env.backend then execs the Encore backend.
# PM2 starts this as the camel user; HOME override keeps PM2 state in APP_DIR.
cat > "$APP_DIR/start-backend.sh" << 'WRAPPER'
#!/usr/bin/env bash
# Sources environment variables then starts the Encore backend.
set -a
# shellcheck source=/dev/null
source "$(dirname "$0")/.env.backend"
set +a
cd "$(dirname "$0")/backend"
exec /usr/local/bin/encore run
WRAPPER
chmod 755 "$APP_DIR/start-backend.sh"
chown "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/start-backend.sh"

# PM2 ecosystem config — nginx serves the frontend, PM2 only manages the backend.
mkdir -p "$APP_DIR/logs"
chown "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/logs"

cat > "$APP_DIR/ecosystem.config.cjs" << ECOSYSTEM
module.exports = {
  apps: [
    {
      name: 'camel-backend',
      script: '$APP_DIR/start-backend.sh',
      interpreter: '/usr/bin/env',
      interpreter_args: 'bash',
      cwd: '$APP_DIR/backend',
      autorestart: true,
      watch: false,
      restart_delay: 5000,
      max_memory_restart: '512M',
      error_file: '$APP_DIR/logs/backend-error.log',
      out_file:   '$APP_DIR/logs/backend-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
ECOSYSTEM
chown "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/ecosystem.config.cjs"

# Stop any previous instance (idempotent on redeploy)
sudo -u "$SERVICE_USER" HOME="$APP_DIR" "$PM2_BIN" delete camel-backend 2>/dev/null || true

# Start the backend under PM2 as the camel user
info "Starting camel-backend via PM2..."
sudo -u "$SERVICE_USER" HOME="$APP_DIR" "$PM2_BIN" start "$APP_DIR/ecosystem.config.cjs"
ok "camel-backend started"

# Install PM2 as a boot service so it survives reboots.
# pm2 startup prints a command we need to run as root; capture and execute it.
STARTUP_CMD=$(sudo -u "$SERVICE_USER" HOME="$APP_DIR" "$PM2_BIN" \
  startup systemd -u "$SERVICE_USER" --hp "$APP_DIR" 2>&1 \
  | grep "^sudo env" | head -1)
if [[ -n "$STARTUP_CMD" ]]; then
  eval "$STARTUP_CMD"
  ok "PM2 systemd startup unit installed"
else
  warn "PM2 startup command not detected — run manually if needed:"
  warn "  pm2 startup systemd -u $SERVICE_USER --hp $APP_DIR"
fi

# Save the process list so PM2 restores it on reboot
sudo -u "$SERVICE_USER" HOME="$APP_DIR" "$PM2_BIN" save --force
ok "PM2 process list saved"

# ════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}${BOLD}Camel deployed successfully!${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Web app          → $PUBLIC_URL"
echo "  API (proxied)    → $PUBLIC_URL/auth  (:4000 backend)"
echo "  Mobile pairing   → open the app, go to Settings"
echo ""
echo "  Status:"
echo "    sudo -u camel HOME=$APP_DIR pm2 status"
echo "    sudo systemctl status nginx"
echo ""
echo "  Logs:"
echo "    sudo -u camel HOME=$APP_DIR pm2 logs camel-backend"
echo "    sudo tail -f /var/log/nginx/error.log"
echo "    tail -f $APP_DIR/logs/backend-error.log"
echo ""
echo -e "  ${BOLD}── Mobile apps ───────────────────────────────────${NC}"
echo "  Rebuild Android/iOS APK/IPA with this server URL:"
echo "    bash deploy/build-mobile.sh --url $PUBLIC_URL"
echo ""
echo -e "  ${BOLD}── Redeploy after code changes ───────────────────${NC}"
echo "    sudo bash deploy/deploy.sh --url $PUBLIC_URL"
echo ""

if [[ "$PUBLIC_URL" =~ ^http:// ]]; then
  echo -e "  ${YELLOW}TIP: To add HTTPS, install certbot and run:${NC}"
  echo "    sudo certbot --nginx -d $SERVER_NAME"
  echo ""
fi
