CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE firmware (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name)
);

CREATE TABLE firmware_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firmware_id   UUID NOT NULL REFERENCES firmware(id) ON DELETE CASCADE,
  version       TEXT NOT NULL,
  author        TEXT NOT NULL,
  changelog     TEXT,
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'release', 'deprecated')),
  file_size     BIGINT NOT NULL,
  sha256        CHAR(64) NOT NULL,
  storage_path  TEXT NOT NULL,
  original_name TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (firmware_id, version)
);
