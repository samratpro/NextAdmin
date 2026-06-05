#!/bin/bash
# Run from the NextAdmin directory: bash setup-nginx.sh
set -e

# ── Load .env ─────────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "ERROR: .env not found. Run: cp .env.example .env && nano .env"
  exit 1
fi
export $(grep -v '^#' .env | xargs)

echo "Setting up Nginx for:"
echo "  API   → https://${API_DOMAIN}  (port ${API_PORT})"
echo "  Admin → https://${ADMIN_DOMAIN}  (port ${ADMIN_PORT})"
echo ""

# ── Detect aaPanel or standard Nginx ─────────────────────────────────────────
if [ -d /www/server/panel ]; then
  NGINX_BIN="/www/server/nginx/sbin/nginx"
  VHOST_DIR="/www/server/panel/vhost/nginx"
  echo "Detected: aaPanel"
else
  NGINX_BIN="nginx"
  VHOST_DIR="/etc/nginx/sites-available"
  mkdir -p /etc/nginx/sites-enabled
  echo "Detected: standard Nginx"
fi

# ── Shared webroot for ACME challenge (no plugin needed) ─────────────────────
ACME_WEBROOT="/www/wwwroot/acme-challenge"
mkdir -p "$ACME_WEBROOT"

# ── Write HTTP config for each domain ────────────────────────────────────────
write_http_config() {
  local DOMAIN=$1
  local PORT=$2
  cat > "${VHOST_DIR}/${DOMAIN}.conf" << EOF
server {
    listen 80;
    server_name ${DOMAIN};

    # ACME challenge for SSL certificate issuance
    location /.well-known/acme-challenge/ {
        root ${ACME_WEBROOT};
    }

    location / {
        proxy_pass         http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }
}
EOF
}

# ── Write HTTPS config (after certs are obtained) ────────────────────────────
write_https_config() {
  local DOMAIN=$1
  local PORT=$2
  cat > "${VHOST_DIR}/${DOMAIN}.conf" << EOF
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name ${DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

    # ACME challenge (for renewals)
    location /.well-known/acme-challenge/ {
        root ${ACME_WEBROOT};
    }

    location / {
        proxy_pass         http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }
}
EOF
}

# ── Enable sites (standard Nginx only) ───────────────────────────────────────
if [ "$VHOST_DIR" = "/etc/nginx/sites-available" ]; then
  ln -sf /etc/nginx/sites-available/${API_DOMAIN}.conf   /etc/nginx/sites-enabled/
  ln -sf /etc/nginx/sites-available/${ADMIN_DOMAIN}.conf /etc/nginx/sites-enabled/
fi

# ── Write HTTP configs and reload ─────────────────────────────────────────────
write_http_config "${API_DOMAIN}"   "${API_PORT}"
write_http_config "${ADMIN_DOMAIN}" "${ADMIN_PORT}"

$NGINX_BIN -t && $NGINX_BIN -s reload
echo "Nginx HTTP config applied."

# ── Get SSL certificates (webroot — no plugin required) ───────────────────────
echo ""
echo "Getting SSL certificates..."

if ! command -v certbot &> /dev/null; then
  apt install -y certbot
fi

certbot certonly --webroot -w "$ACME_WEBROOT" \
  -d "${API_DOMAIN}" \
  --non-interactive --agree-tos -m "${EMAIL_FROM}"

certbot certonly --webroot -w "$ACME_WEBROOT" \
  -d "${ADMIN_DOMAIN}" \
  --non-interactive --agree-tos -m "${EMAIL_FROM}"

# ── Switch to HTTPS configs and reload ───────────────────────────────────────
echo ""
echo "Applying HTTPS configs..."
write_https_config "${API_DOMAIN}"   "${API_PORT}"
write_https_config "${ADMIN_DOMAIN}" "${ADMIN_PORT}"

$NGINX_BIN -t && $NGINX_BIN -s reload

echo ""
echo "Done."
echo "  https://${API_DOMAIN}/health"
echo "  https://${ADMIN_DOMAIN}"
