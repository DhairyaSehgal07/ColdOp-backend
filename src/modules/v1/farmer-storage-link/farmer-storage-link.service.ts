import type { FastifyBaseLogger } from "fastify";
import mongoose from "mongoose";
import { Farmer } from "../farmer/farmer-model.js";
import { FarmerStorageLink } from "./farmer-storage-link-model.js";
import { ColdStorage } from "../cold-storage/cold-storage.model.js";
import { StoreAdmin } from "../store-admin/store-admin.model.js";
import { Preferences } from "../preferences/preferences.model.js";
import { createDebtorLedger } from "../../../utils/accounting/helper-fns.js";
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../../utils/errors.js";
import type { LinkFarmerToStoreBody } from "./farmer-storage-link.schema.js";

export interface CheckFarmerMobileResult {
  exists: boolean;
  farmer?: {
    _id: string;
    name: string;
    address: string;
    mobileNumber: string;
    imageUrl?: string;
    createdAt: string;
    updatedAt: string;
  };
}

/**
 * Check if a farmer exists with the given mobile number.
 * @param mobileNumber - Mobile number to check
 * @param logger - Optional logger instance
 * @returns Object with exists flag and optional farmer document (without password)
 */
export async function checkFarmerByMobileNumber(
  mobileNumber: string,
  logger?: FastifyBaseLogger,
): Promise<CheckFarmerMobileResult> {
  try {
    const farmer = await Farmer.findOne({ mobileNumber })
      .select("-password")
      .lean();

    if (farmer) {
      logger?.info({ mobileNumber }, "Farmer found with mobile number");
      return {
        exists: true,
        farmer: {
          _id: farmer._id.toString(),
          name: farmer.name,
          address: farmer.address,
          mobileNumber: farmer.mobileNumber,
          imageUrl: farmer.imageUrl,
          createdAt: farmer.createdAt.toISOString(),
          updatedAt: farmer.updatedAt.toISOString(),
        },
      };
    }

    logger?.info({ mobileNumber }, "Mobile number available");
    return { exists: false };
  } catch (error) {
    logger?.error({ error, mobileNumber }, "Error checking farmer by mobile number");
    throw new AppError(
      "Failed to check mobile number",
      500,
      "CHECK_FARMER_MOBILE_ERROR",
    );
  }
}

export interface LinkFarmerToStoreParams {
  coldStorageId: string;
  linkedById: string;
  payload: LinkFarmerToStoreBody;
}

export interface LinkFarmerToStoreResult {
  farmer: {
    _id: string;
    name: string;
    address: string;
    mobileNumber: string;
    imageUrl?: string;
    createdAt: string;
    updatedAt: string;
  };
  farmerStorageLink: {
    _id: string;
    farmerId: string;
    coldStorageId: string;
    accountNumber: number;
    isActive: boolean;
    costPerBag?: number;
    createdAt: string;
    updatedAt: string;
  };
}

/**
 * Link an existing farmer to the current cold storage.
 * Creates FarmerStorageLink and optionally a debtor ledger when showFinances is enabled.
 */
export async function linkFarmerToStore(
  params: LinkFarmerToStoreParams,
  logger?: FastifyBaseLogger,
): Promise<LinkFarmerToStoreResult> {
  const { coldStorageId, linkedById, payload } = params;

  try {
    if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
      throw new ValidationError("Invalid cold storage ID", "INVALID_COLD_STORAGE_ID");
    }
    if (!mongoose.Types.ObjectId.isValid(linkedById)) {
      throw new ValidationError("Invalid linkedById (store admin) ID", "INVALID_LINKED_BY_ID");
    }
    if (!mongoose.Types.ObjectId.isValid(payload.farmerId)) {
      throw new ValidationError("Invalid farmer ID", "INVALID_FARMER_ID");
    }

    const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);
    const linkedByIdObjectId = new mongoose.Types.ObjectId(linkedById);
    const farmerObjectId = new mongoose.Types.ObjectId(payload.farmerId);

    const coldStorage = await ColdStorage.findById(coldStorageObjectId);
    if (!coldStorage) {
      logger?.warn({ coldStorageId }, "Cold storage not found");
      throw new NotFoundError("Cold storage not found", "COLD_STORAGE_NOT_FOUND");
    }

    const storeAdmin = await StoreAdmin.findById(linkedByIdObjectId);
    if (!storeAdmin) {
      logger?.warn({ linkedById }, "Store admin not found");
      throw new NotFoundError("Store admin not found", "STORE_ADMIN_NOT_FOUND");
    }

    const farmer = await Farmer.findById(farmerObjectId).select("-password");
    if (!farmer) {
      logger?.warn({ farmerId: payload.farmerId }, "Farmer not found");
      throw new NotFoundError("Farmer not found", "FARMER_NOT_FOUND");
    }

    const existingLink = await FarmerStorageLink.findOne({
      farmerId: farmerObjectId,
      coldStorageId: coldStorageObjectId,
    });
    if (existingLink) {
      logger?.warn(
        { farmerId: payload.farmerId, coldStorageId },
        "Farmer already linked to this cold storage",
      );
      throw new ConflictError(
        "Farmer is already linked to this cold storage",
        "LINK_ALREADY_EXISTS",
      );
    }

    const existingAccountLink = await FarmerStorageLink.findOne({
      coldStorageId: coldStorageObjectId,
      accountNumber: payload.accountNumber,
    });
    if (existingAccountLink) {
      logger?.warn(
        { accountNumber: payload.accountNumber, coldStorageId },
        "Account number already exists for this cold storage",
      );
      throw new ConflictError(
        "Account number already exists for this cold storage",
        "ACCOUNT_NUMBER_EXISTS",
      );
    }

    const farmerStorageLink = await FarmerStorageLink.create({
      farmerId: farmerObjectId,
      coldStorageId: coldStorageObjectId,
      linkedById: linkedByIdObjectId,
      accountNumber: payload.accountNumber,
      isActive: true,
      costPerBag: payload.costPerBag,
    });

    logger?.info(
      {
        linkId: farmerStorageLink._id,
        farmerId: payload.farmerId,
        coldStorageId,
        accountNumber: payload.accountNumber,
      },
      "Farmer-storage-link created successfully",
    );

    const preferences = coldStorage.preferencesId
      ? await Preferences.findById(coldStorage.preferencesId).lean()
      : null;
    if (preferences?.showFinances) {
      await createDebtorLedger({
        farmerStorageLinkId: farmerStorageLink._id,
        coldStorageId: coldStorage._id,
        name: farmer.name,
        openingBalance: payload.openingBalance ?? 0,
        createdBy: linkedByIdObjectId,
      });
    }

    return {
      farmer: {
        _id: farmer._id.toString(),
        name: farmer.name,
        address: farmer.address,
        mobileNumber: farmer.mobileNumber,
        imageUrl: farmer.imageUrl,
        createdAt: farmer.createdAt.toISOString(),
        updatedAt: farmer.updatedAt.toISOString(),
      },
      farmerStorageLink: {
        _id: farmerStorageLink._id.toString(),
        farmerId: farmerStorageLink.farmerId.toString(),
        coldStorageId: farmerStorageLink.coldStorageId.toString(),
        accountNumber: farmerStorageLink.accountNumber,
        isActive: farmerStorageLink.isActive,
        costPerBag: farmerStorageLink.costPerBag,
        createdAt: farmerStorageLink.createdAt.toISOString(),
        updatedAt: farmerStorageLink.updatedAt.toISOString(),
      },
    };
  } catch (error) {
    if (
      error instanceof ConflictError ||
      error instanceof ValidationError ||
      error instanceof NotFoundError
    ) {
      throw error;
    }
    if (error instanceof mongoose.Error.ValidationError) {
      const messages = Object.values(error.errors).map((e) => e.message);
      throw new ValidationError(
        messages.join(", "),
        "MONGOOSE_VALIDATION_ERROR",
      );
    }
    if (error instanceof Error && "code" in error && error.code === 11000) {
      const mongooseError = error as Error & { keyPattern?: Record<string, unknown> };
      const field = Object.keys(mongooseError.keyPattern ?? {})[0] ?? "field";
      throw new ConflictError(`${field} already exists`, "DUPLICATE_KEY_ERROR");
    }
    logger?.error({ error, params }, "Unexpected error in linkFarmerToStore");
    throw new AppError(
      "Failed to link farmer to store",
      500,
      "LINK_FARMER_TO_STORE_ERROR",
    );
  }
}
