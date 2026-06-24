import { describe, it, expect } from 'vitest';
import {
  buildFullPayload,
  buildIncrementalPayload,
  computeChecksum,
} from '../../../../src/lib/backup/backupPayload';

describe('backupPayload', () => {
  const snapshot = {
    connectedAddress: 'GABC123',
    network: 'testnet',
    theme: 'dark',
    activeTab: 'overview',
    watchedAddresses: ['GDEF456'],
    customNetworks: [],
  };

  it('builds a full backup payload with checksum', async () => {
    const payload = await buildFullPayload(snapshot);
    expect(payload.version).toBe(2);
    expect(payload.backupType).toBe('full');
    expect(payload.checksum).toHaveLength(64);
    expect(payload.account.connectedAddress).toBe('GABC123');
  });

  it('detects no changes for incremental backup', async () => {
    const full = await buildFullPayload(snapshot);
    const incremental = await buildIncrementalPayload(snapshot, full);
    expect(incremental).toBeNull();
  });

  it('builds incremental payload when data changes', async () => {
    const full = await buildFullPayload(snapshot);
    const changed = { ...snapshot, theme: 'light' };
    const incremental = await buildIncrementalPayload(changed, full);
    expect(incremental).not.toBeNull();
    expect(incremental?.backupType).toBe('incremental');
    expect(incremental?.changedFields).toContain('theme');
    expect(incremental?.parentChecksum).toBe(full.checksum);
  });

  it('computes stable checksums', async () => {
    const a = await computeChecksum({ foo: 'bar' });
    const b = await computeChecksum({ foo: 'bar' });
    expect(a).toBe(b);
  });
});
