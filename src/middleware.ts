import { defineMiddleware } from 'astro:middleware';
import { AUTH_COOKIE, authEnabled, isValidSession } from './lib/auth';

// Paths that must stay reachable even when you're not logged in — the login
// page itself, its form target, and static assets the login page needs to
// render (its own styles/favicon).
const PUBLIC_PATHS = new Set(['/login', '/api/login', '/api/logout', '/favicon.svg']);

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname) || pathname.startsWith('/_astro/');
}

export const onRequest = defineMiddleware((context, next) => {
  if (!authEnabled() || isPublic(context.url.pathname)) {
    return next();
  }

  const token = context.cookies.get(AUTH_COOKIE)?.value;
  if (isValidSession(token)) {
    return next();
  }

  // API calls get a plain 401 (a redirect would hand back HTML where the
  // client code expects JSON); page loads get sent to the login screen.
  if (context.url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return context.redirect('/login');
});
