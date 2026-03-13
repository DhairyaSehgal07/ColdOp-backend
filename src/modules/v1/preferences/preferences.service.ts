import mongoose from "mongoose";
import type { FastifyBaseLogger } from "fastify";
import { ColdStorage } from "../cold-storage/cold-storage.model.js";
import { Preferences } from "./preferences.model.js";
import {
  NotFoundError,
  ValidationError,
  AppError,
} from "../../../utils/errors.js";

/**
 * Get preferences for a cold storage by its ID.
 * @param coldStorageId - Cold storage ID (from JWT / authenticated store-admin)
 * @param logger - Optional logger instance
 * @returns Preferences document for that cold storage
 * @throws NotFoundError if cold storage or preferences not found
 * @throws ValidationError if cold storage ID format is invalid
 */
export async function getPreferencesByColdStorageId(
  coldStorageId: string,
  logger?: FastifyBaseLogger,
) {
  try {
    if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
      throw new ValidationError(
        "The cold storage ID format is invalid",
        "INVALID_ID",
      );
    }

    const coldStorage = await ColdStorage.findById(coldStorageId)
      .select("preferencesId")
      .lean();

    if (!coldStorage) {
      logger?.warn({ coldStorageId }, "Cold storage not found");
      throw new NotFoundError(
        "No cold storage found with the given ID",
        "COLD_STORAGE_NOT_FOUND",
      );
    }

    if (!coldStorage.preferencesId) {
      logger?.warn({ coldStorageId }, "Cold storage has no preferences");
      throw new NotFoundError(
        "No preferences found for this cold storage",
        "PREFERENCES_NOT_FOUND",
      );
    }

    const preferences = await Preferences.findById(
      coldStorage.preferencesId,
    ).lean();

    if (!preferences) {
      logger?.warn(
        { coldStorageId, preferencesId: coldStorage.preferencesId },
        "Preferences document not found",
      );
      throw new NotFoundError(
        "No preferences found for this cold storage",
        "PREFERENCES_NOT_FOUND",
      );
    }

    logger?.info({ coldStorageId }, "Retrieved preferences for cold storage");

    return preferences;
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error;
    }
    logger?.error(
      { error, coldStorageId },
      "Error retrieving preferences by cold storage ID",
    );
    throw new AppError(
      "We couldn't load preferences. Please try again later.",
      500,
      "GET_PREFERENCES_ERROR",
    );
  }
}
