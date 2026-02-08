import { Types } from "mongoose";
import Ledger from "../../modules/v1/ledger/ledger.model";

/**
 * Update ledger balances for a single voucher: debit ledger balance += amount,
 * credit ledger balance -= amount (double-entry).
 * Uses atomic findOneAndUpdate to avoid race conditions.
 *
 * @param debitLedgerId - Debit ledger ID
 * @param creditLedgerId - Credit ledger ID
 * @param amount - Amount (must be > 0)
 */
export async function applyVoucherBalances(
  debitLedgerId: Types.ObjectId,
  creditLedgerId: Types.ObjectId,
  amount: number,
): Promise<void> {
  if (amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  await Promise.all([
    Ledger.findByIdAndUpdate(debitLedgerId, { $inc: { balance: amount } }),
    Ledger.findByIdAndUpdate(creditLedgerId, { $inc: { balance: -amount } }),
  ]);
}

/**
 * Reverse ledger balances for a voucher (e.g. on delete or edit).
 * Debit balance -= amount, credit balance += amount.
 *
 * @param debitLedgerId - Debit ledger ID
 * @param creditLedgerId - Credit ledger ID
 * @param amount - Amount (must be > 0)
 */
export async function reverseVoucherBalances(
  debitLedgerId: Types.ObjectId,
  creditLedgerId: Types.ObjectId,
  amount: number,
): Promise<void> {
  if (amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  await Promise.all([
    Ledger.findByIdAndUpdate(debitLedgerId, { $inc: { balance: -amount } }),
    Ledger.findByIdAndUpdate(creditLedgerId, { $inc: { balance: amount } }),
  ]);
}
