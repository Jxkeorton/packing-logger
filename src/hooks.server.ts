// Originally a direct port of the main app's src/middleware.ts — one
// `handle` hook running before every request, same shape as Astro's
// middleware. Now branches on which of the two auth modes (see
// $lib/server/auth.ts) the deployment is running:
//
//   'single' — the original shared-password gate, unchanged.
//   'multi'  — a named-account gate: verify the session cookie names a
//              real user, then run the rest of the request with every
//              ledger read/write scoped to that user's own files
//              (storage.ts's runAsUser — this is the one line that makes
//              a shared deployment safe for more than one person).
import type { Handle } from '@sveltejs/kit';
import { AUTH_COOKIE, authMode, isValidSession, verifyUserSession } from '$lib/server/auth';
import { runAsUser } from '$lib/server/storage';

const PUBLIC_PATHS = new Set(['/login', '/favicon.svg', '/robots.txt']);

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname) || pathname.startsWith('/_app/');
}

// A form action (POST) still expects a normal response its `use:enhance`
// handler can read — a redirect is fine there too, unlike the main app's
// plain JSON API routes, which needed a 401 instead of a redirect so
// client code expecting JSON didn't choke on an HTML login page.
// SvelteKit's actions and load functions both handle a redirect thrown
// this way natively, so one response shape covers both here.
function toLogin(pathname: string): Response {
  const redirectTo = pathname === '/' ? '/login' : `/login?redirectTo=${encodeURIComponent(pathname)}`;
  return new Response(null, { status: 303, headers: { location: redirectTo } });
}

export const handle: Handle = async ({ event, resolve }) => {
  const mode = authMode();
  if (mode === 'none' || isPublic(event.url.pathname)) {
    return resolve(event);
  }

  if (mode === 'single') {
    const token = event.cookies.get(AUTH_COOKIE);
    if (isValidSession(token)) return resolve(event);
    return toLogin(event.url.pathname);
  }

  // mode === 'multi'
  const userId = verifyUserSession(event.cookies.get(AUTH_COOKIE));
  if (!userId) return toLogin(event.url.pathname);

  event.locals.userId = userId;
  return runAsUser(userId, () => resolve(event));
};
