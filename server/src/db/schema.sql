PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id                    TEXT PRIMARY KEY,
  username              TEXT NOT NULL UNIQUE,
  display_name          TEXT NOT NULL,
  email                 TEXT NOT NULL UNIQUE,
  password_hash         TEXT NOT NULL,
  avatar_url            TEXT,
  banner_url            TEXT,
  about_me              TEXT,
  pronouns              TEXT,
  accent_color          TEXT,
  status                TEXT NOT NULL DEFAULT 'offline',
  custom_status         TEXT,
  theme                 TEXT NOT NULL DEFAULT 'dark',
  totp_secret           TEXT,
  totp_enabled          INTEGER NOT NULL DEFAULT 0,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until          INTEGER,
  created_at            INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS friendships (
  user_id_a     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id_b     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending',
  requested_by  TEXT NOT NULL REFERENCES users(id),
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id_a, user_id_b),
  CHECK (user_id_a < user_id_b)
);

CREATE TABLE IF NOT EXISTS blocks (
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, blocked_user_id)
);

CREATE TABLE IF NOT EXISTS servers (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  icon_url     TEXT,
  banner_url   TEXT,
  owner_id     TEXT NOT NULL REFERENCES users(id),
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS server_members (
  server_id   TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname    TEXT,
  joined_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (server_id, user_id)
);

CREATE TABLE IF NOT EXISTS roles (
  id           TEXT PRIMARY KEY,
  server_id    TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT '#99AAB5',
  permissions  INTEGER NOT NULL DEFAULT 0,
  position     INTEGER NOT NULL DEFAULT 0,
  hoist        INTEGER NOT NULL DEFAULT 0,
  is_default   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS member_roles (
  server_id  TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  role_id    TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (server_id, user_id, role_id),
  FOREIGN KEY (server_id, user_id) REFERENCES server_members(server_id, user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY,
  server_id   TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS channels (
  id                 TEXT PRIMARY KEY,
  server_id          TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  category_id        TEXT REFERENCES categories(id) ON DELETE SET NULL,
  parent_channel_id  TEXT REFERENCES channels(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  type               TEXT NOT NULL CHECK (type IN ('text', 'voice', 'thread')),
  topic              TEXT,
  nsfw               INTEGER NOT NULL DEFAULT 0,
  slowmode_seconds   INTEGER NOT NULL DEFAULT 0,
  archived           INTEGER NOT NULL DEFAULT 0,
  position           INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS channel_permission_overwrites (
  channel_id   TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  target_type  TEXT NOT NULL CHECK (target_type IN ('role', 'member')),
  target_id    TEXT NOT NULL,
  allow        INTEGER NOT NULL DEFAULT 0,
  deny         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (channel_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS webhooks (
  id          TEXT PRIMARY KEY,
  channel_id  TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  avatar_url  TEXT,
  token_hash  TEXT NOT NULL,
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS messages (
  id            TEXT PRIMARY KEY,
  channel_id    TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  author_id     TEXT REFERENCES users(id),
  webhook_id    TEXT REFERENCES webhooks(id),
  content       TEXT,
  embed_json    TEXT,
  reply_to_id   TEXT REFERENCES messages(id) ON DELETE SET NULL,
  pinned        INTEGER NOT NULL DEFAULT 0,
  edited_at     INTEGER,
  deleted       INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content, content='messages', content_rowid='rowid');

CREATE TABLE IF NOT EXISTS message_attachments (
  id          TEXT PRIMARY KEY,
  message_id  TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  filename    TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  mime_type   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id  TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS message_mentions (
  message_id      TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  mentioned_type  TEXT NOT NULL CHECK (mentioned_type IN ('user', 'role', 'everyone', 'here')),
  mentioned_id    TEXT,
  PRIMARY KEY (message_id, mentioned_type, mentioned_id)
);

CREATE TABLE IF NOT EXISTS custom_emojis (
  id           TEXT PRIMARY KEY,
  server_id    TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  image_url    TEXT NOT NULL,
  uploaded_by  TEXT NOT NULL REFERENCES users(id),
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (server_id, name)
);

CREATE TABLE IF NOT EXISTS invites (
  code        TEXT PRIMARY KEY,
  server_id   TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  created_by  TEXT NOT NULL REFERENCES users(id),
  max_uses    INTEGER,
  uses        INTEGER NOT NULL DEFAULT 0,
  expires_at  INTEGER,
  revoked     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS bans (
  server_id   TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      TEXT,
  banned_by   TEXT NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (server_id, user_id)
);

CREATE TABLE IF NOT EXISTS timeouts (
  server_id   TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL,
  reason      TEXT,
  issued_by   TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY (server_id, user_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id            TEXT PRIMARY KEY,
  server_id     TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  actor_id      TEXT NOT NULL REFERENCES users(id),
  action_type   TEXT NOT NULL,
  target_type   TEXT,
  target_id     TEXT,
  reason        TEXT,
  metadata_json TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS notification_settings (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope_type  TEXT NOT NULL CHECK (scope_type IN ('server', 'channel')),
  scope_id    TEXT NOT NULL,
  level       TEXT NOT NULL DEFAULT 'all',
  PRIMARY KEY (user_id, scope_type, scope_id)
);

CREATE TABLE IF NOT EXISTS dm_channels (
  id          TEXT PRIMARY KEY,
  is_group    INTEGER NOT NULL DEFAULT 0,
  name        TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS dm_participants (
  dm_channel_id  TEXT NOT NULL REFERENCES dm_channels(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (dm_channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS dm_messages (
  id             TEXT PRIMARY KEY,
  dm_channel_id  TEXT NOT NULL REFERENCES dm_channels(id) ON DELETE CASCADE,
  author_id      TEXT NOT NULL REFERENCES users(id),
  content        TEXT,
  embed_json     TEXT,
  reply_to_id    TEXT REFERENCES dm_messages(id) ON DELETE SET NULL,
  edited_at      INTEGER,
  deleted        INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS read_states (
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id        TEXT,
  dm_channel_id     TEXT,
  last_read_message TEXT NOT NULL,
  PRIMARY KEY (user_id, channel_id, dm_channel_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages(channel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dm_messages_channel_created ON dm_messages(dm_channel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_server_members_user ON server_members(user_id);
CREATE INDEX IF NOT EXISTS idx_channels_parent ON channels(parent_channel_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_server_created ON audit_log(server_id, created_at);
