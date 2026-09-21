CREATE TABLE IF NOT EXISTS runtime_objects (
  drive_id TEXT NOT NULL,
  path TEXT NOT NULL,
  parent_path TEXT NOT NULL,
  name TEXT NOT NULL,
  is_directory INTEGER NOT NULL DEFAULT 0,
  size INTEGER NOT NULL DEFAULT 0,
  etag TEXT NOT NULL,
  version TEXT NOT NULL,
  uploaded_at INTEGER NOT NULL,
  content_type TEXT,
  content_disposition TEXT,
  content_language TEXT,
  thumbnail TEXT,
  PRIMARY KEY (drive_id, path)
);
CREATE INDEX IF NOT EXISTS runtime_objects_parent
  ON runtime_objects (drive_id, parent_path, is_directory DESC, name);

CREATE TABLE IF NOT EXISTS runtime_shares (
  drive_id TEXT NOT NULL,
  id TEXT NOT NULL,
  path TEXT NOT NULL,
  token TEXT NOT NULL,
  object_version TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER,
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (drive_id, id),
  UNIQUE (drive_id, path),
  UNIQUE (drive_id, token)
);
CREATE INDEX IF NOT EXISTS runtime_shares_created
  ON runtime_shares (drive_id, created_at DESC, id);

CREATE TABLE IF NOT EXISTS runtime_passkeys (
  drive_id TEXT NOT NULL,
  id TEXT NOT NULL,
  user TEXT NOT NULL,
  public_key_jwk TEXT NOT NULL,
  sign_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  name TEXT,
  last_used_at INTEGER,
  PRIMARY KEY (drive_id, id)
);

CREATE TABLE IF NOT EXISTS runtime_auth_challenges (
  drive_id TEXT NOT NULL,
  challenge_hash TEXT NOT NULL,
  challenge TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('create', 'get')),
  user TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (drive_id, challenge_hash)
);
CREATE INDEX IF NOT EXISTS runtime_auth_challenges_expiry
  ON runtime_auth_challenges (expires_at);

CREATE TABLE IF NOT EXISTS runtime_state (
  drive_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (drive_id, key)
);
