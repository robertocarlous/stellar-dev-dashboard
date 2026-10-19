/**
 * useWalletPermissions — read/sign/submit session permissions for components (#1194).
 *
 * Thin, reactive view over the store's `walletSessionPermissions`. Because the
 * store resets permissions to the granted defaults on disconnect, `can()` is
 * safe to call whether or not a wallet is connected.
 */

import { useCallback } from 'react';
import { useStore } from '../lib/store';
import type { SessionPermissions, WalletPermission } from '../lib/wallet/sessionPermissions';

export interface UseWalletPermissionsReturn {
  /** Current read/sign/submit grants for this session. */
  permissions: SessionPermissions;
  /** Whether `action` is currently allowed. */
  can: (_action: WalletPermission) => boolean;
  /** Grant `action` for the rest of the session. */
  grant: (_action: WalletPermission) => void;
  /** Revoke `action` for the rest of the session. */
  revoke: (_action: WalletPermission) => void;
}

export function useWalletPermissions(): UseWalletPermissionsReturn {
  const permissions = useStore((s) => s.walletSessionPermissions);
  const grant = useStore((s) => s.grantWalletSessionPermission);
  const revoke = useStore((s) => s.revokeWalletSessionPermission);

  const can = useCallback((action: WalletPermission) => permissions[action], [permissions]);

  return { permissions, can, grant, revoke };
}
