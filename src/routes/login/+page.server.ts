import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { Actions, PageServerLoad } from './$types';
import { AUTH_COOKIE, authMode, checkPassword, sessionToken, signUserSession } from '$lib/server/auth';
import { verifyCredentials } from '$lib/server/users';

const SIXTY_DAYS = 60 * 60 * 24 * 60;

export const load: PageServerLoad = async () => {
  return { mode: authMode() };
};

export const actions: Actions = {
  default: async ({ request, cookies, url }) => {
    const formData = await request.formData();
    const mode = authMode();

    let token: string | null;
    if (mode === 'multi') {
      const username = String(formData.get('username') ?? '');
      const password = String(formData.get('password') ?? '');
      const user = await verifyCredentials(username, password);
      if (!user) return fail(401, { error: true, mode });
      token = signUserSession(user.id);
    } else {
      const password = String(formData.get('password') ?? '');
      if (!checkPassword(password)) return fail(401, { error: true, mode });
      token = sessionToken();
    }

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
