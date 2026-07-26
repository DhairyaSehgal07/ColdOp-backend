import mongoose from "mongoose";
import type { ClientSession } from "mongoose";
import type { FastifyBaseLogger } from "fastify";
import {
  IncomingGatePassAudit,
  type IncomingGatePassAuditState,
} from "./incoming-gate-pass-audit.model.js";
import { IncomingGatePass } from "./incoming-gate-pass.model.js";
import { FarmerStorageLink } from "../farmer-storage-link/farmer-storage-link-model.js";
import { NotFoundError, ValidationError } from "../../../utils/errors.js";
import { StoreAdmin } from "../store-admin/store-admin.model.js";

export interface RecordIncomingGatePassAuditParams {
  incomingGatePassId: mongoose.Types.ObjectId;
  editedById: string | { _id: string } | undefined;
  previousState: IncomingGatePassAuditState;
  modifiedState: IncomingGatePassAuditState;
  ipAddress?: string;
  userAgent?: string;
  session?: ClientSession;
  logger?: FastifyBaseLogger;
}

export interface BuildIncomingGatePassAuditStatesParams {
  existing: Record<string, unknown>;
  updated: Record<string, unknown>;
  changedGatePassFields: string[];
  rentAmountBefore?: number;
  rentAmountAfter?: number;
}

function toObjectIdString(
  id: string | { _id: string } | undefined,
): string | undefined {
  if (id == null) return undefined;
  const raw = typeof id === "string" ? id.trim() : id._id?.trim();
  return raw || undefined;
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

  if (key === "bagSizes" && Array.isArray(value)) {
    return value.map((b: unknown) => {
      const item = { ...(b as Record<string, unknown>) };
      if (item.location && typeof item.location === "object") {
        item.location = { ...(item.location as Record<string, unknown>) };
      }
      if (Array.isArray(item.previousLocation)) {
        item.previousLocation = item.previousLocation.map((loc) =>
          loc && typeof loc === "object"
            ? { ...(loc as Record<string, unknown>) }
            : loc,
        );
      }
      return item;
    });
  }

  return value;
}

/** Build delta audit states containing only fields that changed. */
export function buildIncomingGatePassAuditStates({
  existing,
  updated,
  changedGatePassFields,
  rentAmountBefore,
  rentAmountAfter,
}: BuildIncomingGatePassAuditStatesParams): {
  previousState: IncomingGatePassAuditState;
  modifiedState: IncomingGatePassAuditState;
} {
  const previousState: IncomingGatePassAuditState = {};
  const modifiedState: IncomingGatePassAuditState = {};

  for (const key of changedGatePassFields) {
    previousState[key] = serializeAuditField(key, existing[key]);
    modifiedState[key] = serializeAuditField(key, updated[key]);
  }

  if (rentAmountBefore !== undefined && rentAmountAfter !== undefined) {
    previousState.amount = rentAmountBefore;
    modifiedState.amount = rentAmountAfter;
  }

  return { previousState, modifiedState };
}

/** Record one incoming gate pass audit entry (changed fields only). Non-fatal on failure. */
export async function recordIncomingGatePassAudit(
  params: RecordIncomingGatePassAuditParams,
): Promise<void> {
  const {
    incomingGatePassId,
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
      { incomingGatePassId: incomingGatePassId.toString() },
      "Skipping incoming gate pass audit: no valid editedBy user id",
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
    await IncomingGatePassAudit.create(
      [
        {
          incomingGatePassId,
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
      { err, incomingGatePassId: incomingGatePassId.toString() },
      "Failed to record incoming gate pass audit (non-fatal)",
    );
  }
}

type IncomingGatePassAuditItem = {
  _id: mongoose.Types.ObjectId;
  incomingGatePassId: mongoose.Types.ObjectId;
  editedById?: mongoose.Types.ObjectId;
  previousState: IncomingGatePassAuditState;
  modifiedState: IncomingGatePassAuditState;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
};

export type IncomingGatePassAuditResponseItem = {
  _id: string;
  incomingGatePassId: string;
  editedBy?: { _id: string; name: string };
  previousState: IncomingGatePassAuditState;
  modifiedState: IncomingGatePassAuditState;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
};

export type IncomingGatePassAuditPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type GetIncomingGatePassAuditsResult = {
  data: IncomingGatePassAuditResponseItem[];
  pagination: IncomingGatePassAuditPagination;
};

function createAuditPaginationMeta(
  total: number,
  page: number,
  limit: number,
): IncomingGatePassAuditPagination {
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
  items: IncomingGatePassAuditItem[],
): Promise<IncomingGatePassAuditResponseItem[]> {
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
      incomingGatePassId: toIdStr(item.incomingGatePassId),
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

async function assertIncomingGatePassInColdStorage(
  incomingGatePassId: string,
  coldStorageId: string,
): Promise<void> {
  const pass = await IncomingGatePass.findById(incomingGatePassId)
    .select("farmerStorageLinkId")
    .lean();

  if (!pass) {
    throw new NotFoundError(
      "Incoming gate pass not found",
      "INCOMING_GATE_PASS_NOT_FOUND",
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
      "Incoming gate pass not found",
      "INCOMING_GATE_PASS_NOT_FOUND",
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
      "Incoming gate pass not found",
      "INCOMING_GATE_PASS_NOT_FOUND",
    );
  }
}

/**
 * List incoming gate pass audit entries for the user's cold storage.
 * Optionally filter to a single incoming gate pass.
 */
export async function getIncomingGatePassAudits(
  loggedInUserColdStorageId: string | undefined,
  options: {
    incomingGatePassId?: string;
    page?: number;
    limit?: number;
  } = {},
  logger?: FastifyBaseLogger,
): Promise<GetIncomingGatePassAuditsResult> {
  const { incomingGatePassId } = options;
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

  if (incomingGatePassId) {
    if (!mongoose.Types.ObjectId.isValid(incomingGatePassId)) {
      throw new ValidationError(
        "Invalid incoming gate pass ID format",
        "INVALID_INCOMING_GATE_PASS_ID",
      );
    }
    await assertIncomingGatePassInColdStorage(
      incomingGatePassId,
      loggedInUserColdStorageId,
    );
    passIds = [new mongoose.Types.ObjectId(incomingGatePassId)];
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

    const passes = await IncomingGatePass.find({
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

  const filter = { incomingGatePassId: { $in: passIds } };

  const [raw, total] = await Promise.all([
    IncomingGatePassAudit.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    IncomingGatePassAudit.countDocuments(filter),
  ]);

  logger?.debug(
    { count: raw.length, total, page, limit, incomingGatePassId },
    "Incoming gate pass audit entries retrieved",
  );

  return {
    data: await withEditorNames(raw as unknown as IncomingGatePassAuditItem[]),
    pagination: createAuditPaginationMeta(total, page, limit),
  };
}

