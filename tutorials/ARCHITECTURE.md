# Architecture

Nango is a Django-inspired framework with a deliberately more decoupled structure.

The backend, admin UI, and public frontend are not collapsed into one layer. That separation is intentional.

## High-Level Shape

```text
nango/
|- api/         Fastify backend, ORM, auth, CLI
|- admin/       Next.js admin application
`- tutorials/   Documentation
```

There is no built-in public `app/` directory in this repo right now. You are expected to build your user-facing frontend separately, either in another folder or in another repo, and point it at the API.

## Why This Structure

This project is built around a few boundary decisions:

- backend logic belongs in `api/`
- admin UX belongs in `admin/`
- public product UX should not be forced to share admin assumptions
- apps should organize domain features, not just files

This makes the project feel familiar to Django users while staying closer to the explicit composition style common in Node.js projects.

## Backend: `api/`

The `api/` package is the core runtime. It contains:

- Fastify server bootstrapping
- the custom ORM and field system
- built-in authentication and authorization
- CLI commands such as `createsuperuser` and `startapp`
- model registration and admin metadata

Important locations:

- `api/src/index.ts`: API entry point
- `api/src/apps/`: app-oriented backend modules
- `api/src/core/`: framework internals such as models, fields, and database handling
- `api/src/config/settings.ts`: runtime configuration
- `api/src/cli/`: developer commands

## Admin: `admin/`

The admin is a separate Next.js application, not a backend-rendered admin template system.

That choice gives you:

- a clean UI boundary
- frontend flexibility without touching the API runtime
- the ability to evolve admin UX independently

The admin talks to the backend over HTTP using `NEXT_PUBLIC_API_URL`, which defaults to `http://localhost:8000`.

## App-Oriented Backend Design

Backend features are grouped as apps under `api/src/apps/`.

An app usually owns:

- `models.ts` for data definitions
- `routes.ts` for API routes
- `service.ts` for business logic
- optional middleware or helpers

This is conceptually similar to Django apps, but the coupling is lighter. Routes, services, and admin metadata remain explicit.

## Model Registration

Models are not discovered magically. They become active when:

1. the model file is imported by `api/src/index.ts`
2. the model uses `@registerAdmin(...)` if it should appear in the admin UI

This explicit registration avoids a lot of hidden framework behavior.

## Request Flow

Typical flow for an admin interaction:

1. the user opens the Next.js admin app on port `8001`
2. the admin app calls the API on port `8000`
3. Fastify routes hit services and models in `api/`
4. data is read from or written to SQLite
5. the API response goes back to the admin app

## Local Ports

Default local development ports:

- API: `8000`
- Admin: `8001`
- Public app: `3000` if you create one

Keeping the admin off port `3000` leaves the default frontend port available for the actual user-facing app.

## Database Strategy

Today, the backend is optimized for SQLite and a lightweight model layer.

That gives you:

- very fast local setup
- minimal infrastructure overhead
- a simple deployment story for many small and medium projects

It also means the ORM is intentionally limited compared to Django's mature ORM.

## What Nango Is Optimized For

Nango is strongest when you want:

- a batteries-included backend starting point
- a separate admin panel
- a clear domain-app structure
- TypeScript across backend and admin
- less framework magic than Django, but more structure than a blank Fastify repo

## What It Is Not Trying to Be

Nango is not currently:

- a full Django feature clone
- a multi-database ORM abstraction
- a heavily automated migration platform
- a monolithic full-stack runtime where every layer shares the same rendering model

That is a design choice, not a missing identity.
