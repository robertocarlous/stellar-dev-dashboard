/**
 * useBackupRestore — React hook for backup scheduling, restore, and cloud sync.
 */

import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import {
  createBackup,
  getBackupHistory,
  runScheduledBackup,
  updateSchedule,
  exportBackupFile,
} from '../lib/backup/backupManager';
import {
  computeBackupAnalytics,
  formatBytes,
  enforceRetentionPolicy,
} from '../lib/backup/backupHistory';
import {
  getScheduleConfig,
  getBackupPayload,
  deleteBackupRecord,
} from '../lib/backup/backupStorage';
import {
  startBackupScheduler,
  stopBackupScheduler,
  getNextScheduledRun,
} from '../lib/backup/backupScheduler';
import {
  applySelectiveRestore,
  previewRestore,
  validateBackupPayload,
} from '../lib/backup/restoreManager';
import {
  decryptBackupPayload,
  isEncryptedEnvelope,
} from '../lib/backup/backupEncryption';
import {
  connectCloudProvider,
  disconnectCloudProvider,
  isCloudProviderConnected,
  listCloudProviders,
} from '../lib/backup/cloudProviders';
import { downloadFile } from '../utils/export';
import { readFileAsText } from '../lib/import';
import type {
  BackupAnalytics,
  BackupRecord,
  BackupScheduleConfig,
  CloudProviderId,
  ConflictStrategy,
  RestoreField,
  RestorePreview,
} from '../lib/backup/types';
import { RESTORE_FIELDS } from '../lib/backup/types';

export function useBackupRestore() {
  const store = useStore();
  const [history, setHistory] = useState<BackupRecord[]>([]);
  const [schedule, setSchedule] = useState<BackupScheduleConfig | null>(null);
  const [analytics, setAnalytics] = useState<BackupAnalytics | null>(null);
  const [nextRun, setNextRun] = useState<Date | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cloudStatus, setCloudStatus] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    const [records, config, stats] = await Promise.all([
      getBackupHistory(),
      getScheduleConfig(),
      computeBackupAnalytics(),
    ]);
    setHistory(records);
    setSchedule(config);
    setAnalytics(stats);
    setNextRun(await getNextScheduledRun(config));

    const status: Record<string, boolean> = {};
    for (const provider of ['google-drive', 'dropbox', 'onedrive', 'local'] as CloudProviderId[]) {
      status[provider] = await isCloudProviderConnected(provider);
    }
    setCloudStatus(status);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    startBackupScheduler(async () => {
      const config = await getScheduleConfig();
      if (!config.enabled) return;
      await runScheduledBackup(store as unknown as Record<string, unknown>);
      await refresh();
    });
    return () => stopBackupScheduler();
  }, [store, refresh]);

  const runBackup = useCallback(
    async (passphrase?: string) => {
      setIsBackingUp(true);
      setError(null);
      setSuccess(null);
      try {
        const result = await createBackup(store as unknown as Record<string, unknown>, {
          passphrase,
        });
        if (result.skipped) {
          setSuccess(result.reason ?? 'No changes to back up.');
        } else if (result.record.status === 'success') {
          setSuccess(`Backup created (${result.record.type}, ${formatBytes(result.record.sizeBytes)}).`);
        } else {
          setError(result.record.label ?? 'Backup failed.');
        }
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Backup failed.');
      } finally {
        setIsBackingUp(false);
      }
    },
    [store, refresh]
  );

  const saveSchedule = useCallback(
    async (config: BackupScheduleConfig) => {
      await updateSchedule(config);
      await enforceRetentionPolicy(config);
      await refresh();
      setSuccess('Backup schedule saved.');
    },
    [refresh]
  );

  const restoreFromBackup = useCallback(
    async (
      backupId: string,
      fields: RestoreField[],
      conflictStrategy: ConflictStrategy,
      passphrase?: string
    ) => {
      setIsRestoring(true);
      setError(null);
      setSuccess(null);
      try {
        let payload = await getBackupPayload(backupId);
        if (!payload) throw new Error('Backup not found.');

        if (isEncryptedEnvelope(payload)) {
          if (!passphrase) throw new Error('Passphrase required to decrypt backup.');
          payload = await decryptBackupPayload(payload, passphrase);
        }

        const result = applySelectiveRestore(
          payload,
          store as unknown as Record<string, unknown>,
          { fields, conflictStrategy }
        );

        if (!result.ok) {
          setError(result.error ?? 'Restore failed.');
          return;
        }

        setSuccess(`Restored ${result.appliedFields.join(', ')}.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Restore failed.');
      } finally {
        setIsRestoring(false);
      }
    },
    [store]
  );

  const restoreFromFile = useCallback(
    async (
      file: File,
      fields: RestoreField[],
      conflictStrategy: ConflictStrategy,
      passphrase?: string
    ) => {
      setIsRestoring(true);
      setError(null);
      setSuccess(null);
      try {
        const text = await readFileAsText(file);
        let parsed: unknown = JSON.parse(text);

        if (isEncryptedEnvelope(parsed)) {
          if (!passphrase) throw new Error('Passphrase required to decrypt backup.');
          parsed = await decryptBackupPayload(parsed, passphrase);
        }

        const errors = validateBackupPayload(parsed);
        if (errors.length > 0) {
          setError(errors.join(' '));
          return;
        }

        const result = applySelectiveRestore(
          parsed,
          store as unknown as Record<string, unknown>,
          { fields, conflictStrategy }
        );

        if (!result.ok) {
          setError(result.error ?? 'Restore failed.');
          return;
        }

        setSuccess(`Restored ${result.appliedFields.join(', ')} from file.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Restore failed.');
      } finally {
        setIsRestoring(false);
      }
    },
    [store]
  );

  const previewFileRestore = useCallback(
    async (
      file: File,
      fields: RestoreField[],
      conflictStrategy: ConflictStrategy,
      passphrase?: string
    ): Promise<RestorePreview | null> => {
      try {
        const text = await readFileAsText(file);
        let parsed: unknown = JSON.parse(text);

        if (isEncryptedEnvelope(parsed)) {
          if (!passphrase) return null;
          parsed = await decryptBackupPayload(parsed, passphrase);
        }

        return previewRestore(parsed, store as unknown as Record<string, unknown>, {
          fields,
          conflictStrategy,
        });
      } catch {
        return null;
      }
    },
    [store]
  );

  const previewBackupRestore = useCallback(
    async (
      backupId: string,
      fields: RestoreField[],
      conflictStrategy: ConflictStrategy,
      passphrase?: string
    ): Promise<RestorePreview | null> => {
      try {
        let payload = await getBackupPayload(backupId);
        if (!payload) return null;

        if (isEncryptedEnvelope(payload)) {
          if (!passphrase) return null;
          payload = await decryptBackupPayload(payload, passphrase);
        }

        return previewRestore(payload, store as unknown as Record<string, unknown>, {
          fields,
          conflictStrategy,
        });
      } catch {
        return null;
      }
    },
    [store]
  );

  const downloadBackup = useCallback(async (backupId: string) => {
    const content = await exportBackupFile(backupId);
    downloadFile(content, `stellar-backup-${backupId.slice(0, 8)}`);
  }, []);

  const removeBackup = useCallback(
    async (backupId: string) => {
      await deleteBackupRecord(backupId);
      await refresh();
      setSuccess('Backup deleted.');
    },
    [refresh]
  );

  const connectCloud = useCallback(
    async (provider: CloudProviderId, accessToken: string, folderId?: string) => {
      await connectCloudProvider(provider, { accessToken, folderId });
      await refresh();
      setSuccess(`${provider} connected.`);
    },
    [refresh]
  );

  const disconnectCloud = useCallback(
    async (provider: CloudProviderId) => {
      await disconnectCloudProvider(provider);
      await refresh();
      setSuccess(`${provider} disconnected.`);
    },
    [refresh]
  );

  return {
    history,
    schedule,
    analytics,
    nextRun,
    isBackingUp,
    isRestoring,
    error,
    success,
    cloudStatus,
    cloudProviders: listCloudProviders(),
    restoreFields: RESTORE_FIELDS,
    refresh,
    runBackup,
    saveSchedule,
    restoreFromBackup,
    restoreFromFile,
    previewFileRestore,
    previewBackupRestore,
    downloadBackup,
    removeBackup,
    connectCloud,
    disconnectCloud,
    clearMessages: () => {
      setError(null);
      setSuccess(null);
    },
  };
}
