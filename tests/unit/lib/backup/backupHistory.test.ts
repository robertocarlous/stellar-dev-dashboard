import { describe, it, expect, vi } from 'vitest';
import { formatBytes, computeBackupAnalytics } from '../../../../src/lib/backup/backupHistory';
import type { BackupRecord } from '../../../../src/lib/backup/types';

vi.mock('../../../../src/lib/backup/backupStorage', () => ({
  listBackupRecords: vi.fn(),
  deleteBackupRecord: vi.fn(),
}));

import { listBackupRecords } from '../../../../src/lib/backup/backupStorage';

describe('backupHistory', () => {
  it('formats bytes correctly', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
  });

  it('computes analytics from records', async () => {
    const records: BackupRecord[] = [
      {
        id: '1',
        type: 'full',
        createdAt: '2026-06-24T10:00:00Z',
        sizeBytes: 1000,
        encrypted: false,
        checksum: 'a',
        parentId: null,
        cloudProvider: 'local',
        cloudFileId: null,
        status: 'success',
      },
      {
        id: '2',
        type: 'incremental',
        createdAt: '2026-06-23T10:00:00Z',
        sizeBytes: 200,
        encrypted: true,
        checksum: 'b',
        parentId: '1',
        cloudProvider: 'local',
        cloudFileId: null,
        status: 'failed',
      },
    ];

    vi.mocked(listBackupRecords).mockResolvedValue(records);

    const analytics = await computeBackupAnalytics();
    expect(analytics.totalBackups).toBe(2);
    expect(analytics.successfulBackups).toBe(1);
    expect(analytics.failedBackups).toBe(1);
    expect(analytics.successRate).toBe(50);
    expect(analytics.backupsByType.full).toBe(1);
    expect(analytics.backupsByType.incremental).toBe(1);
  });
});
