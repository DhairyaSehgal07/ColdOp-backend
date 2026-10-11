import mongoose, { ClientSession, Types } from "mongoose";
import type { FastifyBaseLogger } from "fastify";
import {
  OutgoingGatePass,
  GatePassType,
  IOutgoingIncomingGatePassSnapshot,
  IOutgoingIncomingGatePassSnapshotBagSize,
  IOutgoingGatePass,
  IOutgoingOrderDetail,
} from "./outgoing-gate-pass.model.js";
import {
  IncomingGatePass,
  GatePassStatus,
  type IIncomingGatePass,
  type IBagSize,
  type ILocation,
} from "../incoming-gate-pass/incoming-gate-pass.model.js";
import type {
  CreateOutgoingGatePassInput,
  NullOutgoingGatePassBody,
  UpdateOutgoingGatePassBody,
} from "./outgoing-gate-pass.schema.js";
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
import {
  recordEditHistory,
  recordEditHistoryBulk,
  EditHistoryEntityType,
  EditHistoryAction,
} from "../edit-history/edit-history.service.js";
import { ColdStorage } from "../cold-storage/cold-storage.model.js";
import { Preferences } from "../preferences/preferences.model.js";
import Ledger from "../ledger/ledger.model.js";
import {
  createVoucher,
  findLabourThekedarLedger,
  type CreateVoucherParams,
} from "../../../utils/accounting/helper-fns.js";
import {
  buildOutgoingGatePassAuditStates,
  recordOutgoingGatePassAudit,
} from "./outgoing-gate-pass-audit.service.js";

/* =======================
   TYPES (internal)
======================= */

interface OutgoingValidatedAllocation {
  incomingGatePassId: string;
  size: string;
  quantityToAllocate: number;
  location?: { chamber: string; floor: string; row: string };
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

/**
 * Current placement for a bag. `location` is current; `previousLocation` is move history only.
 */
function getEffectiveLocation(bag: IBagSize): ILocation {
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

/**
 * True when allocLocation matches the bag's current location.
 */
function bagMatchesLocation(
  bag: IBagSize,
  allocLocation: { chamber: string; floor: string; row: string },
): boolean {
  return locationMatches(getEffectiveLocation(bag), allocLocation);
}

interface MatchedBag {
  index: number;
  bag: IBagSize;
}

interface PlannedTake {
  index: number;
  bag: IBagSize;
  quantity: number;
}

/**
 * Rows that can satisfy an allocation.
 * With a location, every row of that size at that location is one pool
 * (duplicate lines at the same rack are fungible).
 * Without a location, only the first row of that size matches.
 */
function matchBags(
  bagSizes: IBagSize[],
  size: string,
  location?: { chamber: string; floor: string; row: string },
): MatchedBag[] {
  const normSize = normalizeSize(size);
  const matches: MatchedBag[] = [];
  for (let index = 0; index < bagSizes.length; index++) {
    const bag = bagSizes[index];
    if (normalizeSize(bag.name) !== normSize) continue;
    if (!location) {
      matches.push({ index, bag });
      return matches;
    }
    if (bagMatchesLocation(bag, location)) {
      matches.push({ index, bag });
    }
  }
  return matches;
}

function pooledCurrentQuantity(matches: MatchedBag[]): number {
  return matches.reduce((sum, match) => sum + match.bag.currentQuantity, 0);
}

/** Draw quantity from matching rows in array order. */
function planConsumption(
  matches: MatchedBag[],
  quantity: number,
): PlannedTake[] {
  let remaining = quantity;
  const takes: PlannedTake[] = [];
  for (const match of matches) {
    if (remaining <= 0) break;
    const quantityToTake = Math.min(match.bag.currentQuantity, remaining);
    if (quantityToTake <= 0) continue;
    takes.push({
      index: match.index,
      bag: match.bag,
      quantity: quantityToTake,
    });
    remaining -= quantityToTake;
  }
  return takes;
}

/**
 * Put quantity back onto matching rows in array order, filling each row up to
 * initialQuantity. Any remainder is added to the first row so a null or edit
 * still returns the full issued amount.
 */
function planRestore(matches: MatchedBag[], quantity: number): PlannedTake[] {
  let remaining = quantity;
  const takes: PlannedTake[] = [];
  for (const match of matches) {
    if (remaining <= 0) break;
    const room = Math.max(
      0,
      match.bag.initialQuantity - match.bag.currentQuantity,
    );
    const quantityToRestore = Math.min(room, remaining);
    if (quantityToRestore <= 0) continue;
    takes.push({
      index: match.index,
      bag: match.bag,
      quantity: quantityToRestore,
    });
    remaining -= quantityToRestore;
  }

  if (remaining > 0 && matches.length > 0) {
    const first = matches[0];
    const existing = takes.find((take) => take.index === first.index);
    if (existing) existing.quantity += remaining;
    else {
      takes.unshift({
        index: first.index,
        bag: first.bag,
        quantity: remaining,
      });
    }
  }

  return takes;
}

function locationHint(location?: {
  chamber: string;
  floor: string;
  row: string;
}): string {
  return location
    ? ` at location ${location.chamber}/${location.floor}/${location.row}`
    : "";
}

function assertPoolCoversRequest(
  matches: MatchedBag[],
  args: {
    incomingGatePassId: string;
    size: string;
    location?: { chamber: string; floor: string; row: string };
    requested: number;
    previouslyIssued: number;
  },
): void {
  const hint = locationHint(args.location);
  if (matches.length === 0) {
    throw new ValidationError(
      `Size "${args.size}"${hint} not found in incoming gate pass ${args.incomingGatePassId}`,
      "SIZE_NOT_FOUND",
    );
  }

  const current = pooledCurrentQuantity(matches);
  const effectiveAvailable = current + args.previouslyIssued;
  if (effectiveAvailable < args.requested) {
    const availabilityDetail =
      args.previouslyIssued > 0
        ? `available ${effectiveAvailable} (current ${current} + ${args.previouslyIssued} from this pass)`
        : `available ${current}`;
    throw new ValidationError(
      `Insufficient quantity for size "${args.size}"${hint} in incoming gate pass ${args.incomingGatePassId}: ${availabilityDetail}, requested ${args.requested}`,
      "INSUFFICIENT_STOCK",
    );
  }
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
        ...(a.location && { location: a.location }),
      })),
    });
  }

  return result;
}

function allocationLocationKey(
  size: string,
  location?: { chamber: string; floor: string; row: string },
): string {
  const locPart = location
    ? `|${(location.chamber ?? "").trim()}|${(location.floor ?? "").trim()}|${(location.row ?? "").trim()}`
    : "";
  return `${normalizeSize(size)}${locPart}`;
}

function allocationMapKey(
  incomingGatePassId: string,
  size: string,
  location?: { chamber: string; floor: string; row: string },
): string {
  return `${incomingGatePassId}|${allocationLocationKey(size, location)}`;
}

function parseAllocationMapKey(key: string): {
  incomingGatePassId: string;
  size: string;
  location?: { chamber: string; floor: string; row: string };
} {
  const pipeIdx = key.indexOf("|");
  const incomingGatePassId = key.slice(0, pipeIdx);
  const rest = key.slice(pipeIdx + 1);
  const segments = rest.split("|");
  if (segments.length >= 4) {
    return {
      incomingGatePassId,
      size: segments[0],
      location: {
        chamber: segments[1],
        floor: segments[2],
        row: segments[3],
      },
    };
  }
  return { incomingGatePassId, size: rest };
}

/* =======================
   FETCH & VALIDATE INCOMING GATE PASSES
======================= */

async function fetchAndValidateIncomingGatePasses(
  _payload: CreateOutgoingGatePassInput,
  validated: OutgoingIncomingPassWithFilteredAllocations[],
  session: ClientSession,
  _logger?: FastifyBaseLogger,
  previouslyIssuedByKey?: Map<string, number>,
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
  }

  const requestedByKey = buildRequestedAllocationMap(validated);
  for (const [key, requested] of requestedByKey) {
    const { incomingGatePassId, size, location } = parseAllocationMapKey(key);
    const incomingPass = incomingPassMap.get(incomingGatePassId);
    const bagSizes =
      (incomingPass as { bagSizes?: IBagSize[] } | undefined)?.bagSizes ?? [];
    const previouslyIssued = previouslyIssuedByKey?.get(key) ?? 0;
    assertPoolCoversRequest(matchBags(bagSizes, size, location), {
      incomingGatePassId,
      size,
      location,
      requested,
      previouslyIssued,
    });
  }

  return incomingPassMap;
}

/* =======================
   BULK OPERATIONS (index updates across a size/location pool)
======================= */

interface IndexAdjustment {
  index: number;
  bag: IBagSize;
  /** Signed change applied to currentQuantity. Negative issues stock. */
  delta: number;
}

function applyTakes(
  adjustments: Map<number, IndexAdjustment>,
  takes: PlannedTake[],
  sign: 1 | -1,
): void {
  for (const take of takes) {
    const signed = sign * take.quantity;
    const existing = adjustments.get(take.index);
    if (existing) {
      existing.delta += signed;
    } else {
      adjustments.set(take.index, {
        index: take.index,
        bag: take.bag,
        delta: signed,
      });
    }
  }
}

function bulkOpFromAdjustments(
  incomingGatePassId: string,
  adjustments: Map<number, IndexAdjustment>,
): mongoose.mongo.AnyBulkWriteOperation<IIncomingGatePass> | null {
  const filter: Record<string, unknown> = {
    _id: new Types.ObjectId(incomingGatePassId),
  };
  const inc: Record<string, number> = {};

  for (const adj of adjustments.values()) {
    if (adj.delta === 0) continue;
    const prefix = `bagSizes.${adj.index}`;
    inc[`${prefix}.currentQuantity`] = adj.delta;
    filter[`${prefix}.name`] = adj.bag.name;
    filter[`${prefix}.location.chamber`] = adj.bag.location.chamber;
    filter[`${prefix}.location.floor`] = adj.bag.location.floor;
    filter[`${prefix}.location.row`] = adj.bag.location.row;
    if (adj.delta < 0) {
      filter[`${prefix}.currentQuantity`] = { $gte: -adj.delta };
    } else {
      filter[`${prefix}.currentQuantity`] = adj.bag.currentQuantity;
    }
  }

  if (Object.keys(inc).length === 0) return null;

  return {
    updateOne: {
      filter,
      update: { $inc: inc },
    },
  };
}

function snapshotRowMatchesOrderDetail(
  row: IOutgoingIncomingGatePassSnapshotBagSize,
  detail: IOutgoingOrderDetail,
  snapVariety: string,
): boolean {
  const detailVariety = detail.variety?.trim();
  if (detailVariety) {
    if (detailVariety !== snapVariety.trim()) return false;
  }
  if (normalizeSize(detail.size) !== normalizeSize(row.name)) return false;
  if (row.location && detail.location) {
    return locationMatches(row.location, detail.location);
  }
  return !row.location && !detail.location;
}

function findOrderDetailForSnapshotRow(
  row: IOutgoingIncomingGatePassSnapshotBagSize,
  orderDetails: IOutgoingOrderDetail[],
  snapVariety: string,
): IOutgoingOrderDetail | undefined {
  const exact = orderDetails.find((d) =>
    snapshotRowMatchesOrderDetail(row, d, snapVariety),
  );
  if (exact) return exact;

  if (row.location) {
    const sizeOnlyMatches = orderDetails.filter(
      (d) => normalizeSize(d.size) === normalizeSize(row.name) && !d.location,
    );
    if (sizeOnlyMatches.length === 1) return sizeOnlyMatches[0];
  }

  return undefined;
}

function countSnapshotRowsByAllocationKey(
  snapshots: IOutgoingIncomingGatePassSnapshot[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const snap of snapshots) {
    for (const row of snap.bagSizes) {
      const key = `${snap.variety.trim()}|${allocationLocationKey(row.name, row.location)}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Resolves how many bags were issued for a snapshot line (new passes store quantityIssued;
 * legacy passes fall back to orderDetails matched by size + location).
 */
function resolveQuantityIssuedForRestore(
  row: IOutgoingIncomingGatePassSnapshotBagSize,
  orderDetails: IOutgoingOrderDetail[],
  rowCountByAllocationKey: Map<string, number>,
  snapVariety: string,
): number {
  if (row.quantityIssued != null) {
    return row.quantityIssued;
  }

  const detail = findOrderDetailForSnapshotRow(
    row,
    orderDetails,
    snapVariety,
  );

  if (!detail || detail.quantityIssued <= 0) {
    throw new ValidationError(
      `Cannot determine issued quantity for size "${row.name}"; update order details or recreate the outgoing gate pass.`,
      "OUTGOING_RESTORE_QUANTITY_UNKNOWN",
    );
  }

  const key = `${snapVariety.trim()}|${allocationLocationKey(row.name, row.location)}`;
  const rowCount = rowCountByAllocationKey.get(key) ?? 1;
  if (rowCount <= 1) {
    return detail.quantityIssued;
  }

  // Same variety/size/location from multiple incoming passes (aggregated in orderDetails).
  return Math.floor(detail.quantityIssued / rowCount);
}

function buildPreviouslyIssuedMap(
  snapshots: IOutgoingIncomingGatePassSnapshot[],
  orderDetails: IOutgoingOrderDetail[],
): Map<string, number> {
  const map = new Map<string, number>();
  const rowCountByAllocationKey = countSnapshotRowsByAllocationKey(snapshots);

  for (const snap of snapshots) {
    for (const row of snap.bagSizes) {
      const issued = resolveQuantityIssuedForRestore(
        row,
        orderDetails,
        rowCountByAllocationKey,
        snap.variety,
      );
      const key = allocationMapKey(snap._id.toString(), row.name, row.location);
      map.set(key, (map.get(key) ?? 0) + issued);
    }
  }

  return map;
}

function buildRequestedAllocationMap(
  validated: OutgoingIncomingPassWithFilteredAllocations[],
): Map<string, number> {
  const map = new Map<string, number>();

  for (const item of validated) {
    for (const alloc of item.allocations) {
      const key = allocationMapKey(
        item.incomingGatePassId,
        alloc.size,
        alloc.location,
      );
      map.set(key, (map.get(key) ?? 0) + alloc.quantityToAllocate);
    }
  }

  return map;
}

/**
 * Applies net stock change per size and location.
 * delta = newIssued - oldIssued. A positive delta draws from every matching
 * row in array order. A negative delta puts stock back the same way.
 * One updateOne is emitted per incoming gate pass.
 */
function prepareNetDeltaBulkOperationsForUpdate(
  previouslyIssuedMap: Map<string, number>,
  requestedMap: Map<string, number>,
  incomingPassMap: Map<string, IIncomingGatePass & { _id: Types.ObjectId }>,
): mongoose.mongo.AnyBulkWriteOperation<IIncomingGatePass>[] {
  const allKeys = new Set([
    ...previouslyIssuedMap.keys(),
    ...requestedMap.keys(),
  ]);
  const keysByPass = new Map<string, string[]>();
  for (const key of allKeys) {
    const { incomingGatePassId } = parseAllocationMapKey(key);
    const list = keysByPass.get(incomingGatePassId) ?? [];
    list.push(key);
    keysByPass.set(incomingGatePassId, list);
  }

  const bulkOps: mongoose.mongo.AnyBulkWriteOperation<IIncomingGatePass>[] = [];

  for (const [incomingGatePassId, keys] of keysByPass) {
    const hasChange = keys.some((key) => {
      const oldIssued = previouslyIssuedMap.get(key) ?? 0;
      const newIssued = requestedMap.get(key) ?? 0;
      return newIssued !== oldIssued;
    });
    if (!hasChange) continue;

    const ip = incomingPassMap.get(incomingGatePassId);
    if (!ip?.bagSizes) {
      throw new NotFoundError(
        `Incoming gate pass ${incomingGatePassId} not found`,
        "INCOMING_GATE_PASS_NOT_FOUND",
      );
    }

    const adjustments = new Map<number, IndexAdjustment>();

    for (const key of keys) {
      const oldIssued = previouslyIssuedMap.get(key) ?? 0;
      const newIssued = requestedMap.get(key) ?? 0;
      const delta = newIssued - oldIssued;
      if (delta === 0) continue;

      const { size, location } = parseAllocationMapKey(key);
      const matches = matchBags(ip.bagSizes, size, location);
      if (matches.length === 0) {
        throw new ValidationError(
          `Size "${size}"${locationHint(location)} not found in incoming gate pass ${incomingGatePassId}`,
          "SIZE_NOT_FOUND",
        );
      }

      if (delta > 0) {
        assertPoolCoversRequest(matches, {
          incomingGatePassId,
          size,
          location,
          requested: newIssued,
          previouslyIssued: oldIssued,
        });
        const takes = planConsumption(matches, delta);
        const planned = takes.reduce((sum, take) => sum + take.quantity, 0);
        if (planned !== delta) {
          throw new ValidationError(
            `Insufficient quantity for size "${size}"${locationHint(location)} in incoming gate pass ${incomingGatePassId}: available ${pooledCurrentQuantity(matches)}, requested ${delta}`,
            "INSUFFICIENT_STOCK",
          );
        }
        applyTakes(adjustments, takes, -1);
      } else {
        applyTakes(adjustments, planRestore(matches, -delta), 1);
      }
    }

    const op = bulkOpFromAdjustments(incomingGatePassId, adjustments);
    if (op) bulkOps.push(op);
  }

  return bulkOps;
}

function prepareBulkOperationsForOutgoing(
  validated: OutgoingIncomingPassWithFilteredAllocations[],
  incomingPassMap: Map<string, IIncomingGatePass & { _id: Types.ObjectId }>,
): mongoose.mongo.AnyBulkWriteOperation<IIncomingGatePass>[] {
  return prepareNetDeltaBulkOperationsForUpdate(
    new Map(),
    buildRequestedAllocationMap(validated),
    incomingPassMap,
  );
}

/**
 * Sets each affected incoming gate pass to CLOSED when all bag sizes are
 * depleted (sum of currentQuantity === 0), otherwise OPEN.
 */
async function syncIncomingGatePassStatusFromQuantities(
  incomingGatePassIds: Array<string | Types.ObjectId>,
  session: ClientSession,
): Promise<void> {
  const uniqueIds = [
    ...new Set(incomingGatePassIds.map((id) => id.toString())),
  ].map((id) => new Types.ObjectId(id));

  if (uniqueIds.length === 0) return;

  await IncomingGatePass.updateMany(
    { _id: { $in: uniqueIds } },
    [
      {
        $set: {
          status: {
            $cond: {
              if: {
                $eq: [{ $sum: "$bagSizes.currentQuantity" }, 0],
              },
              then: GatePassStatus.CLOSED,
              else: GatePassStatus.OPEN,
            },
          },
        },
      },
    ],
    { session, updatePipeline: true },
  );
}

/* =======================
   BUILD SNAPSHOTS (remaining qty at creation time)
======================= */

function pooledRemaining(
  matches: MatchedBag[],
  issued: number,
  stockAlreadyAdjusted: boolean,
): number {
  const current = pooledCurrentQuantity(matches);
  return stockAlreadyAdjusted
    ? Math.max(0, current)
    : Math.max(0, current - issued);
}

function buildIncomingGatePassSnapshots(
  validated: OutgoingIncomingPassWithFilteredAllocations[],
  incomingPassMap: Map<string, IIncomingGatePass & { _id: Types.ObjectId }>,
  options?: { stockAlreadyAdjusted?: boolean },
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
    quantityIssued: number;
  }>;
}> {
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
      quantityIssued: number;
    }>;
  }> = [];

  for (const item of validated) {
    const ip = incomingPassMap.get(item.incomingGatePassId) as unknown as {
      _id: Types.ObjectId;
      gatePassNo: number;
      bagSizes: IBagSize[];
    };
    if (!ip?.bagSizes) continue;

    const issuedByKey = new Map<
      string,
      {
        size: string;
        location?: { chamber: string; floor: string; row: string };
        quantity: number;
      }
    >();
    for (const alloc of item.allocations) {
      const key = allocationLocationKey(alloc.size, alloc.location);
      const existing = issuedByKey.get(key);
      if (existing) {
        existing.quantity += alloc.quantityToAllocate;
      } else {
        issuedByKey.set(key, {
          size: alloc.size,
          location: alloc.location,
          quantity: alloc.quantityToAllocate,
        });
      }
    }

    const bagSizes: Array<{
      name: string;
      currentQuantity: number;
      initialQuantity: number;
      type: GatePassType;
      location: { chamber: string; floor: string; row: string };
      quantityIssued: number;
    }> = [];

    for (const issued of issuedByKey.values()) {
      const matches = matchBags(ip.bagSizes, issued.size, issued.location);
      if (matches.length === 0) continue;

      const location = issued.location ?? getEffectiveLocation(matches[0].bag);
      bagSizes.push({
        name: matches[0].bag.name,
        currentQuantity: pooledRemaining(
          matches,
          issued.quantity,
          options?.stockAlreadyAdjusted === true,
        ),
        initialQuantity: matches.reduce(
          (sum, match) => sum + match.bag.initialQuantity,
          0,
        ),
        type: GatePassType.DELIVERY,
        location,
        quantityIssued: issued.quantity,
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
   BUILD ORDER DETAILS (aggregate by size, and by location when same size at multiple locations)
======================= */

type OrderDetailEntry = {
  variety: string;
  size: string;
  quantityAvailable: number;
  quantityIssued: number;
  location?: { chamber: string; floor: string; row: string };
};

function buildOrderDetails(
  validated: OutgoingIncomingPassWithFilteredAllocations[],
  incomingPassMap: Map<string, IIncomingGatePass & { _id: Types.ObjectId }>,
  options?: { stockAlreadyAdjusted?: boolean },
): OrderDetailEntry[] {
  const byKey = new Map<
    string,
    {
      variety: string;
      size: string;
      quantityIssued: number;
      quantityAvailable: number;
      location?: { chamber: string; floor: string; row: string };
    }
  >();

  for (const item of validated) {
    const ip = incomingPassMap.get(item.incomingGatePassId) as unknown as {
      bagSizes: IBagSize[];
    };
    if (!ip?.bagSizes) continue;

    const issuedByKey = new Map<
      string,
      {
        size: string;
        location?: { chamber: string; floor: string; row: string };
        quantity: number;
      }
    >();
    for (const alloc of item.allocations) {
      const key = allocationLocationKey(alloc.size, alloc.location);
      const existing = issuedByKey.get(key);
      if (existing) {
        existing.quantity += alloc.quantityToAllocate;
      } else {
        issuedByKey.set(key, {
          size: alloc.size,
          location: alloc.location,
          quantity: alloc.quantityToAllocate,
        });
      }
    }

    for (const [lineKey, issued] of issuedByKey) {
      const matches = matchBags(ip.bagSizes, issued.size, issued.location);
      if (matches.length === 0) continue;
      const remaining = pooledRemaining(
        matches,
        issued.quantity,
        options?.stockAlreadyAdjusted === true,
      );
      const detailKey = `${item.variety}|${lineKey}`;
      const existing = byKey.get(detailKey);
      if (existing) {
        existing.quantityIssued += issued.quantity;
        existing.quantityAvailable += remaining;
      } else {
        byKey.set(detailKey, {
          variety: item.variety,
          size: issued.size,
          quantityIssued: issued.quantity,
          quantityAvailable: remaining,
          location: issued.location,
        });
      }
    }
  }

  return Array.from(byKey.values()).map((v) => {
    const entry: OrderDetailEntry = {
      variety: v.variety,
      size: v.size,
      quantityAvailable: v.quantityAvailable,
      quantityIssued: v.quantityIssued,
    };
    if (v.location) entry.location = v.location;
    return entry;
  });
}

/* =======================
   ERROR HANDLER
======================= */

function handleOutgoingServiceError(
  error: unknown,
  logger?: FastifyBaseLogger,
  opts?: { fallbackMessage: string; fallbackCode: string },
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
    opts?.fallbackMessage ?? "Failed to create outgoing gate pass",
    500,
    opts?.fallbackCode ?? "CREATE_OUTGOING_GATE_PASS_ERROR",
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
            select: FARMER_STORAGE_LINK_POPULATE_SELECT,
            populate: {
              path: "farmerId",
              select: FARMER_STORAGE_LINK_FARMER_POPULATE_SELECT,
            },
          })
          .populate({ path: "createdBy", select: "name" })
          .lean();
        if (!populated) return existing as unknown as Record<string, unknown>;
        const raw = populated as unknown as Record<string, unknown>;
        type PopulatedAdmin = { _id: unknown; name: string };
        const populatedLink = raw.farmerStorageLinkId as
          | PopulatedFarmerStorageLink
          | null
          | undefined;
        const populatedAdmin = raw.createdBy as
          | PopulatedAdmin
          | null
          | undefined;
        const linkDisplay = formatPopulatedFarmerStorageLinkDisplay(populatedLink);
        return {
          ...raw,
          farmerStorageLinkId: linkDisplay ?? raw.farmerStorageLinkId,
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

    // Labour cost voucher: debit Labour, credit Labour Thekedar when preferences.labourCost > 0
    let labourVoucherParams: CreateVoucherParams | null = null;
    const totalBags = validated.reduce(
      (sum, item) =>
        sum + item.allocations.reduce((s, a) => s + a.quantityToAllocate, 0),
      0,
    );
    const coldStorage = await ColdStorage.findById(coldStorageId)
      .select("preferencesId")
      .session(session)
      .lean();
    const preferences = coldStorage?.preferencesId
      ? await Preferences.findById(coldStorage.preferencesId)
          .session(session)
          .lean()
      : null;
    const labourCost =
      preferences?.labourCost != null ? Number(preferences.labourCost) : 0;
    if (labourCost > 0 && totalBags > 0) {
      const createdByObjId = createdById
        ? new Types.ObjectId(createdById)
        : undefined;
      if (!createdByObjId) {
        throw new ValidationError(
          "Created by (store admin) is required to create labour voucher",
          "CREATED_BY_REQUIRED",
        );
      }
      const labourLedger = await Ledger.findOne({
        coldStorageId,
        name: "Labour",
        farmerStorageLinkId: null,
        isSystemLedger: true,
      })
        .select("_id")
        .session(session)
        .lean();
      const labourThekedarLedger = await findLabourThekedarLedger(
        coldStorageId,
        session,
      );
      if (!labourLedger) {
        throw new NotFoundError(
          "Labour ledger not found for the current store",
          "LABOUR_LEDGER_NOT_FOUND",
        );
      }
      if (!labourThekedarLedger) {
        throw new NotFoundError(
          "Labour Thekedar ledger not found for the current store",
          "LABOUR_CONTRACTOR_LEDGER_NOT_FOUND",
        );
      }
      const labourAmount = labourCost * totalBags;
      const labourNarration = `Labour cost for gate pass no. ${payload.gatePassNo} (${totalBags} bags @ ${labourCost})`;
      labourVoucherParams = {
        debitLedgerId: new Types.ObjectId(labourLedger._id),
        creditLedgerId: new Types.ObjectId(labourThekedarLedger._id),
        amount: labourAmount,
        narration: labourNarration,
        coldStorageId,
        farmerStorageLinkId: null,
        createdBy: createdByObjId,
        date: payload.date,
      };
    }

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
    await syncIncomingGatePassStatusFromQuantities(uniqueIncomingIds, session);
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
          ...(payload.stockFilter !== undefined && {
            stockFilter: payload.stockFilter,
          }),
          remarks: payload.remarks,
          idempotencyKey: payload.idempotencyKey,
        },
      ],
      { session },
    ).then((arr) => arr[0]);

    await session.commitTransaction();

    if (labourVoucherParams) {
      await createVoucher(labourVoucherParams);
      logger?.info(
        {
          gatePassNo: payload.gatePassNo,
          labourAmount: labourVoucherParams.amount,
          totalBags,
        },
        "Labour cost voucher created for outgoing gate pass",
      );
    }

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
        select: FARMER_STORAGE_LINK_POPULATE_SELECT,
        populate: {
          path: "farmerId",
          select: FARMER_STORAGE_LINK_FARMER_POPULATE_SELECT,
        },
      })
      .populate({ path: "createdBy", select: "name" })
      .lean();

    if (!populated) {
      return doc.toObject();
    }

    const raw = populated as unknown as Record<string, unknown>;
    const populatedLink = raw.farmerStorageLinkId as
      | PopulatedFarmerStorageLink
      | null
      | undefined;
    type PopulatedAdmin = { _id: unknown; name: string };
    const populatedAdmin = raw.createdBy as PopulatedAdmin | null | undefined;
    const linkDisplay = formatPopulatedFarmerStorageLinkDisplay(populatedLink);

    const response = {
      ...raw,
      farmerStorageLinkId: linkDisplay ?? raw.farmerStorageLinkId,
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

export interface UpdateOutgoingGatePassAuditContext {
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Updates outgoing gate pass header fields and/or allocation quantities.
 * When incomingGatePasses is sent, stock is adjusted by net delta on incoming passes.
 */
export async function updateOutgoingGatePass(
  id: string,
  payload: UpdateOutgoingGatePassBody,
  editedById: string | undefined,
  loggedInUserColdStorageId: string | undefined,
  logger?: FastifyBaseLogger,
  auditContext?: UpdateOutgoingGatePassAuditContext,
) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError(
      "Invalid outgoing gate pass ID format",
      "INVALID_OUTGOING_GATE_PASS_ID",
    );
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const idObj = new Types.ObjectId(id);
    const existing = await OutgoingGatePass.findById(idObj)
      .session(session)
      .lean();

    if (!existing) {
      throw new NotFoundError(
        "Outgoing gate pass not found",
        "OUTGOING_GATE_PASS_NOT_FOUND",
      );
    }

    if (
      existing.isNull === true ||
      existing.type === GatePassType.NULL_DELIVERY
    ) {
      throw new ValidationError(
        "Cannot update a nulled outgoing gate pass",
        "OUTGOING_GATE_PASS_NULLED",
      );
    }

    const existingLinkRaw = existing.farmerStorageLinkId;
    const existingLinkId =
      typeof existingLinkRaw === "object" &&
      existingLinkRaw !== null &&
      "_id" in existingLinkRaw
        ? (existingLinkRaw as { _id: Types.ObjectId })._id
        : existingLinkRaw;
    const existingLinkIdObj =
      typeof existingLinkId === "object"
        ? existingLinkId
        : new Types.ObjectId(String(existingLinkId));

    const storageLink = await FarmerStorageLink.findById(existingLinkIdObj)
      .session(session)
      .lean();

    if (!storageLink) {
      throw new NotFoundError(
        "Farmer-storage-link not found",
        "FARMER_STORAGE_LINK_NOT_FOUND",
      );
    }

    const linkColdStorageId =
      typeof storageLink.coldStorageId === "object" &&
      storageLink.coldStorageId !== null
        ? (storageLink.coldStorageId as { _id: Types.ObjectId })._id.toString()
        : (storageLink.coldStorageId as string);

    if (
      loggedInUserColdStorageId &&
      linkColdStorageId !== loggedInUserColdStorageId
    ) {
      throw new NotFoundError(
        "Outgoing gate pass not found",
        "OUTGOING_GATE_PASS_NOT_FOUND",
      );
    }

    const coldStorageId = new Types.ObjectId(linkColdStorageId);

    const updateFields: Record<string, unknown> = {};
    if (payload.date !== undefined) updateFields.date = payload.date;
    if (payload.from !== undefined) updateFields.from = payload.from;
    if (payload.to !== undefined) updateFields.to = payload.to;
    if (payload.truckNumber !== undefined)
      updateFields.truckNumber = payload.truckNumber;
    if (payload.remarks !== undefined) updateFields.remarks = payload.remarks;
    if (payload.manualParchiNumber !== undefined)
      updateFields.manualParchiNumber = payload.manualParchiNumber;
    if (payload.stockFilter !== undefined)
      updateFields.stockFilter = payload.stockFilter;

    if (payload.farmerStorageLinkId !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(payload.farmerStorageLinkId)) {
        throw new ValidationError(
          "Invalid farmer storage link ID format",
          "INVALID_FARMER_STORAGE_LINK_ID",
        );
      }

      const newLink = await FarmerStorageLink.findById(
        payload.farmerStorageLinkId,
      )
        .session(session)
        .lean();

      if (!newLink) {
        throw new NotFoundError(
          "Farmer-storage-link not found",
          "FARMER_STORAGE_LINK_NOT_FOUND",
        );
      }

      const newLinkColdStorageId =
        typeof newLink.coldStorageId === "object" && newLink.coldStorageId !== null
          ? (newLink.coldStorageId as { _id: Types.ObjectId })._id.toString()
          : (newLink.coldStorageId as string);

      if (newLinkColdStorageId !== linkColdStorageId) {
        throw new NotFoundError(
          "Farmer-storage-link not found",
          "FARMER_STORAGE_LINK_NOT_FOUND",
        );
      }

      updateFields.farmerStorageLinkId = new Types.ObjectId(
        payload.farmerStorageLinkId,
      );
    }

    if (payload.incomingGatePasses !== undefined) {
      const snapshots = existing.incomingGatePassSnapshots ?? [];
      if (snapshots.length === 0) {
        throw new ValidationError(
          "This outgoing gate pass has no allocation snapshot; quantities cannot be edited.",
          "OUTGOING_SNAPSHOT_MISSING",
        );
      }

      const previouslyIssuedMap = buildPreviouslyIssuedMap(
        snapshots,
        existing.orderDetails,
      );

      const fakeCreate: CreateOutgoingGatePassInput = {
        farmerStorageLinkId:
          payload.farmerStorageLinkId ?? existingLinkIdObj.toString(),
        gatePassNo: existing.gatePassNo,
        date: payload.date ?? existing.date,
        from: payload.from ?? existing.from,
        to: payload.to ?? existing.to,
        truckNumber: payload.truckNumber ?? existing.truckNumber,
        remarks: payload.remarks ?? existing.remarks,
        manualParchiNumber:
          payload.manualParchiNumber ?? existing.manualParchiNumber,
        incomingGatePasses: payload.incomingGatePasses,
      };

      const validated = validateOutgoingGatePassInput(fakeCreate, logger);
      const requestedMap = buildRequestedAllocationMap(validated);

      const incomingPassMap = await fetchAndValidateIncomingGatePasses(
        fakeCreate,
        validated,
        session,
        logger,
        previouslyIssuedMap,
      );

      const snapshotIncomingIds = [
        ...new Set(snapshots.map((snap) => snap._id.toString())),
      ];
      const missingSnapshotIds = snapshotIncomingIds.filter(
        (incomingId) => !incomingPassMap.has(incomingId),
      );

      if (missingSnapshotIds.length > 0) {
        const extraFetched = await IncomingGatePass.find({
          _id: {
            $in: missingSnapshotIds.map((incomingId) => new Types.ObjectId(incomingId)),
          },
        })
          .session(session)
          .lean();

        for (const pass of extraFetched) {
          incomingPassMap.set(
            (pass as { _id: Types.ObjectId })._id.toString(),
            pass as IIncomingGatePass & { _id: Types.ObjectId },
          );
        }
      }

      const bulkOps = prepareNetDeltaBulkOperationsForUpdate(
        previouslyIssuedMap,
        requestedMap,
        incomingPassMap,
      );

      if (bulkOps.length === 0) {
        throw new ValidationError(
          "No allocation changes to apply; incoming gate passes and quantities match the current pass.",
          "INVALID_ALLOCATION_QUANTITY",
        );
      }

      const updateResult = await IncomingGatePass.bulkWrite(
        bulkOps as Parameters<typeof IncomingGatePass.bulkWrite>[0],
        { session },
      );

      if (updateResult.modifiedCount !== bulkOps.length) {
        throw new ConflictError(
          `Expected ${bulkOps.length} incoming updates, got ${updateResult.modifiedCount}. Concurrent modification detected.`,
          "CONCURRENT_MODIFICATION",
        );
      }

      const affectedIncomingIds = [
        ...new Set(
          bulkOps.map((op) => {
            const filter = (op as { updateOne: { filter: { _id: Types.ObjectId } } })
              .updateOne.filter;
            return filter._id.toString();
          }),
        ),
      ];

      await syncIncomingGatePassStatusFromQuantities(
        affectedIncomingIds,
        session,
      );

      await recordEditHistoryBulk(
        affectedIncomingIds.map((incomingId) => ({
          entityType: EditHistoryEntityType.INCOMING_GATE_PASS,
          documentId: new Types.ObjectId(incomingId),
          coldStorageId,
          editedById,
          action: EditHistoryAction.QUANTITY_ADJUSTMENT,
          changeSummary: `Quantities adjusted by editing outgoing gate pass #${existing.gatePassNo}`,
          logger,
        })),
        session,
        logger,
      );

      const newIncomingIds = [
        ...new Set(validated.map((v) => v.incomingGatePassId)),
      ].map((incomingId) => new Types.ObjectId(incomingId));

      const refetched = await IncomingGatePass.find({
        _id: { $in: newIncomingIds },
      })
        .session(session)
        .lean();

      const refetchedMap = new Map<
        string,
        IIncomingGatePass & { _id: Types.ObjectId }
      >();
      for (const pass of refetched) {
        refetchedMap.set(
          (pass as { _id: Types.ObjectId })._id.toString(),
          pass as IIncomingGatePass & { _id: Types.ObjectId },
        );
      }

      updateFields.incomingGatePassSnapshots = buildIncomingGatePassSnapshots(
        validated,
        refetchedMap,
        { stockAlreadyAdjusted: true },
      );
      updateFields.orderDetails = buildOrderDetails(validated, refetchedMap, {
        stockAlreadyAdjusted: true,
      });
    }

    if (Object.keys(updateFields).length === 0) {
      throw new ValidationError(
        "No valid fields to update",
        "NO_FIELDS_TO_UPDATE",
      );
    }

    const updated = await OutgoingGatePass.findByIdAndUpdate(
      idObj,
      { $set: updateFields },
      { session, new: true },
    ).lean();

    if (!updated) {
      throw new NotFoundError(
        "Outgoing gate pass not found",
        "OUTGOING_GATE_PASS_NOT_FOUND",
      );
    }

    const { previousState, modifiedState } = buildOutgoingGatePassAuditStates({
      existing: existing as unknown as Record<string, unknown>,
      updated: updated as unknown as Record<string, unknown>,
      changedGatePassFields: Object.keys(updateFields),
    });

    await recordOutgoingGatePassAudit({
      outgoingGatePassId: idObj,
      editedById,
      previousState,
      modifiedState,
      ipAddress: auditContext?.ipAddress,
      userAgent: auditContext?.userAgent,
      session,
      logger,
    });

    await session.commitTransaction();

    await recordEditHistory({
      entityType: EditHistoryEntityType.OUTGOING_GATE_PASS,
      documentId: idObj,
      coldStorageId,
      editedById,
      action: EditHistoryAction.UPDATE,
      changeSummary: `Outgoing gate pass #${updated.gatePassNo} updated`,
      logger,
    });

    const populated = await OutgoingGatePass.findById(idObj)
      .populate({
        path: "farmerStorageLinkId",
        select: FARMER_STORAGE_LINK_POPULATE_SELECT,
        populate: {
          path: "farmerId",
          select: FARMER_STORAGE_LINK_FARMER_POPULATE_SELECT,
        },
      })
      .populate({ path: "createdBy", select: "name" })
      .lean();

    if (!populated) {
      return updated as unknown as Record<string, unknown>;
    }

    const raw = populated as unknown as Record<string, unknown>;
    const populatedLink = raw.farmerStorageLinkId as
      | PopulatedFarmerStorageLink
      | null
      | undefined;
    type PopulatedAdmin = { _id: unknown; name: string };
    const populatedAdmin = raw.createdBy as PopulatedAdmin | null | undefined;
    const linkDisplay = formatPopulatedFarmerStorageLinkDisplay(populatedLink);

    return {
      ...raw,
      farmerStorageLinkId: linkDisplay ?? raw.farmerStorageLinkId,
      createdBy: populatedAdmin
        ? { _id: populatedAdmin._id, name: populatedAdmin.name }
        : raw.createdBy,
    };
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    handleOutgoingServiceError(error, logger, {
      fallbackMessage: "Failed to update outgoing gate pass",
      fallbackCode: "UPDATE_OUTGOING_GATE_PASS_ERROR",
    });
  } finally {
    session.endSession();
  }
}

/**
 * Fetches a single outgoing gate pass by ID, scoped to the logged-in user's cold storage.
 */
export async function getOutgoingGatePassById(
  id: string,
  loggedInUserColdStorageId: string | undefined,
  logger?: FastifyBaseLogger,
) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError(
      "Invalid outgoing gate pass ID format",
      "INVALID_OUTGOING_GATE_PASS_ID",
    );
  }

  try {
    const idObj = new Types.ObjectId(id);
    const existing = await OutgoingGatePass.findById(idObj).lean();

    if (!existing) {
      throw new NotFoundError(
        "Outgoing gate pass not found",
        "OUTGOING_GATE_PASS_NOT_FOUND",
      );
    }

    const existingLinkRaw = existing.farmerStorageLinkId;
    const existingLinkId =
      typeof existingLinkRaw === "object" &&
      existingLinkRaw !== null &&
      "_id" in existingLinkRaw
        ? (existingLinkRaw as { _id: Types.ObjectId })._id
        : existingLinkRaw;
    const existingLinkIdObj =
      typeof existingLinkId === "object"
        ? existingLinkId
        : new Types.ObjectId(String(existingLinkId));

    const storageLink =
      await FarmerStorageLink.findById(existingLinkIdObj).lean();

    if (!storageLink) {
      throw new NotFoundError(
        "Farmer-storage-link not found",
        "FARMER_STORAGE_LINK_NOT_FOUND",
      );
    }

    const linkColdStorageId =
      typeof storageLink.coldStorageId === "object" &&
      storageLink.coldStorageId !== null
        ? (storageLink.coldStorageId as { _id: Types.ObjectId })._id.toString()
        : (storageLink.coldStorageId as string);

    if (
      loggedInUserColdStorageId &&
      linkColdStorageId !== loggedInUserColdStorageId
    ) {
      throw new NotFoundError(
        "Outgoing gate pass not found",
        "OUTGOING_GATE_PASS_NOT_FOUND",
      );
    }

    const populated = await OutgoingGatePass.findById(idObj)
      .populate({
        path: "farmerStorageLinkId",
        select: FARMER_STORAGE_LINK_POPULATE_SELECT,
        populate: {
          path: "farmerId",
          select: FARMER_STORAGE_LINK_FARMER_POPULATE_SELECT,
        },
      })
      .populate({ path: "createdBy", select: "name" })
      .lean();

    if (!populated) {
      throw new NotFoundError(
        "Outgoing gate pass not found",
        "OUTGOING_GATE_PASS_NOT_FOUND",
      );
    }

    logger?.info(
      { outgoingGatePassId: id },
      "Retrieved outgoing gate pass by ID",
    );

    const raw = populated as unknown as Record<string, unknown>;
    const populatedLink = raw.farmerStorageLinkId as
      | PopulatedFarmerStorageLink
      | null
      | undefined;
    type PopulatedAdmin = { _id: unknown; name: string };
    const populatedAdmin = raw.createdBy as PopulatedAdmin | null | undefined;
    const linkDisplay = formatPopulatedFarmerStorageLinkDisplay(populatedLink);

    return {
      ...raw,
      farmerStorageLinkId: linkDisplay ?? raw.farmerStorageLinkId,
      createdBy: populatedAdmin
        ? { _id: populatedAdmin._id, name: populatedAdmin.name }
        : raw.createdBy,
    };
  } catch (error) {
    handleOutgoingServiceError(error, logger, {
      fallbackMessage: "Failed to retrieve outgoing gate pass",
      fallbackCode: "GET_OUTGOING_GATE_PASS_ERROR",
    });
  }
}

export interface OutgoingGatePassReportOptions {
  dateFrom?: string;
  dateTo?: string;
  stockFilter?: string;
}

const STOCK_FILTER_FARMER = "FARMER";
const STOCK_FILTER_OWNED = "OWNED";

function buildOutgoingStockFilterQuery(
  stockFilter?: string,
): Record<string, unknown> | undefined {
  const trimmed = stockFilter?.trim();
  if (!trimmed) return undefined;

  if (trimmed === STOCK_FILTER_FARMER) {
    return { stockFilter: STOCK_FILTER_FARMER };
  }
  if (trimmed === STOCK_FILTER_OWNED) {
    return {
      $or: [
        { stockFilter: STOCK_FILTER_OWNED },
        { stockFilter: { $in: [null, ""] } },
        { stockFilter: { $exists: false } },
      ],
    };
  }

  throw new ValidationError(
    "stockFilter must be either FARMER or OWNED",
    "INVALID_STOCK_FILTER",
  );
}

type OutgoingReportPopulatedAdmin = { _id: unknown; name: string };

type OutgoingReportPopulatedLinkWithId = PopulatedFarmerStorageLink & {
  _id?: unknown;
};

type OutgoingReportPopulatedIncomingRef = {
  _id: unknown;
  customMarka?: string;
};

function stringifyReportId(value: unknown): unknown {
  if (typeof value === "object" && value !== null && "toString" in value) {
    return (value as { toString: () => string }).toString();
  }
  return value;
}

function isPopulatedIncomingRef(
  value: unknown,
): value is OutgoingReportPopulatedIncomingRef {
  if (value == null || typeof value !== "object") return false;
  if (value instanceof Types.ObjectId) return false;
  return "_id" in value;
}

function mapIncomingGatePassSnapshotsForReport(snapshots: unknown): unknown {
  if (!Array.isArray(snapshots)) return snapshots;

  return snapshots.map((snap) => {
    if (snap == null || typeof snap !== "object") return snap;

    const snapshot = snap as Record<string, unknown>;
    const rawId = snapshot._id;
    const populatedIncoming = isPopulatedIncomingRef(rawId) ? rawId : null;

    const mapped: Record<string, unknown> = {
      ...snapshot,
      _id: stringifyReportId(populatedIncoming?._id ?? rawId),
    };

    const customMarka = populatedIncoming?.customMarka;
    if (customMarka != null && customMarka !== "") {
      mapped.customMarka = customMarka;
    }

    return mapped;
  });
}

function mapOutgoingGatePassToReport(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const populatedLink = raw.farmerStorageLinkId as
    | OutgoingReportPopulatedLinkWithId
    | null
    | undefined;
  const populatedAdmin = raw.createdBy as
    | OutgoingReportPopulatedAdmin
    | null
    | undefined;
  const linkDisplay = formatPopulatedFarmerStorageLinkDisplay(populatedLink);

  const orderDetails =
    (raw.orderDetails as { quantityIssued?: number }[]) ?? [];
  const totalBags = orderDetails.reduce(
    (sum, detail) => sum + (detail.quantityIssued ?? 0),
    0,
  );

  const report: Record<string, unknown> = {
    _id:
      typeof raw._id === "object" && raw._id !== null && "toString" in raw._id
        ? (raw._id as { toString: () => string }).toString()
        : raw._id,
    gatePassNo: raw.gatePassNo,
    date:
      raw.date instanceof Date ? raw.date.toISOString() : raw.date,
    orderDetails: raw.orderDetails,
    totalBags,
    farmerStorageLinkId: linkDisplay
      ? {
          _id:
            populatedLink?._id != null
              ? typeof populatedLink._id === "object" &&
                populatedLink._id !== null &&
                "toString" in populatedLink._id
                ? (
                    populatedLink._id as { toString: () => string }
                  ).toString()
                : populatedLink._id
              : undefined,
          ...linkDisplay,
        }
      : raw.farmerStorageLinkId,
  };

  if (raw.type != null && raw.type !== "") {
    report.type = raw.type;
  }
  if (raw.from != null && raw.from !== "") {
    report.from = raw.from;
  }
  if (raw.to != null && raw.to !== "") {
    report.to = raw.to;
  }
  if (raw.truckNumber != null && raw.truckNumber !== "") {
    report.truckNumber = raw.truckNumber;
  }
  if (raw.manualParchiNumber != null) {
    report.manualParchiNumber = raw.manualParchiNumber;
  }
  if (raw.remarks != null && raw.remarks !== "") {
    report.remarks = raw.remarks;
  }
  if (raw.stockFilter != null && raw.stockFilter !== "") {
    report.stockFilter = raw.stockFilter;
  }
  if (raw.incomingGatePassSnapshots != null) {
    report.incomingGatePassSnapshots = mapIncomingGatePassSnapshotsForReport(
      raw.incomingGatePassSnapshots,
    );
  }
  if (raw.isNull === true) {
    report.isNull = true;
  }
  if (raw.nulledAt != null) {
    report.nulledAt =
      raw.nulledAt instanceof Date
        ? raw.nulledAt.toISOString()
        : raw.nulledAt;
  }
  if (populatedAdmin) {
    report.createdBy = {
      _id: populatedAdmin._id,
      name: populatedAdmin.name,
    };
  }

  return report;
}

/**
 * Get all outgoing gate passes for a cold storage as a report (no pagination).
 * Optional dateFrom/dateTo filter on gate pass date (UTC day boundaries).
 */
export async function getOutgoingGatePassReport(
  coldStorageId: string,
  options: OutgoingGatePassReportOptions = {},
  logger?: FastifyBaseLogger,
): Promise<Record<string, unknown>[]> {
  try {
    if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
      throw new ValidationError(
        "Invalid cold storage ID format",
        "INVALID_COLD_STORAGE_ID",
      );
    }

    const { dateFrom, dateTo, stockFilter } = options;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    if (dateFrom != null && dateFrom !== "" && !dateRegex.test(dateFrom)) {
      throw new ValidationError(
        "Invalid dateFrom format. Use ISO date, e.g. 2026-03-01",
        "INVALID_DATE_FROM",
      );
    }
    if (dateTo != null && dateTo !== "" && !dateRegex.test(dateTo)) {
      throw new ValidationError(
        "Invalid dateTo format. Use ISO date, e.g. 2026-03-07",
        "INVALID_DATE_TO",
      );
    }

    const coldStorageObjectId = new Types.ObjectId(coldStorageId);
    const linkIds = await FarmerStorageLink.distinct("_id", {
      coldStorageId: coldStorageObjectId,
    });

    if (linkIds.length === 0) {
      logger?.info(
        { coldStorageId, dateFrom, dateTo },
        "Outgoing gate pass report: no farmer-storage links",
      );
      return [];
    }

    const filter: Record<string, unknown> = {
      farmerStorageLinkId: { $in: linkIds },
    };

    const stockFilterQuery = buildOutgoingStockFilterQuery(stockFilter);
    if (stockFilterQuery) {
      Object.assign(filter, stockFilterQuery);
    }

    if (dateFrom || dateTo) {
      const dateConditions: Record<string, Date> = {};
      if (dateFrom) {
        const from = new Date(dateFrom);
        from.setUTCHours(0, 0, 0, 0);
        dateConditions.$gte = from;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setUTCHours(23, 59, 59, 999);
        dateConditions.$lte = to;
      }
      filter.date = dateConditions;
    }

    const list = await OutgoingGatePass.find(filter)
      .sort({ gatePassNo: -1, date: -1 })
      .populate({
        path: "farmerStorageLinkId",
        select: FARMER_STORAGE_LINK_POPULATE_SELECT,
        populate: {
          path: "farmerId",
          select: FARMER_STORAGE_LINK_FARMER_POPULATE_SELECT,
        },
      })
      .populate({ path: "createdBy", select: "name" })
      .populate({
        path: "incomingGatePassSnapshots._id",
        select: "customMarka",
      })
      .lean();

    const report = list.map((raw) =>
      mapOutgoingGatePassToReport(raw as unknown as Record<string, unknown>),
    );

    logger?.info(
      {
        coldStorageId,
        count: report.length,
        dateFrom,
        dateTo,
        stockFilter,
      },
      "Outgoing gate pass report retrieved",
    );

    return report;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    logger?.error(
      { error, coldStorageId },
      "Error retrieving outgoing gate pass report",
    );
    throw new AppError(
      "Failed to retrieve outgoing gate pass report",
      500,
      "GET_OUTGOING_GATE_PASS_REPORT_ERROR",
    );
  }
}

function buildDwarfOutgoingPassFields(
  existing: Pick<IOutgoingGatePass, "orderDetails">,
): {
  type: GatePassType.NULL_DELIVERY;
  incomingGatePassSnapshots: null;
  orderDetails: IOutgoingOrderDetail[];
} {
  return {
    type: GatePassType.NULL_DELIVERY,
    incomingGatePassSnapshots: null,
    orderDetails: existing.orderDetails.map((detail) => ({
      ...detail,
      quantityIssued: 0,
      quantityAvailable: 0,
    })),
  };
}

/**
 * Nulls (voids) an outgoing gate pass and restores issued quantities to incoming gate passes.
 */
export async function nullOutgoingGatePass(
  id: string,
  payload: NullOutgoingGatePassBody,
  editedById: string | undefined,
  loggedInUserColdStorageId: string | undefined,
  logger?: FastifyBaseLogger,
) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError(
      "Invalid outgoing gate pass ID format",
      "INVALID_OUTGOING_GATE_PASS_ID",
    );
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const idObj = new Types.ObjectId(id);
    const existing = await OutgoingGatePass.findById(idObj)
      .session(session)
      .lean();

    if (!existing) {
      throw new NotFoundError(
        "Outgoing gate pass not found",
        "OUTGOING_GATE_PASS_NOT_FOUND",
      );
    }

    if (
      existing.isNull === true ||
      existing.type === GatePassType.NULL_DELIVERY
    ) {
      throw new ConflictError(
        "Outgoing gate pass is already nulled",
        "OUTGOING_GATE_PASS_ALREADY_NULLED",
      );
    }

    const existingLinkRaw = existing.farmerStorageLinkId;
    const existingLinkId =
      typeof existingLinkRaw === "object" &&
      existingLinkRaw !== null &&
      "_id" in existingLinkRaw
        ? (existingLinkRaw as { _id: Types.ObjectId })._id
        : existingLinkRaw;
    const existingLinkIdObj =
      typeof existingLinkId === "object"
        ? existingLinkId
        : new Types.ObjectId(String(existingLinkId));

    const storageLink = await FarmerStorageLink.findById(existingLinkIdObj)
      .session(session)
      .lean();

    if (!storageLink) {
      throw new NotFoundError(
        "Farmer-storage-link not found",
        "FARMER_STORAGE_LINK_NOT_FOUND",
      );
    }

    const linkColdStorageId =
      typeof storageLink.coldStorageId === "object" &&
      storageLink.coldStorageId !== null
        ? (storageLink.coldStorageId as { _id: Types.ObjectId })._id.toString()
        : (storageLink.coldStorageId as string);

    if (
      loggedInUserColdStorageId &&
      linkColdStorageId !== loggedInUserColdStorageId
    ) {
      throw new NotFoundError(
        "Outgoing gate pass not found",
        "OUTGOING_GATE_PASS_NOT_FOUND",
      );
    }

    const coldStorageId = new Types.ObjectId(linkColdStorageId);

    const incomingGatePassIds = [
      ...new Set(
        (existing.incomingGatePassSnapshots ?? []).map((snap) =>
          snap._id.toString(),
        ),
      ),
    ].map((incomingId) => new Types.ObjectId(incomingId));

    const fetched = await IncomingGatePass.find({
      _id: { $in: incomingGatePassIds },
    })
      .session(session)
      .lean();

    if (fetched.length !== incomingGatePassIds.length) {
      throw new NotFoundError(
        "One or more incoming gate passes not found for restore",
        "INCOMING_GATE_PASS_NOT_FOUND",
      );
    }

    const incomingPassMap = new Map<
      string,
      IIncomingGatePass & { _id: Types.ObjectId }
    >();
    for (const pass of fetched) {
      incomingPassMap.set(
        (pass as { _id: Types.ObjectId })._id.toString(),
        pass as IIncomingGatePass & { _id: Types.ObjectId },
      );
    }

    const previouslyIssuedMap = buildPreviouslyIssuedMap(
      existing.incomingGatePassSnapshots ?? [],
      existing.orderDetails,
    );

    const bulkOps = prepareNetDeltaBulkOperationsForUpdate(
      previouslyIssuedMap,
      new Map(),
      incomingPassMap,
    );

    if (bulkOps.length > 0) {
      const updateResult = await IncomingGatePass.bulkWrite(
        bulkOps as Parameters<typeof IncomingGatePass.bulkWrite>[0],
        { session },
      );

      if (updateResult.modifiedCount !== bulkOps.length) {
        throw new ConflictError(
          `Expected ${bulkOps.length} incoming updates, got ${updateResult.modifiedCount}. Concurrent modification detected.`,
          "CONCURRENT_MODIFICATION",
        );
      }

      await syncIncomingGatePassStatusFromQuantities(
        incomingGatePassIds,
        session,
      );

      await recordEditHistoryBulk(
        incomingGatePassIds.map((incomingId) => ({
          entityType: EditHistoryEntityType.INCOMING_GATE_PASS,
          documentId: incomingId,
          coldStorageId,
          editedById,
          action: EditHistoryAction.QUANTITY_ADJUSTMENT,
          changeSummary: `Quantities restored by nulling outgoing gate pass #${existing.gatePassNo}`,
          logger,
        })),
        session,
        logger,
      );
    }

    const nullUpdateFields: Record<string, unknown> = {
      isNull: true,
      nulledAt: new Date(),
      ...buildDwarfOutgoingPassFields(existing),
    };
    if (editedById) {
      nullUpdateFields.nulledBy = new Types.ObjectId(editedById);
    }
    if (payload.remarks !== undefined) {
      nullUpdateFields.remarks = payload.remarks;
    }

    const updated = await OutgoingGatePass.findByIdAndUpdate(
      idObj,
      { $set: nullUpdateFields },
      { session, new: true },
    ).lean();

    if (!updated) {
      throw new NotFoundError(
        "Outgoing gate pass not found",
        "OUTGOING_GATE_PASS_NOT_FOUND",
      );
    }

    await recordEditHistory({
      entityType: EditHistoryEntityType.OUTGOING_GATE_PASS,
      documentId: idObj,
      coldStorageId,
      editedById,
      action: EditHistoryAction.OTHER,
      changeSummary: `Outgoing gate pass #${existing.gatePassNo} nulled`,
      session,
      logger,
    });

    await session.commitTransaction();

    logger?.info(
      { outgoingGatePassId: id, gatePassNo: existing.gatePassNo },
      "Outgoing gate pass nulled successfully",
    );

    const populated = await OutgoingGatePass.findById(idObj)
      .populate({
        path: "farmerStorageLinkId",
        select: FARMER_STORAGE_LINK_POPULATE_SELECT,
        populate: {
          path: "farmerId",
          select: FARMER_STORAGE_LINK_FARMER_POPULATE_SELECT,
        },
      })
      .populate({ path: "createdBy", select: "name" })
      .populate({ path: "nulledBy", select: "name" })
      .lean();

    if (!populated) {
      return updated as unknown as Record<string, unknown>;
    }

    const raw = populated as unknown as Record<string, unknown>;
    const populatedLink = raw.farmerStorageLinkId as
      | PopulatedFarmerStorageLink
      | null
      | undefined;
    type PopulatedAdmin = { _id: unknown; name: string };
    const populatedAdmin = raw.createdBy as PopulatedAdmin | null | undefined;
    const populatedNulledBy = raw.nulledBy as PopulatedAdmin | null | undefined;
    const linkDisplay = formatPopulatedFarmerStorageLinkDisplay(populatedLink);

    return {
      ...raw,
      farmerStorageLinkId: linkDisplay ?? raw.farmerStorageLinkId,
      createdBy: populatedAdmin
        ? { _id: populatedAdmin._id, name: populatedAdmin.name }
        : raw.createdBy,
      nulledBy: populatedNulledBy
        ? { _id: populatedNulledBy._id, name: populatedNulledBy.name }
        : raw.nulledBy,
    };
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    handleOutgoingServiceError(error, logger, {
      fallbackMessage: "Failed to null outgoing gate pass",
      fallbackCode: "NULL_OUTGOING_GATE_PASS_ERROR",
    });
  } finally {
    session.endSession();
  }
}

/* =======================
   OUTGOING FOR TRANSFER STOCK (from farmer)
======================= */

function buildValidatedAllocationsForTransfer(
  items: Array<{
    incomingGatePassId: string;
    bagSize: string;
    quantity: number;
    location: { chamber: string; floor: string; row: string };
  }>,
  incomingPassMap: Map<string, IIncomingGatePass & { _id: Types.ObjectId }>,
): OutgoingIncomingPassWithFilteredAllocations[] {
  const byPass = new Map<string, OutgoingIncomingPassWithFilteredAllocations>();
  for (const item of items) {
    const pass = incomingPassMap.get(item.incomingGatePassId);
    if (!pass) continue;
    const variety = (pass as { variety?: string }).variety?.trim() ?? "";
    let entry = byPass.get(item.incomingGatePassId);
    if (!entry) {
      entry = {
        incomingGatePassId: item.incomingGatePassId,
        variety,
        allocations: [],
      };
      byPass.set(item.incomingGatePassId, entry);
    }
    entry.allocations.push({
      incomingGatePassId: item.incomingGatePassId,
      size: item.bagSize,
      quantityToAllocate: item.quantity,
      location: item.location,
    });
  }
  return Array.from(byPass.values());
}

/**
 * Creates an outgoing gate pass for the "from" farmer after transfer stock has
 * decremented incoming quantities. `incomingPassMap` must be the pre-decrement
 * fetch used for validation (same transaction).
 */
export async function createOutgoingGatePassForTransferStock(
  session: ClientSession,
  params: {
    fromFarmerStorageLinkId: Types.ObjectId;
    coldStorageId: Types.ObjectId;
    items: Array<{
      incomingGatePassId: string;
      bagSize: string;
      quantity: number;
      location: { chamber: string; floor: string; row: string };
    }>;
    incomingPassMap: Map<string, IIncomingGatePass & { _id: Types.ObjectId }>;
    gatePassNo: number;
    date: Date;
    truckNumber?: string;
    remarks?: string;
    createdById?: string;
  },
  logger?: FastifyBaseLogger,
): Promise<{ _id: Types.ObjectId }> {
  const validated = buildValidatedAllocationsForTransfer(
    params.items,
    params.incomingPassMap,
  );
  if (validated.length === 0) {
    throw new ValidationError(
      "Could not build outgoing gate pass allocations for transfer",
      "TRANSFER_OUTGOING_ALLOCATIONS_EMPTY",
    );
  }

  const incomingGatePassSnapshots = buildIncomingGatePassSnapshots(
    validated,
    params.incomingPassMap,
  );
  const orderDetails = buildOrderDetails(validated, params.incomingPassMap);

  const [doc] = await OutgoingGatePass.create(
    [
      {
        farmerStorageLinkId: params.fromFarmerStorageLinkId,
        createdBy: params.createdById
          ? new Types.ObjectId(params.createdById)
          : undefined,
        incomingGatePassSnapshots,
        gatePassNo: params.gatePassNo,
        date: params.date,
        type: GatePassType.OUTGOING_TRANSFER,
        truckNumber: params.truckNumber ?? "",
        orderDetails,
        remarks: params.remarks,
      },
    ],
    { session },
  );

  const uniqueIncomingIds = [
    ...new Set(validated.map((v) => v.incomingGatePassId)),
  ];
  await recordEditHistoryBulk(
    uniqueIncomingIds.map((id) => ({
      entityType: EditHistoryEntityType.INCOMING_GATE_PASS,
      documentId: new Types.ObjectId(id),
      coldStorageId: params.coldStorageId,
      editedById: params.createdById,
      action: EditHistoryAction.QUANTITY_ADJUSTMENT,
      changeSummary: `Quantities reduced by outgoing gate pass #${params.gatePassNo}`,
      logger,
    })),
    session,
    logger,
  );

  await recordEditHistory({
    entityType: EditHistoryEntityType.OUTGOING_GATE_PASS,
    documentId: doc._id,
    coldStorageId: params.coldStorageId,
    editedById: params.createdById,
    action: EditHistoryAction.CREATE,
    changeSummary: `Outgoing gate pass #${params.gatePassNo} created (transfer stock)`,
    session,
    logger,
  });

  return { _id: doc._id };
}

/** @internal Exported for unit tests only */
export const outgoingGatePassStockEditTestExports = {
  allocationMapKey,
  buildPreviouslyIssuedMap,
  buildRequestedAllocationMap,
  prepareNetDeltaBulkOperationsForUpdate,
  buildIncomingGatePassSnapshots,
};
