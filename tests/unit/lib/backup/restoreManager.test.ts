import { describe, it, expect, vi } from 'vitest';
import {
  previewRestore,
  applySelectiveRestore,
  validateBackupPayload,
  parseBackupData,
} from '../../../../src/lib/backup/restoreManager';
import type { RestoreField } from '../../../../src/lib/backup/types';

describe('restoreManager', () => {
  const backup = {
    format: 'stellar-dev-dashboard.backup',
    version: 2,
    backupType: 'full' as const,
    exportedAt: '2026-06-24T00:00:00.000Z',
    checksum: 'abc',
    parentChecksum: null,
    account: { connectedAddress: 'GNEW123', network: 'mainnet' },
    watchedAddresses: ['GWATCH1'],
    customNetworks: [],
    theme: 'light',
    activeTab: 'settings',
  };

  const store = {
    connectedAddress: 'GOLD123',
    network: 'testnet',
    theme: 'dark',
    activeTab: 'overview',
    watchedAddresses: ['GWATCH2'],
    customNetworks: [],
    setNetwork: vi.fn(),
    setConnectedAddress: vi.fn(),
    setActiveTab: vi.fn(),
  };

  it('validates backup payload', () => {
    expect(validateBackupPayload(backup)).toHaveLength(0);
    expect(validateBackupPayload({ version: 1 })).not.toHaveLength(0);
  });

  it('parses v2 backup format', () => {
    const result = parseBackupData(backup);
    expect(result.ok).toBe(true);
  });

  it('detects conflicts in preview', () => {
    const fields: RestoreField[] = ['theme', 'network'];
    const preview = previewRestore(backup, store, {
      fields,
      conflictStrategy: 'overwrite',
    });
    expect(preview.valid).toBe(true);
    expect(preview.conflicts.length).toBe(2);
    expect(preview.conflicts.map((c) => c.field)).toContain('theme');
  });

  it('applies selective restore with overwrite', () => {
    const result = applySelectiveRestore(backup, store, {
      fields: ['theme', 'network'],
      conflictStrategy: 'overwrite',
    });
    expect(result.ok).toBe(true);
    expect(store.setNetwork).toHaveBeenCalledWith('mainnet');
  });

  it('merges watched addresses on conflict', () => {
    const mergeStore = { ...store, setWatchedAddresses: vi.fn() };
    applySelectiveRestore(backup, mergeStore, {
      fields: ['watchedAddresses'],
      conflictStrategy: 'merge',
    });
    expect(mergeStore.setWatchedAddresses).toHaveBeenCalledWith(
      expect.arrayContaining(['GWATCH1', 'GWATCH2'])
    );
  });
});
