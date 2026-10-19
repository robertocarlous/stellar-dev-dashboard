import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SESSION_PERMISSIONS,
  FALLBACK_SESSION_PERMISSIONS,
  SESSION_PERMISSIONS_STORAGE_KEY,
  SessionPermissionError,
  assertWalletPermission,
  clearSessionPermissions,
  isWalletPermissionGranted,
  loadSessionPermissions,
  normalizeSessionPermissions,
  saveSessionPermissions,
  setWalletPermissionChecker,
  type WalletPermission,
} from '../sessionPermissions';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
}

afterEach(() => {
  setWalletPermissionChecker(null);
});

describe('normalizeSessionPermissions', () => {
  it('accepts a complete boolean record', () => {
    const result = normalizeSessionPermissions({ read: true, sign: false, submit: true });
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.permissions).toEqual({ read: true, sign: false, submit: true });
  });

  it('coerces boolean-like strings', () => {
    const result = normalizeSessionPermissions({ read: 'true', sign: 'false', submit: 'true' });
    expect(result.valid).toBe(true);
    expect(result.permissions).toEqual({ read: true, sign: false, submit: true });
  });

  // ── Boundary ────────────────────────────────────────────────────────────────

  it('denies flags with unknown values instead of trusting them', () => {
    const result = normalizeSessionPermissions({ read: true, sign: 'yes', submit: 1 });
    expect(result.valid).toBe(false);
    expect(result.permissions).toEqual({ read: true, sign: false, submit: false });
    expect(result.issues).toContain('invalid_flag');
  });

  it('denies missing flags in a partial record', () => {
    const result = normalizeSessionPermissions({ read: true });
    expect(result.valid).toBe(false);
    expect(result.permissions).toEqual({ read: true, sign: false, submit: false });
  });

  it('ignores unknown extra keys', () => {
    const result = normalizeSessionPermissions({
      read: true,
      sign: true,
      submit: true,
      admin: true,
    });
    expect(result.valid).toBe(true);
    expect(result.permissions).toEqual(DEFAULT_SESSION_PERMISSIONS);
  });

  // ── Failure ─────────────────────────────────────────────────────────────────

  it('falls back to the restrictive default for non-object input', () => {
    for (const bad of [null, undefined, 'nope', 42, ['read']]) {
      const result = normalizeSessionPermissions(bad);
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('not_an_object');
      expect(result.permissions).toEqual(FALLBACK_SESSION_PERMISSIONS);
    }
  });
});

describe('persistence', () => {
  it('round-trips a saved record', () => {
    const storage = memoryStorage();
    saveSessionPermissions({ read: true, sign: false, submit: false }, storage);

    const stored = storage.getItem(SESSION_PERMISSIONS_STORAGE_KEY);
    expect(stored).not.toBeNull();

    const loaded = loadSessionPermissions(storage);
    expect(loaded.valid).toBe(true);
    expect(loaded.permissions).toEqual({ read: true, sign: false, submit: false });
  });

  it('defaults to fully granted when nothing is stored', () => {
    const loaded = loadSessionPermissions(memoryStorage());
    expect(loaded.valid).toBe(true);
    expect(loaded.permissions).toEqual(DEFAULT_SESSION_PERMISSIONS);
  });

  it('clears the stored record', () => {
    const storage = memoryStorage();
    saveSessionPermissions(DEFAULT_SESSION_PERMISSIONS, storage);
    clearSessionPermissions(storage);
    expect(storage.getItem(SESSION_PERMISSIONS_STORAGE_KEY)).toBeNull();
  });

  // ── Boundary / failure ──────────────────────────────────────────────────────

  it('fails safe when the stored record is corrupt JSON', () => {
    const storage = memoryStorage({ [SESSION_PERMISSIONS_STORAGE_KEY]: '{not json' });
    const loaded = loadSessionPermissions(storage);
    expect(loaded.valid).toBe(false);
    expect(loaded.issues).toEqual(['unparseable_json']);
    expect(loaded.permissions).toEqual(FALLBACK_SESSION_PERMISSIONS);
  });

  it('fails safe when the stored record has an invalid shape', () => {
    const storage = memoryStorage({ [SESSION_PERMISSIONS_STORAGE_KEY]: JSON.stringify({ sign: 'maybe' }) });
    const loaded = loadSessionPermissions(storage);
    expect(loaded.valid).toBe(false);
    expect(loaded.permissions.sign).toBe(false);
  });

  it('fails safe when storage access throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };

    const loaded = loadSessionPermissions(throwing);
    expect(loaded.valid).toBe(false);
    expect(loaded.issues).toEqual(['storage_unavailable']);
    expect(loaded.permissions).toEqual(FALLBACK_SESSION_PERMISSIONS);

    // A blocked write must not throw and still returns the normalized value.
    expect(saveSessionPermissions({ read: true, sign: true, submit: true }, throwing)).toEqual(
      DEFAULT_SESSION_PERMISSIONS,
    );
    expect(() => clearSessionPermissions(throwing)).not.toThrow();
  });

  it('persists the restrictive fallback when saving invalid input', () => {
    const storage = memoryStorage();
    const saved = saveSessionPermissions({ read: true, sign: 'nope' }, storage);
    expect(saved.sign).toBe(false);
    expect(JSON.parse(storage.getItem(SESSION_PERMISSIONS_STORAGE_KEY) as string)).toEqual(saved);
  });
});

describe('enforcement', () => {
  it('grants everything when no checker is installed', () => {
    for (const action of ['read', 'sign', 'submit'] as WalletPermission[]) {
      expect(isWalletPermissionGranted(action)).toBe(true);
      expect(() => assertWalletPermission(action)).not.toThrow();
    }
  });

  it('throws a typed error for a revoked permission', () => {
    setWalletPermissionChecker((action) => action !== 'sign');

    expect(isWalletPermissionGranted('read')).toBe(true);
    expect(isWalletPermissionGranted('sign')).toBe(false);

    let caught: unknown;
    try {
      assertWalletPermission('sign');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SessionPermissionError);
    expect((caught as SessionPermissionError).action).toBe('sign');
    expect((caught as SessionPermissionError).code).toBe('wallet_permission_denied');
  });

  it('fails closed for privileged actions when the checker itself throws', () => {
    setWalletPermissionChecker(() => {
      throw new Error('store unavailable');
    });

    expect(isWalletPermissionGranted('read')).toBe(true);
    expect(isWalletPermissionGranted('sign')).toBe(false);
    expect(isWalletPermissionGranted('submit')).toBe(false);
  });

  it('restores permissive behavior when the checker is uninstalled', () => {
    setWalletPermissionChecker(() => false);
    expect(isWalletPermissionGranted('submit')).toBe(false);

    setWalletPermissionChecker(null);
    expect(isWalletPermissionGranted('submit')).toBe(true);
  });
});
