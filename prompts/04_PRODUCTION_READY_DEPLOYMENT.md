# AI Prompt: Configure Production-Ready Deployment & CI/CD

Copy the prompt block below and paste it into your AI coding assistant to quickly set up, configure, and automate the deployment files for NextAdmin on a VPS server.

---

```text
Act as a senior DevOps engineer and Docker expert.

I want to deploy NextAdmin in a secure, production-ready environment on a Linux VPS.

Here are my deployment specifications:
- Domains: API: `[API_DOMAIN]` (e.g. api.domain.com), Admin Panel: `[ADMIN_DOMAIN]` (e.g. admin.domain.com)
- Database: [DATABASE_CHOICE] (SQLite inside persistent host bind mount, or PostgreSQL container setup)
- CI/CD Platform: [CI_CD_CHOICE] (GitHub Actions, GitLab CI, or local git hooks)

Please generate or update the configuration scripts for me:

1. `.env` and `.env.example` Templates:
   - Provide secure production variables for PORTs, JWT secrets, database credentials, and SMTP settings.

2. `docker-compose.yml`:
   - Setup separate services for `api` (Fastify Node.js), `admin` (Next.js start), and optionally `postgres`.
   - Setup persistent volumes for data files (bind mounts) and media uploads.
   - Configure container dependencies and standard healthchecks.

3. Nginx Reverse Proxy Configs (`setup-nginx.sh`):
   - Scaffold reverse proxy blocks with WebSockets upgrade headers.
   - Configure caching directories, Certbot SSL automation, and strict HTTPS security redirects.

4. Non-interactive Provisioning Integration:
   - Ensure the deployment sequence runs our framework's `verify-admin` CLI command as a post-build hook to verify database connectivity and provision standard superuser access immediately.
```
