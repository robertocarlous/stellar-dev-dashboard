/** Backup & restore type definitions (D-030). */

export type BackupType = 'full' | 'incremental';

export type BackupFrequency = 'hourly' | 'daily' | 'weekly' | 'custom';

export type CloudProviderId = 'google-drive' | 'dropbox' | 'onedrive' | 'local';

export type ConflictStrategy = 'overwrite' | 'merge' | 'skip';

export type RestoreField =
  | 'theme'
  | 'network'
  | 'watchedAddresses'
  | 'customNetworks'
  | 'activeTab'
  | 'connectedAddress';

export interface BackupScheduleConfig {
  enabled: boolean;
  frequency: BackupFrequency;
  /** Cron expression used when frequency is 'custom'. Default: daily at 02:00 */
  cronExpression: string;
  backupType: BackupType;
  encrypt: boolean;
  cloudProvider: CloudProviderId;
  retentionDays: number;
  maxVersions: number;
}

export interface BackupRecord {
  id: string;
  type: BackupType;
  createdAt: string;
  sizeBytes: number;
  encrypted: boolean;
  checksum: string;
  parentId: string | null;
  cloudProvider: CloudProviderId;
  cloudFileId: string | null;
  status: 'success' | 'failed';
  label?: string;
}

export interface BackupPayloadV2 {
  format: 'stellar-dev-dashboard.backup';
  version: 2;
  backupType: BackupType;
  exportedAt: string;
  checksum: string;
  parentChecksum: string | null;
  account: {
    connectedAddress: string | null;
    network: string;
  };
  watchedAddresses: string[];
  customNetworks: unknown[];
  theme: string;
  activeTab: string;
  /** Incremental backups only include changed sections */
  changedFields?: RestoreField[];
}

export interface CloudProviderConfig {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  folderId?: string;
}

export interface RestoreOptions {
  fields: RestoreField[];
  conflictStrategy: ConflictStrategy;
}

export interface RestoreConflict {
  field: RestoreField;
  currentValue: unknown;
  backupValue: unknown;
}

export interface RestorePreview {
  valid: boolean;
  errors: string[];
  conflicts: RestoreConflict[];
  fieldsAvailable: RestoreField[];
}

export interface BackupAnalytics {
  totalBackups: number;
  successfulBackups: number;
  failedBackups: number;
  successRate: number;
  totalSizeBytes: number;
  averageSizeBytes: number;
  lastBackupAt: string | null;
  lastBackupType: BackupType | null;
  backupsByType: Record<BackupType, number>;
  backupsByProvider: Record<string, number>;
}

export const DEFAULT_SCHEDULE: BackupScheduleConfig = {
  enabled: false,
  frequency: 'daily',
  cronExpression: '0 2 * * *',
  backupType: 'full',
  encrypt: true,
  cloudProvider: 'local',
  retentionDays: 30,
  maxVersions: 20,
};

export const RESTORE_FIELDS: RestoreField[] = [
  'theme',
  'network',
  'watchedAddresses',
  'customNetworks',
  'activeTab',
  'connectedAddress',
];

export const FREQUENCY_CRON: Record<Exclude<BackupFrequency, 'custom'>, string> = {
  hourly: '0 * * * *',
  daily: '0 2 * * *',
  weekly: '0 2 * * 0',
};
