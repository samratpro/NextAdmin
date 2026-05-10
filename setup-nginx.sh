#!/bin/bash
# Run from the NextAdmin directory: bash setup-nginx.sh
set -e

# Load .env
if [ ! -f .env ]; then
  echo "ERROR: .env not found. Run: cp .env.example .env && nano .env"
  exit 1
fi
export $(grep -v '^#' .env | xargs)

echo "Setting up Nginx for:"
echo "  API   → https://${API_DOMAIN}  (port ${API_PORT})"
echo "  Admin → https://${ADMIN_DOMAIN}  (port ${ADMIN_PORT})"
echo ""

# ── API config ────────────────────────────────────────────────────────────────
cat > /etc/nginx/sites-available/${API_DOMAIN} << EOF
server {
    listen 80;
    server_name ${API_DOMAIN};

    location / {
        proxy_pass         http://127.0.0.1:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }
}
EOF

# ── Admin config ──────────────────────────────────────────────────────────────
cat > /etc/nginx/sites-available/${ADMIN_DOMAIN} << EOF
server {
    listen 80;
    server_name ${ADMIN_DOMAIN};

    location / {
        proxy_pass         http://127.0.0.1:${ADMIN_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }
}
EOF

# ── Enable sites ──────────────────────────────────────────────────────────────
ln -sf /etc/nginx/sites-available/${API_DOMAIN}   /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/${ADMIN_DOMAIN} /etc/nginx/sites-enabled/

nginx -t && nginx -s reload
echo "Nginx configured."

# ── SSL ───────────────────────────────────────────────────────────────────────
echo ""
echo "Getting SSL certificates..."
certbot --nginx -d ${API_DOMAIN} --non-interactive --agree-tos -m ${EMAIL_FROM}
certbot --nginx -d ${ADMIN_DOMAIN} --non-interactive --agree-tos -m ${EMAIL_FROM}

echo ""
echo "Done. Test your sites:"
echo "  https://${API_DOMAIN}/health"
echo "  https://${ADMIN_DOMAIN}"
