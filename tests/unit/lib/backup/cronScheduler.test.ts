import { describe, it, expect } from 'vitest';
import { cronMatches, parseCron, resolveCronExpression, getNextCronRun } from '../../../../src/lib/backup/cronScheduler';

describe('cronScheduler', () => {
  it('matches daily at 02:00', () => {
    const date = new Date('2026-06-24T02:00:00');
    expect(cronMatches('0 2 * * *', date)).toBe(true);
  });

  it('does not match daily at 03:00', () => {
    const date = new Date('2026-06-24T03:00:00');
    expect(cronMatches('0 2 * * *', date)).toBe(false);
  });

  it('parses five-field cron expression', () => {
    const fields = parseCron('0 2 * * *');
    expect(fields).toHaveLength(5);
    expect(fields[0]).toContain(0);
    expect(fields[1]).toContain(2);
  });

  it('resolves frequency presets', () => {
    expect(resolveCronExpression('hourly', '')).toBe('0 * * * *');
    expect(resolveCronExpression('daily', '')).toBe('0 2 * * *');
    expect(resolveCronExpression('custom', '30 4 * * 1')).toBe('30 4 * * 1');
  });

  it('finds next cron run', () => {
    const from = new Date('2026-06-24T01:00:00');
    const next = getNextCronRun('0 2 * * *', from);
    expect(next.getHours()).toBe(2);
    expect(next.getMinutes()).toBe(0);
  });
});
