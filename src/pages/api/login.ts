import type { APIRoute } from 'astro';
import { AUTH_COOKIE, checkPassword, sessionToken } from '../../lib/auth';

const SIXTY_DAYS = 60 * 60 * 24 * 60;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const password = String(form.get('password') ?? '');

  if (!checkPassword(password)) {
    return redirect('/login?error=1');
  }

  const token = sessionToken();
  if (token) {
    cookies.set(AUTH_COOKIE, token, {
      path: '/',
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax',
      maxAge: SIXTY_DAYS,
    });
  }

  return redirect('/');
};
