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
├── admin/
│   └── Dockerfile
└── data/                 ← created automatically on first run, never committed
    ├── postgres/         ← PostgreSQL data files (survives docker-compose down)
    └── uploads/          ← API uploaded files (media, SEO images, etc.)
```

`data/` is a bind mount on the host. It is never touched by `docker-compose down` or `docker-compose down -v`, and survives Docker removal entirely. Back it up like any other directory.

---

## Quick Deploy Checklist

```bash
# 0. Map Domain via Cloudflare or Custom DNS for VPS IP connection
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

# 6. Nginx + SSL (reads domains/ports from .env automatically)
bash setup-nginx.sh
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

## Step 0 - Setup Domain
```
# Configure Name Server
- Login Domain Provider Website or Cloudflare
- Navigate to Manage DNS
```
Add Following Records:
| Type  | Host/Name   | Value                              |
|-------|-------------|------------------------------------|
| A     | api         | Your Remote Server IP              |
| A     | www.api     | Your Remote Server IP              |
| AAAA  | api         | Your Remote Server IPv6 (optional) |
| AAAA  | www.api     | Your Remote Server IPv6 (optional) |
| A     | admin       | Your Remote Server IP              |
| A     | www.admin   | Your Remote Server IP              |
| AAAA  | admin       | Your Remote Server IPv6 (optional) |
| AAAA  | www.admin   | Your Remote Server IPv6 (optional) |
| A     | @           | Your Remote Server IP              |
| A     | www         | Your Remote Server IP              |
| AAAA  | @           | Your Remote Server IPv6 (optional) |
| AAAA  | www         | Your Remote Server IPv6 (optional) |

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
cd /www/wwwroot  # or specific location
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

Run this once after the first deploy to interactively provision a user:

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

The user persists in PostgreSQL/SQLite across restarts.

### Automated User Verification & Provisioning (Non-Interactive CLI)

If you are deploying in a CI/CD pipeline, setting up a new environment, or need to instantly verify database connection health and assert standard superuser access without interactive blockages:

```bash
# Workspace root
npm run verify-admin

# API directory directly
cd api && npm run verify-admin

# Docker / Production environment
docker-compose exec api node dist/cli/verify_admin.js
```

This automated CLI tool connects to your active database, displays a summary of registered users, and guarantees the default `admin` superuser is active and accessible:
- If no users exist, it automatically creates the default superuser: `admin@example.com` / `admin`.
- If the `admin` user exists but was locked out, it ensures all staff/superuser/active flags are set to `true` and resets the password back to `admin`.

---

## Dynamic Password Updates & API Security

To match standard enterprise security patterns:
- **API Hash Stripping**: Hashed password strings are never sent over the wire to the web browser. The backend API automatically sanitizes all fields matching `*password*` inside admin endpoints, replacing them with empty strings (`""`).
- **Dynamic Form Presentation**: The NextAdmin panel detects password inputs, initializes them as empty, and displays the premium security placeholder: `"Leave blank to keep current"`.
- **Intelligent Updates**:
  - Leaving the input field empty sends an empty payload, which the API ignores, leaving the existing database password hash completely untouched.
  - Typing a value triggers the ORM model's hashing methods to securely encrypt and store the new credentials.

---

## Step 6 — Nginx + SSL (one command)

```bash
bash setup-nginx.sh
```

The script reads domains and ports from `.env` and handles everything:

1. Detects aaPanel or standard Nginx automatically
2. Writes proxy configs to the correct path for your setup
3. Issues SSL certificates via certbot webroot (no plugin required — works on aaPanel too)
4. Rewrites configs to HTTPS and reloads Nginx

Verify after it finishes:
```bash
certbot renew --dry-run
curl https://api.yourdomain.com/health
```

### Manual aaPanel Config

If you prefer to configure through the aaPanel UI instead of the script:

1. Create each subdomain as a site in aaPanel (Website → Add site)
2. In the generated nginx config, find and **remove** these default static file blocks:

```nginx
#Prohibit putting sensitive files in certificate verification directory
if ( $uri ~ "^/\.well-known/.*\.(php|jsp|py|js|css|lua|ts|go|zip|tar\.gz|rar|7z|sql|bak)$" ) {
    return 403;
}

location ~ .*\.(gif|jpg|jpeg|png|bmp|swf)$
{
    expires      30d;
    error_log /dev/null;
    access_log /dev/null;
}

location ~ .*\.(js|css)?$
{
    expires      12h;
    error_log /dev/null;
    access_log /dev/null;
}
```

3. **Replace** them with the proxy block (use your actual port from `.env`):

```nginx
location / {
    proxy_pass         http://127.0.0.1:8000;  # change port
    proxy_http_version 1.1;
    proxy_set_header   Upgrade           $http_upgrade;
    proxy_set_header   Connection        "upgrade";
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
}
```

4. Use **aaPanel → Website → SSL** to issue the Let's Encrypt certificate for each subdomain.
5. Reload: `/www/server/nginx/sbin/nginx -s reload`

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
git pull https://samratpro:git_secrect_token@github.com/username/repo_name.git && docker-compose down && docker-compose up -d
```
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

### Another PostgreSQL is already running on the server

No conflict. The `postgres` container in this setup has no `ports:` mapping — it is internal to Docker only and never binds to the host's `5432`. Other projects or a host PostgreSQL instance are completely isolated.

### Nginx serves stale JS after a rebuild

**Cause:** Nginx proxy cache holds the old HTML which references old JS chunk filenames.

**Fix:**
```bash
rm -rf /www/server/nginx/proxy_cache_dir/*
/www/server/nginx/sbin/nginx -s reload
```
