# Tutorials

This folder contains the core documentation for working with Nango.

If you are new to the project, read these in roughly this order:

1. [Architecture](./ARCHITECTURE.md)
2. [Model Registration Guide](./MODEL_REGISTRATION_GUIDE.md)
3. [User and Authentication Guide](./USER_AND_AUTH_GUIDE.md)
4. [Database and Migrations](./DATABASE_MIGRATIONS.md)
5. [Port Configuration](./PORT_CONFIGURATION.md)

Use these when you need deeper operational guidance:

- [Production Deployment](./PRODUCTION_DEPLOYMENT.md)
- [Rate Limiting](./RATE_LIMITING.md)
- [Django Comparison](./DJANGO_COMPARISON.md)

## What These Docs Try to Do

Nango is not trying to be a one-to-one clone of Django.

These guides explain how to use the project as it actually exists today:

- a Fastify backend in `api/`
- a separate Next.js admin in `admin/`
- explicit model registration
- lightweight ORM conventions
- room for your own public frontend outside the admin app

When in doubt, treat the tutorials as practical implementation notes rather than abstract framework marketing.
