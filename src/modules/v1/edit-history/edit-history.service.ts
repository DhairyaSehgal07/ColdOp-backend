import mongoose from "mongoose";
import type { ClientSession } from "mongoose";
import type { FastifyBaseLogger } from "fastify";
import {
  EditHistory,
  EditHistoryEntityType,
  EditHistoryAction,
} from "./edit-history.model.js";

export interface RecordEditHistoryParams {
  entityType: EditHistoryEntityType;
  documentId: mongoose.Types.ObjectId;
  coldStorageId: mongoose.Types.ObjectId;
  editedById: string | { _id: string } | undefined;
  action: EditHistoryAction;
  changeSummary?: string;
  snapshotBefore?: Record<string, unknown>;
  snapshotAfter?: Record<string, unknown>;
  session?: ClientSession;
  logger?: FastifyBaseLogger;
}

function toObjectIdString(id: string | { _id: string } | undefined): string | undefined {
  if (id == null) return undefined;
  const raw = typeof id === "string" ? id.trim() : id._id?.trim();
  return raw || undefined;
}

/** Record one edit history entry (who edited, when). Call when a gate pass is created/updated. */
export async function recordEditHistory(params: RecordEditHistoryParams): Promise<void> {
  const { entityType, documentId, coldStorageId, editedById, action, changeSummary, snapshotBefore, snapshotAfter, session, logger } = params;

  const editedByStr = toObjectIdString(editedById);
  if (!editedByStr || !mongoose.Types.ObjectId.isValid(editedByStr)) {
    logger?.debug({ entityType, documentId: documentId.toString(), action }, "Skipping edit history: no valid editedBy user id");
    return;
  }

  try {
    await EditHistory.create(
      [
        {
          entityType,
          documentId,
          coldStorageId,
          editedBy: new mongoose.Types.ObjectId(editedByStr),
          editedAt: new Date(),
          action,
          ...(changeSummary && { changeSummary }),
          ...(snapshotBefore && { snapshotBefore }),
          ...(snapshotAfter && { snapshotAfter }),
        },
      ],
      session ? { session } : {},
    );
  } catch (err) {
    logger?.warn({ err, entityType, documentId: documentId.toString(), action }, "Failed to record edit history (non-fatal)");
  }
}

/** Record edit history for multiple documents (e.g. multiple gate passes updated at once). */
export async function recordEditHistoryBulk(
  entries: Omit<RecordEditHistoryParams, "session">[],
  session?: ClientSession,
  logger?: FastifyBaseLogger,
): Promise<void> {
  const valid = entries.filter((e) => {
    const id = toObjectIdString(e.editedById);
    return id && mongoose.Types.ObjectId.isValid(id);
  });

  if (valid.length === 0) return;

  const docs = valid.map((e) => {
    const id = toObjectIdString(e.editedById)!;
    return {
      entityType: e.entityType,
      documentId: e.documentId,
      coldStorageId: e.coldStorageId,
      editedBy: new mongoose.Types.ObjectId(id),
      editedAt: new Date(),
      action: e.action,
      ...(e.changeSummary && { changeSummary: e.changeSummary }),
      ...(e.snapshotBefore && { snapshotBefore: e.snapshotBefore }),
      ...(e.snapshotAfter && { snapshotAfter: e.snapshotAfter }),
    };
  });

  try {
    await EditHistory.insertMany(docs, session ? { session } : {});
  } catch (err) {
    logger?.warn({ err, count: docs.length }, "Failed to record edit history bulk (non-fatal)");
  }
}

export { EditHistoryEntityType, EditHistoryAction } from "./edit-history.model.js";
