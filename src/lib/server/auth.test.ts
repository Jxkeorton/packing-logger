// The session-signing half of the two auth modes. authMode()'s env-var
// switch and the single-password path already had implicit coverage via
// manual testing before this file existed; what's worth pinning down here
// is the forgery resistance of the new multi-user cookie, since that's
// the one thing standing between a shared deployment's users.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('authMode', () => {
  it('is multi when AUTH_SECRET is set, regardless of APP_PASSWORD', async () => {
    vi.stubEnv('AUTH_SECRET', 's3cret');
    vi.stubEnv('APP_PASSWORD', 'also-set');
    const { authMode } = await import('./auth');
    expect(authMode()).toBe('multi');
  });

  it('is single when only APP_PASSWORD is set', async () => {
    vi.stubEnv('APP_PASSWORD', 'hunter2');
    const { authMode } = await import('./auth');
    expect(authMode()).toBe('single');
  });

  it('is none with neither set, same as local dev today', async () => {
    const { authMode } = await import('./auth');
    expect(authMode()).toBe('none');
  });
});

describe('signUserSession / verifyUserSession', () => {
  it('round-trips a user id through a signed cookie', async () => {
    vi.stubEnv('AUTH_SECRET', 's3cret');
    const { signUserSession, verifyUserSession } = await import('./auth');
    const cookie = signUserSession('user-abc');
    expect(verifyUserSession(cookie ?? undefined)).toBe('user-abc');
  });

  it('rejects a cookie signed under a different secret', async () => {
    vi.stubEnv('AUTH_SECRET', 'secret-one');
    const { signUserSession } = await import('./auth');
    const cookie = signUserSession('user-abc');

    vi.resetModules();
    vi.stubEnv('AUTH_SECRET', 'secret-two');
    const { verifyUserSession } = await import('./auth');
    expect(verifyUserSession(cookie ?? undefined)).toBeNull();
  });

  it('rejects a cookie with the user id swapped but the old signature kept', async () => {
    // The forgery this format has to resist: sign in as yourself, then
    // edit the cookie to claim to be someone else, keeping the signature.
    vi.stubEnv('AUTH_SECRET', 's3cret');
    const { signUserSession, verifyUserSession } = await import('./auth');
    const cookie = signUserSession('user-abc')!;
    const signature = cookie.slice(cookie.lastIndexOf('.') + 1);
    const forged = `user-someone-else.${signature}`;
    expect(verifyUserSession(forged)).toBeNull();
  });

  it('rejects malformed and missing cookies without throwing', async () => {
    vi.stubEnv('AUTH_SECRET', 's3cret');
    const { verifyUserSession } = await import('./auth');
    expect(verifyUserSession(undefined)).toBeNull();
    expect(verifyUserSession('')).toBeNull();
    expect(verifyUserSession('no-dot-in-here')).toBeNull();
  });

  it('signs nothing without AUTH_SECRET, even with a valid-looking call', async () => {
    const { signUserSession, verifyUserSession } = await import('./auth');
    expect(signUserSession('user-abc')).toBeNull();
    expect(verifyUserSession('user-abc.whatever')).toBeNull();
  });
});
