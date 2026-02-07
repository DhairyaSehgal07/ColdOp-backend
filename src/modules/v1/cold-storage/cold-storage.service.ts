import { ColdStorage } from "./cold-storage.model.js";
import { Preferences } from "../preferences/preferences.model.js";
import {
  CreateColdStorageInput,
  GetColdStoragesQuery,
} from "./cold-storage.schema.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  AppError,
} from "../../../utils/errors.js";
import mongoose from "mongoose";
import type { FastifyBaseLogger } from "fastify";

/**
 * Creates a new cold storage
 * @param payload - Cold storage data
 * @param logger - Optional logger instance
 * @returns Created cold storage document
 * @throws ConflictError if mobile number already exists
 * @throws ValidationError if input validation fails
 */
export async function createColdStorage(
  payload: CreateColdStorageInput,
  logger?: FastifyBaseLogger,
) {
  try {
    // Check for existing cold storage with same mobile number
    const existing = await ColdStorage.findOne({
      mobileNumber: payload.mobileNumber,
    });

    if (existing) {
      logger?.warn(
        { mobileNumber: payload.mobileNumber },
        "Attempt to create cold storage with existing mobile number",
      );
      throw new ConflictError(
        "A cold storage with this mobile number already exists",
        "MOBILE_NUMBER_EXISTS",
      );
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const [preferences] = await Preferences.create(
        [
          {
            commodities: [
              {
                name: "POTATO",
                varieties: ["K. Pukhraj", "K. Jyoti"],
                sizes: ["Ration", "Seed", "Goli", "Number-12", "Cut-tok"],
              },
            ],
            reportFormat: "default",
            showFinances: true,
            customFields: {},
          },
        ],
        { session },
      );

      const [coldStorage] = await ColdStorage.create(
        [{ ...payload, preferencesId: preferences._id }],
        { session },
      );

      await session.commitTransaction();

      logger?.info(
        { coldStorageId: coldStorage._id, name: coldStorage.name },
        "Cold storage and preferences created successfully",
      );

      const populated = await ColdStorage.findById(coldStorage._id)
        .populate("preferencesId")
        .lean();
      return populated ?? coldStorage;
    } catch (txError) {
      await session.abortTransaction();
      throw txError;
    } finally {
      await session.endSession();
    }
  } catch (error) {
    // Re-throw known errors
    if (error instanceof ConflictError || error instanceof ValidationError) {
      throw error;
    }

    // Handle mongoose validation errors
    if (error instanceof mongoose.Error.ValidationError) {
      const messages = Object.values(error.errors).map((err) => err.message);
      const summary =
        messages.length === 1
          ? messages[0]
          : `Validation failed: ${messages.join(". ")}`;
      throw new ValidationError(summary, "VALIDATION_ERROR");
    }

    // Handle mongoose duplicate key errors (e.g. unique mobileNumber)
    if (error instanceof Error && "code" in error && error.code === 11000) {
      const keyPattern = (error as mongoose.mongo.MongoServerError).keyPattern;
      const field = keyPattern ? Object.keys(keyPattern)[0] : "field";
      const message =
        field === "mobileNumber"
          ? "A cold storage with this mobile number already exists"
          : `A cold storage with this ${field} already exists`;
      throw new ConflictError(message, "DUPLICATE_KEY_ERROR");
    }

    // Log unexpected errors
    logger?.error({ error, payload }, "Unexpected error creating cold storage");

    throw new AppError(
      "We couldn't create the cold storage. Please try again later.",
      500,
      "CREATE_COLD_STORAGE_ERROR",
    );
  }
}

/**
 * Retrieves a paginated list of cold storages
 * @param query - Query parameters for pagination and filtering
 * @param logger - Optional logger instance
 * @returns Object containing cold storages and pagination metadata
 */
export async function getColdStorages(
  query: GetColdStoragesQuery,
  logger?: FastifyBaseLogger,
) {
  try {
    const { page, limit, sortBy, sortOrder, isActive, plan, search } = query;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter: Record<string, unknown> = {};

    if (isActive !== undefined) {
      filter.isActive = isActive;
    }

    if (plan) {
      filter.plan = plan;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { address: { $regex: search, $options: "i" } },
        { mobileNumber: { $regex: search, $options: "i" } },
      ];
    }

    // Build sort object
    const sort: Record<string, 1 | -1> = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    // Execute queries in parallel
    const [coldStorages, total] = await Promise.all([
      ColdStorage.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      ColdStorage.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    logger?.info(
      { page, limit, total, totalPages },
      "Retrieved cold storages list",
    );

    return {
      data: coldStorages,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  } catch (error) {
    logger?.error({ error, query }, "Error retrieving cold storages");

    throw new AppError(
      "We couldn't load the cold storages list. Please try again later.",
      500,
      "GET_COLD_STORAGES_ERROR",
    );
  }
}

/**
 * Retrieves a cold storage by ID
 * @param id - Cold storage ID
 * @param logger - Optional logger instance
 * @returns Cold storage document or null if not found
 * @throws ValidationError if ID format is invalid
 */
export async function getColdStorageById(
  id: string,
  logger?: FastifyBaseLogger,
) {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ValidationError(
        "The cold storage ID format is invalid",
        "INVALID_ID",
      );
    }

    const coldStorage = await ColdStorage.findById(id)
      .populate("preferencesId")
      .lean();

    if (!coldStorage) {
      logger?.warn({ coldStorageId: id }, "Cold storage not found");
      throw new NotFoundError(
        "No cold storage found with the given ID",
        "COLD_STORAGE_NOT_FOUND",
      );
    }

    logger?.info({ coldStorageId: id }, "Retrieved cold storage by ID");

    return coldStorage;
  } catch (error) {
    // Re-throw known errors
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error;
    }

    logger?.error({ error, id }, "Error retrieving cold storage by ID");

    throw new AppError(
      "We couldn't load this cold storage. Please try again later.",
      500,
      "GET_COLD_STORAGE_BY_ID_ERROR",
    );
  }
}
