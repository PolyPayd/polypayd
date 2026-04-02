/**
 * Connected-account wallet top-up helpers (pure; safe for unit tests).
 */

export type TopupMetadataLike = Record<string, string | undefined>;

export function shouldImmediateReleaseWalletTopup(metadata: TopupMetadataLike): boolean {
  const model = (metadata.topup_funding_model ?? "").trim().toLowerCase();
  if (model === "connected") return true;
  const acct = (metadata.stripe_connect_account_id ?? "").trim();
  return acct.length > 0;
}
