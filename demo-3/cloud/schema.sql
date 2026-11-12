PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS principals (
  id TEXT PRIMARY KEY, label TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('operator','reviewer','runner')),
  token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL,
  revoked_at TEXT, last_seen_at TEXT
);
CREATE TABLE IF NOT EXISTS pairing_codes (
  id TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('rfi','meeting','daily')),
  title TEXT NOT NULL, data_classification TEXT NOT NULL CHECK(data_classification IN ('synthetic','authorized')),
  status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','canceled')),
  cohort TEXT NOT NULL CHECK(cohort IN ('baseline','learning','holdout')),
  payload_json TEXT NOT NULL, evaluation_json TEXT, input_sha256 TEXT NOT NULL,
  request_hash TEXT NOT NULL, client_request_id TEXT NOT NULL, created_by TEXT NOT NULL,
  created_at TEXT NOT NULL, not_before TEXT NOT NULL, started_at TEXT, completed_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0, stage TEXT NOT NULL DEFAULT 'Waiting for local runner',
  claimed_by TEXT, lease_token_hash TEXT, lease_expires_at TEXT,
  lesson_policy TEXT NOT NULL CHECK(lesson_policy IN ('fixed','latest_approved')),
  lesson_release_id TEXT, lesson_version INTEGER, lesson_snapshot_json TEXT,
  result_json TEXT, provenance_json TEXT, timings_json TEXT,
  completion_id TEXT, completion_hash TEXT, error TEXT,
  UNIQUE(created_by,client_request_id)
);
CREATE INDEX IF NOT EXISTS jobs_ready ON jobs(status,not_before,created_at);
CREATE INDEX IF NOT EXISTS jobs_lease ON jobs(status,lease_expires_at);
CREATE INDEX IF NOT EXISTS jobs_claim_token ON jobs(lease_token_hash);
CREATE TABLE IF NOT EXISTS job_attempts (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), attempt INTEGER NOT NULL,
  runner_id TEXT NOT NULL REFERENCES principals(id), lease_token_hash TEXT NOT NULL,
  started_at TEXT NOT NULL, ended_at TEXT, status TEXT NOT NULL,
  error TEXT, UNIQUE(job_id,attempt)
);
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), reviewer_id TEXT NOT NULL,
  created_at TEXT NOT NULL, decision TEXT NOT NULL CHECK(decision IN ('answer_from_records','formal_clarification','needs_review')),
  corrected_answer TEXT NOT NULL, notes TEXT NOT NULL, citations_json TEXT NOT NULL,
  metrics_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reviews_job ON reviews(job_id,created_at,id);
CREATE TABLE IF NOT EXISTS lesson_proposals (
  id TEXT PRIMARY KEY, review_id TEXT NOT NULL REFERENCES reviews(id), proposed_by TEXT NOT NULL,
  title TEXT NOT NULL, text TEXT NOT NULL, applies_to_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lesson_releases (
  id TEXT PRIMARY KEY, version INTEGER NOT NULL UNIQUE, label TEXT NOT NULL,
  created_at TEXT NOT NULL, approved_by TEXT NOT NULL, items_json TEXT NOT NULL,
  digest TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY, at TEXT NOT NULL, actor_id TEXT NOT NULL, event TEXT NOT NULL,
  subject_id TEXT, detail_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_at ON audit_events(at);

-- Additive Demo 3 task-board migration. Existing jobs, sources and reviews stay intact.
CREATE TABLE IF NOT EXISTS board_state (
  id TEXT PRIMARY KEY CHECK(id='main'), version INTEGER NOT NULL DEFAULT 0,
  mutation_id TEXT, updated_at TEXT NOT NULL, state_json TEXT NOT NULL
);
INSERT OR IGNORE INTO board_state(id,version,updated_at,state_json)
VALUES('main',0,'2026-11-02T00:00:00.000Z','{"version":0,"tasks":[],"documents":[],"appliedJobIds":[]}');
CREATE TABLE IF NOT EXISTS board_snapshots (
  job_id TEXT PRIMARY KEY REFERENCES jobs(id), board_version INTEGER NOT NULL,
  state_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS board_events (
  id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, created_at TEXT NOT NULL,
  kind TEXT NOT NULL, job_id TEXT REFERENCES jobs(id),
  base_version INTEGER NOT NULL, version INTEGER NOT NULL UNIQUE,
  client_mutation_id TEXT NOT NULL, request_hash TEXT NOT NULL,
  before_json TEXT NOT NULL, after_json TEXT NOT NULL, detail_json TEXT NOT NULL,
  undone_by TEXT REFERENCES board_events(id),
  UNIQUE(actor_id,client_mutation_id)
);
CREATE INDEX IF NOT EXISTS board_events_job ON board_events(job_id,version);
CREATE TABLE IF NOT EXISTS board_reviews (
  id TEXT PRIMARY KEY REFERENCES reviews(id), job_id TEXT NOT NULL REFERENCES jobs(id),
  event_id TEXT NOT NULL REFERENCES board_events(id), decisions_json TEXT NOT NULL,
  metrics_json TEXT NOT NULL
);

-- The client site is separate from the Team 2 experiment. Client accounts
-- cannot authenticate as experiment principals or read the experiment board.
CREATE TABLE IF NOT EXISTS client_projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS client_users (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES client_projects(id),
  name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('gc','sub')), trade TEXT NOT NULL DEFAULT '',
  password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS client_sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES client_users(id),
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS client_sessions_user ON client_sessions(user_id,created_at);
CREATE INDEX IF NOT EXISTS client_sessions_expiry ON client_sessions(expires_at);
CREATE TABLE IF NOT EXISTS client_invites (
  code_hash TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES client_projects(id),
  email TEXT NOT NULL, trade TEXT NOT NULL, created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL, used_by TEXT
);
CREATE INDEX IF NOT EXISTS client_invites_project ON client_invites(project_id,expires_at);
CREATE TABLE IF NOT EXISTS client_auth_rates (
  scope TEXT NOT NULL, bucket INTEGER NOT NULL, hits INTEGER NOT NULL,
  PRIMARY KEY(scope,bucket)
);
CREATE INDEX IF NOT EXISTS client_auth_rates_age ON client_auth_rates(bucket);
CREATE TABLE IF NOT EXISTS client_runs (
  job_id TEXT PRIMARY KEY REFERENCES jobs(id),
  user_id TEXT NOT NULL REFERENCES client_users(id),
  project_id TEXT NOT NULL REFERENCES client_projects(id),
  shareable INTEGER NOT NULL CHECK(shareable IN (0,1)),
  shared INTEGER NOT NULL CHECK(shared IN (0,1) AND shared <= shareable)
);
CREATE INDEX IF NOT EXISTS client_runs_user ON client_runs(user_id);
CREATE INDEX IF NOT EXISTS client_runs_project ON client_runs(project_id,shared);
CREATE TABLE IF NOT EXISTS client_boards (
  user_id TEXT NOT NULL REFERENCES client_users(id),
  shareable INTEGER NOT NULL CHECK(shareable IN (0,1)),
  version INTEGER NOT NULL, mutation_id TEXT NOT NULL, state_json TEXT NOT NULL,
  PRIMARY KEY(user_id,shareable)
);
CREATE TABLE IF NOT EXISTS client_evaluations (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES client_runs(job_id),
  reviewer_id TEXT NOT NULL REFERENCES client_users(id),
  decision TEXT NOT NULL CHECK(decision IN ('accept','revise')),
  notes TEXT NOT NULL, metrics_json TEXT NOT NULL, created_at TEXT NOT NULL,
  applied INTEGER NOT NULL CHECK(applied IN (0,1)),
  UNIQUE(job_id,reviewer_id)
);
CREATE INDEX IF NOT EXISTS client_evaluations_job ON client_evaluations(job_id,created_at);

CREATE TABLE IF NOT EXISTS client_guidance (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES client_users(id),
  shareable INTEGER NOT NULL CHECK(shareable IN (0,1)),
  version INTEGER NOT NULL, text TEXT NOT NULL,
  source_job_id TEXT NOT NULL UNIQUE REFERENCES client_runs(job_id),
  source_review_id TEXT NOT NULL REFERENCES client_evaluations(id),
  created_at TEXT NOT NULL, archived_at TEXT,
  UNIQUE(user_id,shareable,version)
);
CREATE INDEX IF NOT EXISTS client_guidance_active ON client_guidance(user_id,shareable,archived_at,version);
