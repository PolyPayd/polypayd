import assert from "node:assert/strict";
import {
  calculatePayoutPricing,
  calculateTopupChargeFromWalletCredit,
  evaluateWithdrawalAmountInput,
  resolveWithdrawalPricing,
  resolveWithdrawalPricingFromWalletGbp,
} from "./pricing";

const t = calculateTopupChargeFromWalletCredit(1000);
assert.equal(t.walletCreditMinor, 1000);
assert.equal(t.processingFeeMinor, 30);
assert.equal(t.totalChargeMinor, 1030);

const p = calculatePayoutPricing(1000);
assert.equal(p.payoutAmountMinor, 1000);
assert.equal(p.feeMinor, 15);
assert.equal(p.totalDebitMinor, 1015);

// £3, enough balance for fee on top: receive full £3.00, wallet −£3.30
const wTop = resolveWithdrawalPricing(300, 10_000);
assert.equal(wTop.withdrawalAmountMinor, 300);
assert.equal(wTop.feeMinor, 30);
assert.equal(wTop.netPayoutMinor, 300);
assert.equal(wTop.totalWalletDebitMinor, 330);
assert.equal(wTop.feeDeductedFromWithdrawal, false);
assert.equal(wTop.feeMode, "charged_separately");

// £3, only £3.00 available: fee taken from withdrawal → net £2.70, wallet −£3.00
const wFrom = resolveWithdrawalPricing(300, 300);
assert.equal(wFrom.withdrawalAmountMinor, 300);
assert.equal(wFrom.feeMinor, 30);
assert.equal(wFrom.netPayoutMinor, 270);
assert.equal(wFrom.totalWalletDebitMinor, 300);
assert.equal(wFrom.feeDeductedFromWithdrawal, true);
assert.equal(wFrom.feeMode, "deducted_from_withdrawal");

// £50, fee on top: 1% £0.50, debit £50.50, receive £50
const w50 = resolveWithdrawalPricing(5000, 100_000);
assert.equal(w50.netPayoutMinor, 5000);
assert.equal(w50.feeMinor, 50);
assert.equal(w50.totalWalletDebitMinor, 5050);
assert.equal(w50.feeDeductedFromWithdrawal, false);

// Screenshot case: £1000 available, £1000 request, fee £10 → fee from withdrawal (1010 > 1000)
const w1k = resolveWithdrawalPricing(100_000, 100_000);
assert.equal(w1k.feeMinor, 1000);
assert.equal(w1k.netPayoutMinor, 99_000);
assert.equal(w1k.totalWalletDebitMinor, 100_000);
assert.equal(w1k.feeDeductedFromWithdrawal, true);

// £1000 + £1010 available → fee on top
const w1kTop = resolveWithdrawalPricing(100_000, 101_000);
assert.equal(w1kTop.netPayoutMinor, 100_000);
assert.equal(w1kTop.totalWalletDebitMinor, 101_000);
assert.equal(w1kTop.feeDeductedFromWithdrawal, false);
assert.equal(w1kTop.feeMode, "charged_separately");

// £121.00 request, £2,905.45 available → fee £1.21 on top, debit £122.21, receive £121.00
const exSep = resolveWithdrawalPricingFromWalletGbp(12100, 2905.45);
assert.equal(exSep.feeMinor, 121);
assert.equal(exSep.totalWalletDebitMinor, 12221);
assert.equal(exSep.netPayoutMinor, 12100);
assert.equal(exSep.feeMode, "charged_separately");

// £121.00 request, £121.00 available → fee from amount, debit £121, receive £119.79
const exDed = resolveWithdrawalPricingFromWalletGbp(12100, 121);
assert.equal(exDed.feeMinor, 121);
assert.equal(exDed.totalWalletDebitMinor, 12100);
assert.equal(exDed.netPayoutMinor, 11979);
assert.equal(exDed.feeMode, "deducted_from_withdrawal");

const bad = evaluateWithdrawalAmountInput("500", 3);
assert.equal(bad.variant, "invalid");
if (bad.variant === "invalid") {
  assert.ok(bad.message.includes("Insufficient"));
}

const good = evaluateWithdrawalAmountInput("2", 10);
assert.equal(good.variant, "ready");

console.log("pricing.selftest: ok");
