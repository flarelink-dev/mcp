// Thin client for the Flarelink dashboard API, authenticated with a personal
// API key (FLARELINK_API_KEY). The key is minted in the dashboard
// (https://dash.flarelink.dev → API keys) and carries the same authority as the
// user's session.

const BASE = (process.env.FLARELINK_BASE_URL || 'https://dash.flarelink.dev').replace(/\/+$/, '');
const KEY = process.env.FLARELINK_API_KEY;

export const NO_KEY_MESSAGE =
  'No FLARELINK_API_KEY is set for this MCP server. Create a key at https://dash.flarelink.dev → "API keys", then set FLARELINK_API_KEY in this server\'s env (e.g. the `env` block of your MCP config).';

export function hasApiKey(): boolean {
  return Boolean(KEY);
}

export async function flarelinkFetch<T = unknown>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  if (!KEY) throw new Error(NO_KEY_MESSAGE);
  const res = await fetch(BASE + path, {
    method: init?.method ?? 'GET',
    headers: {
      authorization: `Bearer ${KEY}`,
      'content-type': 'application/json',
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { error: text };
  }
  if (!res.ok) {
    const msg = body?.error || `Flarelink API error (${res.status})`;
    if (res.status === 401) {
      throw new Error(
        `${msg} — the FLARELINK_API_KEY is invalid or revoked. Mint a fresh one at https://dash.flarelink.dev → API keys.`,
      );
    }
    if (res.status === 412 && body?.code === 'NO_CONNECTION') {
      throw new Error('No Cloudflare account is connected to this Flarelink user yet — connect one at https://dash.flarelink.dev/connect-cf.');
    }
    throw new Error(msg);
  }
  return body as T;
}
