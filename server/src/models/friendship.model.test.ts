import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, makeUser } from '../test/helpers';
import {
  pair,
  createRequest,
  acceptRequest,
  getFriendship,
  removeFriendship,
  listFriendships,
  block,
  isBlocked,
  eitherBlocked,
  unblock,
} from './friendship.model';

describe('friendship pair ordering', () => {
  it('orders canonically regardless of argument order', () => {
    expect(pair('200', '100')).toEqual(pair('100', '200'));
    const [a, b] = pair('100', '200');
    expect(a < b).toBe(true);
  });
});

describe('friend request -> accept', () => {
  beforeEach(() => resetDb());

  it('request creates a pending friendship surfaced as incoming to the target', () => {
    const u1 = makeUser();
    const u2 = makeUser();
    createRequest(u1.id, u2.id);
    const f = getFriendship(u1.id, u2.id);
    expect(f!.status).toBe('pending');
    expect(f!.requested_by).toBe(u1.id);

    const targetView = listFriendships(u2.id).find((x) => x.otherUserId === u1.id)!;
    expect(targetView.incoming).toBe(true);
    const requesterView = listFriendships(u1.id).find((x) => x.otherUserId === u2.id)!;
    expect(requesterView.incoming).toBe(false);
  });

  it('accept flips status to accepted', () => {
    const u1 = makeUser();
    const u2 = makeUser();
    createRequest(u1.id, u2.id);
    acceptRequest(u1.id, u2.id);
    expect(getFriendship(u1.id, u2.id)!.status).toBe('accepted');
    expect(listFriendships(u1.id, 'accepted')).toHaveLength(1);
  });

  it('removeFriendship deletes the row', () => {
    const u1 = makeUser();
    const u2 = makeUser();
    createRequest(u1.id, u2.id);
    removeFriendship(u2.id, u1.id);
    expect(getFriendship(u1.id, u2.id)).toBeUndefined();
  });
});

describe('block', () => {
  beforeEach(() => resetDb());

  it('block removes the friendship and registers a directional block', () => {
    const u1 = makeUser();
    const u2 = makeUser();
    createRequest(u1.id, u2.id);
    acceptRequest(u1.id, u2.id);
    block(u1.id, u2.id);

    expect(getFriendship(u1.id, u2.id)).toBeUndefined();
    expect(isBlocked(u1.id, u2.id)).toBe(true);
    expect(isBlocked(u2.id, u1.id)).toBe(false);
    expect(eitherBlocked(u1.id, u2.id)).toBe(true);
    expect(eitherBlocked(u2.id, u1.id)).toBe(true);
  });

  it('unblock clears the block', () => {
    const u1 = makeUser();
    const u2 = makeUser();
    block(u1.id, u2.id);
    unblock(u1.id, u2.id);
    expect(isBlocked(u1.id, u2.id)).toBe(false);
  });
});
