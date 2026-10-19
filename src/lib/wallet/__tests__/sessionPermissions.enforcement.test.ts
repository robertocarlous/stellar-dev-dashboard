import { afterEach, describe, expect, it } from 'vitest'
import { getWalletAdapter } from '../adapters'
import {
  SessionPermissionError,
  setWalletPermissionChecker,
} from '../sessionPermissions'
import { useStore } from '../../store'

afterEach(() => {
  // Restore the store-backed checker installed at store import time.
  setWalletPermissionChecker((action) => useStore.getState().walletSessionPermissions[action])
})

describe('signing blocked by session permissions (#1194)', () => {
  it('refuses to sign at the adapter boundary when signing is revoked', async () => {
    setWalletPermissionChecker((action) => action !== 'sign')

    await expect(getWalletAdapter('freighter').signTransaction('any-xdr', 'testnet')).rejects.toBeInstanceOf(
      SessionPermissionError,
    )
  })

  it('refuses auth-entry signing when signing is revoked', async () => {
    setWalletPermissionChecker((action) => action !== 'sign')

    await expect(
      getWalletAdapter('freighter').signAuthEntry('any-xdr', 'testnet'),
    ).rejects.toBeInstanceOf(SessionPermissionError)
  })

  it('allows signing when the permission checker grants it', async () => {
    setWalletPermissionChecker(() => true)

    // The assertion passes; the call then fails network validation, proving the
    // permission gate did not short-circuit a granted action.
    await expect(getWalletAdapter('freighter').signTransaction('any-xdr', 'testnet')).rejects.not.toBeInstanceOf(
      SessionPermissionError,
    )
  })
})
