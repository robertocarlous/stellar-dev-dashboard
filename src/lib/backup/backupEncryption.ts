/**
 * Backup encryption — wraps AES-GCM encryption for backup payloads.
 */

import { encrypt, decrypt } from '../encryption.js';

export interface EncryptedBackupEnvelope {
  format: 'stellar-dev-dashboard.backup.encrypted';
  version: 1;
  encrypted: { ciphertext: string; iv: string; salt: string };
  exportedAt: string;
  backupType: 'full' | 'incremental';
}

export async function encryptBackupPayload(
  payload: unknown,
  passphrase: string
): Promise<EncryptedBackupEnvelope> {
  const plaintext = JSON.stringify(payload);
  const encrypted = await encrypt(plaintext, passphrase);
  return {
    format: 'stellar-dev-dashboard.backup.encrypted',
    version: 1,
    encrypted,
    exportedAt: new Date().toISOString(),
    backupType: (payload as { backupType?: string }).backupType === 'incremental'
      ? 'incremental'
      : 'full',
  };
}

export async function decryptBackupPayload<T = unknown>(
  envelope: EncryptedBackupEnvelope,
  passphrase: string
): Promise<T> {
  const plaintext = await decrypt(
    envelope.encrypted.ciphertext,
    passphrase,
    envelope.encrypted.iv,
    envelope.encrypted.salt
  );
  return JSON.parse(plaintext) as T;
}

export function isEncryptedEnvelope(data: unknown): data is EncryptedBackupEnvelope {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as EncryptedBackupEnvelope).format === 'stellar-dev-dashboard.backup.encrypted'
  );
}
