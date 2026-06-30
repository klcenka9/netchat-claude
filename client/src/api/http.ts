// Thin fetch wrapper: attaches the access token, transparently refreshes on 401.
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) localStorage.setItem('netchat_has_session', '1');
}

export function getAccessToken() {
  return accessToken;
}

async function refresh(): Promise<boolean> {
  const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
  if (!res.ok) return false;
  const data = await res.json();
  setAccessToken(data.accessToken);
  return true;
}

// Exposed so the socket layer can recover its auth after the 15-min access token
// expires (rotates the token via the refresh cookie).
export function refreshAccessToken(): Promise<boolean> {
  return refresh();
}

export async function api<T = unknown>(
  path: string,
  opts: RequestInit & { json?: unknown; retry?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let body = opts.body;
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }
  const res = await fetch(`/api${path}`, { ...opts, headers, body, credentials: 'include' });

  if (res.status === 401 && !opts.retry) {
    if (await refresh()) return api<T>(path, { ...opts, retry: true });
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function uploadFile<T = unknown>(path: string, file: File, field = 'file'): Promise<T> {
  const form = new FormData();
  form.append(field, file);
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers,
    body: form,
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

export async function tryRestoreSession(): Promise<boolean> {
  if (!localStorage.getItem('netchat_has_session')) return false;
  return refresh();
}
