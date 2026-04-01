# Public App Integration

This guide explains how to connect your own user-facing app to Nango without mixing it into the admin panel.

The short version:

- `api/` is the shared backend
- `admin/` is only for staff and superusers
- your user-facing app should be a separate frontend that talks to the same API

If you want one concrete build path, read [First Feature Guide](./FIRST_FEATURE_GUIDE.md) first and then come back here.

## The Mental Model

Think of the project as three independent pieces:

| Piece | Default URL | Purpose |
| --- | --- | --- |
| API | `http://localhost:8000` | auth, business logic, models, data |
| Admin | `http://localhost:8001` | internal management UI |
| Public app | `http://localhost:3000` | the product your users actually use |

The admin is not meant to be embedded inside the user app.

Instead, both frontends call the backend over HTTP:

```text
Public App  ----\
                 >---- API ---- SQLite
Admin Panel ----/
```

## What "Integrating the Admin With the User App" Usually Means

In this repo, integration does not mean putting the admin UI inside your product frontend.

It usually means:

1. both apps use the same backend
2. both apps use the same user/auth system
3. admins manage data in `admin/`
4. normal users interact with that data from your public frontend

Example:

- admins create `Post` records in the admin panel
- your public app fetches published posts from the API
- users never see the admin UI

## Recommended Project Shape

You can keep the public app:

- in another repo
- in another folder next to this repo
- or inside the same repo later if you want, as long as it remains separate from `admin/`

One practical local setup is:

```text
nango/
|- api/
|- admin/
`- tutorials/

my-public-app/
```

Or, if you prefer one repository:

```text
nango/
|- api/
|- admin/
|- app/
`- tutorials/
```

## Step 1: Run the API and Admin

Start the backend:

```bash
cd api
npm run dev
```

Start the admin:

```bash
cd admin
npm run dev
```

Default URLs:

- API: `http://localhost:8000`
- Admin: `http://localhost:8001`

Your public app should usually run on:

- `http://localhost:3000`

## Step 2: Configure the Backend for Both Frontends

Your API must allow requests from both the admin app and the public app.

Set backend environment variables like this:

```env
PORT=8000
HOST=0.0.0.0
CORS_ORIGIN=http://localhost:8001,http://localhost:3000
ADMIN_URL=http://localhost:8001
FRONTEND_URL=http://localhost:3000
```

Important:

- `CORS_ORIGIN` must include both frontend origins
- `FRONTEND_URL` is used in email verification and password reset links

## Step 3: Point Your Public App at the API

Your public frontend should call the API directly.

Example frontend environment variable:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

The public app and the admin app can use the same API base URL.

## Step 4: Use the Built-In Auth Endpoints

The backend already exposes the main auth routes:

- `POST /auth/register`
- `POST /auth/verify-email`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/change-password`
- `GET /auth/me`

Typical public-app auth flow:

1. user registers with `POST /auth/register`
2. backend sends a verification email using `FRONTEND_URL`
3. user opens your public app's `/verify-email` page
4. your frontend sends the token to `POST /auth/verify-email`
5. user logs in with `POST /auth/login`
6. frontend stores `accessToken` and `refreshToken`
7. frontend sends `Authorization: Bearer <accessToken>` on protected requests
8. frontend refreshes the access token with `POST /auth/refresh` when needed

## Step 5: Build Public Pages for the Email Flows

Because verification and reset emails point to `FRONTEND_URL`, your public app should implement pages like:

- `/verify-email?token=...`
- `/reset-password?token=...`

Example verify-email page logic:

```ts
const token = searchParams.get('token');

await fetch(`${API_URL}/auth/verify-email`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token })
});
```

Example reset-password page logic:

```ts
await fetch(`${API_URL}/auth/reset-password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token,
    newPassword
  })
});
```

## Step 6: Store Tokens in the Public App

The admin app already shows one working pattern in [`admin/src/lib/api.ts`](../admin/src/lib/api.ts).

For a public app, the same idea applies:

- store the access token
- store the refresh token
- attach the access token on API calls
- refresh when a `401` happens

Example API client:

```ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function login(email: string, password: string) {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  return response.json();
}

export async function getCurrentUser(accessToken: string) {
  const response = await fetch(`${API_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  return response.json();
}
```

## Step 7: Add Your Own App-Specific Routes

The built-in auth endpoints are only the foundation.

Your product features should live in backend apps under `api/src/apps/`.

Example:

- `api/src/apps/blog/models.ts`
- `api/src/apps/blog/routes.ts`
- `api/src/apps/blog/service.ts`

Then your public app consumes those routes, while the admin can manage the same models if you register them with `@registerAdmin(...)` and import the model file in `api/src/index.ts`.

Example separation:

- `POST /auth/login` handles identity
- `GET /api/posts` powers the public blog homepage
- `POST /api/posts` may be staff-only
- admin users manage `Post` records through `admin/`

## Step 8: Handle Roles Cleanly

Do not use the admin app as the user dashboard.

Instead:

- use `isStaff` and `isSuperuser` for admin/staff access
- use profile models for app-specific user data
- use custom middleware for role-specific public routes

The built-in token payload already includes:

- `userId`
- `email`
- `username`
- `isStaff`
- `isSuperuser`

That means your public app can quickly tell whether a signed-in user is a normal user or a staff/admin user.

## Step 9: Example Next.js Public App Flow

If your public app is built with Next.js, the flow usually looks like this:

1. user submits a login form
2. call `POST /auth/login`
3. save tokens in client storage
4. call `GET /auth/me`
5. render user-specific pages
6. call your domain routes such as `/api/posts` or `/api/vendor/onboarding`

Very small example:

```ts
const loginResult = await login(email, password);

if (loginResult.success) {
  localStorage.setItem('accessToken', loginResult.accessToken);
  localStorage.setItem('refreshToken', loginResult.refreshToken);

  const me = await getCurrentUser(loginResult.accessToken);
  console.log(me.user);
}
```

## Step 10: Production Setup

A common production shape is:

- public app: `https://example.com`
- admin: `https://admin.example.com`
- API: `https://api.example.com`

Example configuration:

```env
# API
CORS_ORIGIN=https://admin.example.com,https://example.com
ADMIN_URL=https://admin.example.com
FRONTEND_URL=https://example.com

# Admin
NEXT_PUBLIC_API_URL=https://api.example.com

# Public app
NEXT_PUBLIC_API_URL=https://api.example.com
```

## Common Mistakes

### Trying to put the admin inside the public app

That fights the architecture of this repo. Keep them separate.

### Forgetting to include the public app in `CORS_ORIGIN`

That causes browser request failures even if the API is running correctly.

### Forgetting `FRONTEND_URL`

Then verification and password-reset emails may point to the wrong frontend.

### Registering models for admin but never creating public API routes

`@registerAdmin(...)` makes a model visible in the admin UI. It does not automatically create your product-facing endpoints.

Your public API routes still need to be registered explicitly in `api/src/index.ts`.

## Practical Rule of Thumb

Use this split:

- `admin/` for internal operators
- your public app for customers or end users
- `api/` as the shared source of truth

That is the intended integration model in Nango.
