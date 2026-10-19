/**
 * WalletSessionPermissions — settings control for #1194.
 *
 * Lets the user revoke (or re-grant) the session-scoped read / sign / submit
 * permissions of the connected wallet. The controls are disabled when no
 * wallet is connected because permissions are meaningless without a session.
 */

import React from 'react';
import { useStore } from '../../lib/store';
import { WALLET_PERMISSIONS, type WalletPermission } from '../../lib/wallet/sessionPermissions';
import './WalletSessionPermissions.css';

const PERMISSION_COPY: Record<WalletPermission, { label: string; description: string }> = {
  read: {
    label: 'Read account data',
    description: 'Fetch balances, transactions, and contract state for the connected account.',
  },
  sign: {
    label: 'Sign transactions',
    description: 'Approve transaction and Soroban auth-entry signatures with the wallet.',
  },
  submit: {
    label: 'Submit transactions',
    description: 'Broadcast signed transactions to the network.',
  },
};

export const WalletSessionPermissions: React.FC = () => {
  const walletConnected = useStore((s) => s.walletConnected);
  const permissions = useStore((s) => s.walletSessionPermissions);
  const grant = useStore((s) => s.grantWalletSessionPermission);
  const revoke = useStore((s) => s.revokeWalletSessionPermission);

  const toggle = (action: WalletPermission) => {
    if (!walletConnected) return;
    if (permissions[action]) {
      revoke(action);
    } else {
      grant(action);
    }
  };

  return (
    <section className="wallet-session-permissions" aria-labelledby="wallet-session-permissions-title">
      <h4 id="wallet-session-permissions-title" className="wallet-session-permissions__title">
        Session permissions
      </h4>
      <p className="wallet-session-permissions__intro">
        Permissions apply to this browser session only. They reset to allowed when you disconnect.
      </p>

      <ul className="wallet-session-permissions__list">
        {WALLET_PERMISSIONS.map((action) => {
          const copy = PERMISSION_COPY[action];
          const granted = permissions[action];
          const id = `wallet-permission-${action}`;

          return (
            <li key={action} className="wallet-session-permissions__item">
              <div className="wallet-session-permissions__meta">
                <label htmlFor={id} className="wallet-session-permissions__label">
                  {copy.label}
                </label>
                <span className="wallet-session-permissions__description">{copy.description}</span>
              </div>
              <button
                id={id}
                type="button"
                role="switch"
                aria-checked={granted}
                disabled={!walletConnected}
                onClick={() => toggle(action)}
                className={`wallet-session-permissions__switch${granted ? ' is-on' : ''}`}
              >
                <span className="wallet-session-permissions__switch-thumb" aria-hidden="true" />
                <span className="wallet-session-permissions__switch-label">
                  {granted ? 'Allowed' : 'Blocked'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="wallet-session-permissions__hint">
        {walletConnected
          ? 'Blocked actions fail safely instead of reaching your wallet.'
          : 'Connect a wallet to manage session permissions.'}
      </p>
    </section>
  );
};

export default WalletSessionPermissions;
