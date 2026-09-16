#!/usr/bin/env bash
# Sets up a fresh Ubuntu 24.04 server for the portal; safe to re-run. See "Deploying" in README.md.
set -euo pipefail

REPO=${REPO:-https://github.com/shivduttkarwa/ignite-care.git}
DOMAIN=${DOMAIN:-}
EMAIL=${EMAIL:-}

HOME_DIR=/srv/ignite
APP=$HOME_DIR/app
ENV_FILE=$APP/.env
ADMIN_PASSWORD_FILE=/root/ignite-admin-password
export DEBIAN_FRONTEND=noninteractive

[[ $EUID -eq 0 ]] || { echo "Run it with sudo." >&2; exit 1; }
[[ -n $DOMAIN ]] || { echo "Set DOMAIN, e.g. sudo DOMAIN=portal.example.com.au bash setup.sh. Care records are only served over HTTPS." >&2; exit 1; }
cd /tmp

as_app() { sudo -u ignite -H -- "$@"; }
manage() { as_app env DJANGO_SETTINGS_MODULE=config.settings.production "$APP/.venv/bin/python" "$APP/manage.py" "$@"; }

set_env() {
  if grep -q "^$1=" "$ENV_FILE"; then
    sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else
    echo "$1=$2" >>"$ENV_FILE"
  fi
}

echo "==> System"
timedatectl set-timezone Australia/Brisbane
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

echo "==> Packages"
apt-get update -q
apt-get install -y -q ca-certificates curl git nginx postgresql rsync rclone certbot python3 \
  libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0 fonts-liberation
if ! node --version 2>/dev/null | grep -q '^v22\.'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi
if ! command -v uv >/dev/null; then
  curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1 sh
fi

echo "==> App user and code"
id ignite &>/dev/null || useradd --system --create-home --home-dir "$HOME_DIR" --shell /bin/bash ignite
chmod 755 "$HOME_DIR"
[[ -d $APP/.git ]] || as_app git clone --quiet "$REPO" "$APP"
as_app mkdir -p "$HOME_DIR/web" "$HOME_DIR/backups" "$APP/var/media"

echo "==> Database"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'ignite'" | grep -q 1; then
  sudo -u postgres createuser ignite
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = 'ignite'" | grep -q 1; then
  sudo -u postgres createdb --owner ignite ignite
fi

echo "==> Settings ($ENV_FILE)"
if [[ ! -f $ENV_FILE ]]; then
  as_app touch "$ENV_FILE"
  cat >>"$ENV_FILE" <<EOF
DJANGO_SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(50))')
# Peer login over the local socket: the ignite user needs no database password.
DATABASE_URL=postgres://ignite@%2Fvar%2Frun%2Fpostgresql/ignite
EOF
fi
set_env DJANGO_ALLOWED_HOSTS "$DOMAIN"
set_env TIME_ZONE Australia/Brisbane
chown ignite:ignite "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "==> API service and nightly backup"
install -m 644 "$APP/deploy/ignite.service" /etc/systemd/system/ignite.service
install -m 644 "$APP/deploy/ignite.cron" /etc/cron.d/ignite
systemctl daemon-reload
systemctl enable --quiet ignite

bash "$APP/deploy/deploy.sh"

echo "==> Administrator login"
if [[ ! -f $ADMIN_PASSWORD_FILE ]]; then
  (umask 077 && python3 -c 'import secrets; print(secrets.token_urlsafe(14))' >"$ADMIN_PASSWORD_FILE")
fi
if ! manage shell -c "import sys; from django.contrib.auth import get_user_model; sys.exit(0 if get_user_model().objects.filter(is_superuser=True).exists() else 1)"; then
  as_app env DJANGO_SETTINGS_MODULE=config.settings.production DJANGO_SUPERUSER_PASSWORD="$(cat "$ADMIN_PASSWORD_FILE")" \
    "$APP/.venv/bin/python" "$APP/manage.py" createsuperuser --noinput --username admin --email "${EMAIL:-admin@localhost}"
fi

echo "==> HTTPS certificate for $DOMAIN"
mkdir -p /var/www/certbot
rm -f /etc/nginx/sites-enabled/default
if [[ ! -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem ]]; then
  cat >/etc/nginx/sites-available/ignite <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
}
EOF
  ln -sf /etc/nginx/sites-available/ignite /etc/nginx/sites-enabled/ignite
  nginx -t -q
  systemctl reload nginx
  if [[ -n $EMAIL ]]; then contact=(-m "$EMAIL"); else contact=(--register-unsafely-without-email); fi
  certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" --non-interactive --agree-tos \
    --deploy-hook "systemctl reload nginx" "${contact[@]}"
fi

echo "==> Web server"
sed "s|portal.example.com.au|$DOMAIN|g" "$APP/deploy/nginx.conf" >/etc/nginx/sites-available/ignite
ln -sf /etc/nginx/sites-available/ignite /etc/nginx/sites-enabled/ignite
nginx -t -q
systemctl reload nginx

echo
echo "The portal is up at https://$DOMAIN"
echo "  Django admin:  https://$DOMAIN/django-admin/   admin / $(cat "$ADMIN_PASSWORD_FILE")   (also in $ADMIN_PASSWORD_FILE)"
echo "  Off-site backups: add BACKUP_REMOTE=<rclone remote:path> to $ENV_FILE once rclone is configured."
