import mongoose from "mongoose";
import type { FastifyBaseLogger } from "fastify";
import { ColdStorage } from "../cold-storage/cold-storage.model.js";
import { CommodityObj, Preferences, StockFilterObj } from "./preferences.model.js";
import {
  NotFoundError,
  ValidationError,
  AppError,
} from "../../../utils/errors.js";

export interface UpdatePreferencesInput {
  commodities?: CommodityObj[];
  reportFormat?: string;
  showFinances?: boolean;
  showViewFilters?: boolean;
  labourCost?: number;
  stockFilter?: StockFilterObj;
  customMarka?: boolean;
  markaType?: string;
  customFields?: Record<string, unknown>;
}

const DEFAULT_MARKA_TYPE = "GatePass";

function normalizePreferencesResponse<T extends { markaType?: string }>(
  preferences: T,
): T {
  return {
    ...preferences,
    markaType:
      typeof preferences.markaType === "string" && preferences.markaType.trim()
        ? preferences.markaType
        : DEFAULT_MARKA_TYPE,
  };
}

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

    return normalizePreferencesResponse(preferences);
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

/**
 * Update preferences for a cold storage by its ID.
 * @param coldStorageId - Cold storage ID (from JWT / authenticated store-admin)
 * @param payload - Partial preferences fields to update
 * @param logger - Optional logger instance
 * @returns Updated preferences document
 */
export async function updatePreferencesByColdStorageId(
  coldStorageId: string,
  payload: UpdatePreferencesInput,
  logger?: FastifyBaseLogger,
) {
  try {
    if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
      throw new ValidationError(
        "The cold storage ID format is invalid",
        "INVALID_ID",
      );
    }

    const updatableKeys: (keyof UpdatePreferencesInput)[] = [
      "commodities",
      "reportFormat",
      "showFinances",
      "showViewFilters",
      "labourCost",
      "stockFilter",
      "customMarka",
      "markaType",
      "customFields",
    ];
    const hasUpdates = updatableKeys.some((key) => payload[key] !== undefined);
    if (!hasUpdates) {
      throw new ValidationError(
        "At least one preference field must be provided",
        "EMPTY_UPDATE",
      );
    }

    if (
      payload.labourCost !== undefined &&
      (typeof payload.labourCost !== "number" || payload.labourCost < 0)
    ) {
      throw new ValidationError(
        "Labour cost must be a non-negative number",
        "INVALID_LABOUR_COST",
      );
    }

    if (
      payload.markaType !== undefined &&
      (typeof payload.markaType !== "string" || !payload.markaType.trim())
    ) {
      throw new ValidationError(
        "Marka type must be a non-empty string",
        "INVALID_MARKA_TYPE",
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

    const update: Record<string, unknown> = {};
    for (const key of updatableKeys) {
      if (payload[key] !== undefined) {
        update[key] =
          key === "markaType"
            ? (payload.markaType as string).trim()
            : payload[key];
      }
    }

    const preferences = await Preferences.findByIdAndUpdate(
      coldStorage.preferencesId,
      { $set: update },
      { new: true, runValidators: true },
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

    logger?.info({ coldStorageId }, "Updated preferences for cold storage");

    return normalizePreferencesResponse(preferences);
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof ValidationError ||
      error instanceof mongoose.Error.ValidationError
    ) {
      if (error instanceof mongoose.Error.ValidationError) {
        throw new ValidationError(
          error.message,
          "VALIDATION_ERROR",
        );
      }
      throw error;
    }
    logger?.error(
      { error, coldStorageId },
      "Error updating preferences by cold storage ID",
    );
    throw new AppError(
      "We couldn't update preferences. Please try again later.",
      500,
      "UPDATE_PREFERENCES_ERROR",
    );
  }
}
