-- Add amount_per_claim to batches for claimable payout pools
alter table batches
  add column if not exists amount_per_claim numeric null;

comment on column batches.amount_per_claim is 'Fixed amount per claim for claimable batches; total_amount / max_claims.';

-- Add claim_amount to batch_claims to store the amount assigned to each claim
alter table batch_claims
  add column if not exists claim_amount numeric null;

comment on column batch_claims.claim_amount is 'Monetary amount assigned to this claim (batch.amount_per_claim at claim time).';
