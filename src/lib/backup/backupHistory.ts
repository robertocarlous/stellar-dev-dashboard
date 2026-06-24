/**
 * Backup version history, retention policy, and analytics.
 */

import type { BackupAnalytics, BackupRecord, BackupScheduleConfig } from './types';
import {
  deleteBackupRecord,
  listBackupRecords,
} from './backupStorage';

export async function enforceRetentionPolicy(
  config: BackupScheduleConfig
): Promise<number> {
  const records = await listBackupRecords();
  const now = Date.now();
  const maxAge = config.retentionDays * 24 * 60 * 60 * 1000;
  let deleted = 0;

  const toDelete: string[] = [];

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    const age = now - new Date(record.createdAt).getTime();
    if (age > maxAge) {
      toDelete.push(record.id);
    }
  }

  if (records.length - toDelete.length > config.maxVersions) {
    const overflow = records
      .filter((r) => !toDelete.includes(r.id))
      .slice(config.maxVersions);
    overflow.forEach((r) => toDelete.push(r.id));
  }

  const unique = [...new Set(toDelete)];
  for (const id of unique) {
    await deleteBackupRecord(id);
    deleted += 1;
  }

  return deleted;
}

export async function computeBackupAnalytics(): Promise<BackupAnalytics> {
  const records = await listBackupRecords();
  const successful = records.filter((r) => r.status === 'success');
  const failed = records.filter((r) => r.status === 'failed');
  const totalSize = successful.reduce((sum, r) => sum + r.sizeBytes, 0);

  const backupsByType = { full: 0, incremental: 0 };
  const backupsByProvider: Record<string, number> = {};

  for (const record of records) {
    backupsByType[record.type] += 1;
    backupsByProvider[record.cloudProvider] =
      (backupsByProvider[record.cloudProvider] ?? 0) + 1;
  }

  const last = successful[0] ?? null;

  return {
    totalBackups: records.length,
    successfulBackups: successful.length,
    failedBackups: failed.length,
    successRate:
      records.length > 0
        ? Math.round((successful.length / records.length) * 1000) / 10
        : 0,
    totalSizeBytes: totalSize,
    averageSizeBytes:
      successful.length > 0 ? Math.round(totalSize / successful.length) : 0,
    lastBackupAt: last?.createdAt ?? null,
    lastBackupType: last?.type ?? null,
    backupsByType,
    backupsByProvider,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function groupBackupsByDate(records: BackupRecord[]): Record<string, BackupRecord[]> {
  return records.reduce<Record<string, BackupRecord[]>>((groups, record) => {
    const date = record.createdAt.slice(0, 10);
    if (!groups[date]) groups[date] = [];
    groups[date].push(record);
    return groups;
  }, {});
}
