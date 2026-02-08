import mongoose, { Types } from "mongoose";
import type { FastifyBaseLogger } from "fastify";
import Ledger from "./ledger.model.js";
import Voucher from "../voucher/voucher.model.js";
import type { CreateLedgerInput, UpdateLedgerInput, ListLedgersQuery } from "./ledger.schema.js";
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from "../../../utils/errors.js";
import type { ILedger } from "./ledger.model.js";
import { LedgerType } from "./ledger.model.js";

/** Loose type for mongoose query filter objects (Mongoose 9 uses QueryFilter internally). */
type QueryFilter = Record<string, unknown>;

function toObjectId(
  coldStorageId: string,
): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(coldStorageId);
}

/**
 * Create a new ledger for the given cold storage (and optional farmer-storage link).
 */
export async function createLedger(
  payload: CreateLedgerInput,
  coldStorageId: string,
  createdById: string,
  logger?: FastifyBaseLogger,
): Promise<ILedger> {
  const coldId = toObjectId(coldStorageId);
  const createdByObjId = new mongoose.Types.ObjectId(createdById);
  const farmerStorageLinkId = payload.farmerStorageLinkId
    ? new mongoose.Types.ObjectId(payload.farmerStorageLinkId)
    : null;

  const filter: QueryFilter = farmerStorageLinkId
    ? {
        coldStorageId: coldId,
        name: payload.name.trim(),
        farmerStorageLinkId,
      }
    : {
        coldStorageId: coldId,
        name: payload.name.trim(),
        $or: [
          { farmerStorageLinkId: null },
          { farmerStorageLinkId: { $exists: false } },
        ],
      };

  const existing = await Ledger.findOne(filter).lean();
  if (existing) {
    logger?.warn({ name: payload.name, coldStorageId }, "Duplicate ledger name");
    throw new ConflictError("Ledger with this name already exists");
  }

  const openingBalance = payload.openingBalance ?? 0;
  const ledgerData = {
    name: payload.name.trim(),
    type: payload.type,
    subType: payload.subType,
    category: payload.category,
    openingBalance,
    balance: openingBalance,
    closingBalance:
      payload.name.trim().toLowerCase() === "stock in hand"
        ? openingBalance
        : undefined,
    coldStorageId: coldId,
    farmerStorageLinkId,
    createdBy: createdByObjId,
  };

  const ledger = await Ledger.create(ledgerData);
  logger?.info(
    { ledgerId: ledger._id, coldStorageId, name: ledger.name },
    "Ledger created",
  );
  return ledger;
}

/**
 * List ledgers for the cold storage with optional filters and date range on createdAt.
 */
export async function getAllLedgers(
  coldStorageId: string,
  query: ListLedgersQuery,
  logger?: FastifyBaseLogger,
): Promise<Array<Record<string, unknown> & { transactionCount: number }>> {
  const coldId = toObjectId(coldStorageId);
  const filter: QueryFilter = { coldStorageId: coldId };

  if (query.type) filter.type = query.type;
  if (query.search) {
    filter.name = { $regex: query.search, $options: "i" };
  }
  if (
    query.farmerStorageLinkId !== undefined &&
    query.farmerStorageLinkId !== null &&
    query.farmerStorageLinkId !== ""
  ) {
    filter.farmerStorageLinkId = new mongoose.Types.ObjectId(
      query.farmerStorageLinkId,
    );
  } else if (
    query.farmerStorageLinkId === null ||
    query.farmerStorageLinkId === ""
  ) {
    filter.$or = [
      { farmerStorageLinkId: null },
      { farmerStorageLinkId: { $exists: false } },
    ];
  }

  if (query.from ?? query.to) {
    const createdAt: { $gte?: Date; $lte?: Date } = {};
    if (query.from) createdAt.$gte = query.from;
    if (query.to) {
      const end = new Date(query.to);
      end.setHours(23, 59, 59, 999);
      createdAt.$lte = end;
    }
    filter.createdAt = createdAt;
  }

  const ledgers = await Ledger.find(filter).sort({ name: 1 }).lean();

  const scopeFilter: QueryFilter =
    query.farmerStorageLinkId !== undefined &&
    query.farmerStorageLinkId !== null &&
    query.farmerStorageLinkId !== ""
      ? { farmerStorageLinkId: new mongoose.Types.ObjectId(query.farmerStorageLinkId) }
      : {
          $or: [
            { farmerStorageLinkId: null },
            { farmerStorageLinkId: { $exists: false } },
          ],
        };

  const ledgersWithCount = await Promise.all(
    ledgers.map(async (ledger) => {
      const count = await Voucher.countDocuments({
        coldStorageId: coldId,
        ...scopeFilter,
        $or: [
          { debitLedger: ledger._id },
          { creditLedger: ledger._id },
        ],
      });
      return {
        ...ledger,
        transactionCount: count,
      };
    }),
  );

  logger?.info(
    { count: ledgersWithCount.length, coldStorageId },
    "Ledgers listed",
  );
  return ledgersWithCount as Array<Record<string, unknown> & { transactionCount: number }>;
}

/**
 * Get a single ledger by ID, scoped to cold storage.
 */
export async function getLedgerById(
  ledgerId: string,
  coldStorageId: string,
  logger?: FastifyBaseLogger,
): Promise<ILedger> {
  if (!mongoose.Types.ObjectId.isValid(ledgerId)) {
    throw new BadRequestError("Invalid ledger ID");
  }
  const coldId = toObjectId(coldStorageId);
  const ledger = await Ledger.findOne({
    _id: new mongoose.Types.ObjectId(ledgerId),
    coldStorageId: coldId,
  });
  if (!ledger) {
    logger?.warn({ ledgerId, coldStorageId }, "Ledger not found");
    throw new NotFoundError("Ledger not found");
  }
  return ledger;
}

/**
 * Update a ledger. Recalculates balance when openingBalance or type changes.
 */
export async function updateLedger(
  ledgerId: string,
  coldStorageId: string,
  payload: UpdateLedgerInput,
  logger?: FastifyBaseLogger,
): Promise<ILedger> {
  if (!mongoose.Types.ObjectId.isValid(ledgerId)) {
    throw new BadRequestError("Invalid ledger ID");
  }
  const coldId = toObjectId(coldStorageId);
  const ledger = await Ledger.findOne({
    _id: new mongoose.Types.ObjectId(ledgerId),
    coldStorageId: coldId,
  });
  if (!ledger) {
    logger?.warn({ ledgerId, coldStorageId }, "Ledger not found");
    throw new NotFoundError("Ledger not found");
  }

  const typeToApply = (payload.type ?? ledger.type) as LedgerType;

  if (payload.type !== undefined) ledger.type = payload.type as LedgerType;
  if (payload.subType !== undefined) ledger.subType = payload.subType;
  if (payload.category !== undefined) ledger.category = payload.category;

  const openingBalanceChanged =
    payload.openingBalance !== undefined &&
    payload.openingBalance !== ledger.openingBalance;
  const typeChanged =
    payload.type !== undefined && payload.type !== ledger.type;

  if (openingBalanceChanged || typeChanged) {
    const scopeCondition: QueryFilter =
      ledger.farmerStorageLinkId
        ? { farmerStorageLinkId: ledger.farmerStorageLinkId }
        : {
            $or: [
              { farmerStorageLinkId: null },
              { farmerStorageLinkId: { $exists: false } },
            ],
          };
    const baseMatch = {
      coldStorageId: coldId,
      ...scopeCondition,
    };

    const [debitAgg, creditAgg] = await Promise.all([
      Voucher.aggregate<{ total: number }>([
        { $match: { ...baseMatch, debitLedger: ledger._id } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Voucher.aggregate<{ total: number }>([
        { $match: { ...baseMatch, creditLedger: ledger._id } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

    const debitSum = debitAgg[0]?.total ?? 0;
    const creditSum = creditAgg[0]?.total ?? 0;
    const netTransactions =
      typeToApply === "Asset" || typeToApply === "Expense"
        ? debitSum - creditSum
        : creditSum - debitSum;
    const newOpening =
      payload.openingBalance !== undefined
        ? payload.openingBalance
        : ledger.openingBalance;
    ledger.balance = newOpening + netTransactions;
    if (openingBalanceChanged) {
      ledger.openingBalance = payload.openingBalance!;
    }
  }

  if (payload.name !== undefined) {
    const nameFilter: QueryFilter = {
      coldStorageId: coldId,
      name: payload.name.trim(),
      _id: { $ne: ledger._id },
    };
    if (ledger.farmerStorageLinkId) {
      nameFilter.farmerStorageLinkId = ledger.farmerStorageLinkId;
    } else {
      nameFilter.$or = [
        { farmerStorageLinkId: null },
        { farmerStorageLinkId: { $exists: false } },
      ];
    }
    const existingName = await Ledger.findOne(nameFilter).lean();
    if (existingName) {
      throw new ConflictError("Ledger with this name already exists");
    }
    ledger.name = payload.name.trim();
  }

  if (payload.closingBalance !== undefined) {
    ledger.closingBalance = payload.closingBalance;
  }

  await ledger.save();
  logger?.info({ ledgerId, coldStorageId }, "Ledger updated");
  return ledger;
}

/**
 * Delete a ledger if it has no vouchers.
 */
export async function deleteLedger(
  ledgerId: string,
  coldStorageId: string,
  logger?: FastifyBaseLogger,
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(ledgerId)) {
    throw new BadRequestError("Invalid ledger ID");
  }
  const coldId = toObjectId(coldStorageId);
  const ledger = await Ledger.findOne({
    _id: new mongoose.Types.ObjectId(ledgerId),
    coldStorageId: coldId,
  });
  if (!ledger) {
    logger?.warn({ ledgerId, coldStorageId }, "Ledger not found");
    throw new NotFoundError("Ledger not found");
  }

  const hasTransactions = await ledger.hasTransactions();
  if (hasTransactions) {
    logger?.warn({ ledgerId }, "Cannot delete ledger with transactions");
    throw new BadRequestError("Cannot delete ledger with existing transactions");
  }

  await Ledger.findByIdAndDelete(ledgerId);
  logger?.info({ ledgerId, coldStorageId }, "Ledger deleted");
}

/**
 * Get ledger entries (vouchers) with running balance for a ledger.
 */
export async function getLedgerEntries(
  ledgerId: string,
  coldStorageId: string,
  logger?: FastifyBaseLogger,
): Promise<{
  ledger: { _id: Types.ObjectId; name: string; type: string; openingBalance: number };
  entries: Array<{
    entryType: "Debit" | "Credit";
    amount: number;
    runningBalance: number;
    [key: string]: unknown;
  }>;
}> {
  if (!mongoose.Types.ObjectId.isValid(ledgerId)) {
    throw new BadRequestError("Invalid ledger ID");
  }
  const coldId = toObjectId(coldStorageId);
  const ledger = await Ledger.findOne({
    _id: new mongoose.Types.ObjectId(ledgerId),
    coldStorageId: coldId,
  }).lean();
  if (!ledger) {
    logger?.warn({ ledgerId, coldStorageId }, "Ledger not found");
    throw new NotFoundError("Ledger not found");
  }

  const ledgerIdObj = new mongoose.Types.ObjectId(ledgerId);
  const voucherFilter: QueryFilter = {
    coldStorageId: coldId,
    $and: [
      {
        $or: [
          { debitLedger: ledgerIdObj },
          { creditLedger: ledgerIdObj },
        ],
      },
      ledger.farmerStorageLinkId
        ? { farmerStorageLinkId: ledger.farmerStorageLinkId }
        : {
            $or: [
              { farmerStorageLinkId: null },
              { farmerStorageLinkId: { $exists: false } },
            ],
          },
    ],
  };

  const vouchers = await Voucher.find(voucherFilter)
    .populate("debitLedger", "name")
    .populate("creditLedger", "name")
    .sort({ date: 1, voucherNumber: 1 })
    .lean();

  const idStr = ledgerId.toString();
  let runningBalance = ledger.openingBalance;
  const entries = vouchers.map((v) => {
    const raw = v as unknown as {
      debitLedger: { _id: Types.ObjectId };
      creditLedger: { _id: Types.ObjectId };
      amount: number;
      [key: string]: unknown;
    };
    const isDebit = raw.debitLedger?._id?.toString() === idStr;
    const isCredit = raw.creditLedger?._id?.toString() === idStr;
    let delta = 0;
    if (isDebit) {
      delta =
        ledger.type === "Asset" || ledger.type === "Expense"
          ? raw.amount
          : -raw.amount;
    } else if (isCredit) {
      delta =
        ledger.type === "Asset" || ledger.type === "Expense"
          ? -raw.amount
          : raw.amount;
    }
    runningBalance += delta;
    return {
      ...v,
      entryType: isDebit ? ("Debit" as const) : ("Credit" as const),
      amount: raw.amount,
      runningBalance,
    };
  });

  logger?.info({ ledgerId, entryCount: entries.length }, "Ledger entries fetched");
  return {
    ledger: {
      _id: ledger._id as Types.ObjectId,
      name: ledger.name,
      type: ledger.type,
      openingBalance: ledger.openingBalance,
    },
    entries,
  };
}
