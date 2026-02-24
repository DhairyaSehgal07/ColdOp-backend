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
import { FarmerStorageLink } from "../farmer-storage-link/farmer-storage-link-model.js";
import { Farmer } from "../farmer/farmer-model.js";
import { IncomingGatePass } from "../incoming-gate-pass/incoming-gate-pass.model.js";
import { OutgoingGatePass } from "../outgoing-gate-pass/outgoing-gate-pass.model.js";
import Ledger from "../ledger/ledger.model.js";
import Voucher from "../voucher/voucher.model.js";
import { EditHistory } from "../edit-history/edit-history.model.js";
import { FarmerEditHistory } from "../farmer-edit-history/farmer-edit-history.model.js";

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
                varieties: [
                  "Atlantic",
                  "Cardinal",
                  "Chipsona 1",
                  "Chipsona 2",
                  "Chipsona 3",
                  "Colomba",
                  "Desiree",
                  "Diamond",
                  "FC - 11",
                  "FC - 12",
                  "FC - 5",
                  "Himalini",
                  "Fry Sona",
                  "K. Badshah",
                  "K. Chandramukhi",
                  "K. Jyoti",
                  "K. Pukhraj",
                  "Kuroda",
                  "Khyati",
                  "L.R",
                  "Lima",
                  "Mohan",
                  "Pushkar",
                  "SU - Khyati",
                  "Super Six",
                ],

                sizes: ["Ration", "Seed", "Goli", "Number-12", "Cut-tok"],
              },
            ],
            reportFormat: "default",
            showFinances: true,
            labourCost: 0,
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

export interface DeleteColdStorageDataResult {
  farmersLinkedElsewhere: Array<{
    _id: mongoose.Types.ObjectId;
    name: string;
    address: string;
    mobileNumber: string;
    imageUrl?: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
}

/**
 * Deletes all data associated with a cold storage: farmer documents (only when
 * the farmer is not linked to any other storage), incoming/outgoing gate passes,
 * ledgers, vouchers, edit histories, farmer edit histories, and farmer-storage links.
 * Returns farmer documents that were not deleted because they are linked to another storage.
 *
 * @param id - Cold storage ID
 * @param logger - Optional logger instance
 * @returns Object with farmersLinkedElsewhere (farmers that could not be deleted)
 * @throws ValidationError if ID format is invalid
 * @throws NotFoundError if cold storage does not exist
 */
export async function deleteColdStorageData(
  id: string,
  logger?: FastifyBaseLogger,
): Promise<DeleteColdStorageDataResult> {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError(
      "The cold storage ID format is invalid",
      "INVALID_ID",
    );
  }

  const coldStorageId = new mongoose.Types.ObjectId(id);
  const coldStorage = await ColdStorage.findById(coldStorageId);
  if (!coldStorage) {
    logger?.warn({ coldStorageId: id }, "Cold storage not found for data delete");
    throw new NotFoundError(
      "No cold storage found with the given ID",
      "COLD_STORAGE_NOT_FOUND",
    );
  }

  const links = await FarmerStorageLink.find({ coldStorageId }).lean();
  const linkIds = links.map((l) => l._id);
  const farmerIdsFromThisStorage = [...new Set(links.map((l) => l.farmerId.toString()))].map(
    (fid) => new mongoose.Types.ObjectId(fid),
  );

  // Farmers that have at least one link to a different cold storage
  const farmerIdsLinkedElsewhere = await FarmerStorageLink.distinct("farmerId", {
    farmerId: { $in: farmerIdsFromThisStorage },
    coldStorageId: { $ne: coldStorageId },
  });

  const farmersLinkedElsewhere =
    farmerIdsLinkedElsewhere.length > 0
      ? await Farmer.find({ _id: { $in: farmerIdsLinkedElsewhere } })
          .select("-password")
          .lean()
      : [];

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Delete in dependency order: gate passes → vouchers → ledgers → edit histories → links → farmers

    await IncomingGatePass.deleteMany(
      { farmerStorageLinkId: { $in: linkIds } },
      { session },
    );
    await OutgoingGatePass.deleteMany(
      { farmerStorageLinkId: { $in: linkIds } },
      { session },
    );
    await Voucher.deleteMany({ coldStorageId }, { session });
    await Ledger.deleteMany({ coldStorageId }, { session });
    await EditHistory.deleteMany({ coldStorageId }, { session });
    await FarmerEditHistory.deleteMany({ coldStorageId }, { session });
    await FarmerStorageLink.deleteMany({ coldStorageId }, { session });

    const farmerIdsToDelete = farmerIdsFromThisStorage.filter(
      (fid) =>
        !farmerIdsLinkedElsewhere.some((oid) => oid.toString() === fid.toString()),
    );
    if (farmerIdsToDelete.length > 0) {
      await Farmer.deleteMany({ _id: { $in: farmerIdsToDelete } }, { session });
    }

    await session.commitTransaction();
    logger?.info(
      {
        coldStorageId: id,
        farmersLinkedElsewhereCount: farmersLinkedElsewhere.length,
        farmersDeletedCount: farmerIdsToDelete.length,
      },
      "Cold storage data deleted successfully",
    );

    return {
      farmersLinkedElsewhere: farmersLinkedElsewhere as DeleteColdStorageDataResult["farmersLinkedElsewhere"],
    };
  } catch (txError) {
    await session.abortTransaction();
    logger?.error({ err: txError, coldStorageId: id }, "Error in deleteColdStorageData transaction");
    throw txError;
  } finally {
    await session.endSession();
  }
}
