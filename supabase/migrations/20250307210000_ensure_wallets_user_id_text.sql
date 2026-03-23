-- Ensure wallets.user_id is text for Clerk user IDs (e.g. user_xxx).
-- If the column was created as uuid (e.g. by an older schema), convert it to text.
-- Idempotent: only alters when data_type is 'uuid'.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'wallets'
      AND column_name = 'user_id'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE wallets
      ALTER COLUMN user_id TYPE text USING user_id::text;
  END IF;
END
$$;

comment on column wallets.user_id is 'App user identifier (e.g. Clerk user ID).';

-- Ensure batch_claims.user_id is text for Clerk user IDs (if column exists and is uuid).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'batch_claims'
      AND column_name = 'user_id'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE batch_claims
      ALTER COLUMN user_id TYPE text USING user_id::text;
  END IF;
END
$$;
