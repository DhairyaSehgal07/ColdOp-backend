import { Types } from "mongoose";
import Ledger, { LedgerType } from "../../modules/v1/ledger/ledger.model";
import Voucher, { VoucherType } from "../../modules/v1/voucher/voucher.model";

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
  voucherNumber: number;
  amount: number;
  narration: string;
  coldStorageId: Types.ObjectId;
  farmerStorageLinkId?: Types.ObjectId | null;
  createdBy: Types.ObjectId;
  /** Voucher date. Defaults to current date if omitted. */
  date?: Date;
}

export async function createVoucher({
  creditLedgerId,
  debitLedgerId,
  voucherNumber,
  amount,
  narration,
  coldStorageId,
  farmerStorageLinkId = null,
  createdBy,
  date = new Date(),
}: CreateVoucherParams) {
  const voucher = await Voucher.create({
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
  });
  return voucher;
}
