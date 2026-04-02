# Port Configuration

Nango uses separate ports for separate concerns.

That split is intentional:

- the backend API should not share a port with the admin UI
- the admin UI should not occupy the default public frontend port
- your own product frontend should remain free to use `3000`

## Default Local Ports

| Service | Port | Purpose |
| --- | --- | --- |
| API | `8000` | Fastify backend and Swagger docs |
| Admin | `7000` | Next.js admin application |
| Public app | `3000` | Your own frontend, if you build one |

## Why Port 3000 Matters

Port `3000` is intentionally left open for the user-facing application.

The admin panel runs on `7000`, not `3000`, so product development and administration stay clearly separated.

## API Configuration

`api/.env.example`

```env
PORT=8000
HOST=0.0.0.0
CORS_ORIGIN=http://localhost:7000,http://localhost:3000
ADMIN_URL=http://localhost:7000
FRONTEND_URL=http://localhost:3000
```

## Admin Configuration

`admin/.env.example`

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

The admin currently defaults to `http://localhost:8000` if the variable is missing.

## Running Services Locally

Run them separately:

```bash
cd api
npm run dev
```

```bash
cd admin
npm run dev
```

Or run both from the root:

```bash
npm run dev
```

## Health Check URLs

When everything is running:

- API base: `http://localhost:8000`
- Swagger docs: `http://localhost:8000/docs`
- Admin UI: `http://localhost:7000`

If you create a public frontend, it will usually live at:

- `http://localhost:3000`

## Production Pattern

A common production shape is:

- API: `api.yourdomain.com`
- Admin: `admin.yourdomain.com`
- Public app: `yourdomain.com`

Example production configuration:

```env
# API
CORS_ORIGIN=https://admin.yourdomain.com,https://yourdomain.com
ADMIN_URL=https://admin.yourdomain.com
FRONTEND_URL=https://yourdomain.com

# Admin
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

## Troubleshooting

### Port already in use

If a port is busy, stop the conflicting process and restart the service.

Windows:

```powershell
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

### CORS errors

Check that `CORS_ORIGIN` includes both:

- the admin origin
- the public frontend origin

### Admin cannot reach the API

Check:

1. the API is running on `8000`
2. `NEXT_PUBLIC_API_URL` is correct
3. the admin app was restarted after changing env variables

## Summary

Use this mental model:

- `8000` is the backend
- `7000` is the admin
- `3000` is reserved for your product frontend

That separation keeps the system easier to reason about and fits the framework's decoupled design.
