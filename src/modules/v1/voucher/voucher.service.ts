import mongoose, { Types } from "mongoose";
import type { FastifyBaseLogger } from "fastify";
import Voucher from "./voucher.model.js";
import Ledger from "../ledger/ledger.model.js";
import {
  applyVoucherBalances,
  reverseVoucherBalances,
} from "../../../utils/accounting/update-balances.js";
import {
  getNextGeneralVoucherNumber,
  createVoucher as createJournalVoucher,
  findLabourThekedarLedger,
  LABOUR_THEKEDAR_LEDGER_NAME,
} from "../../../utils/accounting/helper-fns.js";
import type {
  CreateVoucherInput,
  CreateLabourExpenseInput,
  UpdateVoucherInput,
  ListVouchersQuery,
} from "./voucher.schema.js";
import { NotFoundError, BadRequestError } from "../../../utils/errors.js";
import { VoucherType } from "./voucher.model.js";

const OTHER_LABOUR_EXPENSES_LEDGER_NAME = "Other Labour Expenses";

type LabourExpenseBagRates = {
  lenoBags: number;
  juteBags: number;
  lenoRate: number;
  juteRate: number;
};

function labourExpenseBreakdown(entry: LabourExpenseBagRates): string {
  const parts: string[] = [];
  if (entry.lenoBags > 0) {
    parts.push(`${entry.lenoBags} leno bags × ${entry.lenoRate}`);
  }
  if (entry.juteBags > 0) {
    parts.push(`${entry.juteBags} jute bags × ${entry.juteRate}`);
  }
  return parts.join(" + ");
}

function labourExpenseNarration(
  ledgerName: string,
  amount: number,
  entry: LabourExpenseBagRates,
): string {
  const breakdown = labourExpenseBreakdown(entry);
  const suffix = breakdown ? ` (${breakdown})` : "";
  return `Labour expense: ${ledgerName} — ${amount}${suffix}`;
}

function resolveLabourExpenseNarration(
  ledgerName: string,
  amount: number,
  entry: LabourExpenseBagRates,
  customNarration?: string,
): string {
  const isOtherLabourExpenses =
    ledgerName.toLowerCase() === OTHER_LABOUR_EXPENSES_LEDGER_NAME.toLowerCase();
  const breakdown = labourExpenseBreakdown(entry);
  const suffix = breakdown ? ` (${breakdown})` : "";
  if (isOtherLabourExpenses && customNarration) {
    return `${customNarration}${suffix}`;
  }
  return labourExpenseNarration(ledgerName, amount, entry);
}

/**
 * Create one journal voucher per debit row, all crediting Labour Thekedar.
 * Runs in a single transaction so a failure rolls back every voucher.
 */
export async function createLabourExpenseVouchers(
  payload: CreateLabourExpenseInput,
  coldStorageId: string,
  createdById: string,
  logger?: FastifyBaseLogger,
): Promise<Record<string, unknown>> {
  const coldId = toObjectId(coldStorageId);
  const createdByObjId = toObjectId(createdById);
  const creditLedger = await findLabourThekedarLedger(coldId);
  if (!creditLedger) {
    throw new NotFoundError(
      "Labour Thekedar ledger not found for the current store",
      "LABOUR_THEKEDAR_LEDGER_NOT_FOUND",
    );
  }
  const creditLedgerId = creditLedger._id;

  const debitIds = payload.debits.map((d) => toObjectId(d.debitLedgerId));
  const uniqueDebitIds = [...new Map(debitIds.map((id) => [id.toString(), id])).values()];

  const debitLedgers = await Ledger.find({
    _id: { $in: uniqueDebitIds },
    coldStorageId: coldId,
  })
    .select("_id name farmerStorageLinkId")
    .lean();

  const debitById = new Map(
    debitLedgers.map((ledger) => [ledger._id.toString(), ledger]),
  );

  for (const entry of payload.debits) {
    if (entry.debitLedgerId === creditLedgerId.toString()) {
      throw new BadRequestError("Debit and credit ledgers must be different");
    }
    if (!debitById.has(entry.debitLedgerId)) {
      throw new NotFoundError("One or more debit ledgers not found");
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  const createdIds: Types.ObjectId[] = [];
  try {
    for (const entry of payload.debits) {
      const debitLedger = debitById.get(entry.debitLedgerId)!;
      const debitLedgerId = toObjectId(entry.debitLedgerId);
      const name =
        typeof debitLedger.name === "string" && debitLedger.name.trim()
          ? debitLedger.name.trim()
          : "Labour";
      const farmerStorageLinkId =
        debitLedger.farmerStorageLinkId != null
          ? debitLedger.farmerStorageLinkId
          : null;

      const voucher = await createJournalVoucher({
        creditLedgerId,
        debitLedgerId,
        amount: entry.amount,
        narration: resolveLabourExpenseNarration(
          name,
          entry.amount,
          entry,
          entry.narration,
        ),
        coldStorageId: coldId,
        farmerStorageLinkId,
        createdBy: createdByObjId,
        date: payload.date,
        session,
      });
      createdIds.push(voucher._id as Types.ObjectId);
    }

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }

  const created = await Voucher.find({ _id: { $in: createdIds } })
    .populate("debitLedger", "name")
    .populate("creditLedger", "name")
    .lean();
  const createdByIdMap = new Map(
    created.map((voucher) => [voucher._id.toString(), voucher]),
  );
  const vouchers = createdIds
    .map((id) => createdByIdMap.get(id.toString()))
    .filter(Boolean);

  logger?.info(
    { count: vouchers.length, coldStorageId },
    "Labour expense vouchers created",
  );

  return {
    creditLedgerId: creditLedgerId.toString(),
    creditLedgerName: LABOUR_THEKEDAR_LEDGER_NAME,
    vouchers,
  };
}

type QueryFilter = Record<string, unknown>;

function toObjectId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}

/**
 * Create a new voucher with transaction: next voucher number, create doc, apply ledger balances.
 */
export async function createVoucher(
  payload: CreateVoucherInput,
  coldStorageId: string,
  createdById: string,
  logger?: FastifyBaseLogger,
): Promise<Record<string, unknown>> {
  const coldId = toObjectId(coldStorageId);
  const createdByObjId = new Types.ObjectId(createdById);
  const farmerStorageLinkId =
    payload.farmerStorageLinkId != null && payload.farmerStorageLinkId !== ""
      ? new Types.ObjectId(payload.farmerStorageLinkId)
      : null;

  const debitLedgerId = toObjectId(payload.debitLedger);
  const creditLedgerId = toObjectId(payload.creditLedger);

  const [debitLedger, creditLedger] = await Promise.all([
    Ledger.findOne({ _id: debitLedgerId, coldStorageId: coldId }).lean(),
    Ledger.findOne({ _id: creditLedgerId, coldStorageId: coldId }).lean(),
  ]);

  if (!debitLedger || !creditLedger) {
    logger?.warn(
      { debitLedgerId, creditLedgerId, coldStorageId },
      "Ledger not found",
    );
    throw new NotFoundError("One or both ledgers not found");
  }

  if (payload.debitLedger === payload.creditLedger) {
    throw new BadRequestError("Debit and credit ledgers must be different");
  }

  type LedgerScope = { farmerStorageLinkId?: Types.ObjectId | null };
  const d = debitLedger as LedgerScope;
  const c = creditLedger as LedgerScope;
  const linkD = d.farmerStorageLinkId?.toString() ?? null;
  const linkC = c.farmerStorageLinkId?.toString() ?? null;
  // Infer voucher's farmerStorageLinkId when one ledger is storage-level and the other is farmer-scoped (e.g. Store Rent)
  let resolvedFarmerStorageLinkId = farmerStorageLinkId;
  if (resolvedFarmerStorageLinkId == null || resolvedFarmerStorageLinkId.toString() === "") {
    if (linkD != null && linkC === null) {
      resolvedFarmerStorageLinkId = d.farmerStorageLinkId ?? null;
    } else if (linkC != null && linkD === null) {
      resolvedFarmerStorageLinkId = c.farmerStorageLinkId ?? null;
    }
  }
  const linkV = resolvedFarmerStorageLinkId?.toString() ?? null;
  // Same scope: both same link as voucher, OR one ledger is storage-level (null) and the other matches voucher's link (e.g. rent: Store Rent credit + farmer debit)
  const sameScope =
    (linkD === linkC && linkD === linkV) ||
    (linkD === linkV && linkC === null) ||
    (linkC === linkV && linkD === null);
  if (!sameScope) {
    throw new BadRequestError(
      "Ledgers must belong to the same cold storage and same scope (storage or same farmer-storage link)",
    );
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const voucherNumber = await getNextGeneralVoucherNumber(
      coldStorageId,
      logger,
      session,
    );

    const [created] = await Voucher.create(
      [
        {
          type: VoucherType.Journal,
          voucherNumber,
          date: payload.date,
          debitLedger: debitLedgerId,
          creditLedger: creditLedgerId,
          amount: payload.amount,
          narration: payload.narration,
          coldStorageId: coldId,
          farmerStorageLinkId: resolvedFarmerStorageLinkId,
          createdBy: createdByObjId,
        },
      ],
      { session },
    );

    await applyVoucherBalances(
      debitLedgerId,
      creditLedgerId,
      payload.amount,
      session,
    );
    await session.commitTransaction();

    const populated = await Voucher.findById(created._id)
      .populate("debitLedger", "name")
      .populate("creditLedger", "name")
      .lean();

    logger?.info(
      { voucherId: created._id, voucherNumber, coldStorageId },
      "Voucher created",
    );
    return (populated ?? created.toObject()) as unknown as Record<
      string,
      unknown
    >;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
}

/**
 * List vouchers for cold storage with optional date range and ledgerId filter.
 */
export async function getAllVouchers(
  coldStorageId: string,
  query: ListVouchersQuery,
  logger?: FastifyBaseLogger,
): Promise<Record<string, unknown>[]> {
  const coldId = toObjectId(coldStorageId);
  const filter: QueryFilter = { coldStorageId: coldId };

  const startDate = query.from ?? query.startDate;
  const endDate = query.to ?? query.endDate;
  if (startDate ?? endDate) {
    const dateRange: { $gte?: Date; $lte?: Date } = {};
    if (startDate) dateRange.$gte = startDate;
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateRange.$lte = end;
    }
    filter.date = dateRange;
  }

  if (query.ledgerId) {
    filter.$or = [
      { debitLedger: toObjectId(query.ledgerId) },
      { creditLedger: toObjectId(query.ledgerId) },
    ];
  }

  const vouchers = await Voucher.find(filter)
    .populate("debitLedger", "name")
    .populate("creditLedger", "name")
    .sort({ date: -1, voucherNumber: -1 })
    .lean();

  logger?.info({ count: vouchers.length, coldStorageId }, "Vouchers listed");
  return vouchers as unknown as Record<string, unknown>[];
}

/**
 * Get a single voucher by ID, scoped to cold storage.
 */
export async function getVoucherById(
  voucherId: string,
  coldStorageId: string,
  logger?: FastifyBaseLogger,
): Promise<Record<string, unknown>> {
  if (!mongoose.Types.ObjectId.isValid(voucherId)) {
    throw new BadRequestError("Invalid voucher ID");
  }
  const coldId = toObjectId(coldStorageId);
  const voucher = await Voucher.findOne({
    _id: new Types.ObjectId(voucherId),
    coldStorageId: coldId,
  })
    .populate("debitLedger", "name")
    .populate("creditLedger", "name")
    .lean();

  if (!voucher) {
    logger?.warn({ voucherId, coldStorageId }, "Voucher not found");
    throw new NotFoundError("Voucher not found");
  }
  return voucher as unknown as Record<string, unknown>;
}

/**
 * Update a voucher: reverse old ledger balances, apply new ones, update doc. Uses transaction.
 */
export async function updateVoucher(
  voucherId: string,
  coldStorageId: string,
  payload: UpdateVoucherInput,
  updatedById: string,
  logger?: FastifyBaseLogger,
): Promise<Record<string, unknown>> {
  if (!mongoose.Types.ObjectId.isValid(voucherId)) {
    throw new BadRequestError("Invalid voucher ID");
  }
  const coldId = toObjectId(coldStorageId);
  const oldVoucher = await Voucher.findOne({
    _id: new Types.ObjectId(voucherId),
    coldStorageId: coldId,
  });

  if (!oldVoucher) {
    logger?.warn({ voucherId, coldStorageId }, "Voucher not found");
    throw new NotFoundError("Voucher not found");
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    await reverseVoucherBalances(
      oldVoucher.debitLedger,
      oldVoucher.creditLedger,
      oldVoucher.amount,
    );

    const newDebitId =
      payload.debitLedger != null
        ? toObjectId(payload.debitLedger)
        : oldVoucher.debitLedger;
    const newCreditId =
      payload.creditLedger != null
        ? toObjectId(payload.creditLedger)
        : oldVoucher.creditLedger;
    const newAmount = payload.amount ?? oldVoucher.amount;

    if (
      payload.debitLedger != null ||
      payload.creditLedger != null ||
      payload.amount != null
    ) {
      const [debitLedger, creditLedger] = await Promise.all([
        Ledger.findOne({ _id: newDebitId, coldStorageId: coldId }).lean(),
        Ledger.findOne({ _id: newCreditId, coldStorageId: coldId }).lean(),
      ]);
      if (!debitLedger || !creditLedger) {
        await applyVoucherBalances(
          oldVoucher.debitLedger,
          oldVoucher.creditLedger,
          oldVoucher.amount,
        );
        throw new NotFoundError("One or both ledgers not found");
      }
      if (newDebitId.equals(newCreditId)) {
        await applyVoucherBalances(
          oldVoucher.debitLedger,
          oldVoucher.creditLedger,
          oldVoucher.amount,
        );
        throw new BadRequestError("Debit and credit ledgers must be different");
      }
      await applyVoucherBalances(newDebitId, newCreditId, newAmount);
    } else {
      await applyVoucherBalances(
        oldVoucher.debitLedger,
        oldVoucher.creditLedger,
        oldVoucher.amount,
      );
    }

    const updateData: Record<string, unknown> = {
      updatedBy: new Types.ObjectId(updatedById),
    };
    if (payload.date !== undefined) updateData.date = payload.date;
    if (payload.debitLedger !== undefined)
      updateData.debitLedger = toObjectId(payload.debitLedger);
    if (payload.creditLedger !== undefined)
      updateData.creditLedger = toObjectId(payload.creditLedger);
    if (payload.amount !== undefined) updateData.amount = payload.amount;
    if (payload.narration !== undefined)
      updateData.narration = payload.narration;

    const updated = await Voucher.findByIdAndUpdate(
      voucherId,
      { $set: updateData },
      { new: true, session },
    )
      .populate("debitLedger", "name")
      .populate("creditLedger", "name")
      .lean();

    await session.commitTransaction();
    logger?.info({ voucherId, coldStorageId }, "Voucher updated");
    return (updated ?? oldVoucher.toObject()) as unknown as Record<
      string,
      unknown
    >;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
}

/**
 * Delete a voucher: reverse ledger balances, then delete. Uses transaction.
 */
export async function deleteVoucher(
  voucherId: string,
  coldStorageId: string,
  logger?: FastifyBaseLogger,
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(voucherId)) {
    throw new BadRequestError("Invalid voucher ID");
  }
  const coldId = toObjectId(coldStorageId);
  const voucher = await Voucher.findOne({
    _id: new Types.ObjectId(voucherId),
    coldStorageId: coldId,
  });

  if (!voucher) {
    logger?.warn({ voucherId, coldStorageId }, "Voucher not found");
    throw new NotFoundError("Voucher not found");
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    await reverseVoucherBalances(
      voucher.debitLedger,
      voucher.creditLedger,
      voucher.amount,
    );
    await Voucher.findByIdAndDelete(voucherId, { session });
    await session.commitTransaction();
    logger?.info({ voucherId, coldStorageId }, "Voucher deleted");
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
}
