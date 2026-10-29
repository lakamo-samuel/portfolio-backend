CREATE TABLE IF NOT EXISTS projects (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  tech text[] NOT NULL DEFAULT '{}',
  thumbnail text NOT NULL,
  screenshot text NOT NULL,
  github text,
  live text,
  case_study jsonb NOT NULL DEFAULT '{"problem":"","approach":"","highlights":[],"outcome":""}'::jsonb,
  published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS visits (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  page_path text NOT NULL,
  session_hash text NOT NULL,
  visitor_hash text NOT NULL,
  referrer_host text
);
CREATE INDEX IF NOT EXISTS visits_occurred_at_idx ON visits (occurred_at);
CREATE INDEX IF NOT EXISTS visits_page_path_idx ON visits (page_path);
CREATE INDEX IF NOT EXISTS visits_session_hash_idx ON visits (session_hash, occurred_at);


CREATE TABLE IF NOT EXISTS site_content (
  id text PRIMARY KEY CHECK (id = 'main'),
  content jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
