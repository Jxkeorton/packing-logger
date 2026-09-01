// Accounts for a shared multi-user deployment. `./storage` is mocked with
// an in-memory Map — the same pattern as logbook.test.ts — so users.json
// never touches a real bucket or the local data/ folder.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock('./storage', () => ({
  readText: async (key: string) => store.get(key) ?? null,
  writeText: async (key: string, content: string) => {
    store.set(key, content);
  },
}));

const { createUser, listUsers, resetPassword, verifyCredentials } = await import('./users');

beforeEach(() => {
  store.clear();
});

describe('createUser', () => {
  it('creates an account that verifyCredentials then accepts', async () => {
    await createUser('Jane', 'correct-horse');
    const user = await verifyCredentials('Jane', 'correct-horse');
    expect(user?.username).toBe('Jane');
  });

  it('matches the username case- and whitespace-insensitively on login', async () => {
    await createUser('Jane', 'correct-horse');
    expect(await verifyCredentials('  JANE ', 'correct-horse')).not.toBeNull();
  });

  it('refuses a second account under the same username', async () => {
    await createUser('Jane', 'correct-horse');
    await expect(createUser('jane', 'another-password')).rejects.toThrow(/already has an account/);
  });

  it('refuses a password under 8 characters', async () => {
    await expect(createUser('Jane', 'short')).rejects.toThrow(/at least 8 characters/);
  });

  it('gives every user a distinct id, independent of username', async () => {
    const a = await createUser('Jane', 'correct-horse');
    const b = await createUser('Sam', 'correct-horse');
    expect(a.id).not.toBe(b.id);
  });
});

describe('verifyCredentials', () => {
  it('rejects the wrong password', async () => {
    await createUser('Jane', 'correct-horse');
    expect(await verifyCredentials('Jane', 'wrong-password')).toBeNull();
  });

  it('rejects a username with no account, without throwing', async () => {
    expect(await verifyCredentials('nobody', 'whatever1')).toBeNull();
  });

  it('never stores or returns the plaintext password', async () => {
    await createUser('Jane', 'correct-horse');
    expect(store.get('users.json')).not.toContain('correct-horse');
  });
});

describe('resetPassword', () => {
  it('accepts the new password afterward and rejects the old one', async () => {
    await createUser('Jane', 'correct-horse');
    await resetPassword('Jane', 'new-password');
    expect(await verifyCredentials('Jane', 'correct-horse')).toBeNull();
    expect(await verifyCredentials('Jane', 'new-password')).not.toBeNull();
  });

  it('keeps the same id, so existing ledgers stay reachable', async () => {
    const original = await createUser('Jane', 'correct-horse');
    const updated = await resetPassword('Jane', 'new-password');
    expect(updated.id).toBe(original.id);
  });

  it('matches the username case- and whitespace-insensitively', async () => {
    await createUser('Jane', 'correct-horse');
    await resetPassword('  JANE ', 'new-password');
    expect(await verifyCredentials('Jane', 'new-password')).not.toBeNull();
  });

  it('rejects a username with no account', async () => {
    await expect(resetPassword('nobody', 'new-password')).rejects.toThrow(/no account/i);
  });

  it('refuses a password under 8 characters', async () => {
    await createUser('Jane', 'correct-horse');
    await expect(resetPassword('Jane', 'short')).rejects.toThrow(/at least 8 characters/);
  });
});

describe('listUsers', () => {
  it('lists accounts without exposing salt or hash', async () => {
    await createUser('Jane', 'correct-horse');
    const [user] = await listUsers();
    expect(user).toMatchObject({ username: 'Jane' });
    expect(user).not.toHaveProperty('hash');
    expect(user).not.toHaveProperty('salt');
  });
});
