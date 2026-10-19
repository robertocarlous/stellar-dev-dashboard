/**
 * useWriteGuard — #983 Mainnet Safety Guard
 *
 * Central gate for every write action (submit, sign, deploy, fund).
 * On mainnet the hook forces the user to type "mainnet" before the action
 * proceeds. An optional per-session "mainnet read-only" lock blocks all
 * writes until the lock is lifted.
 *
 * Usage:
 *   const { guard, MainnetConfirmDialog } = useWriteGuard()
 *   // wrap any submit handler:
 *   const handleSubmit = () => guard({ action: 'payment', onConfirm: doSubmit })
 *
 * Every submit path MUST go through guard().  A lint rule (no-direct-submit)
 * in eslint.config.js enforces this for server.submitTransaction calls.
 */

import { useState, useCallback, useRef } from 'react';
import { useStore } from '../lib/store';
import { type WalletPermission } from '../lib/wallet/sessionPermissions';

// ── Session-level read-only lock (persisted in sessionStorage) ──────────────

const SESSION_LOCK_KEY = 'stellar:mainnet-readonly-lock';

function getSessionLock(): boolean {
  try {
    return sessionStorage.getItem(SESSION_LOCK_KEY) === 'true';
  } catch {
    return false;
  }
}

function setSessionLock(locked: boolean): void {
  try {
    if (locked) {
      sessionStorage.setItem(SESSION_LOCK_KEY, 'true');
    } else {
      sessionStorage.removeItem(SESSION_LOCK_KEY);
    }
  } catch {
    // ignore
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface GuardOptions {
  /** Human-readable description shown in the confirmation dialog */
  action: string;
  /** Called when the user has confirmed and the write is allowed to proceed */
  onConfirm: () => void | Promise<void>;
  /**
   * Session permission this write requires (#1194). Defaults to `submit`.
   * Reads use `useWalletPermissions`; the guard covers sign/submit writes.
   */
  permission?: WalletPermission;
}

export interface UseWriteGuardReturn {
  /**
   * Call before any write action. On non-mainnet it calls onConfirm
   * immediately. On mainnet (or when read-only lock is active) it intercepts
   * and shows the appropriate UI.
   */
  guard: (opts: GuardOptions) => void;
  /** Whether the mainnet read-only lock is active this session */
  isReadOnlyLocked: boolean;
  /** Activate the per-session mainnet read-only lock */
  lockReadOnly: () => void;
  /** Lift the per-session mainnet read-only lock */
  unlockReadOnly: () => void;
  /**
   * Permission that blocked the last guard() call, if any (#1194). The last
   * write was NOT performed; show a re-grant prompt and let the user retry.
   */
  permissionDenied: WalletPermission | null;
  /** Clear the permission-denied state (e.g. after showing the prompt) */
  dismissPermissionDenied: () => void;
  /** Whether the confirmation dialog is currently open */
  dialogOpen: boolean;
  /** Props to spread onto <MainnetConfirmDialog> */
  dialogProps: MainnetConfirmDialogProps;
}

export interface MainnetConfirmDialogProps {
  open: boolean;
  actionLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function useWriteGuard(): UseWriteGuardReturn {
  const { network, walletConnected, walletSessionPermissions } = useStore();
  const isMainnet = network === 'mainnet';

  const [readOnlyLocked, setReadOnlyLocked] = useState<boolean>(getSessionLock);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState<WalletPermission | null>(null);
  const [actionLabel, setActionLabel] = useState('');
  const pendingConfirm = useRef<(() => void | Promise<void>) | null>(null);

  const lockReadOnly = useCallback(() => {
    setSessionLock(true);
    setReadOnlyLocked(true);
  }, []);

  const unlockReadOnly = useCallback(() => {
    setSessionLock(false);
    setReadOnlyLocked(false);
  }, []);

  const dismissPermissionDenied = useCallback(() => {
    setPermissionDenied(null);
  }, []);

  const guard = useCallback(
    ({ action, onConfirm, permission = 'submit' }: GuardOptions) => {
      // #1194: a connected wallet session that revoked a permission cannot
      // perform the action. The onConfirm callback is never invoked.
      if (walletConnected && !walletSessionPermissions[permission]) {
        setPermissionDenied(permission);
        return;
      }
      setPermissionDenied(null);

      // Read-only lock blocks all writes on mainnet regardless
      if (isMainnet && readOnlyLocked) {
        // Silently blocked — the UI should surface the lock badge.
        // Components may also show an inline message via isReadOnlyLocked.
        return;
      }

      // Non-mainnet: proceed immediately
      if (!isMainnet) {
        void onConfirm();
        return;
      }

      // Mainnet: require typed confirmation
      pendingConfirm.current = onConfirm;
      setActionLabel(action);
      setDialogOpen(true);
    },
    [isMainnet, readOnlyLocked, walletConnected, walletSessionPermissions],
  );

  const handleConfirm = useCallback(() => {
    setDialogOpen(false);
    const fn = pendingConfirm.current;
    pendingConfirm.current = null;
    if (fn) void fn();
  }, []);

  const handleCancel = useCallback(() => {
    setDialogOpen(false);
    pendingConfirm.current = null;
  }, []);

  return {
    guard,
    isReadOnlyLocked: isMainnet && readOnlyLocked,
    lockReadOnly,
    unlockReadOnly,
    permissionDenied,
    dismissPermissionDenied,
    dialogOpen,
    dialogProps: {
      open: dialogOpen,
      actionLabel,
      onConfirm: handleConfirm,
      onCancel: handleCancel,
    },
  };
}
