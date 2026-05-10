# Production Deployment Guide

Deploying NextAdmin on a Linux VPS: PostgreSQL + API + Admin panel inside Docker, with Nginx as a reverse proxy and SSL.

---

## Architecture

```
Browser
  │
  ├── https://admin.yourdomain.com  →  Nginx  →  localhost:7000  (Next.js Admin)
  └── https://api.yourdomain.com    →  Nginx  →  localhost:8000  (Fastify API)
                                                        │
                                               postgres:5432  (internal only)
```

Three Docker containers on one server. Nginx handles HTTPS and proxies to each container's host port. **To reconfigure, change only `.env` — nothing else.**

---

## File Map

```
NextAdmin/
├── .env                  ← CREATE THIS on the server (copy from .env.example)
├── .env.example          ← committed template — never commit .env
├── docker-compose.yml    ← reads all config from .env
├── api/
│   └── Dockerfile
└── admin/
    └── Dockerfile
```

---

## Quick Deploy Checklist

```bash
# 1. Clone
cd /www/wwwroot
git clone https://github.com/<your-org>/NextAdmin.git
cd NextAdmin

# 2. Create .env
cp .env.example .env
nano .env

# 3. Build and start
docker-compose build
docker-compose up -d

# 4. Verify
docker-compose ps
curl http://localhost:8000/health

# 5. Create first admin user (once only)
docker-compose exec api node dist/cli/create_user.js

# 6. Set up Nginx (Step 6 below)

# 7. SSL
certbot --nginx -d api.yourdomain.com
certbot --nginx -d admin.yourdomain.com
```

**Most likely failure points:**

| Symptom | Check |
|---------|-------|
| API container exits on start | `docker-compose logs api` — missing or wrong `.env` value |
| API can't reach postgres | Postgres healthcheck not passed yet — wait 10s and retry |
| Admin shows blank page | `docker-compose logs admin` — usually a build error |
| Login blocked in browser | `curl -s http://localhost:7000 \| grep api` — must show your domain, not `localhost` |
| API returns 503 | `curl http://localhost:8000/health` — db connection failed |

---

## Step 1 — Server Requirements

- Ubuntu 20.04+ or Debian 11+
- Docker Engine 24+
- Docker Compose v2 (`docker compose`) or v1 (`docker-compose`)
- Nginx
- Certbot

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Nginx + Certbot
apt install -y nginx certbot python3-certbot-nginx
```

---

## Step 2 — Clone the Repository

```bash
cd /www/wwwroot
git clone https://github.com/<your-org>/NextAdmin.git
cd NextAdmin
```

---

## Step 3 — Create `.env`

This is the **only file you edit on the server**.

```bash
cp .env.example .env
nano .env
```

```env
# Domains
API_DOMAIN=api.yourdomain.com
ADMIN_DOMAIN=admin.yourdomain.com

# Ports — change only if these are already in use on your server
API_PORT=8000
ADMIN_PORT=7000

# Database
DB_NAME=nextadmin
DB_USER=nextadmin
DB_PASSWORD=use-a-long-random-password

# Security — generate with: openssl rand -hex 32
SECRET_KEY=generate-32-char-random-string
JWT_SECRET=generate-another-32-char-random-string
JWT_EXPIRES_IN=1d
JWT_REFRESH_EXPIRES_IN=7d

# Email (Gmail: enable 2FA and use an App Password)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=noreply@yourdomain.com
```

`docker-compose.yml` builds `DATABASE_URL`, `CORS_ORIGIN`, and `NEXT_PUBLIC_API_URL` from these values automatically — you never set those manually.

---

## Step 4 — Build and Start

```bash
docker-compose build
docker-compose up -d
```

Verify all three containers are running:

```bash
docker-compose ps
```

Expected:
```
Name                    Command                 State    Ports
-----------------------------------------------------------------------
nextadmin-postgres-1    docker-entrypoint.sh …  Up       5432/tcp
nextadmin-api-1         node dist/index.js       Up       0.0.0.0:8000->8000/tcp
nextadmin-admin-1       next start -p 3000       Up       0.0.0.0:7000->3000/tcp
```

```bash
# API health check — should return {"status":"ok"}
curl http://localhost:8000/health

# Tail logs
docker-compose logs -f api
docker-compose logs -f admin
```

---

## Step 5 — Create the First Admin User

Run this once after the first deploy:

```bash
docker-compose exec api node dist/cli/create_user.js
```

At the prompts:
```
Username: admin
Email:    admin@yourdomain.com
Password: <secure password>
Role:     admin
```

The user persists in PostgreSQL across restarts.

---

## Step 6 — Nginx Configuration

### API subdomain

```bash
cat > /etc/nginx/sites-available/api.yourdomain.com << 'EOF'
server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
EOF
```

### Admin subdomain

```bash
cat > /etc/nginx/sites-available/admin.yourdomain.com << 'EOF'
server {
    listen 80;
    server_name admin.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name admin.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/admin.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.yourdomain.com/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:7000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
EOF
```

### Enable and reload

```bash
ln -s /etc/nginx/sites-available/api.yourdomain.com   /etc/nginx/sites-enabled/
ln -s /etc/nginx/sites-available/admin.yourdomain.com /etc/nginx/sites-enabled/

nginx -t        # verify syntax
nginx -s reload
```

> **BaoTa / aaPanel:** Create each subdomain through the panel UI, then edit the generated `.conf` to add the `proxy_pass` block. Reload with `/www/server/nginx/sbin/nginx -s reload`.

---

## Step 7 — SSL Certificates

```bash
certbot --nginx -d api.yourdomain.com
certbot --nginx -d admin.yourdomain.com
```

Test auto-renewal:
```bash
certbot renew --dry-run
```

---

## Updating the Application

### API only

```bash
git pull
docker-compose build api
docker-compose up -d --no-deps api
```

### Admin panel (any JS or domain change)

The admin JS bundle has the API URL baked in at build time — `--no-cache` is required:

```bash
git pull
docker-compose build --no-cache admin
docker-compose up -d --no-deps admin

# Clear Nginx proxy cache so browsers get the new HTML
rm -rf /www/server/nginx/proxy_cache_dir/*
/www/server/nginx/sbin/nginx -s reload
```

### Full redeploy

```bash
git pull
docker-compose build --no-cache
docker-compose down
docker-compose up -d

rm -rf /www/server/nginx/proxy_cache_dir/*
/www/server/nginx/sbin/nginx -s reload
```

---

## Troubleshooting

### Admin login fails — "Mixed Content" error

**Cause:** An `http://` URL was baked into the admin JS bundle; the browser blocks it on an HTTPS page.

**Fix:**
1. `API_DOMAIN` in `.env` must be the bare domain only — `api.yourdomain.com`, not `https://api.yourdomain.com`. `docker-compose.yml` prepends `https://` automatically.
2. Rebuild with `--no-cache` and clear Nginx cache:
```bash
docker-compose build --no-cache admin
docker-compose up -d --no-deps admin
rm -rf /www/server/nginx/proxy_cache_dir/*
/www/server/nginx/sbin/nginx -s reload
```

### Boolean columns show `-` in admin (isActive, isStaff, isSuperuser)

**Cause:** PostgreSQL returns column names in lowercase. The ORM normalises them back to camelCase.

**Fix:** Already applied in `api/src/core/model.ts`. Ensure you are on the latest code and rebuild the API.

### `docker-compose up` fails with `'ContainerConfig'` error

**Cause:** docker-compose v1 is incompatible with Docker Engine 25+.

**Fix:** Switch to the v2 plugin (`docker compose` without the hyphen), or remove the stale container manually:
```bash
docker rm -f nextadmin-admin-1
docker-compose up -d admin
```

### Nginx serves stale JS after a rebuild

**Cause:** Nginx proxy cache holds the old HTML which references old JS chunk filenames.

**Fix:**
```bash
rm -rf /www/server/nginx/proxy_cache_dir/*
/www/server/nginx/sbin/nginx -s reload
```
