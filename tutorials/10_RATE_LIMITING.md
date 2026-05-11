# Rate Limiting

NextAdmin includes rate limiting in the API layer to reduce abuse and blunt brute-force or spammy traffic patterns.

## Global Limit

The API currently registers a global rate limiter in `api/src/index.ts`.

That limiter applies to incoming requests by IP and acts as the default protection layer for the whole API.

If you want to tune it, update the registration block in `api/src/index.ts`.

Example shape:

```typescript
await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
});
```

## When to Tune the Global Limit

Raise it when:

- you are developing locally and refreshing often
- internal tooling is generating a lot of safe traffic

Lower it when:

- the API is public
- endpoints are sensitive
- you are seeing abusive retry behavior

## Route-Specific Limits

Sensitive routes should usually have stricter limits than the global default.

Typical examples:

- login
- register
- password reset
- OTP or verification endpoints

Example:

```typescript
fastify.post('/auth/login', {
  config: {
    rateLimit: { max: 5, timeWindow: '1 minute' }
  }
}, async () => {
  // ...
});
```

You can also loosen the limit on safe, high-frequency endpoints when necessary.

## Client Behavior

When a limit is exceeded, the API returns `429 Too Many Requests`.

Your frontend should treat that as a normal operational case and show a useful message such as:

- too many attempts
- please wait and retry
- try again in a minute

## Recommended Strategy

Use layers:

- one global baseline
- stricter limits on auth-sensitive routes
- explicit overrides only where you have a real reason

That gives you protection without making the whole API frustrating to use.
