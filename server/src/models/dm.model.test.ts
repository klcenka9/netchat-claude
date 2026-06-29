import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, makeUser } from '../test/helpers';
import {
  openDirectDm,
  createGroupDm,
  listParticipants,
  isParticipant,
  getDmChannel,
} from './dm.model';

describe('openDirectDm', () => {
  beforeEach(() => resetDb());

  it('creates a 1:1 channel with both participants', () => {
    const a = makeUser();
    const b = makeUser();
    const id = openDirectDm(a.id, b.id);
    const parts = listParticipants(id).sort();
    expect(parts).toEqual([a.id, b.id].sort());
    expect(getDmChannel(id)!.is_group).toBe(0);
  });

  it('reuses the existing 1:1 channel regardless of argument order', () => {
    const a = makeUser();
    const b = makeUser();
    const first = openDirectDm(a.id, b.id);
    const second = openDirectDm(b.id, a.id);
    expect(second).toBe(first);
  });

  it('does not reuse a group DM that happens to contain both users', () => {
    const a = makeUser();
    const b = makeUser();
    const c = makeUser();
    const group = createGroupDm(a.id, [b.id, c.id]);
    const direct = openDirectDm(a.id, b.id);
    expect(direct).not.toBe(group);
  });
});

describe('createGroupDm', () => {
  beforeEach(() => resetDb());

  it('includes the creator and all invitees, deduped', () => {
    const a = makeUser();
    const b = makeUser();
    const c = makeUser();
    const id = createGroupDm(a.id, [b.id, c.id, b.id]);
    const parts = listParticipants(id).sort();
    expect(parts).toEqual([a.id, b.id, c.id].sort());
    expect(getDmChannel(id)!.is_group).toBe(1);
    expect(isParticipant(id, a.id)).toBe(true);
    expect(isParticipant(id, makeUser().id)).toBe(false);
  });

  it('stores an optional group name', () => {
    const a = makeUser();
    const b = makeUser();
    const id = createGroupDm(a.id, [b.id], 'Squad');
    expect(getDmChannel(id)!.name).toBe('Squad');
  });
});
