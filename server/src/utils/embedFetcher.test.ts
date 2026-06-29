import { describe, it, expect } from 'vitest';
import { firstUrl, isBlockedHost, fetchEmbed } from './embedFetcher';

describe('firstUrl', () => {
  it('extracts the first http(s) URL from text', () => {
    expect(firstUrl('check https://example.com/page out')).toBe('https://example.com/page');
    expect(firstUrl('http://a.test and https://b.test')).toBe('http://a.test');
  });
  it('returns null when no URL is present', () => {
    expect(firstUrl('no links here')).toBeNull();
    expect(firstUrl('ftp://example.com')).toBeNull();
  });
});

describe('isBlockedHost (SSRF guard)', () => {
  it('blocks loopback and localhost', () => {
    expect(isBlockedHost('localhost')).toBe(true);
    expect(isBlockedHost('127.0.0.1')).toBe(true);
    expect(isBlockedHost('::1')).toBe(true);
    expect(isBlockedHost('foo.local')).toBe(true);
  });
  it('blocks private IPv4 ranges', () => {
    expect(isBlockedHost('10.0.0.5')).toBe(true);
    expect(isBlockedHost('192.168.1.10')).toBe(true);
    expect(isBlockedHost('172.16.0.1')).toBe(true);
    expect(isBlockedHost('172.31.255.255')).toBe(true);
    expect(isBlockedHost('169.254.1.1')).toBe(true); // link-local
  });
  it('blocks unique-local / link-local IPv6', () => {
    expect(isBlockedHost('fc00::1')).toBe(true);
    expect(isBlockedHost('fd12::34')).toBe(true);
    expect(isBlockedHost('fe80::1')).toBe(true);
  });
  it('allows public hosts', () => {
    expect(isBlockedHost('example.com')).toBe(false);
    expect(isBlockedHost('8.8.8.8')).toBe(false);
    expect(isBlockedHost('172.32.0.1')).toBe(false); // just outside private range
    expect(isBlockedHost('11.0.0.1')).toBe(false);
  });
});

describe('fetchEmbed guards', () => {
  it('returns null for a blocked host without making a request', async () => {
    expect(await fetchEmbed('visit http://127.0.0.1/admin')).toBeNull();
    expect(await fetchEmbed('visit http://localhost:3000')).toBeNull();
  });
  it('returns null when there is no URL', async () => {
    expect(await fetchEmbed('nothing to see')).toBeNull();
  });
  it('returns null for non-http(s) schemes', async () => {
    expect(await fetchEmbed('file:///etc/passwd')).toBeNull();
  });
});
