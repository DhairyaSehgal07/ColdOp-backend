import mongoose, { ClientSession, Types } from "mongoose";
import type { FastifyBaseLogger } from "fastify";
import {
  IncomingGatePass,
  GatePassType,
  GatePassStatus,
} from "../incoming-gate-pass/incoming-gate-pass.model.js";
import type {
  IBagSize,
  ILocation,
} from "../incoming-gate-pass/incoming-gate-pass.model.js";
import { TransferStockGatePass } from "./transfer-stock.model.js";
import type { CreateTransferStockInput } from "./transfer-stock.schema.js";
import type { ITransferStockItem } from "./transfer-stock.model.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  AppError,
} from "../../../utils/errors.js";
import { FarmerStorageLink } from "../farmer-storage-link/farmer-storage-link-model.js";
import {
  FARMER_STORAGE_LINK_FARMER_POPULATE_SELECT,
  FARMER_STORAGE_LINK_POPULATE_SELECT,
  formatPopulatedFarmerStorageLinkDisplay,
  type PopulatedFarmerStorageLink,
} from "../farmer-storage-link/farmer-storage-link.utils.js";
import { OutgoingGatePass } from "../outgoing-gate-pass/outgoing-gate-pass.model.js";
import { createOutgoingGatePassForTransferStock } from "../outgoing-gate-pass/outgoing-gate-pass.service.js";
import type { IIncomingGatePass } from "../incoming-gate-pass/incoming-gate-pass.model.js";

/* =======================
   HELPERS (location / bag matching)
======================= */

function normalizeSize(s: string): string {
  return s
    .trim()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ");
}

function getEffectiveLocation(bag: IBagSize): ILocation {
  const p = bag.paltaiLocation;
  if (p?.chamber && p?.floor && p?.row) return p;
  return bag.location;
}

function locationMatches(
  a: { chamber: string; floor: string; row: string },
  b: { chamber: string; floor: string; row: string },
): boolean {
  return (
    (a.chamber ?? "").trim() === (b.chamber ?? "").trim() &&
    (a.floor ?? "").trim() === (b.floor ?? "").trim() &&
    (a.row ?? "").trim() === (b.row ?? "").trim()
  );
}

function getBagForTransferItem(
  bagSizes: IBagSize[],
  item: { bagSize: string; location: ILocation },
): IBagSize | undefined {
  const normSize = normalizeSize(item.bagSize);
  for (const b of bagSizes) {
    if (normalizeSize(b.name) !== normSize) continue;
    const effective = getEffectiveLocation(b);
    if (locationMatches(effective, item.location)) return b;
  }
  return undefined;
}

/* =======================
   NEXT GATE PASS NUMBERS (with session)
======================= */

async function getNextTransferGatePassNumber(
  fromFarmerStorageLinkId: Types.ObjectId,
  session: ClientSession,
): Promise<number> {
  const last = await TransferStockGatePass.findOne({
    fromFarmerStorageLinkId,
  })
    .session(session)
    .sort({ gatePassNo: -1 })
    .select("gatePassNo")
    .lean();
  return ((last as { gatePassNo?: number } | null)?.gatePassNo ?? 0) + 1;
}

async function getNextIncomingGatePassNumberForColdStorage(
  coldStorageId: Types.ObjectId,
  session: ClientSession,
): Promise<number> {
  const farmerStorageLinkIds = await FarmerStorageLink.distinct("_id", {
    coldStorageId,
  }).session(session);

  const last = await IncomingGatePass.findOne({
    farmerStorageLinkId: { $in: farmerStorageLinkIds },
  })
    .session(session)
    .sort({ gatePassNo: -1 })
    .select("gatePassNo")
    .lean();
  return ((last as { gatePassNo?: number } | null)?.gatePassNo ?? 0) + 1;
}

async function getNextOutgoingGatePassNumberForColdStorage(
  coldStorageId: Types.ObjectId,
  session: ClientSession,
): Promise<number> {
  const farmerStorageLinkIds = await FarmerStorageLink.distinct("_id", {
    coldStorageId,
  }).session(session);

  const last = await OutgoingGatePass.findOne({
    farmerStorageLinkId: { $in: farmerStorageLinkIds },
  })
    .session(session)
    .sort({ gatePassNo: -1 })
    .select("gatePassNo")
    .lean();
  return ((last as { gatePassNo?: number } | null)?.gatePassNo ?? 0) + 1;
}

/* =======================
   CREATE TRANSFER STOCK (transaction)
======================= */

async function populateTransferStockGatePass(
  transferStockGatePassId: Types.ObjectId,
) {
  return TransferStockGatePass.findById(transferStockGatePassId)
    .populate({
      path: "fromFarmerStorageLinkId",
      select: FARMER_STORAGE_LINK_POPULATE_SELECT,
      populate: {
        path: "farmerId",
        select: FARMER_STORAGE_LINK_FARMER_POPULATE_SELECT,
      },
    })
    .populate({
      path: "toFarmerStorageLinkId",
      select: FARMER_STORAGE_LINK_POPULATE_SELECT,
      populate: {
        path: "farmerId",
        select: FARMER_STORAGE_LINK_FARMER_POPULATE_SELECT,
      },
    })
    .populate({ path: "createdBy", select: "name" })
    .populate({
      path: "createdIncomingGatePassId",
      select: "gatePassNo date type variety bagSizes customMarka",
    })
    .populate({
      path: "createdOutgoingGatePassId",
      select:
        "gatePassNo date type truckNumber orderDetails incomingGatePassSnapshots",
    })
    .lean();
}

function formatTransferStockGatePassResponse(
  populated: Record<string, unknown> | null,
  fallbackDoc: { toObject(): Record<string, unknown> },
) {
  if (!populated) {
    return fallbackDoc.toObject();
  }

  type PopulatedAdmin = { _id: unknown; name: string };
  const fromLinkPop = populated.fromFarmerStorageLinkId as
    | PopulatedFarmerStorageLink
    | null
    | undefined;
  const toLinkPop = populated.toFarmerStorageLinkId as
    | PopulatedFarmerStorageLink
    | null
    | undefined;
  const createdByPop = populated.createdBy as PopulatedAdmin | null | undefined;
  const fromLinkDisplay = formatPopulatedFarmerStorageLinkDisplay(fromLinkPop);
  const toLinkDisplay = formatPopulatedFarmerStorageLinkDisplay(toLinkPop);

  return {
    ...populated,
    fromFarmerStorageLinkId:
      fromLinkDisplay ?? populated.fromFarmerStorageLinkId,
    toFarmerStorageLinkId: toLinkDisplay ?? populated.toFarmerStorageLinkId,
    createdBy: createdByPop
      ? { _id: createdByPop._id, name: createdByPop.name }
      : populated.createdBy,
  };
}

export async function createTransferStock(
  payload: CreateTransferStockInput,
  createdById: string | undefined,
  logger?: FastifyBaseLogger,
) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!mongoose.Types.ObjectId.isValid(payload.fromFarmerStorageLinkId)) {
      throw new ValidationError(
        "Invalid from farmer storage link ID format",
        "INVALID_FROM_FARMER_STORAGE_LINK_ID",
      );
    }
    if (!mongoose.Types.ObjectId.isValid(payload.toFarmerStorageLinkId)) {
      throw new ValidationError(
        "Invalid to farmer storage link ID format",
        "INVALID_TO_FARMER_STORAGE_LINK_ID",
      );
    }

    const fromLinkId = new Types.ObjectId(payload.fromFarmerStorageLinkId);
    const toLinkId = new Types.ObjectId(payload.toFarmerStorageLinkId);

    const fromLink = await FarmerStorageLink.findById(fromLinkId)
      .session(session)
      .lean();
    const toLink = await FarmerStorageLink.findById(toLinkId)
      .session(session)
      .lean();

    if (!fromLink) {
      throw new NotFoundError(
        "From farmer-storage-link not found",
        "FROM_FARMER_STORAGE_LINK_NOT_FOUND",
      );
    }
    if (!toLink) {
      throw new NotFoundError(
        "To farmer-storage-link not found",
        "TO_FARMER_STORAGE_LINK_NOT_FOUND",
      );
    }

    const fromColdStorageId =
      typeof fromLink.coldStorageId === "object" &&
      fromLink.coldStorageId !== null
        ? (fromLink.coldStorageId as { _id: Types.ObjectId })._id
        : new Types.ObjectId(fromLink.coldStorageId as string);
    const toColdStorageId =
      typeof toLink.coldStorageId === "object" && toLink.coldStorageId !== null
        ? (toLink.coldStorageId as { _id: Types.ObjectId })._id
        : new Types.ObjectId(toLink.coldStorageId as string);

    if (!fromColdStorageId.equals(toColdStorageId)) {
      throw new ValidationError(
        "From and to farmer-storage-links must belong to the same cold storage",
        "DIFFERENT_COLD_STORAGE",
      );
    }

    const incomingGatePassIds = [
      ...new Set(payload.items.map((i) => i.incomingGatePassId)),
    ].map((id) => new Types.ObjectId(id));

    const sourceIncomingPasses = await IncomingGatePass.find({
      _id: { $in: incomingGatePassIds },
    })
      .session(session)
      .lean();

    if (sourceIncomingPasses.length !== incomingGatePassIds.length) {
      const foundIds = new Set(
        sourceIncomingPasses.map((d) =>
          (d as { _id: Types.ObjectId })._id.toString(),
        ),
      );
      const missing = incomingGatePassIds
        .filter((id) => !foundIds.has(id.toString()))
        .map((id) => id.toString());
      throw new NotFoundError(
        `Incoming gate pass(es) not found: ${missing.join(", ")}`,
        "INCOMING_GATE_PASS_NOT_FOUND",
      );
    }

    const incomingPassMap = new Map<
      string,
      (typeof sourceIncomingPasses)[0] & {
        _id: Types.ObjectId;
        variety: string;
        gatePassNo: number;
        bagSizes: IBagSize[];
      }
    >();
    for (const doc of sourceIncomingPasses) {
      const d = doc as typeof doc & {
        _id: Types.ObjectId;
        variety: string;
        gatePassNo: number;
        bagSizes: IBagSize[];
      };
      incomingPassMap.set(d._id.toString(), d);
    }

    const transferItems: ITransferStockItem[] = [];
    const bulkOps: mongoose.mongo.AnyBulkWriteOperation<
      import("../incoming-gate-pass/incoming-gate-pass.model.js").IIncomingGatePass
    >[] = [];

    type BagSizeAccum = {
      name: string;
      quantity: number;
      location: ILocation;
    };
    const newGatePassBagSizesMap = new Map<string, BagSizeAccum>();
    let sourceVariety: string | null = null;

    for (const item of payload.items) {
      const incomingPass = incomingPassMap.get(item.incomingGatePassId);
      if (!incomingPass) continue;

      if (sourceVariety == null) {
        sourceVariety = incomingPass.variety?.trim() ?? "";
      }

      const bagSizes = incomingPass.bagSizes ?? [];
      const location = {
        chamber: item.location.chamber,
        floor: item.location.floor,
        row: item.location.row,
      };
      const bag = getBagForTransferItem(bagSizes, {
        bagSize: item.bagSize,
        location,
      });

      if (!bag) {
        throw new ValidationError(
          `Size "${item.bagSize}" at location ${location.chamber}/${location.floor}/${location.row} not found in incoming gate pass ${item.incomingGatePassId}`,
          "SIZE_LOCATION_NOT_FOUND",
        );
      }
      if (bag.currentQuantity < item.quantity) {
        throw new ValidationError("Insufficient stock", "INSUFFICIENT_STOCK");
      }

      transferItems.push({
        incomingGatePassId: new Types.ObjectId(item.incomingGatePassId),
        gatePassNo: incomingPass.gatePassNo,
        bagSize: bag.name,
        quantity: item.quantity,
        location: getEffectiveLocation(bag),
      });

      const baseFilter: Record<string, unknown> = {
        "elem.name": bag.name,
        "elem.currentQuantity": { $gte: item.quantity },
      };
      const locationFilter = {
        $or: [
          {
            "elem.location.chamber": location.chamber,
            "elem.location.floor": location.floor,
            "elem.location.row": location.row,
          },
          {
            "elem.paltaiLocation.chamber": location.chamber,
            "elem.paltaiLocation.floor": location.floor,
            "elem.paltaiLocation.row": location.row,
          },
        ],
      };
      bulkOps.push({
        updateOne: {
          filter: { _id: new Types.ObjectId(item.incomingGatePassId) },
          update: {
            $inc: {
              "bagSizes.$[elem].currentQuantity": -item.quantity,
            },
          },
          arrayFilters: [{ ...baseFilter, ...locationFilter }],
        },
      });

      const effectiveLoc = getEffectiveLocation(bag);
      const key = `${normalizeSize(bag.name)}|${effectiveLoc.chamber}|${effectiveLoc.floor}|${effectiveLoc.row}`;
      const existing = newGatePassBagSizesMap.get(key);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        newGatePassBagSizesMap.set(key, {
          name: bag.name,
          quantity: item.quantity,
          location: effectiveLoc,
        });
      }
    }

    if (sourceVariety == null || sourceVariety === "") {
      throw new ValidationError(
        "Could not determine variety from source incoming gate pass(es)",
        "VARIETY_REQUIRED",
      );
    }

    if (bulkOps.length > 0) {
      const updateResult = await IncomingGatePass.bulkWrite(
        bulkOps as Parameters<typeof IncomingGatePass.bulkWrite>[0],
        { session },
      );
      if (updateResult.modifiedCount !== bulkOps.length) {
        throw new ConflictError(
          `Expected ${bulkOps.length} updates, got ${updateResult.modifiedCount}. Concurrent modification detected.`,
          "CONCURRENT_MODIFICATION",
        );
      }
    }

    const transferGatePassNo = await getNextTransferGatePassNumber(
      fromLinkId,
      session,
    );
    const nextIncomingGatePassNo =
      await getNextIncomingGatePassNumberForColdStorage(
        toColdStorageId,
        session,
      );
    const nextOutgoingGatePassNo =
      await getNextOutgoingGatePassNumberForColdStorage(
        fromColdStorageId,
        session,
      );

    const newBagSizes = Array.from(newGatePassBagSizesMap.values()).map(
      (acc) => ({
        name: acc.name,
        initialQuantity: acc.quantity,
        currentQuantity: acc.quantity,
        location: acc.location,
      }),
    );

    const [newIncomingDoc] = await IncomingGatePass.create(
      [
        {
          farmerStorageLinkId: toLinkId,
          createdBy: createdById
            ? new Types.ObjectId(createdById)
            : undefined,
          gatePassNo: nextIncomingGatePassNo,
          date: payload.date,
          type: GatePassType.INCOMING_TRANSFER,
          variety: sourceVariety,
          truckNumber: payload.truckNumber,
          bagSizes: newBagSizes,
          status: GatePassStatus.OPEN,
          remarks: payload.remarks,
          ...(payload.customMarka !== undefined && {
            customMarka: payload.customMarka,
          }),
        },
      ],
      { session },
    );

    const outgoingForFrom = await createOutgoingGatePassForTransferStock(
      session,
      {
        fromFarmerStorageLinkId: fromLinkId,
        coldStorageId: fromColdStorageId,
        items: payload.items.map((i) => ({
          incomingGatePassId: i.incomingGatePassId,
          bagSize: i.bagSize,
          quantity: i.quantity,
          location: i.location,
        })),
        incomingPassMap: incomingPassMap as Map<
          string,
          IIncomingGatePass & { _id: Types.ObjectId }
        >,
        gatePassNo: nextOutgoingGatePassNo,
        date: payload.date,
        truckNumber: payload.truckNumber,
        remarks: payload.remarks,
        createdById,
      },
      logger,
    );

    const [transferDoc] = await TransferStockGatePass.create(
      [
        {
          fromFarmerStorageLinkId: fromLinkId,
          toFarmerStorageLinkId: toLinkId,
          createdBy: createdById
            ? new Types.ObjectId(createdById)
            : undefined,
          gatePassNo: transferGatePassNo,
          date: payload.date,
          truckNumber: payload.truckNumber,
          items: transferItems,
          remarks: payload.remarks,
          ...(payload.customMarka !== undefined && {
            customMarka: payload.customMarka,
          }),
          createdIncomingGatePassId: newIncomingDoc._id,
          createdOutgoingGatePassId: outgoingForFrom._id,
        },
      ],
      { session },
    );

    await session.commitTransaction();

    logger?.info(
      {
        transferStockGatePassId: transferDoc._id,
        fromFarmerStorageLinkId: payload.fromFarmerStorageLinkId,
        toFarmerStorageLinkId: payload.toFarmerStorageLinkId,
        gatePassNo: transferDoc.gatePassNo,
      },
      "Transfer stock gate pass created successfully",
    );

    const populated = await populateTransferStockGatePass(transferDoc._id);

    return formatTransferStockGatePassResponse(
      populated as Record<string, unknown> | null,
      transferDoc,
    );
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    if (
      error instanceof ValidationError ||
      error instanceof NotFoundError ||
      error instanceof ConflictError
    ) {
      throw error;
    }
    const err = error as {
      code?: number;
      keyPattern?: Record<string, unknown>;
    };
    if (err?.code === 11000) {
      const field = Object.keys(err.keyPattern ?? {})[0] ?? "field";
      throw new ConflictError(`${field} already exists`, "DUPLICATE_KEY_ERROR");
    }
    logger?.error({ err: error }, "Unexpected error in transfer stock service");
    throw new AppError(
      "Failed to create transfer stock gate pass",
      500,
      "CREATE_TRANSFER_STOCK_ERROR",
    );
  } finally {
    await session.endSession();
  }
}

/* =======================
   LIST BY COLD STORAGE
======================= */

export async function getTransferStockGatePassesForColdStorage(
  coldStorageId: string,
  logger?: FastifyBaseLogger,
) {
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      "Invalid cold storage ID format",
      "INVALID_COLD_STORAGE_ID",
    );
  }

  const coldStorageObjectId = new Types.ObjectId(coldStorageId);

  const farmerStorageLinkIds = await FarmerStorageLink.find({
    coldStorageId: coldStorageObjectId,
  })
    .distinct("_id")
    .lean();

  if (!farmerStorageLinkIds || farmerStorageLinkIds.length === 0) {
    logger?.info(
      { coldStorageId },
      "No farmer-storage-links found for cold storage when listing transfer stock gate passes",
    );
    return [];
  }

  const docs = await TransferStockGatePass.find({
    $or: [
      { fromFarmerStorageLinkId: { $in: farmerStorageLinkIds } },
      { toFarmerStorageLinkId: { $in: farmerStorageLinkIds } },
    ],
  })
    .sort({ date: -1, gatePassNo: -1 })
    .populate({
      path: "fromFarmerStorageLinkId",
      select: FARMER_STORAGE_LINK_POPULATE_SELECT,
      populate: {
        path: "farmerId",
        select: FARMER_STORAGE_LINK_FARMER_POPULATE_SELECT,
      },
    })
    .populate({
      path: "toFarmerStorageLinkId",
      select: FARMER_STORAGE_LINK_POPULATE_SELECT,
      populate: {
        path: "farmerId",
        select: FARMER_STORAGE_LINK_FARMER_POPULATE_SELECT,
      },
    })
    .populate({ path: "createdBy", select: "name" })
    .populate({
      path: "createdIncomingGatePassId",
      select: "gatePassNo date type variety bagSizes customMarka",
    })
    .populate({
      path: "createdOutgoingGatePassId",
      select:
        "gatePassNo date type truckNumber orderDetails incomingGatePassSnapshots",
    })
    .lean();

  return docs.map((rawDoc) => {
    const raw = rawDoc as unknown as Record<string, unknown>;
    type PopulatedAdmin = { _id: unknown; name: string };

    const fromLinkPop = raw.fromFarmerStorageLinkId as
      | PopulatedFarmerStorageLink
      | null
      | undefined;
    const toLinkPop = raw.toFarmerStorageLinkId as
      | PopulatedFarmerStorageLink
      | null
      | undefined;
    const createdByPop = raw.createdBy as PopulatedAdmin | null | undefined;
    const fromLinkDisplay =
      formatPopulatedFarmerStorageLinkDisplay(fromLinkPop);
    const toLinkDisplay = formatPopulatedFarmerStorageLinkDisplay(toLinkPop);

    return {
      ...raw,
      fromFarmerStorageLinkId:
        fromLinkDisplay ?? raw.fromFarmerStorageLinkId,
      toFarmerStorageLinkId: toLinkDisplay ?? raw.toFarmerStorageLinkId,
      createdBy: createdByPop
        ? { _id: createdByPop._id, name: createdByPop.name }
        : raw.createdBy,
    };
  });
}
