# Wallet Session Permissions

A connected wallet can read account data, sign transactions, and submit them. On a shared machine, or when reviewing a suspicious contract, users may want to keep a wallet connected for monitoring while blocking the privileged actions. Session-scoped permissions let them do that for the current browser session (#1194).

## Behaviour

Every wallet session carries three permissions:

| Permission | Gates |
|------------|-------|
| `read` | Fetching account balances, transactions, operations and contract state for the connected account. |
| `sign` | Producing transaction and Soroban auth-entry signatures through any wallet adapter. |
| `submit` | Broadcast writes routed through the mainnet write guard (`useWriteGuard`). |

A freshly connected session starts with **all three granted**, matching the long-standing "a connected wallet can act" behaviour. The user can revoke any permission from **Wallet → Session permissions**:

- Revoking **sign** blocks every adapter's `signTransaction` / `signAuthEntry`. The call throws a `SessionPermissionError` **before** any network or XDR work, so a revoked session never reaches the wallet or the network.
- Revoking **submit** makes `useWriteGuard().guard(...)` refuse the write and expose `permissionDenied` instead of calling `onConfirm`.
- Revoking **read** skips account-data fetching on connect and on the Freighter background account refresh.

Permissions are re-grantable at any time in the same session.

## Scope and lifecycle

- **Session-scoped.** Permissions live in `sessionStorage` under `stellar-dash:wallet-session-permissions` and in the in-memory session slice. They are deliberately **not** in the store's `PERSIST_KEYS`, so they never persist as durable preferences.
- **Survive reload, die with the tab.** `sessionStorage` keeps the choice across an in-page reload; closing the tab or disconnecting clears it.
- **Cleared on session end.** `disconnectWallet()` and `revokeWalletSession(reason)` (idle timeout, wallet lock, account change, manual disconnect) both reset permissions to the granted defaults and remove the stored record.
- **Per tab.** Another tab's activity or permissions never affect this one.

## Fail-safe semantics

Validation lives in `src/lib/wallet/sessionPermissions.ts`.

| Stored state | Result |
|--------------|--------|
| No record | All permissions granted (fresh session). |
| Complete, valid record | Used as stored. |
| Partial record (missing an action) | Missing actions are **denied**. |
| A flag with an unrecognized value | That flag is **denied**. |
| Unparseable JSON or a non-object record | Fall back to `read: true`, `sign: false`, `submit: false`. |
| `sessionStorage` unreadable | Same restrictive fallback. |

A corrupt record must never silently re-grant a permission the user revoked, so every ambiguous case fails **closed** for the privileged actions while keeping `read` so the dashboard stays usable. The module is framework-free; enforcement goes through `setWalletPermissionChecker`, which the store installs once at startup. If that checker throws, `sign`/`submit` are reported denied and `read` allowed.

## Configuration for contributors

```ts
import { useWalletPermissions } from '../hooks/useWalletPermissions';

const { can, grant, revoke } = useWalletPermissions();
```

- Components that only need to *check* a permission can call `isWalletPermissionGranted(action)` from `src/lib/wallet/sessionPermissions.ts`.
- Writes must still go through `useWriteGuard`; the permission check composes with (and never replaces) the mainnet confirmation dialog and read-only lock:

```ts
guard({ action: 'payment', permission: 'submit', onConfirm: onSubmit });
```

- Signing is enforced centrally in `createAdapter` in `src/lib/wallet/adapters.ts`, so every wallet shares the same gate. Do not add per-wallet permission checks.

## Security, privacy and accessibility notes

- **Not a cryptographic boundary.** Permissions guard the dashboard's own actions against accidental or coerced use in a session. An attacker with script execution in the page can edit `sessionStorage`; the wallet extension still performs its own confirmation for every signature.
- **Defense in depth.** Because the check runs before any wallet call, a revoked `sign` produces no signature request at all — removing the accidental-approval path.
- **No new data egress.** Nothing about permissions leaves the browser; the record holds only three booleans.
- **Accessibility.** The settings control uses native `role="switch"` toggles with associated labels and an `aria-checked` state, honours `prefers-reduced-motion`, and increases the control border in high-contrast mode.

## Tests

- `src/lib/wallet/__tests__/sessionPermissions.test.ts` — normalization, persistence round-trips, the restrictive fallbacks, and the checker (happy path, boundary flags, throwing checker).
- `src/lib/wallet/__tests__/sessionPermissions.store.test.ts` — grant/revoke wiring and the disconnect/revoke reset-and-clear paths.
- `src/lib/wallet/__tests__/sessionPermissions.enforcement.test.ts` — the adapter signing gate for `signTransaction` and `signAuthEntry`, plus the granted-permission control case.

## Related

- `docs/security/wallet-idle-timeout.md` — idle expiry revokes the session and therefore also clears these permissions.
- `docs/features/MAINNET_SAFETY_GUARD.md` — the write guard these permissions compose with.
