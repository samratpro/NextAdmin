# CI/CD with GitHub Actions

Auto-deploy to your VPS on every push to `main` — no Docker registry needed. The workflow SSHes into your server and runs the same commands you would run manually.

---

## How It Works

```
git push origin main
        ↓
GitHub Actions triggers
        ↓
GitHub SSHes into your VPS
        ↓
git pull → docker-compose build → docker-compose up -d
        ↓
Site updated — nothing to do manually
```

---

## Step 1 — Generate an SSH Key for GitHub

Run this **on your VPS** (not your local machine):

```bash
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_actions -N ""
```

This creates two files:
- `~/.ssh/github_actions` — private key (goes to GitHub)
- `~/.ssh/github_actions.pub` — public key (stays on VPS)

Allow GitHub to SSH in using this key:

```bash
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

---

## Step 2 — Add Secrets to GitHub

Go to your repo → **Settings → Secrets and variables → Actions → New repository secret**

Add these three secrets:

| Secret name | Value |
|-------------|-------|
| `VPS_HOST` | Your server IP or domain (e.g. `123.456.789.0`) |
| `VPS_USER` | SSH user (usually `root`) |
| `VPS_SSH_KEY` | Contents of `~/.ssh/github_actions` (the private key) |

To print the private key:
```bash
cat ~/.ssh/github_actions
```
Copy the entire output including `-----BEGIN OPENSSH PRIVATE KEY-----` and `-----END OPENSSH PRIVATE KEY-----`.

---

## Step 3 — Create the Workflow File

In your project repo create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to VPS

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: SSH and deploy
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /www/wwwroot/NextAdmin

            git pull origin main

            # Rebuild API if changed
            docker-compose build api
            docker-compose up -d --no-deps api

            # Rebuild admin only if frontend files changed
            docker-compose build --no-cache admin
            docker-compose up -d --no-deps admin
```

---

## Step 4 — Push and Watch It Run

```bash
git add .github/workflows/deploy.yml
git commit -m "add CI/CD workflow"
git push origin main
```

Go to your repo → **Actions** tab — you will see the workflow running live.

---

## Smarter: Only Rebuild What Changed

Rebuilding admin on every push is slow (3-5 min for Next.js). This version only rebuilds what actually changed:

```yaml
name: Deploy to VPS

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - name: Detect changed services
        id: changes
        run: |
          echo "api=$(git diff --name-only HEAD~1 HEAD | grep '^api/' | wc -l | tr -d ' ')" >> $GITHUB_OUTPUT
          echo "admin=$(git diff --name-only HEAD~1 HEAD | grep '^admin/' | wc -l | tr -d ' ')" >> $GITHUB_OUTPUT

      - name: Deploy API
        if: steps.changes.outputs.api != '0'
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /www/wwwroot/NextAdmin
            git pull origin main
            docker-compose build api
            docker-compose up -d --no-deps api

      - name: Deploy Admin
        if: steps.changes.outputs.admin != '0'
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /www/wwwroot/NextAdmin
            git pull origin main
            docker-compose build --no-cache admin
            docker-compose up -d --no-deps admin
            rm -rf /www/server/nginx/proxy_cache_dir/*
            /www/server/nginx/sbin/nginx -s reload
```

With this version:
- Push only API changes → only API rebuilds (~30s)
- Push only admin changes → only admin rebuilds (~4 min)
- Push both → both rebuild in parallel

---

## Manual Trigger (Optional)

Add `workflow_dispatch` to trigger a full redeploy from the GitHub UI without pushing code:

```yaml
on:
  push:
    branches:
      - main
  workflow_dispatch:    # enables the "Run workflow" button in GitHub Actions UI
```

---

## Verify It Works

After the first successful deploy:

```bash
# On your VPS — check containers are still running
docker-compose ps

# API health
curl http://localhost:8000/health
```

If the workflow fails, the old containers keep running — your site stays up.
