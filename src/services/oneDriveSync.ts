import { db } from '../db/database';
import { nowIso } from '../utils/date';

const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const SCOPES = ['openid', 'profile', 'offline_access', 'Files.ReadWrite.AppFolder'];
const SETTINGS_KEY = 'onedriveSettings';
const AUTH_PENDING_KEY = 'onedriveAuthPending';
const BACKUP_FOLDER = 'backups';
const LARGE_UPLOAD_THRESHOLD = 3.5 * 1024 * 1024;
const CHUNK_SIZE = 5 * 1024 * 1024;

export interface OneDriveSettings {
  clientId: string;
  connected: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  accountName?: string;
  lastBackupAt?: string;
  lastSyncAt?: string;
}

interface PendingAuth {
  clientId: string;
  state: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

interface GraphDriveItem {
  id: string;
  name: string;
  size?: number;
  lastModifiedDateTime?: string;
  webUrl?: string;
  file?: unknown;
  folder?: unknown;
}

export interface OneDriveBackupItem {
  id: string;
  name: string;
  size: number;
  modifiedAt: string;
  webUrl?: string;
}

export interface OneDriveAuthResult {
  handled: boolean;
  connected?: boolean;
  error?: string;
}

export async function getOneDriveSettings(): Promise<OneDriveSettings | undefined> {
  const meta = await db.appMeta.get(SETTINGS_KEY);
  return isOneDriveSettings(meta?.value) ? meta.value : undefined;
}

export async function saveOneDriveClientId(clientId: string): Promise<OneDriveSettings> {
  const current = await getOneDriveSettings();
  const next: OneDriveSettings = {
    ...current,
    clientId: clientId.trim(),
    connected: Boolean(current?.connected && current.clientId === clientId.trim())
  };
  await saveSettings(next);
  return next;
}

export async function disconnectOneDrive(): Promise<void> {
  const current = await getOneDriveSettings();
  if (!current) return;
  await saveSettings({
    clientId: current.clientId,
    connected: false
  });
  await db.appMeta.delete(AUTH_PENDING_KEY);
}

export async function startOneDriveSignIn(clientId: string): Promise<void> {
  const normalizedClientId = clientId.trim();
  if (!normalizedClientId) throw new Error('Nejprve vyplňte Microsoft Application (client) ID.');
  if (!window.crypto?.subtle) throw new Error('Pro přihlášení je potřeba HTTPS a WebCrypto.');

  const redirectUri = oneDriveRedirectUri();
  const state = randomUrlToken(24);
  const codeVerifier = randomUrlToken(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const pending: PendingAuth = {
    clientId: normalizedClientId,
    state,
    codeVerifier,
    redirectUri,
    createdAt: nowIso()
  };

  await db.appMeta.put({ key: AUTH_PENDING_KEY, value: pending, updatedAt: nowIso() });
  await saveOneDriveClientId(normalizedClientId);

  const params = new URLSearchParams({
    client_id: normalizedClientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: SCOPES.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account'
  });

  window.location.assign(`${AUTHORITY}/authorize?${params.toString()}`);
}

export async function completeOneDriveRedirect(): Promise<OneDriveAuthResult> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error_description') ?? url.searchParams.get('error');

  if (!code && !error) return { handled: false };

  cleanOneDriveAuthParams(url);

  if (error) {
    await db.appMeta.delete(AUTH_PENDING_KEY);
    return { handled: true, error };
  }

  const pendingMeta = await db.appMeta.get(AUTH_PENDING_KEY);
  const pending = isPendingAuth(pendingMeta?.value) ? pendingMeta.value : undefined;
  if (!pending || pending.state !== state) {
    return { handled: true, error: 'Přihlášení k OneDrive nemá platný stav. Zkuste ho spustit znovu.' };
  }

  try {
    const token = await requestToken({
      client_id: pending.clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: pending.redirectUri,
      code_verifier: pending.codeVerifier,
      scope: SCOPES.join(' ')
    });
    const expiresAt = new Date(Date.now() + Math.max(60, token.expires_in ?? 3600) * 1000).toISOString();
    const accountName = await readAccountName(token.access_token);
    await saveSettings({
      clientId: pending.clientId,
      connected: true,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt,
      accountName,
      lastSyncAt: nowIso()
    });
    await db.appMeta.delete(AUTH_PENDING_KEY);
    return { handled: true, connected: true };
  } catch (err) {
    return { handled: true, error: err instanceof Error ? err.message : 'Přihlášení k OneDrive se nepodařilo.' };
  }
}

export async function uploadOneDriveBackup(blob: Blob, name: string): Promise<OneDriveBackupItem> {
  await ensureBackupsFolder();
  const token = await getValidAccessToken();
  const item = blob.size > LARGE_UPLOAD_THRESHOLD
    ? await uploadLargeBackup(token, blob, name)
    : await uploadSmallBackup(token, blob, name);
  const settings = await getOneDriveSettings();
  if (settings) {
    await saveSettings({ ...settings, lastBackupAt: nowIso(), lastSyncAt: nowIso() });
  }
  return toBackupItem(item);
}

export async function listOneDriveBackups(): Promise<OneDriveBackupItem[]> {
  await ensureBackupsFolder();
  const token = await getValidAccessToken();
  const data = await graphJson<{ value: GraphDriveItem[] }>(
    token,
    `/me/drive/special/approot:/${BACKUP_FOLDER}:/children?$select=id,name,size,lastModifiedDateTime,webUrl,file&$orderby=lastModifiedDateTime desc`
  );
  return data.value
    .filter((item) => item.file && item.name.toLowerCase().endsWith('.zip'))
    .map(toBackupItem);
}

export async function downloadOneDriveBackup(name: string): Promise<Blob> {
  const token = await getValidAccessToken();
  const response = await graphFetch(token, `/me/drive/special/approot:/${BACKUP_FOLDER}/${encodeURIComponentPathSegment(name)}:/content`);
  return response.blob();
}

export async function deleteOneDriveBackup(name: string): Promise<void> {
  const token = await getValidAccessToken();
  await graphFetch(token, `/me/drive/special/approot:/${BACKUP_FOLDER}/${encodeURIComponentPathSegment(name)}`, {
    method: 'DELETE'
  });
}

async function ensureBackupsFolder(): Promise<void> {
  const token = await getValidAccessToken();
  const encodedFolder = encodeURIComponentPathSegment(BACKUP_FOLDER);
  const existing = await fetch(`${GRAPH_ROOT}/me/drive/special/approot:/${encodedFolder}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (existing.ok) return;
  if (existing.status !== 404) {
    throw await graphError(existing, 'Složku záloh na OneDrive se nepodařilo ověřit.');
  }

  await graphFetch(token, '/me/drive/special/approot/children', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: BACKUP_FOLDER,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'replace'
    })
  });
}

async function uploadSmallBackup(token: string, blob: Blob, name: string): Promise<GraphDriveItem> {
  const response = await graphFetch(token, `/me/drive/special/approot:/${BACKUP_FOLDER}/${encodeURIComponentPathSegment(name)}:/content`, {
    method: 'PUT',
    body: blob
  });
  return response.json() as Promise<GraphDriveItem>;
}

async function uploadLargeBackup(token: string, blob: Blob, name: string): Promise<GraphDriveItem> {
  const sessionResponse = await graphFetch(token, `/me/drive/special/approot:/${BACKUP_FOLDER}/${encodeURIComponentPathSegment(name)}:/createUploadSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      item: {
        '@microsoft.graph.conflictBehavior': 'replace',
        name
      }
    })
  });
  const session = await sessionResponse.json() as { uploadUrl?: string };
  if (!session.uploadUrl) throw new Error('OneDrive nevytvořil upload session.');

  let start = 0;
  let lastItem: GraphDriveItem | undefined;
  while (start < blob.size) {
    const end = Math.min(start + CHUNK_SIZE, blob.size) - 1;
    const chunk = blob.slice(start, end + 1);
    const response = await fetch(session.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Range': `bytes ${start}-${end}/${blob.size}`
      },
      body: chunk
    });
    if (!response.ok) throw await graphError(response, 'Upload na OneDrive selhal.');
    const data = await response.json();
    if ('id' in data) lastItem = data as GraphDriveItem;
    start = end + 1;
  }

  if (!lastItem) {
    const uploaded = await graphJson<GraphDriveItem>(token, `/me/drive/special/approot:/${BACKUP_FOLDER}/${encodeURIComponentPathSegment(name)}`);
    return uploaded;
  }
  return lastItem;
}

async function getValidAccessToken(): Promise<string> {
  const settings = await getOneDriveSettings();
  if (!settings?.clientId || !settings.connected) throw new Error('OneDrive není připojený.');
  if (settings.accessToken && settings.expiresAt && Date.parse(settings.expiresAt) > Date.now() + 90_000) {
    return settings.accessToken;
  }
  if (!settings.refreshToken) throw new Error('OneDrive vyžaduje nové přihlášení.');

  const token = await requestToken({
    client_id: settings.clientId,
    grant_type: 'refresh_token',
    refresh_token: settings.refreshToken,
    scope: SCOPES.join(' ')
  });
  const expiresAt = new Date(Date.now() + Math.max(60, token.expires_in ?? 3600) * 1000).toISOString();
  await saveSettings({
    ...settings,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? settings.refreshToken,
    expiresAt,
    lastSyncAt: nowIso()
  });
  return token.access_token;
}

async function requestToken(params: Record<string, string | null | undefined>): Promise<TokenResponse> {
  const body = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) body.set(key, value);
  });
  const response = await fetch(`${AUTHORITY}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!response.ok) throw await graphError(response, 'Microsoft přihlášení se nepodařilo dokončit.');
  return response.json() as Promise<TokenResponse>;
}

async function readAccountName(accessToken: string): Promise<string | undefined> {
  try {
    const profile = await graphJson<{ userPrincipalName?: string; displayName?: string }>(accessToken, '/me?$select=displayName,userPrincipalName');
    return profile.userPrincipalName ?? profile.displayName;
  } catch {
    return undefined;
  }
}

async function graphJson<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await graphFetch(token, path, init);
  return response.json() as Promise<T>;
}

async function graphFetch(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${GRAPH_ROOT}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) throw await graphError(response, 'Komunikace s OneDrive selhala.');
  return response;
}

async function graphError(response: Response, fallback: string): Promise<Error> {
  try {
    const data = await response.json();
    const message = data?.error?.message ?? data?.error_description ?? data?.error;
    return new Error(message ? `${fallback} ${message}` : fallback);
  } catch {
    return new Error(`${fallback} (${response.status})`);
  }
}

function toBackupItem(item: GraphDriveItem): OneDriveBackupItem {
  return {
    id: item.id,
    name: item.name,
    size: item.size ?? 0,
    modifiedAt: item.lastModifiedDateTime ?? nowIso(),
    webUrl: item.webUrl
  };
}

async function saveSettings(settings: OneDriveSettings): Promise<void> {
  await db.appMeta.put({ key: SETTINGS_KEY, value: settings, updatedAt: nowIso() });
}

function oneDriveRedirectUri(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

function cleanOneDriveAuthParams(url: URL): void {
  ['code', 'state', 'session_state', 'error', 'error_description'].forEach((key) => url.searchParams.delete(key));
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

function randomUrlToken(bytes: number): string {
  const values = new Uint8Array(bytes);
  window.crypto.getRandomValues(values);
  return base64Url(values);
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encodeURIComponentPathSegment(value: string): string {
  return value.split('/').map(encodeURIComponent).join('/');
}

function isOneDriveSettings(value: unknown): value is OneDriveSettings {
  return Boolean(value && typeof value === 'object' && 'clientId' in value);
}

function isPendingAuth(value: unknown): value is PendingAuth {
  return Boolean(
    value
    && typeof value === 'object'
    && 'clientId' in value
    && 'state' in value
    && 'codeVerifier' in value
    && 'redirectUri' in value
  );
}
