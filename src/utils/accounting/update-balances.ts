import mongoose, { Types } from "mongoose";
import Ledger from "../../modules/v1/ledger/ledger.model";

type ClientSession = mongoose.mongo.ClientSession;

/**
 * Update ledger balances for a single voucher: debit ledger balance += amount,
 * credit ledger balance -= amount (double-entry).
 * Uses atomic findOneAndUpdate to avoid race conditions.
 * Pass session to run inside a transaction (recommended).
 *
 * @param debitLedgerId - Debit ledger ID
 * @param creditLedgerId - Credit ledger ID
 * @param amount - Amount (must be > 0)
 * @param session - Optional MongoDB session; use when calling from a transaction
 */
export async function applyVoucherBalances(
  debitLedgerId: Types.ObjectId,
  creditLedgerId: Types.ObjectId,
  amount: number,
  session?: ClientSession,
): Promise<void> {
  if (amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  const opts = session ? { session } : {};
  await Promise.all([
    Ledger.findByIdAndUpdate(debitLedgerId, { $inc: { balance: amount } }, opts),
    Ledger.findByIdAndUpdate(creditLedgerId, { $inc: { balance: -amount } }, opts),
  ]);
}

/**
 * Reverse ledger balances for a voucher (e.g. on delete or edit).
 * Debit balance -= amount, credit balance += amount.
 * Pass session to run inside a transaction (recommended).
 *
 * @param debitLedgerId - Debit ledger ID
 * @param creditLedgerId - Credit ledger ID
 * @param amount - Amount (must be > 0)
 * @param session - Optional MongoDB session; use when calling from a transaction
 */
export async function reverseVoucherBalances(
  debitLedgerId: Types.ObjectId,
  creditLedgerId: Types.ObjectId,
  amount: number,
  session?: ClientSession,
): Promise<void> {
  if (amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  const opts = session ? { session } : {};
  await Promise.all([
    Ledger.findByIdAndUpdate(debitLedgerId, { $inc: { balance: -amount } }, opts),
    Ledger.findByIdAndUpdate(creditLedgerId, { $inc: { balance: amount } }, opts),
  ]);
}
