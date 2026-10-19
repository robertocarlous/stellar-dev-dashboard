/**
 * Session-scoped wallet permissions (#1194).
 *
 * A connected wallet session carries three explicit permissions — read, sign
 * and submit. The user can revoke any of them from settings for the rest of
 * the browser session; revocations are enforced at every wallet choke point
 * (adapter signing, the write guard, and account-read paths) and are cleared
 * when the session ends (disconnect, revoke, wallet lock).
 *
 * Storage semantics (fail-safe, in order of precedence):
 * - Nothing stored        → all permissions granted (fresh session; preserves
 *                          the long-standing "connected wallet can act" UX).
 * - Record exists but is  → sign/submit denied, read kept so the dashboard
 *   corrupt or invalid       remains usable. A corrupt record must never
 *                          silently re-grant a revoked permission.
 *
 * This module is framework-free: it does not import the store. Enforcement
 * reads go through an injectable checker that the store registers once at
 * startup (see `setWalletPermissionChecker`), so adapters and hooks can
 * assert permissions without a circular import.
 */

/** Every permission an action can require. */
export type WalletPermission = 'read' | 'sign' | 'submit'

export const WALLET_PERMISSIONS: ReadonlyArray<WalletPermission> = ['read', 'sign', 'submit']

export interface SessionPermissions {
  read: boolean
  sign: boolean
  submit: boolean
}

/** Fresh session default: everything allowed (unchanged pre-#1194 behavior). */
export const DEFAULT_SESSION_PERMISSIONS: SessionPermissions = {
  read: true,
  sign: true,
  submit: true,
}

/**
 * Fail-safe applied when a stored record exists but cannot be trusted.
 * Read is kept so the dashboard stays usable; signing and submitting — the
 * privileged actions the user may have revoked — are denied.
 */
export const FALLBACK_SESSION_PERMISSIONS: SessionPermissions = {
  read: true,
  sign: false,
  submit: false,
}

/**
 * sessionStorage key. Session-scoped on purpose: permissions must die with
 * the tab's wallet session and never survive into a new login via localStorage
 * or the persisted store (the session slice is deliberately outside
 * PERSIST_KEYS).
 */
export const SESSION_PERMISSIONS_STORAGE_KEY = 'stellar-dash:wallet-session-permissions'

export type SessionPermissionsIssue =
  | 'not_an_object'
  | 'invalid_flag'
  | 'unparseable_json'
  | 'storage_unavailable'

export interface NormalizedSessionPermissions {
  permissions: SessionPermissions
  /** False when input had to be replaced by the fail-safe fallback. */
  valid: boolean
  issues: SessionPermissionsIssue[]
}

function coerceFlag(value: unknown): { flag: boolean; issue: SessionPermissionsIssue | null } {
  if (typeof value === 'boolean') return { flag: value, issue: null }
  if (value === 'true') return { flag: true, issue: null }
  if (value === 'false') return { flag: false, issue: null }
  // Unknown values fail closed for the flag they protect.
  return { flag: false, issue: 'invalid_flag' }
}

/**
 * Validate a user- or storage-supplied permission record.
 *
 * - Non-object input falls back to `FALLBACK_SESSION_PERMISSIONS`.
 * - Individual flags are coerced; anything unrecognizable is treated as
 *   denied and reported as an issue.
 * - Unknown extra keys are ignored.
 */
export function normalizeSessionPermissions(raw: unknown): NormalizedSessionPermissions {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      permissions: { ...FALLBACK_SESSION_PERMISSIONS },
      valid: false,
      issues: ['not_an_object'],
    }
  }

  const record = raw as Record<string, unknown>
  const issues: SessionPermissionsIssue[] = []
  const permissions = { ...DEFAULT_SESSION_PERMISSIONS }

  for (const action of WALLET_PERMISSIONS) {
    if (!(action in record)) {
      // A partial record (older shape or hand-edited) must not silently
      // keep a permission the user removed from the record.
      permissions[action] = false
      issues.push('invalid_flag')
      continue
    }
    const { flag, issue } = coerceFlag(record[action])
    permissions[action] = flag
    if (issue) issues.push(issue)
  }

  return { permissions, valid: issues.length === 0, issues }
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function defaultStorage(): StorageLike | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    // Accessing sessionStorage throws in some sandboxed / privacy modes.
    return null
  }
}

/**
 * Read the persisted permission record.
 *
 * - No record      → defaults, valid.
 * - Corrupt record → fail-safe fallback (sign/submit denied), invalid.
 * - No storage     → fail-safe fallback, invalid (`storage_unavailable`).
 */
export function loadSessionPermissions(storage: StorageLike | null = defaultStorage()): NormalizedSessionPermissions {
  if (!storage) {
    return {
      permissions: { ...FALLBACK_SESSION_PERMISSIONS },
      valid: false,
      issues: ['storage_unavailable'],
    }
  }
  try {
    const raw = storage.getItem(SESSION_PERMISSIONS_STORAGE_KEY)
    if (raw === null) {
      return { permissions: { ...DEFAULT_SESSION_PERMISSIONS }, valid: true, issues: [] }
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return {
        permissions: { ...FALLBACK_SESSION_PERMISSIONS },
        valid: false,
        issues: ['unparseable_json'],
      }
    }
    return normalizeSessionPermissions(parsed)
  } catch {
    return {
      permissions: { ...FALLBACK_SESSION_PERMISSIONS },
      valid: false,
      issues: ['storage_unavailable'],
    }
  }
}

/**
 * Persist a permission record. Invalid input is coerced flag-by-flag (unknown
 * flags become denied) so a save can never store an unbounded shape. Returns
 * the normalized record that was (or would have been) stored.
 */
export function saveSessionPermissions(
  value: unknown,
  storage: StorageLike | null = defaultStorage(),
): SessionPermissions {
  const { permissions } = normalizeSessionPermissions(value)
  // Re-reading via a full object keeps the stored shape stable for future
  // additive fields: unknown keys from `value` are intentionally dropped.
  const record: Record<string, boolean> = {}
  for (const action of WALLET_PERMISSIONS) record[action] = permissions[action]
  try {
    storage?.setItem(SESSION_PERMISSIONS_STORAGE_KEY, JSON.stringify(record))
  } catch {
    // Quota exceeded / storage blocked: the in-memory value still applies.
  }
  return permissions
}

/** Remove the persisted record (end of session). */
export function clearSessionPermissions(storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(SESSION_PERMISSIONS_STORAGE_KEY)
  } catch {
    // ignore
  }
}

// ── Enforcement ───────────────────────────────────────────────────────────────

/** Error thrown when an action is attempted without its permission. */
export class SessionPermissionError extends Error {
  readonly action: WalletPermission
  readonly code = 'wallet_permission_denied'

  constructor(action: WalletPermission) {
    super(`Wallet session permission "${action}" has been revoked for this session.`)
    this.name = 'SessionPermissionError'
    this.action = action
  }
}

export type PermissionChecker = (_action: WalletPermission) => boolean

let permissionChecker: PermissionChecker | null = null

/**
 * Register the live permission source (the store does this once at startup).
 * Pass `null` to uninstall (tests). While no checker is installed every
 * permission is treated as granted, which keeps framework-free consumers
 * (adapters) usable in isolation.
 */
export function setWalletPermissionChecker(checker: PermissionChecker | null): void {
  permissionChecker = checker
}

/** Whether `action` is currently granted. Fails open only when no checker is installed. */
export function isWalletPermissionGranted(action: WalletPermission): boolean {
  if (!permissionChecker) return true
  try {
    return permissionChecker(action)
  } catch {
    // A broken checker must not accidentally allow privileged actions.
    return action === 'read'
  }
}

/** Throw a `SessionPermissionError` when `action` is not granted. */
export function assertWalletPermission(action: WalletPermission): void {
  if (!isWalletPermissionGranted(action)) {
    throw new SessionPermissionError(action)
  }
}
