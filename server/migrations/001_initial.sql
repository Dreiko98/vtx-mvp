CREATE TABLE users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('athlete','brand')), name TEXT NOT NULL, profile TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE offers (
 id TEXT PRIMARY KEY, brand_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, description TEXT NOT NULL,
 sport TEXT NOT NULL, region TEXT NOT NULL, values_json TEXT NOT NULL, type TEXT NOT NULL,
 budget REAL NOT NULL CHECK(budget >= 0), deadline TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
 deliverables TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','published','closed')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE applications (
 id TEXT PRIMARY KEY, offer_id TEXT NOT NULL REFERENCES offers(id), athlete_id TEXT NOT NULL REFERENCES users(id),
 motivation TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('submitted','reviewing','shortlisted','negotiating','proposed','accepted','rejected','withdrawn')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(offer_id,athlete_id)
);
CREATE TABLE application_events (id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id), actor_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE messages (id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id), sender_id TEXT NOT NULL REFERENCES users(id), text TEXT NOT NULL, read_at TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE proposals (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id), value REAL NOT NULL CHECK(value >= 0),
 start_date TEXT NOT NULL, end_date TEXT NOT NULL, terms TEXT NOT NULL, deliverables TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined','superseded')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX one_pending_proposal ON proposals(application_id) WHERE status='pending';
CREATE TABLE sponsorships (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL UNIQUE REFERENCES applications(id), proposal_id TEXT NOT NULL UNIQUE REFERENCES proposals(id),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed')), paid REAL NOT NULL DEFAULT 0 CHECK(paid >= 0),
 payment_note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE deliverables (
 id TEXT PRIMARY KEY, sponsorship_id TEXT NOT NULL REFERENCES sponsorships(id), title TEXT NOT NULL, due TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','submitted','changes_requested','approved')), evidence_url TEXT NOT NULL DEFAULT '',
 note TEXT NOT NULL DEFAULT '', review_note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE contracts (id TEXT PRIMARY KEY, sponsorship_id TEXT NOT NULL REFERENCES sponsorships(id), uploaded_by TEXT NOT NULL REFERENCES users(id), filename TEXT NOT NULL, document BLOB NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE results (
 id TEXT PRIMARY KEY, sponsorship_id TEXT NOT NULL REFERENCES sponsorships(id), author_id TEXT NOT NULL REFERENCES users(id),
 date TEXT NOT NULL, reach INTEGER NOT NULL CHECK(reach >= 0), engagements INTEGER NOT NULL CHECK(engagements >= 0), sales REAL NOT NULL CHECK(sales >= 0),
 cost REAL NOT NULL CHECK(cost >= 0), source TEXT NOT NULL, note TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(sponsorship_id,date)
);
CREATE TABLE saved_profiles (user_id TEXT NOT NULL REFERENCES users(id), target_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(user_id,target_id));
CREATE TABLE profile_views (viewer_id TEXT NOT NULL REFERENCES users(id), target_id TEXT NOT NULL REFERENCES users(id), date TEXT NOT NULL, PRIMARY KEY(viewer_id,target_id,date));
CREATE INDEX applications_athlete ON applications(athlete_id);
CREATE INDEX messages_application ON messages(application_id,created_at);
