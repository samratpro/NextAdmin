// Tells a public Next.js frontend to regenerate cached pages on-demand.
//
// Admin/settings writes call this after saving. A tag-cached frontend can then
// invalidate just the affected pages instead of refetching on every request,
// so visitors get static pages that regenerate only when something changes.
//
// NEXTJS_SITE_URL should point at the frontend over the internal network
// (e.g. http://website:3000). When it's unset, this is a no-op — so wiring a
// frontend is optional and adding these calls never breaks an API-only setup.
// REVALIDATE_SECRET is optional: when set, it's passed through and the frontend
// should reject calls without it (recommended, since the frontend is public).
//
// Fire-and-forget: a failure here must never break the admin save.
export async function revalidateFrontend(tag: string): Promise<void> {
  const siteUrl = process.env.NEXTJS_SITE_URL;
  if (!siteUrl) return;

  const url = new URL(`${siteUrl.replace(/\/$/, '')}/api/revalidate`);
  url.searchParams.set('tag', tag);
  const secret = process.env.REVALIDATE_SECRET;
  if (secret) url.searchParams.set('secret', secret);

  try {
    await fetch(url.toString(), { method: 'POST' });
  } catch {
    // ignore — frontend may be down; pages self-heal via the fallback revalidate
  }
}

export default revalidateFrontend;
