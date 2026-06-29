import { request } from 'undici';
import { parse } from 'node-html-parser';
import net from 'net';

export interface LinkEmbed {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

const URL_RE = /\bhttps?:\/\/[^\s<>()]+/i;
const TIMEOUT_MS = 5000;
const MAX_BYTES = 2 * 1024 * 1024;

// Basic SSRF guard: reject private / loopback / link-local hosts (spec §12).
function isBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.local')) return true;
  if (net.isIP(hostname)) {
    if (
      hostname.startsWith('10.') ||
      hostname.startsWith('127.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname === '::1' ||
      hostname.startsWith('fc') ||
      hostname.startsWith('fd') ||
      hostname.startsWith('fe80')
    ) {
      return true;
    }
  }
  return false;
}

export function firstUrl(content: string): string | null {
  const m = content.match(URL_RE);
  return m ? m[0] : null;
}

export async function fetchEmbed(content: string): Promise<LinkEmbed | null> {
  const url = firstUrl(content);
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (isBlockedHost(parsed.hostname)) return null;

  try {
    const res = await request(url, {
      method: 'GET',
      headers: { 'user-agent': 'NetChatBot/1.0 (+link-preview)' },
      maxRedirections: 3,
      bodyTimeout: TIMEOUT_MS,
      headersTimeout: TIMEOUT_MS,
    });
    const ctype = String(res.headers['content-type'] ?? '');
    if (!ctype.includes('text/html')) {
      res.body.destroy();
      return null;
    }
    let html = '';
    let bytes = 0;
    for await (const chunk of res.body) {
      bytes += chunk.length;
      if (bytes > MAX_BYTES) break;
      html += chunk.toString('utf8');
    }
    const root = parse(html);
    const meta = (prop: string): string | undefined => {
      const el =
        root.querySelector(`meta[property="${prop}"]`) ||
        root.querySelector(`meta[name="${prop}"]`);
      return el?.getAttribute('content') ?? undefined;
    };
    const title = meta('og:title') ?? root.querySelector('title')?.text?.trim();
    const description = meta('og:description') ?? meta('description');
    const image = meta('og:image');
    const siteName = meta('og:site_name');
    if (!title && !description && !image) return null;
    return { url, title, description, image, siteName };
  } catch {
    return null;
  }
}
