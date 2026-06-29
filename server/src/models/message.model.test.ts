import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, makeUser } from '../test/helpers';
import { db } from '../db/client';
import { createServer } from './server.model';
import { listChannels } from './channel.model';
import {
  createMessage,
  serializeMessage,
  toggleReaction,
  softDeleteMessage,
  editMessage,
  getMessageRow,
} from './message.model';

function textChannel(serverId: string): string {
  return listChannels(serverId).find((c) => c.type === 'text')!.id;
}

function ftsSearch(serverId: string, term: string): string[] {
  const rows = db
    .prepare(
      `SELECT m.id FROM messages m
       JOIN channels c ON c.id = m.channel_id
       JOIN messages_fts fts ON fts.rowid = m.rowid
       WHERE c.server_id = ? AND m.deleted = 0 AND messages_fts MATCH ?`,
    )
    .all(serverId, term) as { id: string }[];
  return rows.map((r) => r.id);
}

describe('createMessage + serializeMessage', () => {
  beforeEach(() => resetDb());

  it('serializes author, content, html, attachments and reactions', () => {
    const owner = makeUser('alice');
    const server = createServer(owner.id, 'S');
    const ch = textChannel(server.id);
    const id = createMessage({
      channelId: ch,
      authorId: owner.id,
      content: '**hello**',
      attachments: [
        { url: '/u/a.png', filename: 'a.png', size_bytes: 10, mime_type: 'image/png' },
      ],
    });
    const msg = serializeMessage(id) as any;
    expect(msg.id).toBe(id);
    expect(msg.author.username).toBe('alice');
    expect(msg.content).toBe('**hello**');
    expect(msg.contentHtml).toContain('<strong>hello</strong>');
    expect(msg.attachments).toHaveLength(1);
    expect(msg.reactions).toEqual([]);
  });

  it('serializes a reply preview', () => {
    const owner = makeUser('alice');
    const server = createServer(owner.id, 'S');
    const ch = textChannel(server.id);
    const parent = createMessage({ channelId: ch, authorId: owner.id, content: 'original' });
    const reply = createMessage({
      channelId: ch,
      authorId: owner.id,
      content: 'response',
      replyToId: parent,
    });
    const msg = serializeMessage(reply) as any;
    expect(msg.replyTo.id).toBe(parent);
    expect(msg.replyTo.content).toBe('original');
    expect(msg.replyTo.author.username).toBe('alice');
  });
});

describe('toggleReaction', () => {
  beforeEach(() => resetDb());

  it('adds then removes a reaction and aggregates in serializeMessage', () => {
    const owner = makeUser();
    const other = makeUser();
    const server = createServer(owner.id, 'S');
    const ch = textChannel(server.id);
    const id = createMessage({ channelId: ch, authorId: owner.id, content: 'hi' });

    expect(toggleReaction(id, owner.id, '👍')).toBe(true); // added
    expect(toggleReaction(id, other.id, '👍')).toBe(true);
    let msg = serializeMessage(id) as any;
    const r = msg.reactions.find((x: any) => x.emoji === '👍');
    expect(r.count).toBe(2);
    expect(r.users.sort()).toEqual([owner.id, other.id].sort());

    expect(toggleReaction(id, owner.id, '👍')).toBe(false); // removed
    msg = serializeMessage(id) as any;
    expect(msg.reactions.find((x: any) => x.emoji === '👍').count).toBe(1);
  });
});

describe('softDeleteMessage', () => {
  beforeEach(() => resetDb());

  it('clears content but keeps the row for reply integrity', () => {
    const owner = makeUser();
    const server = createServer(owner.id, 'S');
    const ch = textChannel(server.id);
    const id = createMessage({ channelId: ch, authorId: owner.id, content: 'secret' });
    softDeleteMessage(id);
    const row = getMessageRow(id)!;
    expect(row.deleted).toBe(1);
    expect(row.content).toBeNull();
  });
});

describe('FTS5 search index', () => {
  beforeEach(() => resetDb());

  it('finds a message by content after insert', () => {
    const owner = makeUser();
    const server = createServer(owner.id, 'S');
    const ch = textChannel(server.id);
    const id = createMessage({ channelId: ch, authorId: owner.id, content: 'pineapple pizza' });
    expect(ftsSearch(server.id, 'pineapple')).toContain(id);
  });

  it('reflects edits in the index', () => {
    const owner = makeUser();
    const server = createServer(owner.id, 'S');
    const ch = textChannel(server.id);
    const id = createMessage({ channelId: ch, authorId: owner.id, content: 'apricot' });
    expect(ftsSearch(server.id, 'apricot')).toContain(id);
    editMessage(id, 'banana');
    expect(ftsSearch(server.id, 'apricot')).not.toContain(id);
    expect(ftsSearch(server.id, 'banana')).toContain(id);
  });

  it('drops a soft-deleted message from the index', () => {
    const owner = makeUser();
    const server = createServer(owner.id, 'S');
    const ch = textChannel(server.id);
    const id = createMessage({ channelId: ch, authorId: owner.id, content: 'watermelon' });
    expect(ftsSearch(server.id, 'watermelon')).toContain(id);
    softDeleteMessage(id);
    expect(ftsSearch(server.id, 'watermelon')).not.toContain(id);
  });
});
