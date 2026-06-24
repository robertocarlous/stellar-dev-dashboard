import React, { useRef, useState } from 'react';
import { useBackupRestore } from '../../hooks/useBackupRestore';
import { formatBytes } from '../../lib/backup/backupHistory';
import type {
  BackupFrequency,
  BackupType,
  CloudProviderId,
  ConflictStrategy,
  RestoreField,
} from '../../lib/backup/types';

interface ActionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
}

function ActionButton({
  onClick,
  disabled,
  children,
  variant = 'primary',
}: ActionButtonProps) {
  const base: React.CSSProperties = {
    padding: '9px 18px',
    borderRadius: 'var(--radius-md)',
    fontSize: '12px',
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    border: 'none',
    transition: 'var(--transition)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  };
  const styles: React.CSSProperties =
    variant === 'primary'
      ? { ...base, background: 'var(--cyan)', color: '#000' }
      : variant === 'danger'
        ? { ...base, background: 'var(--red-glow)', color: 'var(--red)', border: '1px solid var(--red)' }
        : {
            ...base,
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-bright)',
          };
  return (
    <button type="button" style={styles} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: '13px',
        }}
      >
        {title}
      </div>
      <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {children}
      </div>
    </div>
  );
}

function StatusMessage({ error, success }: { error?: string | null; success?: string | null }) {
  if (!error && !success) return null;
  return (
    <div
      role="alert"
      style={{
        padding: '8px 12px',
        borderRadius: 'var(--radius-md)',
        fontSize: '12px',
        background: error ? 'var(--red-glow)' : 'var(--green-glow)',
        border: `1px solid ${error ? 'var(--red)' : 'var(--green)'}`,
        color: error ? 'var(--red)' : 'var(--green)',
      }}
    >
      {error || success}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  marginBottom: '4px',
  display: 'block',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  fontSize: '12px',
};

export default function BackupRestore() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    history,
    schedule,
    analytics,
    nextRun,
    isBackingUp,
    isRestoring,
    error,
    success,
    cloudStatus,
    cloudProviders,
    restoreFields,
    runBackup,
    saveSchedule,
    restoreFromBackup,
    restoreFromFile,
    previewBackupRestore,
    downloadBackup,
    removeBackup,
    connectCloud,
    disconnectCloud,
    clearMessages,
  } = useBackupRestore();

  const [passphrase, setPassphrase] = useState('');
  const [selectedFields, setSelectedFields] = useState<RestoreField[]>([...restoreFields]);
  const [conflictStrategy, setConflictStrategy] = useState<ConflictStrategy>('merge');
  const [selectedBackupId, setSelectedBackupId] = useState<string | null>(null);
  const [cloudToken, setCloudToken] = useState('');
  const [cloudFolder, setCloudFolder] = useState('stellar-backups');
  const [selectedProvider, setSelectedProvider] = useState<CloudProviderId>('google-drive');
  const [conflicts, setConflicts] = useState<string[]>([]);

  const toggleField = (field: RestoreField) => {
    setSelectedFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  };

  const handleScheduleChange = async (patch: Partial<NonNullable<typeof schedule>>) => {
    if (!schedule) return;
    await saveSchedule({ ...schedule, ...patch });
  };

  const handlePreviewRestore = async () => {
    if (!selectedBackupId) return;
    const preview = await previewBackupRestore(
      selectedBackupId,
      selectedFields,
      conflictStrategy,
      passphrase || undefined
    );
    setConflicts(preview?.conflicts.map((c) => c.field) ?? []);
  };

  const handleRestore = async () => {
    if (selectedBackupId) {
      await restoreFromBackup(
        selectedBackupId,
        selectedFields,
        conflictStrategy,
        passphrase || undefined
      );
    }
  };

  const handleFileRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void restoreFromFile(file, selectedFields, conflictStrategy, passphrase || undefined);
      e.target.value = '';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '4px' }}>
      <StatusMessage error={error} success={success} />
      {(error || success) && (
        <ActionButton onClick={clearMessages} variant="secondary">
          Dismiss
        </ActionButton>
      )}

      {/* Analytics */}
      {analytics && (
        <Card title="Backup Analytics">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '12px',
            }}
          >
            {[
              ['Total', analytics.totalBackups],
              ['Success Rate', `${analytics.successRate}%`],
              ['Total Size', formatBytes(analytics.totalSizeBytes)],
              ['Full', analytics.backupsByType.full],
              ['Incremental', analytics.backupsByType.incremental],
            ].map(([label, value]) => (
              <div
                key={label as string}
                style={{
                  padding: '10px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{label}</div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>{value}</div>
              </div>
            ))}
          </div>
          {analytics.lastBackupAt && (
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
              Last backup: {new Date(analytics.lastBackupAt).toLocaleString()} (
              {analytics.lastBackupType})
            </p>
          )}
        </Card>
      )}

      {/* Schedule */}
      {schedule && (
        <Card title="Backup Schedule">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
            <input
              type="checkbox"
              checked={schedule.enabled}
              onChange={(e) => void handleScheduleChange({ enabled: e.target.checked })}
            />
            Enable scheduled backups
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Frequency</label>
              <select
                style={inputStyle}
                value={schedule.frequency}
                onChange={(e) =>
                  void handleScheduleChange({ frequency: e.target.value as BackupFrequency })
                }
              >
                <option value="hourly">Hourly</option>
                <option value="daily">Daily (02:00)</option>
                <option value="weekly">Weekly (Sunday 02:00)</option>
                <option value="custom">Custom cron</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Backup Type</label>
              <select
                style={inputStyle}
                value={schedule.backupType}
                onChange={(e) =>
                  void handleScheduleChange({ backupType: e.target.value as BackupType })
                }
              >
                <option value="full">Full</option>
                <option value="incremental">Incremental</option>
              </select>
            </div>
          </div>

          {schedule.frequency === 'custom' && (
            <div>
              <label style={labelStyle}>Cron Expression (min hour day month weekday)</label>
              <input
                style={inputStyle}
                value={schedule.cronExpression}
                onChange={(e) => void handleScheduleChange({ cronExpression: e.target.value })}
                placeholder="0 2 * * *"
              />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Retention (days)</label>
              <input
                type="number"
                style={inputStyle}
                min={1}
                max={365}
                value={schedule.retentionDays}
                onChange={(e) =>
                  void handleScheduleChange({ retentionDays: parseInt(e.target.value, 10) })
                }
              />
            </div>
            <div>
              <label style={labelStyle}>Max Versions</label>
              <input
                type="number"
                style={inputStyle}
                min={1}
                max={100}
                value={schedule.maxVersions}
                onChange={(e) =>
                  void handleScheduleChange({ maxVersions: parseInt(e.target.value, 10) })
                }
              />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
            <input
              type="checkbox"
              checked={schedule.encrypt}
              onChange={(e) => void handleScheduleChange({ encrypt: e.target.checked })}
            />
            Encrypt backups (AES-256-GCM)
          </label>

          {nextRun && schedule.enabled && (
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
              Next scheduled run: {nextRun.toLocaleString()}
            </p>
          )}

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <ActionButton
              onClick={() => void runBackup(schedule.encrypt ? passphrase : undefined)}
              disabled={isBackingUp || (schedule.encrypt && !passphrase)}
            >
              {isBackingUp ? '⏳ Backing up…' : '💾 Run Backup Now'}
            </ActionButton>
          </div>

          {schedule.encrypt && (
            <div>
              <label style={labelStyle}>Encryption Passphrase</label>
              <input
                type="password"
                style={inputStyle}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Required for encrypted backups"
                aria-label="Backup encryption passphrase"
              />
            </div>
          )}
        </Card>
      )}

      {/* Cloud Providers */}
      <Card title="Cloud Storage">
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
          Connect Google Drive, Dropbox, or OneDrive using an OAuth access token. Tokens are stored
          locally in IndexedDB.
        </p>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {cloudProviders.map((p) => (
            <span
              key={p.id}
              style={{
                fontSize: '11px',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                background: cloudStatus[p.id] ? 'var(--green-glow)' : 'var(--bg-elevated)',
                border: `1px solid ${cloudStatus[p.id] ? 'var(--green)' : 'var(--border)'}`,
                color: cloudStatus[p.id] ? 'var(--green)' : 'var(--text-muted)',
              }}
            >
              {p.label} {cloudStatus[p.id] ? '✓' : '—'}
            </span>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Provider</label>
            <select
              style={inputStyle}
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value as CloudProviderId)}
            >
              <option value="google-drive">Google Drive</option>
              <option value="dropbox">Dropbox</option>
              <option value="onedrive">OneDrive</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Folder</label>
            <input
              style={inputStyle}
              value={cloudFolder}
              onChange={(e) => setCloudFolder(e.target.value)}
              placeholder="stellar-backups"
            />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Access Token</label>
          <input
            type="password"
            style={inputStyle}
            value={cloudToken}
            onChange={(e) => setCloudToken(e.target.value)}
            placeholder="Paste OAuth access token"
            aria-label="Cloud provider access token"
          />
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <ActionButton
            onClick={() =>
              void connectCloud(selectedProvider, cloudToken, cloudFolder || undefined)
            }
            disabled={!cloudToken}
            variant="secondary"
          >
            Connect
          </ActionButton>
          {cloudStatus[selectedProvider] && (
            <ActionButton
              onClick={() => void disconnectCloud(selectedProvider)}
              variant="danger"
            >
              Disconnect
            </ActionButton>
          )}
        </div>
      </Card>

      {/* History */}
      <Card title="Backup History">
        {history.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
            No backups yet. Run a manual or scheduled backup to get started.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {history.map((record) => (
              <div
                key={record.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-elevated)',
                  border: `1px solid ${selectedBackupId === record.id ? 'var(--cyan)' : 'var(--border)'}`,
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedBackupId(record.id)}
                onKeyDown={(e) => e.key === 'Enter' && setSelectedBackupId(record.id)}
                role="button"
                tabIndex={0}
                aria-label={`Select backup from ${record.createdAt}`}
              >
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600 }}>
                    {record.type} · {record.status === 'success' ? '✅' : '❌'}{' '}
                    {record.encrypted ? '🔒' : ''}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {new Date(record.createdAt).toLocaleString()} ·{' '}
                    {formatBytes(record.sizeBytes)} · {record.cloudProvider}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                  <ActionButton onClick={() => void downloadBackup(record.id)} variant="secondary">
                    ⬇
                  </ActionButton>
                  <ActionButton onClick={() => void removeBackup(record.id)} variant="danger">
                    ✕
                  </ActionButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Restore */}
      <Card title="Restore">
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
          Selectively restore fields from a backup. Conflicts can be merged, overwritten, or skipped.
        </p>

        <div>
          <label style={labelStyle}>Fields to Restore</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {restoreFields.map((field) => (
              <label
                key={field}
                style={{
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-sm)',
                  background: selectedFields.includes(field)
                    ? 'var(--cyan-glow)'
                    : 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedFields.includes(field)}
                  onChange={() => toggleField(field)}
                />
                {field}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Conflict Resolution</label>
          <select
            style={inputStyle}
            value={conflictStrategy}
            onChange={(e) => setConflictStrategy(e.target.value as ConflictStrategy)}
          >
            <option value="merge">Merge (combine lists)</option>
            <option value="overwrite">Overwrite (use backup value)</option>
            <option value="skip">Skip conflicting fields</option>
          </select>
        </div>

        {conflicts.length > 0 && (
          <p style={{ fontSize: '11px', color: 'var(--red)', margin: 0 }}>
            Conflicts detected in: {conflicts.join(', ')}
          </p>
        )}

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <ActionButton
            onClick={() => void handlePreviewRestore()}
            disabled={!selectedBackupId}
            variant="secondary"
          >
            Preview Conflicts
          </ActionButton>
          <ActionButton
            onClick={() => void handleRestore()}
            disabled={!selectedBackupId || isRestoring}
          >
            {isRestoring ? '⏳ Restoring…' : '⬆ Restore Selected Backup'}
          </ActionButton>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleFileRestore}
            aria-label="Select backup file to restore"
          />
          <ActionButton
            onClick={() => fileInputRef.current?.click()}
            disabled={isRestoring}
            variant="secondary"
          >
            ⬆ Restore from File
          </ActionButton>
        </div>
      </Card>
    </div>
  );
}
