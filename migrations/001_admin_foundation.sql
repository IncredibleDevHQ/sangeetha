CREATE TABLE accounts (
  id UUID PRIMARY KEY,
  principal_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE auth_identities (
  account_id UUID NOT NULL REFERENCES accounts(id),
  provider TEXT NOT NULL CHECK (provider IN ('google.com', 'phone')),
  provider_uid TEXT NOT NULL,
  label TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(account_id, provider),
  UNIQUE(provider, provider_uid)
);
CREATE TABLE schools (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE CHECK(slug ~ '^[a-z][a-z0-9-]{1,48}[a-z0-9]$'),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 100),
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE memberships (
  school_id UUID NOT NULL REFERENCES schools(id),
  account_id UUID NOT NULL REFERENCES accounts(id),
  role TEXT NOT NULL CHECK(role IN ('owner', 'admin')),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(school_id, account_id)
);
CREATE TABLE invitations (
  id UUID PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id),
  channel TEXT NOT NULL CHECK(channel IN ('email', 'phone')),
  destination TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner', 'admin')),
  invited_by UUID REFERENCES accounts(id),
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_by UUID REFERENCES accounts(id),
  claimed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pending_invitation ON invitations(school_id, channel, destination)
  WHERE claimed_at IS NULL AND revoked_at IS NULL;
CREATE TABLE sessions (
  school_id UUID REFERENCES schools(id),
  token_hash TEXT PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id),
  auth_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  device_label TEXT NOT NULL
);
CREATE INDEX account_sessions ON sessions(account_id);
CREATE TABLE audit_events (
  id UUID PRIMARY KEY,
  school_id UUID REFERENCES schools(id),
  actor_id UUID REFERENCES accounts(id),
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE request_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE principal_aliases (
 principal_key TEXT PRIMARY KEY,
 account_id UUID NOT NULL REFERENCES accounts(id)
);
CREATE TABLE auth_flows (
 id TEXT PRIMARY KEY,
 payload JSONB NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL
);
