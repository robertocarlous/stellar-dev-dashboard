/**
 * Cloud provider integrations — Google Drive, Dropbox, OneDrive.
 * Uses REST APIs with user-provided OAuth access tokens stored locally.
 */

import type { CloudProviderConfig, CloudProviderId } from './types';
import { getCloudToken, saveCloudToken, removeCloudToken } from './backupStorage';

export interface CloudUploadResult {
  fileId: string;
  provider: CloudProviderId;
}

export interface CloudProvider {
  id: CloudProviderId;
  label: string;
  upload(filename: string, content: string, token: CloudProviderConfig): Promise<CloudUploadResult>;
  download(fileId: string, token: CloudProviderConfig): Promise<string>;
  isConfigured(token: CloudProviderConfig | null): boolean;
}

async function googleDriveUpload(
  filename: string,
  content: string,
  token: CloudProviderConfig
): Promise<CloudUploadResult> {
  const metadata = {
    name: filename,
    parents: token.folderId ? [token.folderId] : undefined,
  };

  const boundary = `backup_${Date.now()}`;
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    content,
    `--${boundary}--`,
  ].join('\r\n');

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!response.ok) {
    throw new Error(`Google Drive upload failed: ${response.status}`);
  }

  const data = (await response.json()) as { id: string };
  return { fileId: data.id, provider: 'google-drive' };
}

async function googleDriveDownload(
  fileId: string,
  token: CloudProviderConfig
): Promise<string> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token.accessToken}` } }
  );
  if (!response.ok) throw new Error(`Google Drive download failed: ${response.status}`);
  return response.text();
}

async function dropboxUpload(
  filename: string,
  content: string,
  token: CloudProviderConfig
): Promise<CloudUploadResult> {
  const path = `/${token.folderId ?? 'stellar-backups'}/${filename}`;
  const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({ path, mode: 'add', autorename: true }),
    },
    body: content,
  });

  if (!response.ok) throw new Error(`Dropbox upload failed: ${response.status}`);
  const data = (await response.json()) as { id: string };
  return { fileId: data.id, provider: 'dropbox' };
}

async function dropboxDownload(
  fileId: string,
  token: CloudProviderConfig
): Promise<string> {
  const response = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({ path: fileId }),
    },
  });
  if (!response.ok) throw new Error(`Dropbox download failed: ${response.status}`);
  return response.text();
}

async function oneDriveUpload(
  filename: string,
  content: string,
  token: CloudProviderConfig
): Promise<CloudUploadResult> {
  const folder = token.folderId ?? 'stellar-backups';
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/root:/${folder}/${filename}:/content`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: content,
    }
  );

  if (!response.ok) throw new Error(`OneDrive upload failed: ${response.status}`);
  const data = (await response.json()) as { id: string };
  return { fileId: data.id, provider: 'onedrive' };
}

async function oneDriveDownload(
  fileId: string,
  token: CloudProviderConfig
): Promise<string> {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`,
    { headers: { Authorization: `Bearer ${token.accessToken}` } }
  );
  if (!response.ok) throw new Error(`OneDrive download failed: ${response.status}`);
  return response.text();
}

const providers: Record<Exclude<CloudProviderId, 'local'>, CloudProvider> = {
  'google-drive': {
    id: 'google-drive',
    label: 'Google Drive',
    upload: googleDriveUpload,
    download: googleDriveDownload,
    isConfigured: (t) => Boolean(t?.accessToken),
  },
  dropbox: {
    id: 'dropbox',
    label: 'Dropbox',
    upload: dropboxUpload,
    download: dropboxDownload,
    isConfigured: (t) => Boolean(t?.accessToken),
  },
  onedrive: {
    id: 'onedrive',
    label: 'OneDrive',
    upload: oneDriveUpload,
    download: oneDriveDownload,
    isConfigured: (t) => Boolean(t?.accessToken),
  },
};

export function getCloudProvider(id: CloudProviderId): CloudProvider | null {
  if (id === 'local') return null;
  return providers[id] ?? null;
}

export function listCloudProviders(): CloudProvider[] {
  return Object.values(providers);
}

export async function connectCloudProvider(
  provider: CloudProviderId,
  config: CloudProviderConfig
): Promise<void> {
  await saveCloudToken(provider, config);
}

export async function disconnectCloudProvider(provider: CloudProviderId): Promise<void> {
  await removeCloudToken(provider);
}

export async function uploadToCloud(
  providerId: CloudProviderId,
  filename: string,
  content: string
): Promise<CloudUploadResult | null> {
  if (providerId === 'local') return null;

  const provider = getCloudProvider(providerId);
  if (!provider) throw new Error(`Unknown cloud provider: ${providerId}`);

  const token = await getCloudToken(providerId);
  if (!token || !provider.isConfigured(token)) {
    throw new Error(`${provider.label} is not connected. Add an access token in settings.`);
  }

  return provider.upload(filename, content, token);
}

export async function downloadFromCloud(
  providerId: CloudProviderId,
  fileId: string
): Promise<string> {
  const provider = getCloudProvider(providerId);
  if (!provider) throw new Error(`Unknown cloud provider: ${providerId}`);

  const token = await getCloudToken(providerId);
  if (!token) throw new Error(`${providerId} is not connected.`);

  return provider.download(fileId, token);
}

export async function isCloudProviderConnected(providerId: CloudProviderId): Promise<boolean> {
  if (providerId === 'local') return true;
  const provider = getCloudProvider(providerId);
  const token = await getCloudToken(providerId);
  return Boolean(provider?.isConfigured(token));
}
