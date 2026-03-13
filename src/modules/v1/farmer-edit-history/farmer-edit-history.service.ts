import mongoose from "mongoose";
import type { FastifyBaseLogger } from "fastify";
import { FarmerEditHistory } from "./farmer-edit-history.model.js";
import type {
  FarmerSnapshot,
  FarmerStorageLinkSnapshot,
} from "./farmer-edit-history.model.js";

export interface RecordFarmerEditHistoryParams {
  farmerId: mongoose.Types.ObjectId;
  farmerStorageLinkId: mongoose.Types.ObjectId;
  coldStorageId: mongoose.Types.ObjectId;
  editedById: string | { _id: string } | undefined;
  snapshotBefore: {
    farmer: FarmerSnapshot;
    farmerStorageLink: FarmerStorageLinkSnapshot;
  };
  snapshotAfter: {
    farmer: FarmerSnapshot;
    farmerStorageLink: FarmerStorageLinkSnapshot;
  };
  changeSummary?: string;
  logger?: FastifyBaseLogger;
}

function toObjectIdString(
  id: string | { _id: string } | undefined,
): string | undefined {
  if (id == null) return undefined;
  const raw = typeof id === "string" ? id.trim() : id._id?.trim();
  return raw || undefined;
}

/**
 * Record one farmer edit history entry (who edited, when, full before/after).
 * Call after updating a farmer-storage-link and associated farmer.
 * Non-fatal: logs and returns on failure.
 */
export async function recordFarmerEditHistory(
  params: RecordFarmerEditHistoryParams,
): Promise<void> {
  const {
    farmerId,
    farmerStorageLinkId,
    coldStorageId,
    editedById,
    snapshotBefore,
    snapshotAfter,
    changeSummary,
    logger,
  } = params;

  const editedByStr = toObjectIdString(editedById);
  if (!editedByStr || !mongoose.Types.ObjectId.isValid(editedByStr)) {
    logger?.debug(
      {
        farmerId: farmerId.toString(),
        farmerStorageLinkId: farmerStorageLinkId.toString(),
      },
      "Skipping farmer edit history: no valid editedBy user id",
    );
    return;
  }

  try {
    await FarmerEditHistory.create({
      farmerId,
      farmerStorageLinkId,
      coldStorageId,
      editedBy: new mongoose.Types.ObjectId(editedByStr),
      editedAt: new Date(),
      snapshotBefore,
      snapshotAfter,
      ...(changeSummary && { changeSummary }),
    });
  } catch (err) {
    logger?.warn(
      {
        err,
        farmerId: farmerId.toString(),
        farmerStorageLinkId: farmerStorageLinkId.toString(),
      },
      "Failed to record farmer edit history (non-fatal)",
    );
  }
}
