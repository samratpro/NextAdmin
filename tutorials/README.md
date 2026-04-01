# Tutorials

This folder contains the core documentation for working with Nango.

If you are new to the project, this is the easiest reading path:

1. [Architecture](./ARCHITECTURE.md)
2. [First Feature Guide](./FIRST_FEATURE_GUIDE.md)
3. [Public App Integration](./PUBLIC_APP_INTEGRATION.md)
4. [Model Registration Guide](./MODEL_REGISTRATION_GUIDE.md)
5. [User and Authentication Guide](./USER_AND_AUTH_GUIDE.md)
6. [Database and Migrations](./DATABASE_MIGRATIONS.md)
7. [Port Configuration](./PORT_CONFIGURATION.md)

Use these when you need deeper operational guidance:

- [Production Deployment](./PRODUCTION_DEPLOYMENT.md)
- [Rate Limiting](./RATE_LIMITING.md)
- [Django Comparison](./DJANGO_COMPARISON.md)

## Common Goals

If you are trying to do a specific task, start here:

- create your first app, model, route, and admin flow: [First Feature Guide](./FIRST_FEATURE_GUIDE.md)
- understand how the admin and your public app fit together: [Public App Integration](./PUBLIC_APP_INTEGRATION.md)
- understand model wiring and admin registration in detail: [Model Registration Guide](./MODEL_REGISTRATION_GUIDE.md)
- set up login, registration, and protected routes: [User and Authentication Guide](./USER_AND_AUTH_GUIDE.md)
- understand current database limits and production tradeoffs: [Production Deployment](./PRODUCTION_DEPLOYMENT.md)

## What These Docs Try to Do

Nango is not trying to be a one-to-one clone of Django.

These guides explain how to use the project as it actually exists today:

- a Fastify backend in `api/`
- a separate Next.js admin in `admin/`
- explicit model registration
- lightweight ORM conventions
- room for your own public frontend outside the admin app

When in doubt, treat the tutorials as practical implementation notes rather than abstract framework marketing.
