-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_path TEXT NOT NULL,
  page_title TEXT DEFAULT '',
  parent_id INTEGER DEFAULT NULL,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  website TEXT DEFAULT '',
  content TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  is_pinned INTEGER DEFAULT 0,
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  ip_hash TEXT,
  email_hash TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_page ON comments(page_path, status, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_pinned ON comments(page_path, is_pinned DESC);
CREATE INDEX IF NOT EXISTS idx_comments_email_hash ON comments(email_hash);
CREATE INDEX IF NOT EXISTS idx_comments_recent ON comments(status, created_at DESC);

-- Votes table (prevent duplicate votes)
CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL,
  voter_fingerprint TEXT NOT NULL,
  vote_type TEXT NOT NULL CHECK(vote_type IN ('up', 'down')),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(comment_id, voter_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_votes_comment ON votes(comment_id);

-- Admins table
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Trusted users table (auto-approve after first approval)
CREATE TABLE IF NOT EXISTS trusted_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_hash TEXT UNIQUE NOT NULL,
  first_approved_at TEXT DEFAULT (datetime('now'))
);
