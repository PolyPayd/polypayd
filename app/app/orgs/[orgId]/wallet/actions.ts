"use server";

export type AddFundsState = { error?: string; success?: boolean };

export async function addFunds(
  _orgId: string,
  _amount: number,
  _currency: string,
  _note?: string
): Promise<AddFundsState> {
  // Intentionally disabled: wallet balance changes must come from Stripe webhook only.
  return {
    error:
      "Direct wallet credit is disabled. Use Stripe top-up checkout so balance is updated by webhook.",
  };
}
