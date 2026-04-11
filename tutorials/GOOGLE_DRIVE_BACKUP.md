# Google Drive Backup Integration

This guide walks you through connecting Google Drive to the Admin Backup panel so you can send backup files directly to your Google Drive with one click.

---

## How It Works

- Admin panel shows a **"Connect Google Drive"** button on the Backup → Backup Files tab
- Clicking it opens a Google login popup
- After you grant access, backup files can be uploaded to a `nango_backup/` folder in your Drive
- Tokens are stored server-side in `api/.google_tokens.json` — never exposed to the browser

---

## Step 1 — Create a Google Cloud Project

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown (top-left) → **New Project**
3. Give it a name (e.g. `nango-backup`) → **Create**
4. Make sure the new project is selected in the dropdown

---

## Step 2 — Enable the Google Drive API

1. In the left sidebar go to **APIs & Services → Library**
2. Search for **Google Drive API**
3. Click it → **Enable**

---

## Step 3 — Create OAuth 2.0 Credentials & Download JSON

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → OAuth client ID**
3. If prompted, click **Configure Consent Screen** first:
   - Choose **External** (works for personal accounts)
   - Fill in **App name** (e.g. `Nango Backup`), **User support email**, **Developer contact email**
   - Click **Save and Continue** through all steps
   - On the **Test users** step, add your own Gmail address
   - Click **Back to Dashboard**
4. Now go back to **Credentials → + Create Credentials → OAuth client ID**
5. Application type: **Web application**
6. Name: `Nango Admin`
7. Under **Authorized redirect URIs**, click **+ Add URI** and enter:
   ```
   http://localhost:8000/api/admin/backup/drive/callback
   ```
   > For production, replace with your actual API domain, e.g.:
   > `https://api.yourdomain.com/api/admin/backup/drive/callback`
8. Click **Create**
9. In the popup, click **Download JSON** (the download icon ⬇) — this saves a file like `client_secret_xxxx.json`
10. Close the popup

---

## Step 4 — Upload Credentials in the Admin Panel

> This is the easiest method — no `.env` editing needed.

1. Open the Admin Panel → **Backup → Backup Files** tab
2. The Drive banner shows: *"Google Drive not set up — upload credentials.json"*
3. Click **upload credentials.json**
4. Select the JSON file you downloaded in Step 3
5. The banner updates to: *"Credentials ready — click Connect to authorise"*

The file is stored securely at `api/.google_credentials.json` with owner-only permissions.

> **Alternative — .env vars:** If you prefer environment variables instead of a file upload, add to `api/.env`:
> ```env
> GOOGLE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
> GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx
> ```
> Then restart the API. The uploaded file takes priority over env vars if both exist.

---

## Step 5 — Connect Your Google Account

1. After uploading credentials, the banner shows: *"Credentials ready — click Connect to authorise"*
2. Click **☁ Connect Google Drive**
3. A Google login popup opens — sign in with the Gmail you added as a test user
4. Grant the requested permissions (Drive file access)
5. The popup closes automatically and the banner turns green:
   > *"Google Drive connected (OAuth2) — uploads go to nango_backup/"*

---

## Step 6 — Upload a Backup to Drive

1. Go to **Backup Files** tab
2. Create a backup first if none exist (go to the **Databases** tab → **Create Backup**)
3. In the backup files list, click **☁ Drive** next to any file
4. The file is uploaded to a `nango_backup/` folder in your Google Drive
5. A success notification appears with a direct link to the file in Drive

---

## Token Storage & Security

| Detail | Info |
|--------|------|
| Token file | `api/.google_tokens.json` |
| Permissions | `600` (owner read/write only) |
| Auto-refresh | Access tokens refresh automatically using the stored refresh token |
| Disconnect | Click **Disconnect** in the banner to remove stored tokens |

> **Git ignore note** - this repo already ignores the Google credential and token files, but if you are copying this setup elsewhere, keep these files untracked:
> ```
> # .gitignore or api/.gitignore
> .google_credentials.json
> .google_tokens.json
> ```

---

## Service Account (Alternative / Advanced)

If you prefer a service account instead of OAuth2 (useful for fully automated/headless setups):

1. Go to **APIs & Services → Credentials → + Create Credentials → Service Account**
2. Fill in a name → **Create and Continue → Done**
3. Click the service account → **Keys tab → Add Key → JSON**
4. Download the JSON file
5. Add to `api/.env`:
   ```env
   GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}
   ```
   > Paste the entire JSON as a single line (minify it first if needed)
6. Optional — share the `nango_backup` folder with your Gmail so files appear in your Drive:
   ```env
   GOOGLE_DRIVE_SHARE_EMAIL=you@gmail.com
   ```

Service Account takes effect immediately — no login popup needed. If both OAuth2 tokens and a service account key are present, **OAuth2 takes priority**.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Popup blocked by browser | Allow popups for `localhost` in browser settings |
| `redirect_uri_mismatch` error | Make sure the redirect URI in Google Cloud Console exactly matches your `GOOGLE_REDIRECT_URI` |
| `Access blocked: app not verified` | Add yourself as a Test User in the OAuth consent screen (Step 3) |
| Token file missing after restart | The file is in `api/` — make sure the API has write permission to that directory |
| `GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set` | Restart the API after editing `.env` |
