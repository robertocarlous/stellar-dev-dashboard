import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../store'
import {
  DEFAULT_SESSION_PERMISSIONS,
  SESSION_PERMISSIONS_STORAGE_KEY,
  isWalletPermissionGranted,
} from '../sessionPermissions'

const BASELINE = useStore.getState()

beforeEach(() => {
  try {
    sessionStorage.clear()
  } catch {
    /* ignore */
  }
  useStore.setState({ ...BASELINE, walletSessionPermissions: { ...DEFAULT_SESSION_PERMISSIONS } }, true)
})

describe('session permissions store wiring (#1194)', () => {
  it('starts fully granted and enforces revocations', () => {
    expect(useStore.getState().walletSessionPermissions).toEqual(DEFAULT_SESSION_PERMISSIONS)
    expect(isWalletPermissionGranted('submit')).toBe(true)

    useStore.getState().revokeWalletSessionPermission('submit')

    expect(useStore.getState().walletSessionPermissions.submit).toBe(false)
    expect(useStore.getState().session.walletSessionPermissions.submit).toBe(false)
    expect(isWalletPermissionGranted('submit')).toBe(false)
    // Revoking one permission leaves the others intact.
    expect(isWalletPermissionGranted('read')).toBe(true)
  })

  it('persists revocations to sessionStorage', () => {
    useStore.getState().revokeWalletSessionPermission('sign')

    const raw = sessionStorage.getItem(SESSION_PERMISSIONS_STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw as string)).toMatchObject({ sign: false })
  })

  it('re-grants a revoked permission', () => {
    useStore.getState().revokeWalletSessionPermission('sign')
    useStore.getState().grantWalletSessionPermission('sign')

    expect(useStore.getState().walletSessionPermissions.sign).toBe(true)
    expect(isWalletPermissionGranted('sign')).toBe(true)
  })

  // ── Failure / recovery ──────────────────────────────────────────────────────

  it('clears permissions and storage when the wallet disconnects', () => {
    useStore.getState().setWalletConnected(true, 'freighter', 'GABC')
    useStore.getState().revokeWalletSessionPermission('submit')
    expect(sessionStorage.getItem(SESSION_PERMISSIONS_STORAGE_KEY)).not.toBeNull()

    useStore.getState().disconnectWallet()

    expect(useStore.getState().walletSessionPermissions).toEqual(DEFAULT_SESSION_PERMISSIONS)
    expect(sessionStorage.getItem(SESSION_PERMISSIONS_STORAGE_KEY)).toBeNull()
    expect(isWalletPermissionGranted('submit')).toBe(true)
  })

  it('clears permissions and storage when the session is revoked', () => {
    useStore.getState().setWalletConnected(true, 'freighter', 'GABC')
    useStore.getState().revokeWalletSessionPermission('sign')
    useStore.getState().revokeWalletSessionPermission('submit')

    useStore.getState().revokeWalletSession('wallet_locked')

    expect(useStore.getState().walletSessionPermissions).toEqual(DEFAULT_SESSION_PERMISSIONS)
    expect(sessionStorage.getItem(SESSION_PERMISSIONS_STORAGE_KEY)).toBeNull()
  })
})
