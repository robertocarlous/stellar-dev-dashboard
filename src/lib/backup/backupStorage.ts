/**
 * IndexedDB storage for backup versions and schedule configuration.
 */

import type {
  BackupRecord,
  BackupScheduleConfig,
  CloudProviderConfig,
  CloudProviderId,
} from './types';
import { DEFAULT_SCHEDULE } from './types';

const DB_NAME = 'stellar-backup-store';
const DB_VERSION = 1;

const STORES = {
  BACKUPS: 'backups',
  PAYLOADS: 'backup-payloads',
  SCHEDULE: 'schedule',
  CLOUD_TOKENS: 'cloud-tokens',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORES.BACKUPS)) {
        const store = db.createObjectStore(STORES.BACKUPS, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.PAYLOADS)) {
        db.createObjectStore(STORES.PAYLOADS, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(STORES.SCHEDULE)) {
        db.createObjectStore(STORES.SCHEDULE);
      }

      if (!db.objectStoreNames.contains(STORES.CLOUD_TOKENS)) {
        db.createObjectStore(STORES.CLOUD_TOKENS, { keyPath: 'provider' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

async function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = fn(store);

    if (request) {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } else {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    }
  });
}

export async function saveBackupRecord(
  record: BackupRecord,
  payload: unknown
): Promise<void> {
  await tx(STORES.BACKUPS, 'readwrite', (s) => s.put(record));
  await tx(STORES.PAYLOADS, 'readwrite', (s) => s.put({ id: record.id, payload }));
}

export async function getBackupRecord(id: string): Promise<BackupRecord | null> {
  const record = (await tx(STORES.BACKUPS, 'readonly', (s) => s.get(id))) as
    | BackupRecord
    | undefined;
  return record ?? null;
}

export async function getBackupPayload(id: string): Promise<unknown | null> {
  const entry = (await tx(STORES.PAYLOADS, 'readonly', (s) => s.get(id))) as
    | { id: string; payload: unknown }
    | undefined;
  return entry?.payload ?? null;
}

export async function listBackupRecords(): Promise<BackupRecord[]> {
  const records = (await tx(STORES.BACKUPS, 'readonly', (s) => s.getAll())) as
    | BackupRecord[]
    | undefined;
  return (records ?? []).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function deleteBackupRecord(id: string): Promise<void> {
  await tx(STORES.BACKUPS, 'readwrite', (s) => s.delete(id));
  await tx(STORES.PAYLOADS, 'readwrite', (s) => s.delete(id));
}

export async function getScheduleConfig(): Promise<BackupScheduleConfig> {
  const config = (await tx(STORES.SCHEDULE, 'readonly', (s) => s.get('config'))) as
    | BackupScheduleConfig
    | undefined;
  return config ?? { ...DEFAULT_SCHEDULE };
}

export async function saveScheduleConfig(config: BackupScheduleConfig): Promise<void> {
  await tx(STORES.SCHEDULE, 'readwrite', (s) => s.put(config, 'config'));
}

export async function saveCloudToken(
  provider: CloudProviderId,
  config: CloudProviderConfig
): Promise<void> {
  await tx(STORES.CLOUD_TOKENS, 'readwrite', (s) =>
    s.put({ provider, ...config, updatedAt: Date.now() })
  );
}

export async function getCloudToken(
  provider: CloudProviderId
): Promise<CloudProviderConfig | null> {
  const entry = (await tx(STORES.CLOUD_TOKENS, 'readonly', (s) =>
    s.get(provider)
  )) as (CloudProviderConfig & { provider: string }) | undefined;
  if (!entry) return null;
  const { accessToken, refreshToken, expiresAt, folderId } = entry;
  return { accessToken, refreshToken, expiresAt, folderId };
}

export async function removeCloudToken(provider: CloudProviderId): Promise<void> {
  await tx(STORES.CLOUD_TOKENS, 'readwrite', (s) => s.delete(provider));
}

export async function getLatestSuccessfulBackup(): Promise<BackupRecord | null> {
  const records = await listBackupRecords();
  return records.find((r) => r.status === 'success') ?? null;
}
