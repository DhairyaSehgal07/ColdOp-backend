import mongoose, { ClientSession, Types } from "mongoose";
import type { FastifyBaseLogger } from "fastify";
import { OutgoingGatePass, GatePassType } from "./outgoing-gate-pass.model.js";
import { IncomingGatePass } from "../incoming-gate-pass/incoming-gate-pass.model.js";
import type { CreateOutgoingGatePassInput } from "./outgoing-gate-pass.schema.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  AppError,
} from "../../../utils/errors.js";
import { FarmerStorageLink } from "../farmer-storage-link/farmer-storage-link-model.js";
import type {
  IIncomingGatePass,
  IBagSize,
} from "../incoming-gate-pass/incoming-gate-pass.model.js";
import {
  recordEditHistory,
  recordEditHistoryBulk,
  EditHistoryEntityType,
  EditHistoryAction,
} from "../edit-history/edit-history.service.js";

/* =======================
   TYPES (internal)
======================= */

interface OutgoingValidatedAllocation {
  incomingGatePassId: string;
  size: string;
  quantityToAllocate: number;
}

interface OutgoingIncomingPassWithFilteredAllocations {
  incomingGatePassId: string;
  variety: string;
  allocations: OutgoingValidatedAllocation[];
}

/**
 * Normalizes size string for comparison (e.g. "25-30" and "25–30" en-dash match).
 * Replaces common dash-like Unicode chars with ASCII hyphen.
 */
function normalizeSize(s: string): string {
  return s
    .trim()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ");
}

/* =======================
   INPUT VALIDATION
======================= */

function validateOutgoingGatePassInput(
  payload: CreateOutgoingGatePassInput,
  logger?: FastifyBaseLogger,
): OutgoingIncomingPassWithFilteredAllocations[] {
  const result: OutgoingIncomingPassWithFilteredAllocations[] = [];

  for (const ip of payload.incomingGatePasses) {
    const nonZeroAllocations = ip.allocations.filter(
      (a) => a.quantityToAllocate > 0,
    );

    if (nonZeroAllocations.length === 0) {
      logger?.warn(
        { incomingGatePassId: ip.incomingGatePassId },
        "All allocations have zero quantity",
      );
      throw new ValidationError(
        `Incoming gate pass ${ip.incomingGatePassId}: at least one allocation must have quantity > 0`,
        "INVALID_ALLOCATION_QUANTITY",
      );
    }

    result.push({
      incomingGatePassId: ip.incomingGatePassId,
      variety: ip.variety.trim(),
      allocations: nonZeroAllocations.map((a) => ({
        incomingGatePassId: ip.incomingGatePassId,
        size: a.size,
        quantityToAllocate: a.quantityToAllocate,
      })),
    });
  }

  return result;
}

/* =======================
   FETCH & VALIDATE INCOMING GATE PASSES
======================= */

async function fetchAndValidateIncomingGatePasses(
  payload: CreateOutgoingGatePassInput,
  validated: OutgoingIncomingPassWithFilteredAllocations[],
  session: ClientSession,
  _logger?: FastifyBaseLogger,
): Promise<Map<string, IIncomingGatePass & { _id: Types.ObjectId }>> {
  const incomingGatePassIds = [
    ...new Set(validated.map((v) => v.incomingGatePassId)),
  ].map((id) => new Types.ObjectId(id));

  const fetched = await IncomingGatePass.find({
    _id: { $in: incomingGatePassIds },
  })
    .session(session)
    .lean();

  if (fetched.length !== incomingGatePassIds.length) {
    const foundIds = new Set(
      fetched.map((f) => (f as { _id: Types.ObjectId })._id.toString()),
    );
    const missingIds = incomingGatePassIds
      .filter((id) => !foundIds.has(id.toString()))
      .map((id) => id.toString());
    throw new NotFoundError(
      `Incoming gate pass(es) not found: ${missingIds.join(", ")}`,
      "INCOMING_GATE_PASS_NOT_FOUND",
    );
  }

  const incomingPassMap = new Map<
    string,
    IIncomingGatePass & { _id: Types.ObjectId }
  >();
  for (const ip of fetched) {
    const doc = ip as IIncomingGatePass & { _id: Types.ObjectId };
    incomingPassMap.set(doc._id.toString(), doc);
  }

  for (const item of validated) {
    const incomingPass = incomingPassMap.get(item.incomingGatePassId);
    if (!incomingPass) continue;

    const ipVariety = (incomingPass as { variety?: string }).variety?.trim();
    if (ipVariety !== item.variety) {
      throw new ValidationError(
        `Variety mismatch for incoming gate pass ${item.incomingGatePassId}: expected "${item.variety}", got "${ipVariety}"`,
        "VARIETY_MISMATCH",
      );
    }

    const bagSizes = (incomingPass as { bagSizes: IBagSize[] }).bagSizes ?? [];
    const detailBySize = new Map(
      bagSizes.map((b) => [normalizeSize(b.name), b]),
    );

    for (const alloc of item.allocations) {
      const bag = detailBySize.get(normalizeSize(alloc.size));
      if (!bag) {
        throw new ValidationError(
          `Size "${alloc.size}" not found in incoming gate pass ${item.incomingGatePassId}`,
          "SIZE_NOT_FOUND",
        );
      }
      if (bag.currentQuantity < alloc.quantityToAllocate) {
        throw new ValidationError(
          `Insufficient quantity for size "${alloc.size}" in incoming gate pass ${item.incomingGatePassId}: available ${bag.currentQuantity}, requested ${alloc.quantityToAllocate}`,
          "INSUFFICIENT_STOCK",
        );
      }
    }
  }

  return incomingPassMap;
}

/* =======================
   BULK OPERATIONS (arrayFilters by size / bag name)
======================= */

function prepareBulkOperationsForOutgoing(
  validated: OutgoingIncomingPassWithFilteredAllocations[],
  incomingPassMap: Map<string, IIncomingGatePass & { _id: Types.ObjectId }>,
): mongoose.mongo.AnyBulkWriteOperation<IIncomingGatePass>[] {
  const bulkOps: mongoose.mongo.AnyBulkWriteOperation<IIncomingGatePass>[] = [];

  for (const item of validated) {
    const ip = incomingPassMap.get(item.incomingGatePassId) as unknown as {
      bagSizes: IBagSize[];
    };
    if (!ip?.bagSizes) continue;

    const detailBySize = new Map(
      ip.bagSizes.map((b) => [normalizeSize(b.name), b]),
    );

    for (const alloc of item.allocations) {
      const bag = detailBySize.get(normalizeSize(alloc.size));
      if (!bag) continue;
      bulkOps.push({
        updateOne: {
          filter: { _id: new Types.ObjectId(item.incomingGatePassId) },
          update: {
            $inc: {
              "bagSizes.$[elem].currentQuantity": -alloc.quantityToAllocate,
            },
          },
          arrayFilters: [
            {
              "elem.name": bag.name,
              "elem.currentQuantity": { $gte: alloc.quantityToAllocate },
            },
          ],
        },
      });
    }
  }

  return bulkOps;
}

/* =======================
   BUILD SNAPSHOTS (remaining qty at creation time)
======================= */

function buildIncomingGatePassSnapshots(
  validated: OutgoingIncomingPassWithFilteredAllocations[],
  incomingPassMap: Map<string, IIncomingGatePass & { _id: Types.ObjectId }>,
): Array<{
  _id: Types.ObjectId;
  gatePassNo: number;
  variety: string;
  bagSizes: Array<{
    name: string;
    currentQuantity: number;
    initialQuantity: number;
    type: GatePassType;
    location: { chamber: string; floor: string; row: string };
  }>;
}> {
  const allocatedBySize = new Map<string, number>();
  for (const item of validated) {
    for (const alloc of item.allocations) {
      const key = `${item.incomingGatePassId}|${normalizeSize(alloc.size)}`;
      allocatedBySize.set(
        key,
        (allocatedBySize.get(key) ?? 0) + alloc.quantityToAllocate,
      );
    }
  }

  const snapshots: Array<{
    _id: Types.ObjectId;
    gatePassNo: number;
    variety: string;
    bagSizes: Array<{
      name: string;
      currentQuantity: number;
      initialQuantity: number;
      type: GatePassType;
      location: { chamber: string; floor: string; row: string };
    }>;
  }> = [];

  for (const item of validated) {
    const ip = incomingPassMap.get(item.incomingGatePassId) as unknown as {
      _id: Types.ObjectId;
      gatePassNo: number;
      bagSizes: IBagSize[];
    };
    if (!ip?.bagSizes) continue;

    const detailBySize = new Map(
      ip.bagSizes.map((b) => [normalizeSize(b.name), b]),
    );

    // Only include bag sizes that were updated (had quantities removed in this outgoing gate pass)
    const bagSizes: Array<{
      name: string;
      currentQuantity: number;
      initialQuantity: number;
      type: GatePassType;
      location: { chamber: string; floor: string; row: string };
    }> = [];

    for (const alloc of item.allocations) {
      const bag = detailBySize.get(normalizeSize(alloc.size));
      if (!bag) continue;

      const key = `${item.incomingGatePassId}|${normalizeSize(alloc.size)}`;
      const allocated = allocatedBySize.get(key) ?? 0;
      const remaining = Math.max(0, bag.currentQuantity - allocated);
      // Use paltai location as latest location when present (bags moved in cold storage)
      const effectiveLocation =
        bag.paltaiLocation &&
        bag.paltaiLocation.chamber &&
        bag.paltaiLocation.floor &&
        bag.paltaiLocation.row
          ? bag.paltaiLocation
          : bag.location;

      bagSizes.push({
        name: bag.name,
        currentQuantity: remaining,
        initialQuantity: bag.initialQuantity,
        type: GatePassType.DELIVERY,
        location: effectiveLocation,
      });
    }

    if (bagSizes.length === 0) continue;

    snapshots.push({
      _id: ip._id,
      gatePassNo: ip.gatePassNo,
      variety: item.variety,
      bagSizes,
    });
  }

  return snapshots;
}

/* =======================
   BUILD ORDER DETAILS (aggregate by size)
======================= */

function buildOrderDetails(
  validated: OutgoingIncomingPassWithFilteredAllocations[],
  incomingPassMap: Map<string, IIncomingGatePass & { _id: Types.ObjectId }>,
): Array<{ size: string; quantityAvailable: number; quantityIssued: number }> {
  const bySize = new Map<
    string,
    { quantityIssued: number; quantityAvailable: number }
  >();

  for (const item of validated) {
    const ip = incomingPassMap.get(item.incomingGatePassId) as unknown as {
      bagSizes: IBagSize[];
    };
    if (!ip?.bagSizes) continue;

    const detailBySize = new Map(
      ip.bagSizes.map((b) => [normalizeSize(b.name), b]),
    );

    for (const alloc of item.allocations) {
      const bag = detailBySize.get(normalizeSize(alloc.size));
      if (!bag) continue;
      const remaining = Math.max(
        0,
        bag.currentQuantity - alloc.quantityToAllocate,
      );

      const existing = bySize.get(alloc.size) ?? {
        quantityIssued: 0,
        quantityAvailable: 0,
      };
      bySize.set(alloc.size, {
        quantityIssued: existing.quantityIssued + alloc.quantityToAllocate,
        quantityAvailable: existing.quantityAvailable + remaining,
      });
    }
  }

  return Array.from(bySize.entries()).map(([size, v]) => ({
    size,
    quantityAvailable: v.quantityAvailable,
    quantityIssued: v.quantityIssued,
  }));
}

/* =======================
   ERROR HANDLER
======================= */

function handleOutgoingServiceError(
  error: unknown,
  logger?: FastifyBaseLogger,
): never {
  if (
    error instanceof ConflictError ||
    error instanceof ValidationError ||
    error instanceof NotFoundError ||
    error instanceof AppError
  ) {
    throw error;
  }

  if (error instanceof mongoose.Error.ValidationError) {
    const messages = Object.values(error.errors).map((e) => e.message);
    throw new ValidationError(messages.join(", "), "MONGOOSE_VALIDATION_ERROR");
  }

  const err = error as Error & {
    code?: number;
    keyPattern?: Record<string, unknown>;
  };
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern ?? {})[0] ?? "field";
    throw new ConflictError(`${field} already exists`, "DUPLICATE_KEY_ERROR");
  }

  logger?.error(
    { err: error },
    "Unexpected error in outgoing gate pass service",
  );
  throw new AppError(
    "Failed to create outgoing gate pass",
    500,
    "CREATE_OUTGOING_GATE_PASS_ERROR",
  );
}

/* =======================
   CREATE OUTGOING GATE PASS (with transaction)
======================= */

/**
 * Creates a new outgoing gate pass and updates current quantities on the
 * respective IncomingGatePass vouchers. Runs in a transaction.
 * API shape matches nikasi: gatePassNo from body, incomingGatePasses with allocations by size.
 */
export async function createOutgoingGatePass(
  payload: CreateOutgoingGatePassInput,
  createdById: string | undefined,
  logger?: FastifyBaseLogger,
) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!mongoose.Types.ObjectId.isValid(payload.farmerStorageLinkId)) {
      throw new ValidationError(
        "Invalid farmer storage link ID format",
        "INVALID_FARMER_STORAGE_LINK_ID",
      );
    }

    const storageLink = await FarmerStorageLink.findById(
      payload.farmerStorageLinkId,
    )
      .session(session)
      .lean();

    if (!storageLink) {
      logger?.warn(
        { farmerStorageLinkId: payload.farmerStorageLinkId },
        "Farmer-storage-link not found for outgoing gate pass",
      );
      throw new NotFoundError(
        "Farmer-storage-link not found",
        "FARMER_STORAGE_LINK_NOT_FOUND",
      );
    }

    const farmerStorageLinkObjectId = new Types.ObjectId(
      payload.farmerStorageLinkId,
    );

    if (payload.idempotencyKey) {
      const existing = await OutgoingGatePass.findOne({
        idempotencyKey: payload.idempotencyKey,
      })
        .session(session)
        .lean();
      if (existing) {
        logger?.info(
          {
            idempotencyKey: payload.idempotencyKey,
            outgoingGatePassId: existing._id,
          },
          "Idempotency: returning existing outgoing gate pass",
        );
        await session.commitTransaction();
        const populated = await OutgoingGatePass.findById(existing._id)
          .populate({
            path: "farmerStorageLinkId",
            select: "accountNumber farmerId",
            populate: {
              path: "farmerId",
              select: "name address mobileNumber",
            },
          })
          .populate({ path: "createdBy", select: "name" })
          .lean();
        if (!populated) return existing as unknown as Record<string, unknown>;
        const raw = populated as unknown as Record<string, unknown>;
        type PopulatedLink = {
          accountNumber: number;
          farmerId: { name: string; address: string; mobileNumber: string };
        };
        type PopulatedAdmin = { _id: unknown; name: string };
        const populatedLink = raw.farmerStorageLinkId as
          | PopulatedLink
          | null
          | undefined;
        const populatedAdmin = raw.createdBy as
          | PopulatedAdmin
          | null
          | undefined;
        return {
          ...raw,
          farmerStorageLinkId:
            populatedLink && populatedLink.farmerId
              ? {
                  name: populatedLink.farmerId.name,
                  accountNumber: populatedLink.accountNumber,
                  address: populatedLink.farmerId.address,
                  mobileNumber: populatedLink.farmerId.mobileNumber,
                }
              : raw.farmerStorageLinkId,
          createdBy: populatedAdmin
            ? { _id: populatedAdmin._id, name: populatedAdmin.name }
            : raw.createdBy,
        };
      }
    }

    // Gate pass number must be unique per cold storage (like nikasi)
    const coldStorageId =
      typeof storageLink.coldStorageId === "object" &&
      storageLink.coldStorageId !== null
        ? (storageLink.coldStorageId as { _id: Types.ObjectId })._id
        : new Types.ObjectId(storageLink.coldStorageId as string);

    const farmerStorageLinkIdsForColdStorage = await FarmerStorageLink.find({
      coldStorageId,
    })
      .session(session)
      .distinct("_id")
      .lean();

    const existingByGatePassNo = await OutgoingGatePass.findOne({
      gatePassNo: payload.gatePassNo,
      farmerStorageLinkId: { $in: farmerStorageLinkIdsForColdStorage },
    })
      .session(session)
      .lean();
    if (existingByGatePassNo) {
      throw new ConflictError(
        `Gate pass number ${payload.gatePassNo} already exists for this cold storage`,
        "GATE_PASS_NUMBER_EXISTS",
      );
    }

    const validated = validateOutgoingGatePassInput(payload, logger);

    const incomingPassMap = await fetchAndValidateIncomingGatePasses(
      payload,
      validated,
      session,
      logger,
    );

    const bulkOps = prepareBulkOperationsForOutgoing(
      validated,
      incomingPassMap,
    );
    if (bulkOps.length === 0) {
      throw new ValidationError(
        "No allocations to apply",
        "INVALID_ALLOCATION_QUANTITY",
      );
    }

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

    // Record edit history for each modified incoming gate pass (who edited, when)
    const uniqueIncomingIds = [
      ...new Set(validated.map((v) => v.incomingGatePassId)),
    ];
    await recordEditHistoryBulk(
      uniqueIncomingIds.map((id) => ({
        entityType: EditHistoryEntityType.INCOMING_GATE_PASS,
        documentId: new Types.ObjectId(id),
        coldStorageId,
        editedById: createdById,
        action: EditHistoryAction.QUANTITY_ADJUSTMENT,
        changeSummary: `Quantities reduced by outgoing gate pass #${payload.gatePassNo}`,
        logger,
      })),
      session,
      logger,
    );

    const incomingGatePassSnapshots = buildIncomingGatePassSnapshots(
      validated,
      incomingPassMap,
    );
    const orderDetails = buildOrderDetails(validated, incomingPassMap);

    const doc = await OutgoingGatePass.create(
      [
        {
          farmerStorageLinkId: farmerStorageLinkObjectId,
          createdBy: createdById ? new Types.ObjectId(createdById) : undefined,
          incomingGatePassSnapshots,
          gatePassNo: payload.gatePassNo,
          date: payload.date,
          from: payload.from,
          to: payload.to,
          truckNumber: payload.truckNumber ?? "",
          orderDetails,
          ...(payload.manualParchiNumber !== undefined && {
            manualParchiNumber: payload.manualParchiNumber,
          }),
          remarks: payload.remarks,
          idempotencyKey: payload.idempotencyKey,
        },
      ],
      { session },
    ).then((arr) => arr[0]);

    await session.commitTransaction();

    logger?.info(
      {
        outgoingGatePassId: doc._id,
        farmerStorageLinkId: payload.farmerStorageLinkId,
        gatePassNo: doc.gatePassNo,
      },
      "Outgoing gate pass created successfully",
    );

    // Record edit history for outgoing gate pass (who created, when)
    await recordEditHistory({
      entityType: EditHistoryEntityType.OUTGOING_GATE_PASS,
      documentId: doc._id,
      coldStorageId,
      editedById: createdById,
      action: EditHistoryAction.CREATE,
      changeSummary: `Outgoing gate pass #${doc.gatePassNo} created`,
      logger,
    });

    const populated = await OutgoingGatePass.findById(doc._id)
      .populate({
        path: "farmerStorageLinkId",
        select: "accountNumber farmerId",
        populate: {
          path: "farmerId",
          select: "name address mobileNumber",
        },
      })
      .populate({ path: "createdBy", select: "name" })
      .lean();

    if (!populated) {
      return doc.toObject();
    }

    const raw = populated as unknown as Record<string, unknown>;
    type PopulatedLink = {
      accountNumber: number;
      farmerId: { name: string; address: string; mobileNumber: string };
    };
    const populatedLink = raw.farmerStorageLinkId as
      | PopulatedLink
      | null
      | undefined;
    type PopulatedAdmin = { _id: unknown; name: string };
    const populatedAdmin = raw.createdBy as PopulatedAdmin | null | undefined;

    const response = {
      ...raw,
      farmerStorageLinkId:
        populatedLink && populatedLink.farmerId
          ? {
              name: populatedLink.farmerId.name,
              accountNumber: populatedLink.accountNumber,
              address: populatedLink.farmerId.address,
              mobileNumber: populatedLink.farmerId.mobileNumber,
            }
          : raw.farmerStorageLinkId,
      createdBy: populatedAdmin
        ? { _id: populatedAdmin._id, name: populatedAdmin.name }
        : raw.createdBy,
    };

    return response;
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    handleOutgoingServiceError(error, logger);
  } finally {
    session.endSession();
  }
}
