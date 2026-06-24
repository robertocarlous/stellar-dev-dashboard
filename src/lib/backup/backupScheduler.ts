/**
 * Cron-based backup scheduler — runs in the browser while the app is open.
 */

import type { BackupScheduleConfig } from './types';
import { cronMatches, resolveCronExpression } from './cronScheduler';
import { getScheduleConfig } from './backupStorage';

type BackupCallback = () => Promise<void>;

let intervalId: ReturnType<typeof setInterval> | null = null;
let lastRunMinute: string | null = null;
let onBackup: BackupCallback | null = null;

export function startBackupScheduler(callback: BackupCallback): void {
  onBackup = callback;
  if (intervalId) return;

  intervalId = setInterval(() => {
    void tick();
  }, 30_000);

  void tick();
}

export function stopBackupScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  lastRunMinute = null;
  onBackup = null;
}

async function tick(): Promise<void> {
  if (!onBackup) return;

  const config = await getScheduleConfig();
  if (!config.enabled) return;

  const cron = resolveCronExpression(config.frequency, config.cronExpression);
  const now = new Date();
  const minuteKey = `${now.toISOString().slice(0, 16)}`;

  if (lastRunMinute === minuteKey) return;
  if (!cronMatches(cron, now)) return;

  lastRunMinute = minuteKey;
  try {
    await onBackup();
  } catch (err) {
    console.error('[backup-scheduler] Scheduled backup failed:', err);
  }
}

export async function getNextScheduledRun(
  config: BackupScheduleConfig
): Promise<Date | null> {
  if (!config.enabled) return null;
  const { getNextCronRun } = await import('./cronScheduler');
  const cron = resolveCronExpression(config.frequency, config.cronExpression);
  return getNextCronRun(cron);
}
