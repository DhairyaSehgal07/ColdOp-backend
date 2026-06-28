import mongoose from "mongoose";
import type { ClientSession } from "mongoose";
import type { FastifyBaseLogger } from "fastify";
import {
  OutgoingGatePassAudit,
  type OutgoingGatePassAuditState,
} from "./outgoing-gate-pass-audit.model.js";
import { OutgoingGatePass } from "./outgoing-gate-pass.model.js";
import { FarmerStorageLink } from "../farmer-storage-link/farmer-storage-link-model.js";
import { NotFoundError, ValidationError } from "../../../utils/errors.js";
import { StoreAdmin } from "../store-admin/store-admin.model.js";

export interface RecordOutgoingGatePassAuditParams {
  outgoingGatePassId: mongoose.Types.ObjectId;
  editedById: string | { _id: string } | undefined;
  previousState: OutgoingGatePassAuditState;
  modifiedState: OutgoingGatePassAuditState;
  ipAddress?: string;
  userAgent?: string;
  session?: ClientSession;
  logger?: FastifyBaseLogger;
}

export interface BuildOutgoingGatePassAuditStatesParams {
  existing: Record<string, unknown>;
  updated: Record<string, unknown>;
  changedGatePassFields: string[];
}

function toObjectIdString(
  id: string | { _id: string } | undefined,
): string | undefined {
  if (id == null) return undefined;
  const raw = typeof id === "string" ? id.trim() : id._id?.trim();
  return raw || undefined;
}

function cloneSnapshotArray(value: unknown): unknown {
  if (!Array.isArray(value)) return value;

  return value.map((item) => {
    const row = { ...(item as Record<string, unknown>) };
    if (row._id instanceof mongoose.Types.ObjectId) {
      row._id = row._id.toString();
    } else if (
      row._id != null &&
      typeof row._id === "object" &&
      "toString" in row._id
    ) {
      row._id = (row._id as { toString(): string }).toString();
    }
    if (Array.isArray(row.bagSizes)) {
      row.bagSizes = row.bagSizes.map((b: unknown) => {
        const bag = { ...(b as Record<string, unknown>) };
        if (bag.location && typeof bag.location === "object") {
          bag.location = { ...(bag.location as Record<string, unknown>) };
        }
        return bag;
      });
    }
    return row;
  });
}

function serializeAuditField(key: string, value: unknown): unknown {
  if (value === undefined || value === null) return value;

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "_id" in value &&
    typeof (value as { _id: unknown })._id === "object"
  ) {
    return (value as { _id: { toString(): string } })._id.toString();
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return value.toString();
  }

  if (key === "orderDetails" && Array.isArray(value)) {
    return value.map((item) => {
      const row = { ...(item as Record<string, unknown>) };
      if (row.location && typeof row.location === "object") {
        row.location = { ...(row.location as Record<string, unknown>) };
      }
      return row;
    });
  }

  if (key === "incomingGatePassSnapshots") {
    return cloneSnapshotArray(value);
  }

  return value;
}

/** Build delta audit states containing only fields that changed. */
export function buildOutgoingGatePassAuditStates({
  existing,
  updated,
  changedGatePassFields,
}: BuildOutgoingGatePassAuditStatesParams): {
  previousState: OutgoingGatePassAuditState;
  modifiedState: OutgoingGatePassAuditState;
} {
  const previousState: OutgoingGatePassAuditState = {};
  const modifiedState: OutgoingGatePassAuditState = {};

  for (const key of changedGatePassFields) {
    previousState[key] = serializeAuditField(key, existing[key]);
    modifiedState[key] = serializeAuditField(key, updated[key]);
  }

  return { previousState, modifiedState };
}

/** Record one outgoing gate pass audit entry (changed fields only). Non-fatal on failure. */
export async function recordOutgoingGatePassAudit(
  params: RecordOutgoingGatePassAuditParams,
): Promise<void> {
  const {
    outgoingGatePassId,
    editedById,
    previousState,
    modifiedState,
    ipAddress,
    userAgent,
    session,
    logger,
  } = params;

  const editedByStr = toObjectIdString(editedById);
  if (!editedByStr || !mongoose.Types.ObjectId.isValid(editedByStr)) {
    logger?.debug(
      { outgoingGatePassId: outgoingGatePassId.toString() },
      "Skipping outgoing gate pass audit: no valid editedBy user id",
    );
    return;
  }

  if (
    Object.keys(previousState).length === 0 &&
    Object.keys(modifiedState).length === 0
  ) {
    return;
  }

  try {
    await OutgoingGatePassAudit.create(
      [
        {
          outgoingGatePassId,
          editedById: new mongoose.Types.ObjectId(editedByStr),
          previousState,
          modifiedState,
          ...(ipAddress && { ipAddress }),
          ...(userAgent && { userAgent }),
        },
      ],
      session ? { session } : {},
    );
  } catch (err) {
    logger?.warn(
      { err, outgoingGatePassId: outgoingGatePassId.toString() },
      "Failed to record outgoing gate pass audit (non-fatal)",
    );
  }
}

type OutgoingGatePassAuditItem = {
  _id: mongoose.Types.ObjectId;
  outgoingGatePassId: mongoose.Types.ObjectId;
  editedById?: mongoose.Types.ObjectId;
  previousState: OutgoingGatePassAuditState;
  modifiedState: OutgoingGatePassAuditState;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
};

export type OutgoingGatePassAuditResponseItem = {
  _id: string;
  outgoingGatePassId: string;
  editedBy?: { _id: string; name: string };
  previousState: OutgoingGatePassAuditState;
  modifiedState: OutgoingGatePassAuditState;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
};

export type OutgoingGatePassAuditPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type GetOutgoingGatePassAuditsResult = {
  data: OutgoingGatePassAuditResponseItem[];
  pagination: OutgoingGatePassAuditPagination;
};

function createAuditPaginationMeta(
  total: number,
  page: number,
  limit: number,
): OutgoingGatePassAuditPagination {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

function toIdStr(id: unknown): string {
  if (id != null && typeof id === "object" && "toString" in id) {
    return (id as mongoose.Types.ObjectId).toString();
  }
  return String(id ?? "");
}

async function withEditorNames(
  items: OutgoingGatePassAuditItem[],
): Promise<OutgoingGatePassAuditResponseItem[]> {
  const editorIds = [
    ...new Set(
      items.map((r) => toIdStr(r.editedById)).filter(Boolean),
    ),
  ];
  const nameMap = new Map<string, { _id: string; name: string }>();

  if (editorIds.length > 0) {
    const admins = await StoreAdmin.find({
      _id: { $in: editorIds.map((id) => new mongoose.Types.ObjectId(id)) },
    })
      .select("_id name")
      .lean();
    for (const a of admins) {
      const row = a as { _id: mongoose.Types.ObjectId; name: string };
      const id = row._id.toString();
      nameMap.set(id, { _id: id, name: row.name });
    }
  }

  return items.map((item) => {
    const editedByIdStr = item.editedById ? toIdStr(item.editedById) : undefined;
    return {
      _id: toIdStr(item._id),
      outgoingGatePassId: toIdStr(item.outgoingGatePassId),
      ...(editedByIdStr && {
        editedBy: nameMap.get(editedByIdStr) ?? {
          _id: editedByIdStr,
          name: "Unknown",
        },
      }),
      previousState: item.previousState,
      modifiedState: item.modifiedState,
      ipAddress: item.ipAddress,
      userAgent: item.userAgent,
      createdAt: item.createdAt,
    };
  });
}

async function assertOutgoingGatePassInColdStorage(
  outgoingGatePassId: string,
  coldStorageId: string,
): Promise<void> {
  const pass = await OutgoingGatePass.findById(outgoingGatePassId)
    .select("farmerStorageLinkId")
    .lean();

  if (!pass) {
    throw new NotFoundError(
      "Outgoing gate pass not found",
      "OUTGOING_GATE_PASS_NOT_FOUND",
    );
  }

  const linkId =
    typeof pass.farmerStorageLinkId === "object" &&
    pass.farmerStorageLinkId !== null
      ? pass.farmerStorageLinkId
      : new mongoose.Types.ObjectId(pass.farmerStorageLinkId);

  const storageLink = await FarmerStorageLink.findById(linkId)
    .select("coldStorageId")
    .lean();

  if (!storageLink) {
    throw new NotFoundError(
      "Outgoing gate pass not found",
      "OUTGOING_GATE_PASS_NOT_FOUND",
    );
  }

  const linkColdStorageId =
    typeof storageLink.coldStorageId === "object" &&
    storageLink.coldStorageId !== null
      ? (
          storageLink.coldStorageId as { _id: mongoose.Types.ObjectId }
        )._id.toString()
      : (storageLink.coldStorageId as string);

  if (linkColdStorageId !== coldStorageId) {
    throw new NotFoundError(
      "Outgoing gate pass not found",
      "OUTGOING_GATE_PASS_NOT_FOUND",
    );
  }
}

/**
 * List outgoing gate pass audit entries for the user's cold storage.
 * Optionally filter to a single outgoing gate pass.
 */
export async function getOutgoingGatePassAudits(
  loggedInUserColdStorageId: string | undefined,
  options: {
    outgoingGatePassId?: string;
    page?: number;
    limit?: number;
  } = {},
  logger?: FastifyBaseLogger,
): Promise<GetOutgoingGatePassAuditsResult> {
  const { outgoingGatePassId } = options;
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 100);
  const page = Math.max(options.page ?? 1, 1);
  const skip = (page - 1) * limit;

  if (
    !loggedInUserColdStorageId ||
    !mongoose.Types.ObjectId.isValid(loggedInUserColdStorageId)
  ) {
    throw new ValidationError(
      "Cold storage not found for this user",
      "COLD_STORAGE_NOT_FOUND",
    );
  }

  const coldStorageObjId = new mongoose.Types.ObjectId(
    loggedInUserColdStorageId,
  );

  let passIds: mongoose.Types.ObjectId[];

  if (outgoingGatePassId) {
    if (!mongoose.Types.ObjectId.isValid(outgoingGatePassId)) {
      throw new ValidationError(
        "Invalid outgoing gate pass ID format",
        "INVALID_OUTGOING_GATE_PASS_ID",
      );
    }
    await assertOutgoingGatePassInColdStorage(
      outgoingGatePassId,
      loggedInUserColdStorageId,
    );
    passIds = [new mongoose.Types.ObjectId(outgoingGatePassId)];
  } else {
    const links = await FarmerStorageLink.find({
      coldStorageId: coldStorageObjId,
    })
      .select("_id")
      .lean();

    if (links.length === 0) {
      return {
        data: [],
        pagination: createAuditPaginationMeta(0, page, limit),
      };
    }

    const linkIds = links.map(
      (l) => l._id as mongoose.Types.ObjectId,
    );

    const passes = await OutgoingGatePass.find({
      farmerStorageLinkId: { $in: linkIds },
    })
      .select("_id")
      .lean();

    if (passes.length === 0) {
      return {
        data: [],
        pagination: createAuditPaginationMeta(0, page, limit),
      };
    }

    passIds = passes.map((p) => p._id as mongoose.Types.ObjectId);
  }

  const filter = { outgoingGatePassId: { $in: passIds } };

  const [raw, total] = await Promise.all([
    OutgoingGatePassAudit.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    OutgoingGatePassAudit.countDocuments(filter),
  ]);

  logger?.debug(
    { count: raw.length, total, page, limit, outgoingGatePassId },
    "Outgoing gate pass audit entries retrieved",
  );

  return {
    data: await withEditorNames(raw as unknown as OutgoingGatePassAuditItem[]),
    pagination: createAuditPaginationMeta(total, page, limit),
  };
}
