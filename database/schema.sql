-- ROBOFORGE X example schema; not connected by default.
CREATE TABLE IF NOT EXISTS robot_sessions (
  id INTEGER PRIMARY KEY,
  robot_code VARCHAR(32) NOT NULL,
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  mode VARCHAR(24) NOT NULL DEFAULT 'simulation'
);

CREATE TABLE IF NOT EXISTS joint_samples (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES robot_sessions(id),
  joint_number INTEGER NOT NULL CHECK (joint_number BETWEEN 1 AND 6),
  angle_degrees REAL NOT NULL,
  sampled_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS motion_jobs (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES robot_sessions(id),
  job_name VARCHAR(100) NOT NULL,
  target_x REAL NOT NULL,
  target_y REAL NOT NULL,
  target_z REAL NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft'
);
