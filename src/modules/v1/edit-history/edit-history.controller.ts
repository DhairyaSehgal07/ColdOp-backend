import type { FastifyRequest, FastifyReply } from "fastify";
import mongoose from "mongoose";
import { EditHistory, EditHistoryEntityType } from "./edit-history.model.js";
import { ValidationError } from "../../../utils/errors.js";
import type { AuthenticatedRequest } from "../../../utils/auth.js";
import { StoreAdmin } from "../store-admin/store-admin.model.js";

const VALID_ENTITY_TYPES = Object.values(EditHistoryEntityType);

interface GetByDocumentParams {
  entityType: "incoming_gate_pass" | "outgoing_gate_pass";
  documentId: string;
}

type EditHistoryItem = {
  _id: mongoose.Types.ObjectId;
  entityType: string;
  documentId: mongoose.Types.ObjectId;
  coldStorageId?: mongoose.Types.ObjectId;
  editedBy: mongoose.Types.ObjectId;
  editedAt: Date;
  action: string;
  changeSummary?: string;
  snapshotBefore?: Record<string, unknown>;
  snapshotAfter?: Record<string, unknown>;
  [key: string]: unknown;
};

type EditHistoryResponseItem = {
  _id: string;
  entityType: string;
  documentId: string;
  coldStorageId?: string;
  editedBy: { _id: string; name: string };
  editedAt: Date;
  action: string;
  changeSummary?: string;
  snapshotBefore?: Record<string, unknown>;
  snapshotAfter?: Record<string, unknown>;
};

function getColdStorageId(request: FastifyRequest): string | undefined {
  const user = (request as AuthenticatedRequest).user;
  const raw = user?.coldStorageId;
  if (!raw) return undefined;
  return typeof raw === "object" && raw !== null && "_id" in raw ? raw._id : (raw as string);
}

function toIdStr(id: unknown): string {
  if (id != null && typeof id === "object" && "toString" in id) return (id as mongoose.Types.ObjectId).toString();
  return String(id ?? "");
}

async function withEditorNames(items: EditHistoryItem[]): Promise<EditHistoryResponseItem[]> {
  const editorIds = [...new Set(items.map((r) => toIdStr(r.editedBy)).filter(Boolean))];
  const nameMap = new Map<string, { _id: string; name: string }>();

  if (editorIds.length > 0) {
    const admins = await StoreAdmin.find({ _id: { $in: editorIds.map((id) => new mongoose.Types.ObjectId(id)) } })
      .select("_id name")
      .lean();
    for (const a of admins) {
      const row = a as { _id: mongoose.Types.ObjectId; name: string };
      const id = row._id.toString();
      nameMap.set(id, { _id: id, name: row.name });
    }
  }

  return items.map((item) => ({
    _id: toIdStr(item._id),
    entityType: item.entityType,
    documentId: toIdStr(item.documentId),
    coldStorageId: item.coldStorageId != null ? toIdStr(item.coldStorageId) : undefined,
    editedBy: nameMap.get(toIdStr(item.editedBy)) ?? { _id: toIdStr(item.editedBy), name: "Unknown" },
    editedAt: item.editedAt,
    action: item.action,
    changeSummary: item.changeSummary,
    snapshotBefore: item.snapshotBefore,
    snapshotAfter: item.snapshotAfter,
  }));
}

/** GET /edit-history/storage — all edit history for the current user's cold storage */
export async function getEditHistoryByStorageHandler(request: FastifyRequest, reply: FastifyReply) {
  const coldStorageId = getColdStorageId(request);
  if (!coldStorageId || !mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError("Cold storage not found for this user", "COLD_STORAGE_NOT_FOUND");
  }

  const raw = await EditHistory.find({ coldStorageId: new mongoose.Types.ObjectId(coldStorageId) })
    .sort({ editedAt: -1 })
    .lean();

  const data = await withEditorNames(raw as unknown as EditHistoryItem[]);
  return reply.send({ success: true, data, message: "Edit history for storage retrieved" });
}

/** GET /edit-history/:entityType/:documentId — edit history for one gate pass */
export async function getEditHistoryByDocumentHandler(
  request: FastifyRequest<{ Params: GetByDocumentParams }>,
  reply: FastifyReply,
) {
  const { entityType, documentId } = request.params;

  if (!VALID_ENTITY_TYPES.includes(entityType as (typeof VALID_ENTITY_TYPES)[number])) {
    throw new ValidationError("entityType must be incoming_gate_pass or outgoing_gate_pass", "INVALID_ENTITY_TYPE");
  }
  if (!mongoose.Types.ObjectId.isValid(documentId)) {
    throw new ValidationError("Invalid documentId", "INVALID_DOCUMENT_ID");
  }

  const raw = await EditHistory.find({
    entityType,
    documentId: new mongoose.Types.ObjectId(documentId),
  })
    .sort({ editedAt: -1 })
    .lean();

  const data = await withEditorNames(raw as unknown as EditHistoryItem[]);
  return reply.send({ success: true, data, message: "Edit history retrieved" });
}
