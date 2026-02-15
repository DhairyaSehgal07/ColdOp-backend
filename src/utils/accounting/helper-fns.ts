import mongoose, { Types } from "mongoose";
import type { FastifyBaseLogger } from "fastify";
import Ledger, { LedgerType } from "../../modules/v1/ledger/ledger.model.js";
import Voucher, {
  VoucherType,
} from "../../modules/v1/voucher/voucher.model.js";
import { applyVoucherBalances } from "./update-balances.js";

interface CreateDebtorLedgerParams {
  farmerStorageLinkId: Types.ObjectId;
  coldStorageId: Types.ObjectId;
  /** Ledger display name (e.g. farmer name). Defaults to "Farmer Debtor A/c" if omitted. */
  name?: string;
  openingBalance?: number;
  createdBy: Types.ObjectId;
}

export async function createDebtorLedger({
  farmerStorageLinkId,
  coldStorageId,
  name = "Farmer Debtor A/c",
  openingBalance = 0,
  createdBy,
}: CreateDebtorLedgerParams) {
  // Prevent duplicate debtor ledger for same farmer & cold storage
  const existingLedger = await Ledger.findOne({
    coldStorageId,
    farmerStorageLinkId,
    category: "Debtors",
  }).lean();

  if (existingLedger) {
    return existingLedger;
  }

  const ledger = await Ledger.create({
    name,
    type: LedgerType.Asset,
    subType: "Current Assets",
    category: "Debtors",

    openingBalance,
    balance: openingBalance,
    closingBalance: null,

    coldStorageId,
    farmerStorageLinkId,

    createdBy,
    isSystemLedger: false,
  });

  return ledger;
}

export interface CreateVoucherParams {
  creditLedgerId: Types.ObjectId;
  debitLedgerId: Types.ObjectId;
  amount: number;
  narration: string;
  coldStorageId: Types.ObjectId;
  farmerStorageLinkId?: Types.ObjectId | null;
  createdBy: Types.ObjectId;
  /** Voucher date. Defaults to current date if omitted. */
  date?: Date;
}

/**
 * Create a journal voucher and update debit/credit ledger balances in a single
 * MongoDB transaction. Ensures voucher creation and balance updates succeed or
 * fail together (best practice for double-entry consistency).
 */
export async function createVoucher({
  creditLedgerId,
  debitLedgerId,
  amount,
  narration,
  coldStorageId,
  farmerStorageLinkId = null,
  createdBy,
  date = new Date(),
}: CreateVoucherParams) {
  if (amount <= 0) {
    throw new Error("Voucher amount must be greater than 0");
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const voucherNumber = await getNextGeneralVoucherNumber(
      coldStorageId.toString(),
      undefined,
      session,
    );

    const [voucher] = await Voucher.create(
      [
        {
          type: VoucherType.Journal,
          voucherNumber,
          date,
          debitLedger: debitLedgerId,
          creditLedger: creditLedgerId,
          amount,
          narration,
          coldStorageId,
          farmerStorageLinkId,
          createdBy,
        },
      ],
      { session },
    );

    await applyVoucherBalances(debitLedgerId, creditLedgerId, amount, session);

    await session.commitTransaction();
    return voucher;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
}

/**
 * Get the next journal voucher number for the given cold storage.
 * One sequence per cold storage (same as incoming/outgoing gate pass numbers).
 * Call with the current logged-in user's cold storage ID (e.g. from request.user.coldStorageId).
 *
 * @param coldStorageId - Cold storage ID (use the logged-in user's cold storage).
 * @param logger - Optional Fastify logger for debug.
 * @param session - Optional MongoDB session; use when generating number inside a transaction.
 * @returns Next voucher number (1 if no vouchers exist).
 */
export async function getNextGeneralVoucherNumber(
  coldStorageId: string,
  logger?: FastifyBaseLogger,
  session?: mongoose.mongo.ClientSession,
): Promise<number> {
  const coldStorageObjectId = new Types.ObjectId(coldStorageId);

  const agg = Voucher.aggregate<{ maxNo: number | null }>([
    { $match: { coldStorageId: coldStorageObjectId } },
    { $group: { _id: null, maxNo: { $max: "$voucherNumber" } } },
    { $project: { maxNo: 1, _id: 0 } },
  ]);

  if (session) {
    agg.session(session);
  }

  const result = await agg.exec();
  const next = (result[0]?.maxNo ?? 0) + 1;

  logger?.debug(
    { coldStorageId, next },
    "Next general (journal) voucher number",
  );
  return next;
}
