-- Prevent the same user from claiming the same claimable batch more than once.
-- Safe: unique index only; no data change.
create unique index if not exists batch_claims_batch_id_user_id_key
  on batch_claims (batch_id, user_id);
