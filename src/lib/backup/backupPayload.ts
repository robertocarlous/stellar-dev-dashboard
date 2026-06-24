/**
 * Backup payload builder — full and incremental backup types.
 */

import type { BackupPayloadV2, BackupType, RestoreField } from './types';

const BACKUP_FIELDS: RestoreField[] = [
  'theme',
  'network',
  'watchedAddresses',
  'customNetworks',
  'activeTab',
  'connectedAddress',
];

export interface StoreSnapshot {
  connectedAddress?: string | null;
  network?: string;
  theme?: string;
  activeTab?: string;
  watchedAddresses?: string[];
  customNetworks?: unknown[];
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort());
}

export async function computeChecksum(data: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(stableStringify(data));
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fieldValue(snapshot: StoreSnapshot, field: RestoreField): unknown {
  switch (field) {
    case 'theme':
      return snapshot.theme ?? 'dark';
    case 'network':
      return snapshot.network ?? 'testnet';
    case 'watchedAddresses':
      return snapshot.watchedAddresses ?? [];
    case 'customNetworks':
      return snapshot.customNetworks ?? [];
    case 'activeTab':
      return snapshot.activeTab ?? 'overview';
    case 'connectedAddress':
      return snapshot.connectedAddress ?? null;
    default:
      return null;
  }
}

export async function buildFullPayload(snapshot: StoreSnapshot): Promise<BackupPayloadV2> {
  const payload: BackupPayloadV2 = {
    format: 'stellar-dev-dashboard.backup',
    version: 2,
    backupType: 'full',
    exportedAt: new Date().toISOString(),
    checksum: '',
    parentChecksum: null,
    account: {
      connectedAddress: snapshot.connectedAddress ?? null,
      network: snapshot.network ?? 'testnet',
    },
    watchedAddresses: snapshot.watchedAddresses ?? [],
    customNetworks: snapshot.customNetworks ?? [],
    theme: snapshot.theme ?? 'dark',
    activeTab: snapshot.activeTab ?? 'overview',
  };
  payload.checksum = await computeChecksum(payload);
  return payload;
}

export async function buildIncrementalPayload(
  snapshot: StoreSnapshot,
  previousPayload: BackupPayloadV2
): Promise<BackupPayloadV2 | null> {
  const changedFields: RestoreField[] = [];

  for (const field of BACKUP_FIELDS) {
    const current = fieldValue(snapshot, field);
    const previous = fieldValue(
      {
        connectedAddress: previousPayload.account.connectedAddress,
        network: previousPayload.account.network,
        theme: previousPayload.theme,
        activeTab: previousPayload.activeTab,
        watchedAddresses: previousPayload.watchedAddresses,
        customNetworks: previousPayload.customNetworks,
      },
      field
    );
    if (stableStringify(current) !== stableStringify(previous)) {
      changedFields.push(field);
    }
  }

  if (changedFields.length === 0) return null;

  const payload: BackupPayloadV2 = {
    format: 'stellar-dev-dashboard.backup',
    version: 2,
    backupType: 'incremental',
    exportedAt: new Date().toISOString(),
    checksum: '',
    parentChecksum: previousPayload.checksum,
    account: {
      connectedAddress: snapshot.connectedAddress ?? null,
      network: snapshot.network ?? 'testnet',
    },
    watchedAddresses: snapshot.watchedAddresses ?? [],
    customNetworks: snapshot.customNetworks ?? [],
    theme: snapshot.theme ?? 'dark',
    activeTab: snapshot.activeTab ?? 'overview',
    changedFields,
  };
  payload.checksum = await computeChecksum(payload);
  return payload;
}

export async function buildBackupPayload(
  snapshot: StoreSnapshot,
  type: BackupType,
  previousPayload?: BackupPayloadV2 | null
): Promise<BackupPayloadV2 | null> {
  if (type === 'incremental' && previousPayload) {
    return buildIncrementalPayload(snapshot, previousPayload);
  }
  return buildFullPayload(snapshot);
}

/** Convert v2 payload to v1-compatible shape for legacy import. */
export function toLegacyPayload(payload: BackupPayloadV2): Record<string, unknown> {
  return {
    version: 1,
    exportedAt: payload.exportedAt,
    account: payload.account,
    watchedAddresses: payload.watchedAddresses,
    customNetworks: payload.customNetworks,
    theme: payload.theme,
    activeTab: payload.activeTab,
  };
}
