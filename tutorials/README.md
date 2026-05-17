# Tutorials

This folder contains the core documentation for working with NextAdmin.

If you are new to the project, read in this order:

1. [Architecture](./01_ARCHITECTURE.md)
2. [Django Comparison](./02_DJANGO_COMPARISON.md)
3. [First Feature Guide](./03_FIRST_FEATURE_GUIDE.md)
4. [Public App Integration](./04_PUBLIC_APP_INTEGRATION.md)
5. [Model Registration Guide](./05_MODEL_REGISTRATION_GUIDE.md)
6. [User and Authentication Guide](./06_USER_AND_AUTH_GUIDE.md)
7. [Database and Migrations](./07_DATABASE_MIGRATIONS.md)
8. [Email Configuration](./08_EMAIL_CONFIGURATION.md)
9. [Port Configuration](./09_PORT_CONFIGURATION.md)
10. [Rate Limiting](./10_RATE_LIMITING.md)
11. [EditorJS Integration](./11_EDITORJS_INTEGRATION.md)
12. [Google Drive Backup](./12_GOOGLE_DRIVE_BACKUP.md)
13. [SEO Integration](./13_SEO_INTEGRATION.md)
14. [Removing Blog Feature](./14_REMOVING_BLOG_FEATURE.md)
15. [Production Deployment](./15_PRODUCTION_DEPLOYMENT.md)
16. [CI/CD with GitHub Actions](./16_CICD_GITHUB_ACTIONS.md)
17. [Site Settings](./17_SITE_SETTINGS.md)

---

## Common Goals

| I want to… | Start here |
|---|---|
| Create my first app, model, route, and admin flow | [03_FIRST_FEATURE_GUIDE.md](./03_FIRST_FEATURE_GUIDE.md) |
| Understand how the admin and public app fit together | [04_PUBLIC_APP_INTEGRATION.md](./04_PUBLIC_APP_INTEGRATION.md) |
| Understand model wiring and admin registration | [05_MODEL_REGISTRATION_GUIDE.md](./05_MODEL_REGISTRATION_GUIDE.md) |
| Set up login, registration, and protected routes | [06_USER_AND_AUTH_GUIDE.md](./06_USER_AND_AUTH_GUIDE.md) |
| Set up SMTP for email verification and password reset | [08_EMAIL_CONFIGURATION.md](./08_EMAIL_CONFIGURATION.md) |
| Deploy to a VPS with Docker | [15_PRODUCTION_DEPLOYMENT.md](./15_PRODUCTION_DEPLOYMENT.md) |
| Set up auto-deploy from GitHub | [16_CICD_GITHUB_ACTIONS.md](./16_CICD_GITHUB_ACTIONS.md) |
| Manage logo, favicon, title, tagline from the admin | [17_SITE_SETTINGS.md](./17_SITE_SETTINGS.md) |

---

## What These Docs Try to Do

NextAdmin is not trying to be a one-to-one clone of Django.

These guides explain how to use the project as it actually exists today:

- a Fastify backend in `api/`
- a separate Next.js admin in `admin/`
- explicit model registration
- lightweight ORM conventions
- room for your own public frontend outside the admin app

When in doubt, treat the tutorials as practical implementation notes rather than abstract framework marketing.
