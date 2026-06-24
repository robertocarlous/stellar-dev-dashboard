/**
 * Backup manager — orchestrates backup creation, encryption, cloud upload, and history.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  BackupRecord,
  BackupScheduleConfig,
  BackupType,
  CloudProviderId,
} from './types';
import { buildBackupPayload, type StoreSnapshot } from './backupPayload';
import { encryptBackupPayload } from './backupEncryption';
import {
  getBackupPayload,
  getLatestSuccessfulBackup,
  listBackupRecords,
  saveBackupRecord,
  saveScheduleConfig,
  getScheduleConfig,
} from './backupStorage';
import { enforceRetentionPolicy } from './backupHistory';
import { uploadToCloud } from './cloudProviders';
import type { BackupPayloadV2 } from './types';

export interface CreateBackupOptions {
  type?: BackupType;
  encrypt?: boolean;
  passphrase?: string;
  cloudProvider?: CloudProviderId;
  label?: string;
}

export interface CreateBackupResult {
  record: BackupRecord;
  skipped?: boolean;
  reason?: string;
}

function snapshotFromStore(store: Record<string, unknown>): StoreSnapshot {
  return {
    connectedAddress: store.connectedAddress as string | null,
    network: store.network as string,
    theme: store.theme as string,
    activeTab: store.activeTab as string,
    watchedAddresses: store.watchedAddresses as string[],
    customNetworks: store.customNetworks as unknown[],
  };
}

export async function createBackup(
  store: Record<string, unknown>,
  options: CreateBackupOptions = {}
): Promise<CreateBackupResult> {
  const schedule = await getScheduleConfig();
  const type = options.type ?? schedule.backupType;
  const encrypt = options.encrypt ?? schedule.encrypt;
  const cloudProvider = options.cloudProvider ?? schedule.cloudProvider;

  let previousPayload: BackupPayloadV2 | null = null;
  if (type === 'incremental') {
    const latest = await getLatestSuccessfulBackup();
    if (latest) {
      previousPayload = (await getBackupPayload(latest.id)) as BackupPayloadV2 | null;
    }
    if (!previousPayload) {
      // Fall back to full backup when no baseline exists
      return createBackup(store, { ...options, type: 'full' });
    }
  }

  const payload = await buildBackupPayload(snapshotFromStore(store), type, previousPayload);

  if (!payload) {
    return {
      record: makeFailedRecord(type, cloudProvider, 'No changes since last backup'),
      skipped: true,
      reason: 'No changes since last backup',
    };
  }

  let serialized: string;
  let encrypted = false;

  if (encrypt) {
    if (!options.passphrase) {
      throw new Error('Passphrase required for encrypted backups.');
    }
    const envelope = await encryptBackupPayload(payload, options.passphrase);
    serialized = JSON.stringify(envelope);
    encrypted = true;
  } else {
    serialized = JSON.stringify(payload);
  }

  const id = uuidv4();
  const sizeBytes = new TextEncoder().encode(serialized).length;

  const record: BackupRecord = {
    id,
    type,
    createdAt: new Date().toISOString(),
    sizeBytes,
    encrypted,
    checksum: payload.checksum,
    parentId: previousPayload ? (await getLatestSuccessfulBackup())?.id ?? null : null,
    cloudProvider,
    cloudFileId: null,
    status: 'success',
    label: options.label,
  };

  let cloudFileId: string | null = null;
  if (cloudProvider !== 'local') {
    try {
      const filename = `stellar-backup-${id}.json`;
      const upload = await uploadToCloud(cloudProvider, filename, serialized);
      cloudFileId = upload?.fileId ?? null;
      record.cloudFileId = cloudFileId;
    } catch (err) {
      record.status = 'failed';
      record.label = err instanceof Error ? err.message : 'Cloud upload failed';
      await saveBackupRecord(record, payload);
      return { record };
    }
  }

  await saveBackupRecord(record, payload);
  await enforceRetentionPolicy(schedule);

  return { record };
}

function makeFailedRecord(
  type: BackupType,
  cloudProvider: CloudProviderId,
  reason: string
): BackupRecord {
  return {
    id: uuidv4(),
    type,
    createdAt: new Date().toISOString(),
    sizeBytes: 0,
    encrypted: false,
    checksum: '',
    parentId: null,
    cloudProvider,
    cloudFileId: null,
    status: 'failed',
    label: reason,
  };
}

export async function updateSchedule(config: BackupScheduleConfig): Promise<void> {
  await saveScheduleConfig(config);
}

export async function getBackupHistory(): Promise<BackupRecord[]> {
  return listBackupRecords();
}

export async function runScheduledBackup(
  store: Record<string, unknown>,
  passphrase?: string
): Promise<CreateBackupResult> {
  const schedule = await getScheduleConfig();
  return createBackup(store, {
    type: schedule.backupType,
    encrypt: schedule.encrypt,
    passphrase,
    cloudProvider: schedule.cloudProvider,
    label: 'Scheduled backup',
  });
}

export async function exportBackupFile(
  backupId: string,
  encrypt?: boolean,
  passphrase?: string
): Promise<string> {
  const payload = await getBackupPayload(backupId);
  if (!payload) throw new Error('Backup not found.');

  if (encrypt && passphrase) {
    const envelope = await encryptBackupPayload(payload, passphrase);
    return JSON.stringify(envelope, null, 2);
  }

  return JSON.stringify(payload, null, 2);
}
