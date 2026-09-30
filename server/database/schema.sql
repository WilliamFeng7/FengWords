CREATE TABLE IF NOT EXISTS fw_workspaces (
  id uuid PRIMARY KEY,
  access_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS fw_records (
  workspace_id uuid NOT NULL REFERENCES fw_workspaces(id),
  type text NOT NULL,
  data jsonb NOT NULL,
  data_version integer NOT NULL,
  client_updated_ms bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, type)
);
CREATE INDEX IF NOT EXISTS fw_records_updated_idx ON fw_records (workspace_id, updated_at, type);

CREATE TABLE IF NOT EXISTS fw_rate_limits (
  key text PRIMARY KEY,
  hits integer NOT NULL,
  reset_at timestamptz NOT NULL
);
