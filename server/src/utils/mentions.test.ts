import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, makeUser } from '../test/helpers';
import { createServer, addMember } from '../models/server.model';
import { createRole } from '../models/role.model';
import { parseMentions, storeMentions, getMentions } from './mentions';
import { createMessage } from '../models/message.model';
import { listChannels } from '../models/channel.model';

describe('parseMentions', () => {
  beforeEach(() => resetDb());

  it('detects @everyone and @here', () => {
    const r = parseMentions('hey @everyone and @here', null);
    expect(r.everyone).toBe(true);
    expect(r.here).toBe(true);
  });

  it('does not flag @everyone when embedded in a word', () => {
    const r = parseMentions('foo@everyonebar', null);
    expect(r.everyone).toBe(false);
  });

  it('parses explicit <@id> user and <@&id> role mentions distinctly', () => {
    const r = parseMentions('ping <@123> and <@&456>', null);
    expect(r.users).toEqual(['123']);
    expect(r.roles).toEqual(['456']);
  });

  it('resolves plain @username against server members', () => {
    const owner = makeUser('alice');
    const bob = makeUser('bob');
    const server = createServer(owner.id, 'S');
    addMember(server.id, bob.id);
    const r = parseMentions('hi @bob', server.id);
    expect(r.users).toContain(bob.id);
  });

  it('does not resolve a username for a non-member', () => {
    const owner = makeUser('alice');
    makeUser('carol'); // exists but not a member of this server
    const server = createServer(owner.id, 'S');
    const r = parseMentions('hi @carol', server.id);
    expect(r.users).toHaveLength(0);
  });

  it('resolves plain @rolename against server roles', () => {
    const owner = makeUser('alice');
    const server = createServer(owner.id, 'S');
    const role = createRole(server.id, { name: 'Moderators' });
    const r = parseMentions('attn @Moderators', server.id);
    expect(r.roles).toContain(role.id);
  });

  it('dedupes repeated mentions', () => {
    const r = parseMentions('<@1> <@1> <@&2> <@&2>', null);
    expect(r.users).toEqual(['1']);
    expect(r.roles).toEqual(['2']);
  });
});

describe('storeMentions / getMentions', () => {
  beforeEach(() => resetDb());

  it('persists and reads back mention rows', () => {
    const owner = makeUser('alice');
    const bob = makeUser('bob');
    const server = createServer(owner.id, 'S');
    addMember(server.id, bob.id);
    const channelId = listChannels(server.id).find((c) => c.type === 'text')!.id;
    const msgId = createMessage({ channelId, authorId: owner.id, content: 'hi @bob @everyone' });
    const parsed = parseMentions('hi @bob @everyone', server.id);
    storeMentions(msgId, parsed);
    const rows = getMentions(msgId);
    expect(rows.some((r) => r.mentioned_type === 'user' && r.mentioned_id === bob.id)).toBe(true);
    expect(rows.some((r) => r.mentioned_type === 'everyone')).toBe(true);
  });
});
