# Django Comparison

NextAdmin is inspired by Django, but it does not try to reproduce Django exactly.

This document is the easiest way to understand the overlap and the differences.

## Where It Feels Familiar

If you know Django, these ideas should feel natural:

- app-oriented backend structure
- model classes for persistence
- a built-in admin concept
- CLI commands for common developer workflows
- a preference for convention over chaos

## Where It Differs

NextAdmin is more explicitly decoupled.

Instead of one framework owning templates, admin rendering, routing, and database behavior in one place, NextAdmin splits those concerns:

- Fastify handles the backend runtime
- Next.js handles the admin UI
- your public frontend is free to evolve separately

That is one of the main architectural differences from Django.

## Quick Mapping

| Django | NextAdmin |
| --- | --- |
| `startapp` | `npm run startapp <name>` |
| `settings.py` | `api/src/config/settings.ts` |
| `models.py` | `models.ts` in each app |
| `views.py` and `urls.py` | `routes.ts` in each app |
| Django admin | standalone Next.js admin app |
| `createsuperuser` | `npm run createsuperuser` |
| built-in ORM migrations | current sync-on-start plus manual schema updates |

## Models

Django:

```python
class Article(models.Model):
    title = models.CharField(max_length=255)
    content = models.TextField()
    published = models.BooleanField(default=False)
```

NextAdmin:

```typescript
export class Article extends Model {
  title = new CharField({ maxLength: 255 });
  content = new TextField();
  published = new BooleanField({ default: false });
}
```

## Query Style

Django:

```python
Article.objects.filter(published=True)
```

NextAdmin:

```typescript
Article.objects.filter({ published: true }).all()
```

## Admin Philosophy

Django admin is tightly integrated with the backend framework.

NextAdmin admin is a separate frontend application that consumes the API. That gives you more UI flexibility, but also means the admin is not just a backend-side switch you turn on.

## Authentication

Django defaults to session-oriented patterns.

NextAdmin ships with a JWT-oriented flow and keeps auth in the API layer, which fits modern frontend and API workflows more naturally.

## What Django Still Does Better Today

Django is still stronger in several areas:

- ORM maturity
- migration tooling
- ecosystem depth
- relational query richness

NextAdmin is not pretending otherwise.

## What NextAdmin Tries to Do Better

NextAdmin aims to be stronger in a different direction:

- cleaner separation between admin and backend
- TypeScript across the stack
- easier integration with modern frontend workflows
- less framework entanglement
- a more explicit architecture for teams that value loose coupling

## Best Mental Model

Think of NextAdmin as:

"Django's app-oriented productivity ideas, rebuilt for a TypeScript and API-first workflow, with stronger boundaries between layers."

That framing is much more accurate than calling it "Django in Node.js".
