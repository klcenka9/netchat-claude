import { describe, it, expect } from 'vitest';
import {
  Permissions,
  hasServerPermission,
  resolveChannelPermission,
  EVERYONE_DEFAULT_PERMISSIONS,
} from './permissions';

describe('hasServerPermission', () => {
  it('ADMINISTRATOR bypasses every check', () => {
    expect(hasServerPermission(Permissions.ADMINISTRATOR, Permissions.BAN_MEMBERS)).toBe(true);
  });
  it('requires the exact bit otherwise', () => {
    expect(hasServerPermission(Permissions.KICK_MEMBERS, Permissions.BAN_MEMBERS)).toBe(false);
    expect(hasServerPermission(Permissions.BAN_MEMBERS, Permissions.BAN_MEMBERS)).toBe(true);
  });
});

describe('resolveChannelPermission (spec §7 order)', () => {
  it('ADMINISTRATOR ignores overwrites entirely', () => {
    const ok = resolveChannelPermission(
      Permissions.SEND_MESSAGES,
      Permissions.ADMINISTRATOR,
      { allow: 0, deny: Permissions.SEND_MESSAGES },
      [],
      null,
    );
    expect(ok).toBe(true);
  });

  it('@everyone deny removes a base permission', () => {
    const ok = resolveChannelPermission(
      Permissions.VIEW_CHANNELS,
      EVERYONE_DEFAULT_PERMISSIONS,
      { allow: 0, deny: Permissions.VIEW_CHANNELS },
      [],
      null,
    );
    expect(ok).toBe(false);
  });

  it('role allow overrides @everyone deny', () => {
    const ok = resolveChannelPermission(
      Permissions.VIEW_CHANNELS,
      EVERYONE_DEFAULT_PERMISSIONS,
      { allow: 0, deny: Permissions.VIEW_CHANNELS },
      [{ allow: Permissions.VIEW_CHANNELS, deny: 0 }],
      null,
    );
    expect(ok).toBe(true);
  });

  it('member overwrite is applied last and wins', () => {
    const ok = resolveChannelPermission(
      Permissions.SEND_MESSAGES,
      EVERYONE_DEFAULT_PERMISSIONS,
      null,
      [{ allow: Permissions.SEND_MESSAGES, deny: 0 }],
      { allow: 0, deny: Permissions.SEND_MESSAGES },
    );
    expect(ok).toBe(false);
  });

  it('grants a private channel to one member via member allow', () => {
    const ok = resolveChannelPermission(
      Permissions.VIEW_CHANNELS,
      0,
      { allow: 0, deny: Permissions.VIEW_CHANNELS },
      [],
      { allow: Permissions.VIEW_CHANNELS, deny: 0 },
    );
    expect(ok).toBe(true);
  });
});
