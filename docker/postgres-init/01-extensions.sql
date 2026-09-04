-- Runs once when the Postgres data volume is first created.
-- btree_gist is required for the bookings overlap EXCLUDE constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist;
