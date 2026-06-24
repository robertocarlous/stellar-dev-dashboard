/**
 * Restore manager — selective restore, conflict detection, and validation.
 */

import type {
  BackupPayloadV2,
  ConflictStrategy,
  RestoreConflict,
  RestoreField,
  RestoreOptions,
  RestorePreview,
} from './types';
import { RESTORE_FIELDS } from './types';
import { applyBackupToStore } from '../import.js';
import { toLegacyPayload } from './backupPayload';

const SUPPORTED_VERSIONS = [1, 2];

export function isBackupPayloadV2(data: unknown): data is BackupPayloadV2 {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as BackupPayloadV2).format === 'stellar-dev-dashboard.backup' &&
    (data as BackupPayloadV2).version === 2
  );
}

export function parseBackupData(raw: unknown): {
  ok: boolean;
  data?: BackupPayloadV2 | Record<string, unknown>;
  error?: string;
} {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Backup file has an unexpected format.' };
  }

  if (isBackupPayloadV2(raw)) {
    return { ok: true, data: raw };
  }

  const legacy = raw as { version?: number };
  if (!SUPPORTED_VERSIONS.includes(legacy.version ?? -1)) {
    return {
      ok: false,
      error: `Unsupported backup version: ${legacy.version}. Expected one of: ${SUPPORTED_VERSIONS.join(', ')}.`,
    };
  }

  return { ok: true, data: raw as Record<string, unknown> };
}

function getFieldFromPayload(
  payload: BackupPayloadV2 | Record<string, unknown>,
  field: RestoreField
): unknown {
  if (isBackupPayloadV2(payload)) {
    switch (field) {
      case 'theme':
        return payload.theme;
      case 'network':
        return payload.account.network;
      case 'watchedAddresses':
        return payload.watchedAddresses;
      case 'customNetworks':
        return payload.customNetworks;
      case 'activeTab':
        return payload.activeTab;
      case 'connectedAddress':
        return payload.account.connectedAddress;
      default:
        return undefined;
    }
  }

  const legacy = payload as Record<string, unknown>;
  switch (field) {
    case 'theme':
      return legacy.theme;
    case 'network':
      return (legacy.account as Record<string, unknown>)?.network;
    case 'watchedAddresses':
      return legacy.watchedAddresses;
    case 'customNetworks':
      return legacy.customNetworks;
    case 'activeTab':
      return legacy.activeTab;
    case 'connectedAddress':
      return (legacy.account as Record<string, unknown>)?.connectedAddress;
    default:
      return undefined;
  }
}

function getCurrentFieldValue(store: Record<string, unknown>, field: RestoreField): unknown {
  switch (field) {
    case 'theme':
      return store.theme;
    case 'network':
      return store.network;
    case 'watchedAddresses':
      return store.watchedAddresses;
    case 'customNetworks':
      return store.customNetworks;
    case 'activeTab':
      return store.activeTab;
    case 'connectedAddress':
      return store.connectedAddress;
    default:
      return undefined;
  }
}

function valuesConflict(current: unknown, backup: unknown): boolean {
  return JSON.stringify(current) !== JSON.stringify(backup);
}

export function validateBackupPayload(data: unknown): string[] {
  const errors: string[] = [];
  const parsed = parseBackupData(data);
  if (!parsed.ok) {
    errors.push(parsed.error ?? 'Invalid backup.');
    return errors;
  }

  const payload = parsed.data!;
  const exportedAt = isBackupPayloadV2(payload)
    ? payload.exportedAt
    : (payload as { exportedAt?: string }).exportedAt;

  if (!exportedAt) errors.push('Missing exportedAt timestamp.');

  const account = isBackupPayloadV2(payload)
    ? payload.account
    : (payload as { account?: unknown }).account;

  if (!account || typeof account !== 'object') {
    errors.push('Missing or invalid account section.');
  }

  return errors;
}

export function previewRestore(
  payload: unknown,
  store: Record<string, unknown>,
  options: RestoreOptions
): RestorePreview {
  const errors = validateBackupPayload(payload);
  if (errors.length > 0) {
    return { valid: false, errors, conflicts: [], fieldsAvailable: [] };
  }

  const parsed = parseBackupData(payload);
  const data = parsed.data!;
  const fieldsAvailable = isBackupPayloadV2(data)
    ? data.backupType === 'incremental' && data.changedFields
      ? data.changedFields
      : RESTORE_FIELDS
    : RESTORE_FIELDS;

  const conflicts: RestoreConflict[] = [];

  for (const field of options.fields) {
    if (!fieldsAvailable.includes(field)) continue;
    const current = getCurrentFieldValue(store, field);
    const backup = getFieldFromPayload(data, field);
    if (valuesConflict(current, backup)) {
      conflicts.push({ field, currentValue: current, backupValue: backup });
    }
  }

  return { valid: true, errors: [], conflicts, fieldsAvailable };
}

function buildPartialPayload(
  payload: BackupPayloadV2 | Record<string, unknown>,
  fields: RestoreField[],
  strategy: ConflictStrategy,
  store: Record<string, unknown>,
  conflicts: RestoreConflict[]
): Record<string, unknown> {
  const conflictFields = new Set(conflicts.map((c) => c.field));
  const selected = new Set(fields);

  const base = isBackupPayloadV2(payload)
    ? toLegacyPayload(payload)
    : { ...(payload as Record<string, unknown>) };

  const result: Record<string, unknown> = {
    version: 1,
    exportedAt:
      (base as { exportedAt?: string }).exportedAt ?? new Date().toISOString(),
    account: { ...(base as { account?: Record<string, unknown> }).account },
  };

  for (const field of RESTORE_FIELDS) {
    if (!selected.has(field)) continue;

    let value = getFieldFromPayload(payload, field);

    if (conflictFields.has(field)) {
      if (strategy === 'skip') continue;
      if (strategy === 'merge') {
        if (field === 'watchedAddresses') {
          const current = (getCurrentFieldValue(store, field) as string[]) ?? [];
          const backup = (value as string[]) ?? [];
          value = [...new Set([...current, ...backup])];
        } else if (field === 'customNetworks') {
          const current = (getCurrentFieldValue(store, field) as unknown[]) ?? [];
          const backup = (value as unknown[]) ?? [];
          value = [...current, ...backup];
        }
        // overwrite uses backup value as-is
      }
    }

    switch (field) {
      case 'theme':
        result.theme = value;
        break;
      case 'network':
        (result.account as Record<string, unknown>).network = value;
        break;
      case 'watchedAddresses':
        result.watchedAddresses = value;
        break;
      case 'customNetworks':
        result.customNetworks = value;
        break;
      case 'activeTab':
        result.activeTab = value;
        break;
      case 'connectedAddress':
        (result.account as Record<string, unknown>).connectedAddress = value;
        break;
      default:
        break;
    }
  }

  return result;
}

export function applySelectiveRestore(
  payload: unknown,
  store: Record<string, unknown>,
  options: RestoreOptions
): { ok: boolean; error?: string; appliedFields: RestoreField[] } {
  const preview = previewRestore(payload, store, options);
  if (!preview.valid) {
    return { ok: false, error: preview.errors.join(' '), appliedFields: [] };
  }

  const parsed = parseBackupData(payload);
  const partial = buildPartialPayload(
    parsed.data!,
    options.fields,
    options.conflictStrategy,
    store,
    preview.conflicts
  );

  applyBackupToStore(partial, store);

  if (options.fields.includes('connectedAddress') && partial.account) {
    const address = (partial.account as { connectedAddress?: string }).connectedAddress;
    if (address && typeof store.setConnectedAddress === 'function') {
      store.setConnectedAddress(address);
    }
  }

  if (options.fields.includes('activeTab') && partial.activeTab) {
    if (typeof store.setActiveTab === 'function') {
      store.setActiveTab(partial.activeTab);
    }
  }

  if (options.fields.includes('customNetworks') && Array.isArray(partial.customNetworks)) {
    if (typeof store.setCustomNetworks === 'function') {
      store.setCustomNetworks(partial.customNetworks);
    }
  }

  return { ok: true, appliedFields: options.fields };
}
