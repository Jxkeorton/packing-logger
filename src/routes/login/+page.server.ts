import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { Actions } from './$types';
import { AUTH_COOKIE, checkPassword, sessionToken } from '$lib/server/auth';

const SIXTY_DAYS = 60 * 60 * 24 * 60;

export const actions: Actions = {
  default: async ({ request, cookies, url }) => {
    const formData = await request.formData();
    const password = String(formData.get('password') ?? '');

    if (!checkPassword(password)) {
      return fail(401, { error: true });
    }

    const token = sessionToken();
    if (token) {
      cookies.set(AUTH_COOKIE, token, {
        path: '/',
        httpOnly: true,
        secure: !dev,
        sameSite: 'lax',
        maxAge: SIXTY_DAYS,
      });
    }

    redirect(303, url.searchParams.get('redirectTo') || '/');
  },
};
