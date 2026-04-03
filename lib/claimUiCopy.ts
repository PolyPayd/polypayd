/**
 * Human-friendly copy for claim-to-wallet API errors (recipient-facing).
 * Keeps technical details out of the UI where possible.
 */
export function mapClaimErrorMessage(raw: string | undefined): { title: string; detail?: string } {
  const t = (raw ?? "").trim();
  const lower = t.toLowerCase();

  if (!t) {
    return { title: "Something went wrong", detail: "Please try again in a moment." };
  }
  if (lower.includes("invalid claim link") || lower.includes("invalid claim")) {
    return { title: "This link isn’t valid", detail: "Ask the sender for a new claim link." };
  }
  if (lower.includes("must be signed in") || lower.includes("signed in to claim")) {
    return { title: "Sign in to continue", detail: "Use the same account you used to join this payout." };
  }
  if (lower.includes("expired")) {
    return { title: "This payout has expired", detail: "Contact the organiser if you still need access." };
  }
  if (lower.includes("wrong user") || lower.includes("not authorised") || lower.includes("not authorized")) {
    return { title: "Wrong account", detail: "Sign in with the account that joined this payout." };
  }
  if (lower.includes("already") && (lower.includes("claim") || lower.includes("credited"))) {
    return { title: "Already claimed", detail: "This amount was added to your wallet earlier." };
  }
  if (lower.includes("not funded") || lower.includes("not ready")) {
    return { title: "Not ready yet", detail: "The organiser hasn’t finished funding this payout." };
  }
  if (lower.includes("batch") && lower.includes("complete")) {
    return { title: "This payout is closed", detail: "No further claims are possible for this batch." };
  }
  if (t.length < 160 && !t.includes("rpc") && !t.includes("p_")) {
    return { title: t };
  }
  return { title: "We couldn’t complete your claim", detail: "Please try again or contact support if this continues." };
}
