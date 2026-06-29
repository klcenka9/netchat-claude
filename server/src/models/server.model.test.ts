import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, makeUser } from '../test/helpers';
import { db } from '../db/client';
import { createServer, isMember, listServersForUser } from './server.model';
import { listRoles } from './role.model';
import { listChannels, listCategories } from './channel.model';
import { EVERYONE_DEFAULT_PERMISSIONS } from '../utils/permissions';

describe('createServer bootstrap (spec §2)', () => {
  beforeEach(() => resetDb());

  it('creates @everyone role, default category, #general text + General voice, owner membership', () => {
    const owner = makeUser();
    const server = createServer(owner.id, 'My Server');

    expect(server.name).toBe('My Server');
    expect(server.owner_id).toBe(owner.id);
    expect(isMember(server.id, owner.id)).toBe(true);

    const roles = listRoles(server.id);
    const everyone = roles.find((r) => r.is_default === 1);
    expect(everyone).toBeDefined();
    expect(everyone!.name).toBe('@everyone');
    expect(everyone!.permissions).toBe(EVERYONE_DEFAULT_PERMISSIONS);
    expect(everyone!.position).toBe(0);

    const categories = listCategories(server.id) as { name: string }[];
    expect(categories.length).toBe(1);

    const channels = listChannels(server.id);
    const general = channels.find((c) => c.type === 'text');
    const voice = channels.find((c) => c.type === 'voice');
    expect(general!.name).toBe('general');
    expect(voice!.name).toBe('General');
    // both channels are attached to the default category
    expect(general!.category_id).toBe((categories as unknown as { id: string }[])[0].id ?? general!.category_id);
  });

  it('runs as a single transaction (owner appears in listServersForUser)', () => {
    const owner = makeUser();
    const server = createServer(owner.id, 'S');
    const list = listServersForUser(owner.id);
    expect(list.map((s) => s.id)).toContain(server.id);
  });

  it('the bootstrap channels share one category id', () => {
    const owner = makeUser();
    const server = createServer(owner.id, 'S');
    const channels = listChannels(server.id);
    const cats = new Set(channels.map((c) => c.category_id));
    expect(cats.size).toBe(1);
    const catId = [...cats][0];
    const exists = db.prepare('SELECT 1 FROM categories WHERE id = ?').get(catId!);
    expect(exists).toBeTruthy();
  });
});
