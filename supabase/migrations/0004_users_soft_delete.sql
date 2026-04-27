-- Add soft-delete support to users.
-- Hard deletes are avoided because the users table is referenced by ledger_entries,
-- claims, and audit_logs — orphaning those records would break financial integrity.

ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Partial index: only indexes the rare deleted rows, keeping the index small.
CREATE INDEX IF NOT EXISTS idx_users_deleted_at
  ON users (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS: exclude soft-deleted users from client-visible queries.
-- The service role bypasses RLS entirely, so server-side code can still
-- read deleted records when needed (e.g. audit trail lookups).
-- ---------------------------------------------------------------------------

-- Drop and recreate the existing user read/update policies to add the guard.
-- (DROP IF EXISTS is safe here — these were created in 0002.)

DROP POLICY IF EXISTS "users: read own row"   ON users;
DROP POLICY IF EXISTS "users: update own row" ON users;

CREATE POLICY "users: read own row"
  ON users FOR SELECT
  -- Guard: never expose a soft-deleted row to the owning user or admin queries.
  USING (deleted_at IS NULL AND (id = auth.uid() OR is_admin()));

CREATE POLICY "users: update own row"
  ON users FOR UPDATE
  USING (deleted_at IS NULL AND id = auth.uid());
