# Public Auth Next.js Template

This is a reusable starter for building a custom user-facing auth flow on top of Nango.

It covers:

- signup
- email verification
- login
- forgot password
- reset password
- protected dashboard
- profile update
- password change

## Copy These Files Into Your App

Copy the `src/` files into your Next.js project and adapt the layout as needed.

Also copy `.env.example` into your app as `.env.local`.

## Required Backend Settings

In Nango `api/.env`, make sure:

```env
FRONTEND_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:7000,http://localhost:3000
```

Then restart the API.

## Assumptions

- Next.js App Router
- `@/*` path alias maps to `src/*`
- auth uses cookies with `credentials: 'include'`
- styling uses Tailwind utility classes

## Required App Wiring

Wrap your root layout with the provided `Providers` component:

```tsx
import Providers from '@/app/providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

## Optional Improvement

If you want a richer profile page after full reload, add a dedicated authenticated profile route in your API that returns the full `User` record instead of only the token payload from `GET /auth/me`.
