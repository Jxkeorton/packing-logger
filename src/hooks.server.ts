// Direct port of the main app's src/middleware.ts. SvelteKit's `handle`
// hook is the same shape of thing Astro's middleware is — one function
// that runs before every request — so this needed no restructuring, just
// swapping `context.redirect`/`context.cookies` for SvelteKit's
// equivalents on `event`.
import type { Handle } from '@sveltejs/kit';
import { AUTH_COOKIE, authEnabled, isValidSession } from '$lib/server/auth';

const PUBLIC_PATHS = new Set(['/login', '/favicon.svg', '/robots.txt']);

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname) || pathname.startsWith('/_app/');
}

export const handle: Handle = async ({ event, resolve }) => {
  if (!authEnabled() || isPublic(event.url.pathname)) {
    return resolve(event);
  }

  const token = event.cookies.get(AUTH_COOKIE);
  if (isValidSession(token)) {
    return resolve(event);
  }

  // A form action (POST) still expects a normal response its `use:enhance`
  // handler can read — a redirect is fine there too, unlike the main
  // app's plain JSON API routes, which needed a 401 instead of a redirect
  // so client code expecting JSON didn't choke on an HTML login page.
  // SvelteKit's actions and load functions both handle a redirect thrown
  // this way natively, so one response shape covers both here.
  const redirectTo = event.url.pathname === '/' ? '/login' : `/login?redirectTo=${encodeURIComponent(event.url.pathname)}`;
  return new Response(null, { status: 303, headers: { location: redirectTo } });
};
