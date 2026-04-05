import { StoreAdmin, Role } from "./store-admin.model.js";
import {
  CreateStoreAdminInput,
  LoginStoreAdminInput,
  QuickRegisterFarmerInput,
  UpdateFarmerStorageLinkInput,
  type DaybookGatePassType,
  type DaybookListType,
} from "./store-admin.schema.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  AppError,
  UnauthorizedError,
} from "../../../utils/errors.js";
import mongoose from "mongoose";
import type { FastifyBaseLogger } from "fastify";
import { RolePermission } from "../role-permission/role-permission.model.js";
import type { ResourcePermission } from "../role-permission/role-permission.model.js";
import bcrypt from "bcryptjs";
import { Farmer } from "../farmer/farmer-model.js";
import { FarmerStorageLink } from "../farmer-storage-link/farmer-storage-link-model.js";
import { Preferences } from "../preferences/preferences.model.js";
import { createDebtorLedger } from "../../../utils/accounting/helper-fns.js";
import Ledger from "../ledger/ledger.model.js";
import { updateLedger } from "../ledger/ledger.service.js";
import { IncomingGatePass } from "../incoming-gate-pass/incoming-gate-pass.model.js";
import { OutgoingGatePass } from "../outgoing-gate-pass/outgoing-gate-pass.model.js";
import { recordFarmerEditHistory } from "../farmer-edit-history/farmer-edit-history.service.js";

/**
 * Get all available resources and actions for Admin permissions
 * This represents all possible permissions in the system
 */
function getAllAdminPermissions(): ResourcePermission[] {
  // Define all resources and their possible actions
  const resources = [
    "incomingOrder",
    "outgoingOrder",
    "coldStorage",
    "storeAdmin",
    "farmerStorageLink",
    "preferences",
    "rolePermission",
  ];

  const actions = ["create", "read", "update", "delete", "approve", "manage"];

  return resources.map((resource) => ({
    resource,
    actions: [...actions],
  }));
}

/**
 * Creates a new store admin and sets up permissions if role is Admin
 * @param payload - Store admin data
 * @param logger - Optional logger instance
 * @returns Created store admin document
 * @throws ConflictError if mobile number already exists for the cold storage
 * @throws ValidationError if input validation fails
 */
export async function createStoreAdmin(
  payload: CreateStoreAdminInput,
  logger?: FastifyBaseLogger,
) {
  try {
    // Validate cold storage exists
    const ColdStorage = mongoose.model("ColdStorage");
    const coldStorage = await ColdStorage.findById(payload.coldStorageId);

    if (!coldStorage) {
      logger?.warn(
        { coldStorageId: payload.coldStorageId },
        "Attempt to create store admin for non-existent cold storage",
      );
      throw new NotFoundError(
        "Cold storage not found",
        "COLD_STORAGE_NOT_FOUND",
      );
    }

    // Check for existing store admin with same mobile number in the same cold storage
    const existing = await StoreAdmin.findOne({
      coldStorageId: payload.coldStorageId,
      mobileNumber: payload.mobileNumber,
    });

    if (existing) {
      logger?.warn(
        {
          coldStorageId: payload.coldStorageId,
          mobileNumber: payload.mobileNumber,
        },
        "Attempt to create store admin with existing mobile number",
      );
      throw new ConflictError(
        "Store admin with this mobile number already exists for this cold storage",
        "MOBILE_NUMBER_EXISTS",
      );
    }

    // Create the store admin
    const storeAdmin = await StoreAdmin.create({
      ...payload,
    });

    logger?.info(
      {
        storeAdminId: storeAdmin._id,
        name: storeAdmin.name,
        role: storeAdmin.role,
        coldStorageId: storeAdmin.coldStorageId,
      },
      "Store admin created successfully",
    );

    // If role is Admin, create/update RolePermission with all permissions
    if (storeAdmin.role === Role.Admin) {
      const allPermissions = getAllAdminPermissions();

      // Upsert role permission for Admin role
      await RolePermission.findOneAndUpdate(
        {
          coldStorageId: storeAdmin.coldStorageId,
          role: Role.Admin,
        },
        {
          $set: {
            permissions: allPermissions,
            createdById: storeAdmin._id,
            isActive: true,
          },
        },
        {
          upsert: true,
          new: true,
        },
      );

      logger?.info(
        {
          storeAdminId: storeAdmin._id,
          coldStorageId: storeAdmin.coldStorageId,
        },
        "Admin permissions set with all permissions",
      );
    }

    return storeAdmin;
  } catch (error) {
    // Re-throw known errors
    if (
      error instanceof ConflictError ||
      error instanceof ValidationError ||
      error instanceof NotFoundError
    ) {
      throw error;
    }

    // Handle mongoose validation errors
    if (error instanceof mongoose.Error.ValidationError) {
      const messages = Object.values(error.errors).map((err) => err.message);
      throw new ValidationError(
        messages.join(", "),
        "MONGOOSE_VALIDATION_ERROR",
      );
    }

    // Handle mongoose duplicate key errors
    if (error instanceof Error && "code" in error && error.code === 11000) {
      const mongooseError = error as Error & {
        keyPattern?: Record<string, unknown>;
      };
      const field = Object.keys(mongooseError.keyPattern || {})[0] || "field";
      throw new ConflictError(`${field} already exists`, "DUPLICATE_KEY_ERROR");
    }

    // Log unexpected errors
    logger?.error({ error, payload }, "Unexpected error creating store admin");

    throw new AppError(
      "Failed to create store admin",
      500,
      "CREATE_STORE_ADMIN_ERROR",
    );
  }
}

/**
 * Retrieves a store admin by ID
 * @param id - Store admin ID
 * @param logger - Optional logger instance
 * @returns Store admin document or null if not found
 * @throws ValidationError if ID format is invalid
 */
export async function getStoreAdminById(
  id: string,
  logger?: FastifyBaseLogger,
) {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ValidationError("Invalid store admin ID format", "INVALID_ID");
    }

    const storeAdmin = await StoreAdmin.findById(id)
      .select("-password") // Exclude password from results
      .lean();

    if (!storeAdmin) {
      logger?.warn({ storeAdminId: id }, "Store admin not found");
      throw new NotFoundError("Store admin not found", "STORE_ADMIN_NOT_FOUND");
    }

    logger?.info({ storeAdminId: id }, "Retrieved store admin by ID");

    return storeAdmin;
  } catch (error) {
    // Re-throw known errors
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error;
    }

    logger?.error({ error, id }, "Error retrieving store admin by ID");

    throw new AppError(
      "Failed to retrieve store admin",
      500,
      "GET_STORE_ADMIN_BY_ID_ERROR",
    );
  }
}

/**
 * Updates a store admin
 * @param id - Store admin ID
 * @param payload - Update data
 * @param logger - Optional logger instance
 * @returns Updated store admin document
 * @throws NotFoundError if store admin not found
 * @throws ValidationError if input validation fails
 */
export async function updateStoreAdmin(
  id: string,
  payload: Partial<CreateStoreAdminInput>,
  logger?: FastifyBaseLogger,
) {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ValidationError("Invalid store admin ID format", "INVALID_ID");
    }

    // Check if store admin exists
    const existing = await StoreAdmin.findById(id);

    if (!existing) {
      logger?.warn({ storeAdminId: id }, "Store admin not found for update");
      throw new NotFoundError("Store admin not found", "STORE_ADMIN_NOT_FOUND");
    }

    // If mobile number is being updated, check for conflicts
    if (
      payload.mobileNumber &&
      payload.mobileNumber !== existing.mobileNumber
    ) {
      const conflict = await StoreAdmin.findOne({
        coldStorageId: existing.coldStorageId,
        mobileNumber: payload.mobileNumber,
        _id: { $ne: id },
      });

      if (conflict) {
        logger?.warn(
          {
            storeAdminId: id,
            mobileNumber: payload.mobileNumber,
          },
          "Attempt to update to existing mobile number",
        );
        throw new ConflictError(
          "Store admin with this mobile number already exists for this cold storage",
          "MOBILE_NUMBER_EXISTS",
        );
      }
    }

    // If role is being changed to Admin, set up permissions
    if (payload.role === Role.Admin && existing.role !== Role.Admin) {
      const allPermissions = getAllAdminPermissions();

      await RolePermission.findOneAndUpdate(
        {
          coldStorageId: existing.coldStorageId,
          role: Role.Admin,
        },
        {
          $set: {
            permissions: allPermissions,
            createdById: existing._id,
            isActive: true,
          },
        },
        {
          upsert: true,
          new: true,
        },
      );

      logger?.info(
        {
          storeAdminId: id,
          coldStorageId: existing.coldStorageId,
        },
        "Admin permissions set after role update",
      );
    }

    // Update the store admin
    const updatedStoreAdmin = await StoreAdmin.findByIdAndUpdate(
      id,
      { ...payload },
      { new: true, runValidators: true },
    )
      .select("-password")
      .lean();

    logger?.info({ storeAdminId: id }, "Store admin updated successfully");

    return updatedStoreAdmin;
  } catch (error) {
    // Re-throw known errors
    if (
      error instanceof NotFoundError ||
      error instanceof ValidationError ||
      error instanceof ConflictError
    ) {
      throw error;
    }

    // Handle mongoose validation errors
    if (error instanceof mongoose.Error.ValidationError) {
      const messages = Object.values(error.errors).map((err) => err.message);
      throw new ValidationError(
        messages.join(", "),
        "MONGOOSE_VALIDATION_ERROR",
      );
    }

    // Handle mongoose duplicate key errors
    if (error instanceof Error && "code" in error && error.code === 11000) {
      const mongooseError = error as Error & {
        keyPattern?: Record<string, unknown>;
      };
      const field = Object.keys(mongooseError.keyPattern || {})[0] || "field";
      throw new ConflictError(`${field} already exists`, "DUPLICATE_KEY_ERROR");
    }

    logger?.error({ error, id, payload }, "Error updating store admin");

    throw new AppError(
      "Failed to update store admin",
      500,
      "UPDATE_STORE_ADMIN_ERROR",
    );
  }
}

/**
 * Deletes a store admin
 * @param id - Store admin ID
 * @param logger - Optional logger instance
 * @returns Deleted store admin document
 * @throws NotFoundError if store admin not found
 * @throws ValidationError if ID format is invalid
 */
export async function deleteStoreAdmin(id: string, logger?: FastifyBaseLogger) {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ValidationError("Invalid store admin ID format", "INVALID_ID");
    }

    const storeAdmin = await StoreAdmin.findByIdAndDelete(id).lean();

    if (!storeAdmin) {
      logger?.warn({ storeAdminId: id }, "Store admin not found for deletion");
      throw new NotFoundError("Store admin not found", "STORE_ADMIN_NOT_FOUND");
    }

    logger?.info({ storeAdminId: id }, "Store admin deleted successfully");

    return storeAdmin;
  } catch (error) {
    // Re-throw known errors
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error;
    }

    logger?.error({ error, id }, "Error deleting store admin");

    throw new AppError(
      "Failed to delete store admin",
      500,
      "DELETE_STORE_ADMIN_ERROR",
    );
  }
}

/**
 * Checks if a mobile number is already used for any cold storage
 * @param mobileNumber - Mobile number to check
 * @param logger - Optional logger instance
 * @throws ConflictError if mobile number is already in use
 */
export async function checkMobileNumber(
  mobileNumber: string,
  logger?: FastifyBaseLogger,
) {
  try {
    // Check if mobile number exists in any store admin
    const existing = await StoreAdmin.findOne({ mobileNumber }).lean();

    if (existing) {
      logger?.warn(
        { mobileNumber },
        "Mobile number already exists for a cold storage",
      );
      throw new ConflictError(
        "Mobile number is already in use for a cold storage",
        "MOBILE_NUMBER_EXISTS",
      );
    }

    logger?.info({ mobileNumber }, "Mobile number is available");
    return { available: true };
  } catch (error) {
    // Re-throw known errors
    if (error instanceof ConflictError) {
      throw error;
    }

    logger?.error({ error, mobileNumber }, "Error checking mobile number");

    throw new AppError(
      "Failed to check mobile number",
      500,
      "CHECK_MOBILE_NUMBER_ERROR",
    );
  }
}

/**
 * Retrieves all farmer-storage-links for a cold storage with farmer details populated (name, address, mobileNumber)
 * @param coldStorageId - Cold storage ID
 * @param logger - Optional logger instance
 * @returns Array of farmer-storage-links with populated farmerId
 */
export async function getFarmerStorageLinksByColdStorage(
  coldStorageId: string,
  logger?: FastifyBaseLogger,
) {
  try {
    if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
      throw new ValidationError(
        "Invalid cold storage ID format",
        "INVALID_COLD_STORAGE_ID",
      );
    }

    const links = await FarmerStorageLink.find({
      coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
    })
      .populate("farmerId", "name address mobileNumber")
      .lean();

    logger?.info(
      { coldStorageId, count: links.length },
      "Retrieved farmer-storage-links by cold storage",
    );

    return links;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    logger?.error(
      { error, coldStorageId },
      "Error retrieving farmer-storage-links by cold storage",
    );

    throw new AppError(
      "Failed to retrieve farmer-storage-links",
      500,
      "GET_FARMER_STORAGE_LINKS_ERROR",
    );
  }
}

/**
 * Authenticates a store admin and returns JWT token with populated cold storage
 * @param payload - Login credentials (mobileNumber and password)
 * @param logger - Optional logger instance
 * @returns Object containing store admin data, cold storage, and token
 * @throws UnauthorizedError if credentials are invalid
 * @throws NotFoundError if store admin not found
 */
export async function loginStoreAdmin(
  payload: LoginStoreAdminInput,
  logger?: FastifyBaseLogger,
) {
  try {
    // Find store admin by mobile number and include password; populate coldStorage and its preferences
    const storeAdmin = await StoreAdmin.findOne({
      mobileNumber: payload.mobileNumber,
    })
      .select("+password")
      .populate({
        path: "coldStorageId",
        populate: { path: "preferencesId" },
      })
      .lean();

    if (!storeAdmin) {
      logger?.warn(
        { mobileNumber: payload.mobileNumber },
        "Store admin not found for login",
      );
      throw new UnauthorizedError(
        "Invalid mobile number or password",
        "INVALID_CREDENTIALS",
      );
    }

    // Check if account is locked
    if (storeAdmin.lockedUntil && storeAdmin.lockedUntil > new Date()) {
      logger?.warn(
        { storeAdminId: storeAdmin._id },
        "Attempted login to locked account",
      );
      throw new UnauthorizedError(
        "Account is locked. Please try again later.",
        "ACCOUNT_LOCKED",
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      payload.password,
      storeAdmin.password,
    );

    if (!isPasswordValid) {
      // Increment failed login attempts
      const updatedAdmin = await StoreAdmin.findByIdAndUpdate(
        storeAdmin._id,
        {
          $inc: { failedLoginAttempts: 1 },
        },
        { new: true },
      );

      const failedAttempts = updatedAdmin?.failedLoginAttempts || 0;
      const MAX_FAILED_ATTEMPTS = 5;
      const LOCKOUT_DURATION_MINUTES = 30;

      // Lock account after MAX_FAILED_ATTEMPTS failed attempts
      if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
        const lockoutUntil = new Date();
        lockoutUntil.setMinutes(
          lockoutUntil.getMinutes() + LOCKOUT_DURATION_MINUTES,
        );

        await StoreAdmin.findByIdAndUpdate(storeAdmin._id, {
          $set: { lockedUntil: lockoutUntil },
        });

        logger?.warn(
          { storeAdminId: storeAdmin._id, failedAttempts },
          "Account locked due to too many failed login attempts",
        );
        throw new UnauthorizedError(
          `Account has been locked due to ${MAX_FAILED_ATTEMPTS} failed login attempts. Please try again after ${LOCKOUT_DURATION_MINUTES} minutes.`,
          "ACCOUNT_LOCKED",
        );
      }

      logger?.warn(
        { storeAdminId: storeAdmin._id, failedAttempts },
        "Invalid password attempt",
      );
      throw new UnauthorizedError(
        "Invalid mobile number or password",
        "INVALID_CREDENTIALS",
      );
    }

    // Reset failed login attempts on successful login
    await StoreAdmin.findByIdAndUpdate(storeAdmin._id, {
      $set: { failedLoginAttempts: 0, lockedUntil: null },
    });

    // Remove password from response
    const { password: _password, ...storeAdminWithoutPassword } = storeAdmin;

    logger?.info(
      { storeAdminId: storeAdmin._id },
      "Store admin logged in successfully",
    );

    return {
      storeAdmin: storeAdminWithoutPassword,
    };
  } catch (error) {
    // Re-throw known errors
    if (error instanceof UnauthorizedError || error instanceof NotFoundError) {
      throw error;
    }

    logger?.error(
      { error, mobileNumber: payload.mobileNumber },
      "Error during login",
    );

    throw new AppError("Failed to login", 500, "LOGIN_ERROR");
  }
}

/**
 * Logs out a store admin (placeholder for future session management)
 * @param logger - Optional logger instance
 * @returns Success message
 */
export async function logoutStoreAdmin(logger?: FastifyBaseLogger) {
  try {
    logger?.info("Store admin logged out");
    return { message: "Logged out successfully" };
  } catch (error) {
    logger?.error({ error }, "Error during logout");
    throw new AppError("Failed to logout", 500, "LOGOUT_ERROR");
  }
}

/**
 * Quick register a farmer and create farmer-storage-link
 * @param payload - Farmer registration data
 * @param logger - Optional logger instance
 * @returns Object containing created farmer and farmer-storage-link
 * @throws NotFoundError if cold storage or store admin not found
 * @throws ConflictError if farmer with mobile number already exists or link already exists
 * @throws ValidationError if input validation fails
 */
export async function quickRegisterFarmer(
  payload: QuickRegisterFarmerInput,
  logger?: FastifyBaseLogger,
) {
  try {
    // Validate cold storage exists
    const ColdStorage = mongoose.model("ColdStorage");
    const coldStorage = await ColdStorage.findById(payload.coldStorageId);

    if (!coldStorage) {
      logger?.warn(
        { coldStorageId: payload.coldStorageId },
        "Attempt to register farmer for non-existent cold storage",
      );
      throw new NotFoundError(
        "Cold storage not found",
        "COLD_STORAGE_NOT_FOUND",
      );
    }

    // Validate store admin exists
    const storeAdmin = await StoreAdmin.findById(payload.linkedById);

    if (!storeAdmin) {
      logger?.warn(
        { linkedById: payload.linkedById },
        "Attempt to register farmer with non-existent store admin",
      );
      throw new NotFoundError("Store admin not found", "STORE_ADMIN_NOT_FOUND");
    }

    // Check if farmer with mobile number already exists
    const existingFarmer = await Farmer.findOne({
      mobileNumber: payload.mobileNumber,
    });

    if (existingFarmer) {
      // Check if farmer-storage-link already exists for this farmer and cold storage
      const existingLink = await FarmerStorageLink.findOne({
        farmerId: existingFarmer._id,
        coldStorageId: payload.coldStorageId,
      });

      if (existingLink) {
        logger?.warn(
          {
            farmerId: existingFarmer._id,
            coldStorageId: payload.coldStorageId,
          },
          "Attempt to create duplicate farmer-storage-link",
        );
        throw new ConflictError(
          "Farmer is already linked to this cold storage",
          "LINK_ALREADY_EXISTS",
        );
      }

      logger?.warn(
        { mobileNumber: payload.mobileNumber },
        "Attempt to register farmer with existing mobile number",
      );
      throw new ConflictError(
        "Farmer with this mobile number already exists",
        "MOBILE_NUMBER_EXISTS",
      );
    }

    // Determine account number - use provided or auto-generate
    let accountNumber: number;

    if (payload.accountNumber !== undefined) {
      // Check if the provided account number already exists for this cold storage
      const existingAccountLink = await FarmerStorageLink.findOne({
        coldStorageId: payload.coldStorageId,
        accountNumber: payload.accountNumber,
      });

      if (existingAccountLink) {
        logger?.warn(
          {
            accountNumber: payload.accountNumber,
            coldStorageId: payload.coldStorageId,
          },
          "Attempt to use existing account number",
        );
        throw new ConflictError(
          "Account number already exists for this cold storage",
          "ACCOUNT_NUMBER_EXISTS",
        );
      }

      accountNumber = payload.accountNumber;
    } else {
      // Generate account number (find max account number for this cold storage and increment)
      const maxAccountLink = await FarmerStorageLink.findOne({
        coldStorageId: payload.coldStorageId,
      })
        .sort({ accountNumber: -1 })
        .select("accountNumber")
        .lean();

      accountNumber = maxAccountLink ? maxAccountLink.accountNumber + 1 : 1;
    }

    // Create farmer with default password "123456"
    const farmer = await Farmer.create({
      name: payload.name,
      address: payload.address,
      mobileNumber: payload.mobileNumber,
      imageUrl: payload.imageUrl || "",
      password: "123456", // Default password, will be hashed by pre-save hook
    });

    logger?.info(
      {
        farmerId: farmer._id,
        name: farmer.name,
        mobileNumber: farmer.mobileNumber,
      },
      "Farmer created successfully",
    );

    // Create farmer-storage-link (include costPerBag if received in payload)
    const farmerStorageLink = await FarmerStorageLink.create({
      farmerId: farmer._id,
      coldStorageId: payload.coldStorageId,
      linkedById: payload.linkedById,
      accountNumber,
      isActive: true,
      ...(payload.costPerBag !== undefined && {
        costPerBag: payload.costPerBag,
      }),
    });

    logger?.info(
      {
        linkId: farmerStorageLink._id,
        farmerId: farmer._id,
        coldStorageId: payload.coldStorageId,
        accountNumber,
      },
      "Farmer-storage-link created successfully",
    );

    // Create debtor ledger for farmer when cold storage has showFinances enabled
    const preferences = coldStorage.preferencesId
      ? await Preferences.findById(coldStorage.preferencesId).lean()
      : null;
    if (preferences?.showFinances) {
      await createDebtorLedger({
        farmerStorageLinkId: farmerStorageLink._id,
        coldStorageId: coldStorage._id,
        name: farmer.name,
        openingBalance: payload.openingBalance ?? 0,
        createdBy: new mongoose.Types.ObjectId(payload.linkedById),
      });
    }

    // Return farmer without password and the link
    const { password: _, ...farmerWithoutPassword } = farmer.toObject();

    return {
      farmer: farmerWithoutPassword,
      farmerStorageLink: farmerStorageLink.toObject(),
    };
  } catch (error) {
    // Re-throw known errors
    if (
      error instanceof ConflictError ||
      error instanceof ValidationError ||
      error instanceof NotFoundError
    ) {
      throw error;
    }

    // Handle mongoose validation errors
    if (error instanceof mongoose.Error.ValidationError) {
      const messages = Object.values(error.errors).map((err) => err.message);
      throw new ValidationError(
        messages.join(", "),
        "MONGOOSE_VALIDATION_ERROR",
      );
    }

    // Handle mongoose duplicate key errors
    if (error instanceof Error && "code" in error && error.code === 11000) {
      const mongooseError = error as Error & {
        keyPattern?: Record<string, unknown>;
      };
      const field = Object.keys(mongooseError.keyPattern || {})[0] || "field";
      throw new ConflictError(`${field} already exists`, "DUPLICATE_KEY_ERROR");
    }

    // Log unexpected errors
    logger?.error(
      { error, payload },
      "Unexpected error in quick register farmer",
    );

    throw new AppError(
      "Failed to quick register farmer",
      500,
      "QUICK_REGISTER_FARMER_ERROR",
    );
  }
}

/**
 * Updates a farmer-storage-link and associated farmer
 * @param id - Farmer-storage-link ID
 * @param payload - Update data
 * @param logger - Optional logger instance
 * @returns Object containing updated farmer and farmer-storage-link
 * @throws NotFoundError if farmer-storage-link not found
 * @throws ConflictError if accountNumber or mobileNumber already exists
 * @throws ValidationError if input validation fails
 */
export async function updateFarmerStorageLink(
  id: string,
  payload: UpdateFarmerStorageLinkInput,
  logger?: FastifyBaseLogger,
  editedByStoreAdminId?: string,
) {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ValidationError(
        "Invalid farmer-storage-link ID format",
        "INVALID_ID",
      );
    }

    // Find the farmer-storage-link
    const farmerStorageLink =
      await FarmerStorageLink.findById(id).populate("farmerId");

    if (!farmerStorageLink) {
      logger?.warn(
        { farmerStorageLinkId: id },
        "Farmer-storage-link not found for update",
      );
      throw new NotFoundError(
        "Farmer-storage-link not found",
        "FARMER_STORAGE_LINK_NOT_FOUND",
      );
    }

    const farmerId = farmerStorageLink.farmerId as mongoose.Types.ObjectId;
    const coldStorageId = farmerStorageLink.coldStorageId;

    // Capture before state for farmer edit history (full snapshots, password excluded)
    const farmerBefore = await Farmer.findById(farmerId).lean();
    if (farmerBefore) {
      delete (farmerBefore as { password?: string }).password;
    }
    const linkBefore = await FarmerStorageLink.findById(id).lean();
    const snapshotBefore = {
      farmer: (farmerBefore ?? {}) as Record<string, unknown>,
      farmerStorageLink: (linkBefore ?? {}) as Record<string, unknown>,
    };

    // If accountNumber is being updated, check for uniqueness within the cold storage
    if (payload.accountNumber !== undefined) {
      const existingAccountLink = await FarmerStorageLink.findOne({
        coldStorageId: coldStorageId,
        accountNumber: payload.accountNumber,
        _id: { $ne: id }, // Exclude the current link
      });

      if (existingAccountLink) {
        logger?.warn(
          {
            accountNumber: payload.accountNumber,
            coldStorageId: coldStorageId,
            farmerStorageLinkId: id,
          },
          "Attempt to update to existing account number",
        );
        throw new ConflictError(
          "Account number already exists for this cold storage",
          "ACCOUNT_NUMBER_EXISTS",
        );
      }
    }

    // If mobileNumber is being updated, check for conflicts
    if (payload.mobileNumber !== undefined) {
      const existingFarmer = await Farmer.findOne({
        mobileNumber: payload.mobileNumber,
        _id: { $ne: farmerId }, // Exclude the current farmer
      });

      if (existingFarmer) {
        logger?.warn(
          {
            mobileNumber: payload.mobileNumber,
            farmerId: farmerId,
          },
          "Attempt to update to existing mobile number",
        );
        throw new ConflictError(
          "Farmer with this mobile number already exists",
          "MOBILE_NUMBER_EXISTS",
        );
      }
    }

    // If linkedById is being updated, validate store admin exists
    if (payload.linkedById !== undefined) {
      const storeAdmin = await StoreAdmin.findById(payload.linkedById);

      if (!storeAdmin) {
        logger?.warn(
          { linkedById: payload.linkedById },
          "Attempt to link to non-existent store admin",
        );
        throw new NotFoundError(
          "Store admin not found",
          "STORE_ADMIN_NOT_FOUND",
        );
      }
    }

    // Prepare farmer update data
    const farmerUpdateData: Partial<{
      name: string;
      address: string;
      mobileNumber: string;
      imageUrl: string;
    }> = {};

    if (payload.name !== undefined) {
      farmerUpdateData.name = payload.name;
    }
    if (payload.address !== undefined) {
      farmerUpdateData.address = payload.address;
    }
    if (payload.mobileNumber !== undefined) {
      farmerUpdateData.mobileNumber = payload.mobileNumber;
    }
    if (payload.imageUrl !== undefined) {
      farmerUpdateData.imageUrl = payload.imageUrl;
    }

    // Prepare farmer-storage-link update data
    const linkUpdateData: Partial<{
      accountNumber: number;
      isActive: boolean;
      notes: string;
      linkedById: mongoose.Types.ObjectId;
      costPerBag: number;
    }> = {};

    if (payload.accountNumber !== undefined) {
      linkUpdateData.accountNumber = payload.accountNumber;
    }
    if (payload.isActive !== undefined) {
      linkUpdateData.isActive = payload.isActive;
    }
    if (payload.notes !== undefined) {
      linkUpdateData.notes = payload.notes;
    }
    if (payload.linkedById !== undefined) {
      linkUpdateData.linkedById = new mongoose.Types.ObjectId(
        payload.linkedById,
      );
    }
    if (payload.costPerBag !== undefined) {
      linkUpdateData.costPerBag = payload.costPerBag;
    }

    // Update farmer if there are farmer fields to update
    let updatedFarmer = null;
    if (Object.keys(farmerUpdateData).length > 0) {
      updatedFarmer = await Farmer.findByIdAndUpdate(
        farmerId,
        farmerUpdateData,
        { new: true, runValidators: true },
      ).lean();

      if (!updatedFarmer) {
        logger?.warn({ farmerId }, "Farmer not found for update");
        throw new NotFoundError("Farmer not found", "FARMER_NOT_FOUND");
      }

      // Remove password from response
      delete (updatedFarmer as { password?: string }).password;
    }

    // Update farmer-storage-link
    const updatedLink = await FarmerStorageLink.findByIdAndUpdate(
      id,
      linkUpdateData,
      { new: true, runValidators: true },
    )
      .populate("farmerId")
      .lean();

    if (!updatedLink) {
      logger?.warn(
        { farmerStorageLinkId: id },
        "Failed to update farmer-storage-link",
      );
      throw new NotFoundError(
        "Farmer-storage-link not found",
        "FARMER_STORAGE_LINK_NOT_FOUND",
      );
    }

    // Update debtor ledger opening balance when provided (mirrors quick-register behaviour)
    if (payload.openingBalance !== undefined) {
      const debtorLedger = await Ledger.findOne({
        coldStorageId,
        farmerStorageLinkId: new mongoose.Types.ObjectId(id),
        category: "Debtors",
      }).lean();

      if (debtorLedger) {
        await updateLedger(
          debtorLedger._id.toString(),
          coldStorageId.toString(),
          { openingBalance: payload.openingBalance },
          logger,
        );
      }
    }

    // Get updated farmer if not already fetched
    if (!updatedFarmer) {
      updatedFarmer = await Farmer.findById(farmerId).lean();
      if (updatedFarmer) {
        delete (updatedFarmer as { password?: string }).password;
      }
    }

    // Record farmer edit history (before/after snapshots and who made the change)
    const farmerAfter =
      updatedFarmer ?? (await Farmer.findById(farmerId).lean());
    if (farmerAfter) {
      delete (farmerAfter as { password?: string }).password;
    }
    const snapshotAfter = {
      farmer: (farmerAfter ?? {}) as Record<string, unknown>,
      farmerStorageLink: updatedLink as unknown as Record<string, unknown>,
    };
    await recordFarmerEditHistory({
      farmerId,
      farmerStorageLinkId: new mongoose.Types.ObjectId(id),
      coldStorageId: coldStorageId as mongoose.Types.ObjectId,
      editedById: editedByStoreAdminId,
      snapshotBefore,
      snapshotAfter,
      logger,
    });

    logger?.info(
      {
        farmerStorageLinkId: id,
        farmerId: farmerId,
        updates: { ...farmerUpdateData, ...linkUpdateData },
      },
      "Farmer-storage-link updated successfully",
    );

    return {
      farmer: updatedFarmer,
      farmerStorageLink: updatedLink,
    };
  } catch (error) {
    // Re-throw known errors
    if (
      error instanceof ConflictError ||
      error instanceof ValidationError ||
      error instanceof NotFoundError
    ) {
      throw error;
    }

    // Handle mongoose validation errors
    if (error instanceof mongoose.Error.ValidationError) {
      const messages = Object.values(error.errors).map((err) => err.message);
      throw new ValidationError(
        messages.join(", "),
        "MONGOOSE_VALIDATION_ERROR",
      );
    }

    // Handle mongoose duplicate key errors
    if (error instanceof Error && "code" in error && error.code === 11000) {
      const mongooseError = error as Error & {
        keyPattern?: Record<string, unknown>;
      };
      const field = Object.keys(mongooseError.keyPattern || {})[0] || "field";
      throw new ConflictError(`${field} already exists`, "DUPLICATE_KEY_ERROR");
    }

    // Log unexpected errors
    logger?.error(
      { error, id, payload },
      "Unexpected error in update farmer-storage-link",
    );

    throw new AppError(
      "Failed to update farmer-storage-link",
      500,
      "UPDATE_FARMER_STORAGE_LINK_ERROR",
    );
  }
}

/* =======================
   DAYBOOK (incoming + outgoing gate passes)
======================= */

export interface DaybookEntry {
  incoming: {
    _id: unknown;
    farmerStorageLinkId: unknown;
    createdBy: unknown;
    gatePassNo: number;
    manualParchiNumber?: string;
    date: Date;
    type: string;
    variety: string;
    truckNumber?: string;
    bagSizes: {
      name: string;
      initialQuantity: number;
      currentQuantity: number;
    }[];
    status: string;
    remarks?: string;
    createdAt: Date;
    updatedAt: Date;
  };
  farmer: Record<string, unknown>;
  outgoingPasses: Record<string, unknown>[];
  summaries: {
    totalBagsIncoming: number;
    totalBagsOutgoing: number;
  };
}

export interface DaybookPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Pagination meta for daybook orders list (all / incoming / outgoing) */
export interface DaybookOrdersPaginationMeta {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextPage: number | null;
  previousPage: number | null;
}

export interface GetDaybookOrdersResult {
  status: "Success" | "Fail";
  message?: string;
  data?: Record<string, unknown>[];
  pagination: DaybookOrdersPaginationMeta;
}

export interface GetDaybookOptions {
  limit?: number;
  page?: number;
  sortOrder?: "asc" | "desc";
  gatePassTypes?: DaybookGatePassType[];
}

const DAYBOOK_STAGE_ORDER: DaybookGatePassType[] = ["incoming", "outgoing"];

function createPaginationMeta(
  total: number,
  page: number,
  limit: number,
): DaybookOrdersPaginationMeta {
  const totalPages = Math.ceil(total / limit);
  return {
    currentPage: page,
    totalPages,
    totalItems: total,
    itemsPerPage: limit,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    nextPage: page < totalPages ? page + 1 : null,
    previousPage: page > 1 ? page - 1 : null,
  };
}

/** Sort bagSizes by name on incoming docs; sort orderDetails by size on outgoing docs. */
function sortOrderDetails(
  orders: Array<
    | { bagSizes?: { name: string }[]; orderDetails?: { size: string }[] }
    | {
        toObject: () => Record<string, unknown>;
        bagSizes?: unknown;
        orderDetails?: unknown;
      }
  >,
): Record<string, unknown>[] {
  return orders.map((order) => {
    const hasToObject =
      typeof (order as { toObject?: () => Record<string, unknown> })
        .toObject === "function";
    const obj = hasToObject
      ? (order as { toObject: () => Record<string, unknown> }).toObject()
      : { ...(order as Record<string, unknown>) };
    if (Array.isArray(obj.bagSizes)) {
      (obj as { bagSizes: { name: string }[] }).bagSizes = [
        ...(obj.bagSizes as { name: string }[]),
      ].sort((a, b) => a.name.localeCompare(b.name));
    }
    if (Array.isArray(obj.orderDetails)) {
      (obj as { orderDetails: { size: string }[] }).orderDetails = [
        ...(obj.orderDetails as { size: string }[]),
      ].sort((a, b) => a.size.localeCompare(b.size));
    }
    return obj as Record<string, unknown>;
  });
}

/**
 * Get all incoming and outgoing gate passes for a single farmer-storage-link.
 * Returns same format as daybook: status, data (merged/filtered array), pagination (single page, no pagination logic).
 * Optional filter: from, to (YYYY-MM-DD). Optional: type (all | incoming | outgoing), sortBy.
 * Scoped to the given cold storage.
 */
export async function getGatePassesByFarmerStorageLinkId(
  farmerStorageLinkId: string,
  coldStorageId: string,
  options: {
    from?: string;
    to?: string;
    type?: DaybookListType;
    sortBy?: "latest" | "oldest";
  } = {},
  logger?: FastifyBaseLogger,
): Promise<GetDaybookOrdersResult> {
  if (!mongoose.Types.ObjectId.isValid(farmerStorageLinkId)) {
    throw new ValidationError(
      "Invalid farmer storage link ID format",
      "INVALID_FARMER_STORAGE_LINK_ID",
    );
  }
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      "Invalid cold storage ID format",
      "INVALID_COLD_STORAGE_ID",
    );
  }

  const linkIdObj = new mongoose.Types.ObjectId(farmerStorageLinkId);
  const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);

  const storageLink = await FarmerStorageLink.findOne({
    _id: linkIdObj,
    coldStorageId: coldStorageObjectId,
  }).lean();

  if (!storageLink) {
    logger?.warn(
      { farmerStorageLinkId, coldStorageId },
      "Farmer-storage-link not found or does not belong to cold storage",
    );
    throw new NotFoundError(
      "Farmer-storage-link not found",
      "FARMER_STORAGE_LINK_NOT_FOUND",
    );
  }

  const dateFilter: { date?: { $gte?: Date; $lte?: Date } } = {};
  if (options.from || options.to) {
    const dateClause: { $gte?: Date; $lte?: Date } = {};
    if (options.from) dateClause.$gte = new Date(options.from);
    if (options.to) {
      const toEnd = new Date(options.to);
      toEnd.setHours(23, 59, 59, 999);
      dateClause.$lte = toEnd;
    }
    dateFilter.date = dateClause;
  }
  const incomingFilter = { farmerStorageLinkId: linkIdObj, ...dateFilter };
  const outgoingFilter = { farmerStorageLinkId: linkIdObj, ...dateFilter };

  const sortOrder = options.sortBy === "latest" ? -1 : 1;
  const type = options.type ?? "all";

  const incomingSelect =
    "_id farmerStorageLinkId createdBy gatePassNo date type variety truckNumber bagSizes status remarks manualParchiNumber stockFilter customMarka createdAt";
  const outgoingSelect =
    "_id farmerStorageLinkId createdBy gatePassNo date type variety from to truckNumber orderDetails remarks manualParchiNumber incomingGatePassSnapshots createdAt";

  const populateLink = [
    {
      path: "farmerStorageLinkId",
      select: "farmerId accountNumber",
      populate: {
        path: "farmerId",
        model: Farmer,
        select: "name mobileNumber address",
      },
    },
  ];

  switch (type) {
    case "all": {
      const [incomingList, outgoingList] = await Promise.all([
        IncomingGatePass.find(incomingFilter)
          .sort({ createdAt: sortOrder })
          .select(incomingSelect)
          .populate(populateLink)
          .lean(),
        OutgoingGatePass.find(outgoingFilter)
          .sort({ createdAt: sortOrder })
          .select(outgoingSelect)
          .populate(populateLink)
          .lean(),
      ]);

      const allOrders = [...incomingList, ...outgoingList] as Array<{
        createdAt: Date | string;
      }>;
      allOrders.sort((a, b) => {
        const tA = new Date(a.createdAt).getTime();
        const tB = new Date(b.createdAt).getTime();
        return sortOrder === -1 ? tB - tA : tA - tB;
      });

      const totalCount = allOrders.length;
      if (totalCount === 0) {
        logger?.info(
          { farmerStorageLinkId, from: options.from, to: options.to },
          "Gate passes by farmer-storage-link: no orders",
        );
        return {
          status: "Fail",
          message: "No gate passes found. Try changing the filters.",
          pagination: createPaginationMeta(0, 1, 1),
        };
      }

      const sorted = sortOrderDetails(
        allOrders as {
          bagSizes?: { name: string }[];
          orderDetails?: { size: string }[];
        }[],
      );

      logger?.info(
        { farmerStorageLinkId, totalCount },
        "Gate passes by farmer-storage-link (all) retrieved",
      );
      return {
        status: "Success",
        data: sorted,
        pagination: createPaginationMeta(totalCount, 1, totalCount),
      };
    }
    case "incoming": {
      const incomingOrders = await IncomingGatePass.find(incomingFilter)
        .sort({ createdAt: sortOrder })
        .select(incomingSelect)
        .populate(populateLink)
        .lean();

      const totalCount = incomingOrders.length;
      if (totalCount === 0) {
        return {
          status: "Fail",
          message: "No incoming gate passes found.",
          pagination: createPaginationMeta(0, 1, 1),
        };
      }

      const sorted = sortOrderDetails(
        incomingOrders as unknown as { bagSizes?: { name: string }[] }[],
      );
      return {
        status: "Success",
        data: sorted,
        pagination: createPaginationMeta(totalCount, 1, totalCount),
      };
    }
    case "outgoing": {
      const outgoingOrders = await OutgoingGatePass.find(outgoingFilter)
        .sort({ createdAt: sortOrder })
        .select(outgoingSelect)
        .populate(populateLink)
        .lean();

      const totalCount = outgoingOrders.length;
      if (totalCount === 0) {
        return {
          status: "Fail",
          message: "No outgoing gate passes found.",
          pagination: createPaginationMeta(0, 1, 1),
        };
      }

      const sorted = sortOrderDetails(
        outgoingOrders as unknown as { orderDetails?: { size: string }[] }[],
      );
      return {
        status: "Success",
        data: sorted,
        pagination: createPaginationMeta(totalCount, 1, totalCount),
      };
    }
    default: {
      void type as never;
      throw new ValidationError(
        "Invalid type parameter. Use 'all', 'incoming', or 'outgoing'.",
        "INVALID_DAYBOOK_TYPE",
      );
    }
  }
}

/**
 * Get daybook as a list of incoming and/or outgoing gate passes with farmer populated,
 * pagination, and optional merge (type=all). Sorts bagSizes/orderDetails by size/name.
 */
export async function getDaybookOrders(
  coldStorageId: string,
  options: {
    type: DaybookListType;
    sortBy?: "latest" | "oldest";
    page?: number;
    limit?: number;
  } = { type: "all" },
  logger?: FastifyBaseLogger,
): Promise<GetDaybookOrdersResult> {
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 100) as number;
  const page = Math.max(options.page ?? 1, 1);
  const sortOrder = options.sortBy === "latest" ? -1 : 1;
  const skip = (page - 1) * limit;

  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      "Invalid cold storage ID format",
      "INVALID_COLD_STORAGE_ID",
    );
  }

  const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);
  const farmerStorageLinkIds = await FarmerStorageLink.find(
    { coldStorageId: coldStorageObjectId },
    { _id: 1 },
  )
    .lean()
    .then((links) => links.map((l) => l._id));

  if (farmerStorageLinkIds.length === 0) {
    logger?.info({ coldStorageId }, "Daybook orders: no farmer-storage links");
    return {
      status: "Fail",
      message: "Cold storage doesn't have any orders",
      pagination: createPaginationMeta(0, page, limit),
    };
  }

  const incomingSelect =
    "_id farmerStorageLinkId createdBy gatePassNo date type variety truckNumber bagSizes status remarks manualParchiNumber stockFilter customMarka createdAt";
  const outgoingSelect =
    "_id farmerStorageLinkId createdBy gatePassNo date type variety from to truckNumber orderDetails remarks manualParchiNumber incomingGatePassSnapshots createdAt";

  const populateLink = [
    {
      path: "farmerStorageLinkId",
      select: "farmerId accountNumber",
      populate: {
        path: "farmerId",
        model: Farmer,
        select: "name mobileNumber address",
      },
    },
    {
      path: "createdBy",
      model: StoreAdmin,
      select: "name",
    },
  ];

  switch (options.type) {
    case "all": {
      const [incomingCount, outgoingCount] = await Promise.all([
        IncomingGatePass.countDocuments({
          farmerStorageLinkId: { $in: farmerStorageLinkIds },
        }),
        OutgoingGatePass.countDocuments({
          farmerStorageLinkId: { $in: farmerStorageLinkIds },
        }),
      ]);
      const totalCount = incomingCount + outgoingCount;

      if (totalCount === 0) {
        logger?.info({ coldStorageId }, "Daybook orders: no orders");
        return {
          status: "Fail",
          message: "Cold storage doesn't have any orders",
          pagination: createPaginationMeta(0, page, limit),
        };
      }

      const [allIncoming, allOutgoing] = await Promise.all([
        IncomingGatePass.find({
          farmerStorageLinkId: { $in: farmerStorageLinkIds },
        })
          .sort({ createdAt: sortOrder })
          .select(incomingSelect)
          .populate(populateLink),
        OutgoingGatePass.find({
          farmerStorageLinkId: { $in: farmerStorageLinkIds },
        })
          .sort({ createdAt: sortOrder })
          .select(outgoingSelect)
          .populate(populateLink),
      ]);

      const allOrders = [...allIncoming, ...allOutgoing] as Array<{
        createdAt: Date | string;
      }>;
      allOrders.sort((a, b) => {
        const tA = new Date(a.createdAt).getTime();
        const tB = new Date(b.createdAt).getTime();
        return sortOrder === -1 ? tB - tA : tA - tB;
      });

      const paginated = allOrders.slice(skip, skip + limit);
      const sorted = sortOrderDetails(
        paginated as {
          bagSizes?: { name: string }[];
          orderDetails?: { size: string }[];
        }[],
      );

      logger?.info(
        { coldStorageId, totalCount, page, limit },
        "Daybook orders (all) retrieved",
      );
      return {
        status: "Success",
        data: sorted,
        pagination: createPaginationMeta(totalCount, page, limit),
      };
    }
    case "incoming": {
      const totalCount = await IncomingGatePass.countDocuments({
        farmerStorageLinkId: { $in: farmerStorageLinkIds },
      });

      if (totalCount === 0) {
        return {
          status: "Fail",
          message: "No incoming orders found.",
          pagination: createPaginationMeta(0, page, limit),
        };
      }

      const incomingOrders = await IncomingGatePass.find({
        farmerStorageLinkId: { $in: farmerStorageLinkIds },
      })
        .sort({ createdAt: sortOrder })
        .skip(skip)
        .limit(limit)
        .select(incomingSelect)
        .populate(populateLink);

      const sorted = sortOrderDetails(
        incomingOrders as unknown as { bagSizes?: { name: string }[] }[],
      );

      return {
        status: "Success",
        data: sorted,
        pagination: createPaginationMeta(totalCount, page, limit),
      };
    }
    case "outgoing": {
      const totalCount = await OutgoingGatePass.countDocuments({
        farmerStorageLinkId: { $in: farmerStorageLinkIds },
      });

      if (totalCount === 0) {
        return {
          status: "Fail",
          message: "No outgoing orders found.",
          pagination: createPaginationMeta(0, page, limit),
        };
      }

      const outgoingOrders = await OutgoingGatePass.find({
        farmerStorageLinkId: { $in: farmerStorageLinkIds },
      })
        .sort({ createdAt: sortOrder })
        .skip(skip)
        .limit(limit)
        .select(outgoingSelect)
        .populate(populateLink);

      const sorted = sortOrderDetails(
        outgoingOrders as unknown as { orderDetails?: { size: string }[] }[],
      );

      return {
        status: "Success",
        data: sorted,
        pagination: createPaginationMeta(totalCount, page, limit),
      };
    }
    default: {
      void options.type as never;
      throw new ValidationError(
        "Invalid type parameter. Use 'all', 'incoming', or 'outgoing'.",
        "INVALID_DAYBOOK_TYPE",
      );
    }
  }
}

export interface SearchOrdersByReceiptNumberResult {
  status: "Success" | "Fail";
  message?: string;
  data?: {
    incoming: Record<string, unknown>[];
    outgoing: Record<string, unknown>[];
  };
}

export type SearchOrdersByReceiptSearchBy =
  | "gatePassNumber"
  | "manualParchiNumber"
  | "marka"
  | "customMarka"
  | "remarks";

/** Escape user input for safe literal substring match in MongoDB $regex. */
function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Parse marka: gatePassNo/totalBags (spaces around / allowed). */
function parseMarkaSearchString(
  value: string,
): { gatePassNo: number; totalBags: number } | null {
  const m = value.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return null;
  const gatePassNo = Number(m[1]);
  const totalBags = Number(m[2]);
  if (
    !Number.isInteger(gatePassNo) ||
    !Number.isInteger(totalBags) ||
    gatePassNo < 0 ||
    totalBags < 1
  ) {
    return null;
  }
  return { gatePassNo, totalBags };
}

/**
 * Search incoming and outgoing gate passes by gate pass number, manual parchi, marka (gatePassNo/totalBags), customMarka (incoming only), or remarks (case-insensitive substring, both pass types).
 * Scoped to cold storage via farmer-storage-links. Returns populated farmer and sorted bagSizes/orderDetails.
 */
export async function searchOrdersByReceiptNumber(
  coldStorageId: string,
  receiptNumber: string,
  logger?: FastifyBaseLogger,
  options?: { searchBy?: SearchOrdersByReceiptSearchBy },
): Promise<SearchOrdersByReceiptNumberResult> {
  if (!receiptNumber?.trim()) {
    throw new ValidationError(
      "Receipt number is required",
      "MISSING_RECEIPT_NUMBER",
    );
  }

  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      "Invalid cold storage ID format",
      "INVALID_COLD_STORAGE_ID",
    );
  }

  const searchBy = options?.searchBy ?? "gatePassNumber";

  const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);
  const farmerStorageLinkIds = await FarmerStorageLink.find(
    { coldStorageId: coldStorageObjectId },
    { _id: 1 },
  )
    .lean()
    .then((links) => links.map((l) => l._id));

  if (farmerStorageLinkIds.length === 0) {
    logger?.info(
      { coldStorageId },
      "Search by receipt: no farmer-storage links",
    );
    return {
      status: "Fail",
      message: "No orders found with this receipt number",
      data: { incoming: [], outgoing: [] },
    };
  }

  const trimmed = receiptNumber.trim();

  const incomingSelect =
    "_id farmerStorageLinkId createdBy gatePassNo date type variety truckNumber bagSizes status remarks manualParchiNumber stockFilter customMarka createdAt";
  const outgoingSelect =
    "_id farmerStorageLinkId createdBy gatePassNo date type variety from to truckNumber orderDetails remarks manualParchiNumber incomingGatePassSnapshots createdAt";
  const populateLink = [
    {
      path: "farmerStorageLinkId",
      select: "farmerId accountNumber",
      populate: {
        path: "farmerId",
        model: Farmer,
        select: "name mobileNumber address",
      },
    },
  ];

  if (searchBy === "marka") {
    const parsedMarka = parseMarkaSearchString(trimmed);
    if (!parsedMarka) {
      throw new ValidationError(
        'Marka must be gatePassNumber/totalBags, e.g. "42/300"',
        "INVALID_MARKA_FORMAT",
      );
    }
    const { gatePassNo, totalBags } = parsedMarka;
    const linkMatch = { farmerStorageLinkId: { $in: farmerStorageLinkIds } };

    const sumIncomingBags = {
      $reduce: {
        input: { $ifNull: ["$bagSizes", []] },
        initialValue: 0,
        in: {
          $add: ["$$value", { $ifNull: ["$$this.initialQuantity", 0] }],
        },
      },
    };
    const sumOutgoingIssued = {
      $reduce: {
        input: { $ifNull: ["$orderDetails", []] },
        initialValue: 0,
        in: {
          $add: ["$$value", { $ifNull: ["$$this.quantityIssued", 0] }],
        },
      },
    };

    const [incomingIdDocs, outgoingIdDocs] = await Promise.all([
      IncomingGatePass.aggregate<{ _id: mongoose.Types.ObjectId }>([
        { $match: { ...linkMatch, gatePassNo } },
        { $addFields: { _markaTotalBags: sumIncomingBags } },
        { $match: { _markaTotalBags: totalBags } },
        { $project: { _id: 1 } },
      ]),
      OutgoingGatePass.aggregate<{ _id: mongoose.Types.ObjectId }>([
        { $match: { ...linkMatch, gatePassNo } },
        { $addFields: { _markaTotalBags: sumOutgoingIssued } },
        { $match: { _markaTotalBags: totalBags } },
        { $project: { _id: 1 } },
      ]),
    ]);

    const incomingIds = incomingIdDocs.map((d) => d._id);
    const outgoingIds = outgoingIdDocs.map((d) => d._id);

    if (incomingIds.length === 0 && outgoingIds.length === 0) {
      logger?.info(
        { marka: trimmed, coldStorageId },
        "No orders found for marka search",
      );
      return {
        status: "Fail",
        message: "No orders found with this receipt number",
        data: { incoming: [], outgoing: [] },
      };
    }

    const [incomingOrders, outgoingOrders] = await Promise.all([
      incomingIds.length > 0
        ? IncomingGatePass.find({ _id: { $in: incomingIds } })
            .select(incomingSelect)
            .populate(populateLink)
            .lean()
        : [],
      outgoingIds.length > 0
        ? OutgoingGatePass.find({ _id: { $in: outgoingIds } })
            .select(outgoingSelect)
            .populate(populateLink)
            .lean()
        : [],
    ]);

    const processedIncoming = sortOrderDetails(
      incomingOrders as unknown as {
        bagSizes?: { name: string }[];
        orderDetails?: { size: string }[];
      }[],
    );
    const processedOutgoing = sortOrderDetails(
      outgoingOrders as unknown as {
        bagSizes?: { name: string }[];
        orderDetails?: { size: string }[];
      }[],
    );

    logger?.info(
      {
        marka: trimmed,
        coldStorageId,
        incomingCount: incomingOrders.length,
        outgoingCount: outgoingOrders.length,
      },
      "Search by marka: orders found",
    );

    return {
      status: "Success",
      data: {
        incoming: processedIncoming,
        outgoing: processedOutgoing,
      },
    };
  }

  let baseFilter: Record<string, unknown>;

  if (searchBy === "manualParchiNumber") {
    const parchiNum = Number(trimmed);
    const outgoingNumeric =
      Number.isInteger(parchiNum) && !Number.isNaN(parchiNum);
    baseFilter = {
      farmerStorageLinkId: { $in: farmerStorageLinkIds },
      $or: outgoingNumeric
        ? [{ manualParchiNumber: trimmed }, { manualParchiNumber: parchiNum }]
        : [{ manualParchiNumber: trimmed }],
    };
  } else if (searchBy === "customMarka") {
    baseFilter = {
      farmerStorageLinkId: { $in: farmerStorageLinkIds },
      customMarka: trimmed,
    };
  } else if (searchBy === "remarks") {
    baseFilter = {
      farmerStorageLinkId: { $in: farmerStorageLinkIds },
      remarks: {
        $regex: escapeRegexLiteral(trimmed),
        $options: "i",
      },
    };
  } else {
    const gatePassNo = Number(trimmed);
    if (
      trimmed === "" ||
      !Number.isInteger(gatePassNo) ||
      Number.isNaN(gatePassNo)
    ) {
      throw new ValidationError(
        "Receipt number must be a valid gate pass number (integer)",
        "INVALID_RECEIPT_NUMBER",
      );
    }
    baseFilter = {
      farmerStorageLinkId: { $in: farmerStorageLinkIds },
      gatePassNo,
    };
  }

  const [incomingOrders, outgoingOrders] =
    searchBy === "customMarka"
      ? await Promise.all([
          IncomingGatePass.find(baseFilter as Record<string, unknown>)
            .select(incomingSelect)
            .populate(populateLink)
            .lean(),
          Promise.resolve([]),
        ])
      : await Promise.all([
          IncomingGatePass.find(baseFilter as Record<string, unknown>)
            .select(incomingSelect)
            .populate(populateLink)
            .lean(),
          OutgoingGatePass.find(baseFilter as Record<string, unknown>)
            .select(outgoingSelect)
            .populate(populateLink)
            .lean(),
        ]);

  if (incomingOrders.length === 0 && outgoingOrders.length === 0) {
    logger?.info(
      { receiptNumber: trimmed, coldStorageId },
      "No orders found with receipt number",
    );
    return {
      status: "Fail",
      message: "No orders found with this receipt number",
      data: { incoming: [], outgoing: [] },
    };
  }

  const processedIncoming = sortOrderDetails(
    incomingOrders as unknown as {
      bagSizes?: { name: string }[];
      orderDetails?: { size: string }[];
    }[],
  );
  const processedOutgoing = sortOrderDetails(
    outgoingOrders as unknown as {
      bagSizes?: { name: string }[];
      orderDetails?: { size: string }[];
    }[],
  );

  logger?.info(
    {
      receiptNumber: trimmed,
      coldStorageId,
      incomingCount: incomingOrders.length,
      outgoingCount: outgoingOrders.length,
    },
    "Search by receipt number: orders found",
  );

  return {
    status: "Success",
    data: {
      incoming: processedIncoming,
      outgoing: processedOutgoing,
    },
  };
}

/**
 * Get daybook: one entry per incoming gate pass with attached outgoing passes (that reference this incoming),
 * farmer populated, and bag summaries. Scoped to cold storage via farmer-storage-links.
 * Filter gatePassType: "incoming" = only entries with no outgoing; "outgoing" = entries that have at least one outgoing.
 */
export async function getDaybook(
  coldStorageId: string,
  options: GetDaybookOptions = {},
  logger?: FastifyBaseLogger,
  overrideFarmerStorageLinkIds?: mongoose.Types.ObjectId[],
): Promise<{ daybook: DaybookEntry[]; pagination: DaybookPagination }> {
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 100);
  const page = Math.max(options.page ?? 1, 1);
  const sortOrder = options.sortOrder ?? "desc";
  const gatePassTypes = options.gatePassTypes?.length
    ? options.gatePassTypes
    : undefined;
  const sortDir = sortOrder === "desc" ? -1 : 1;

  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      "Invalid cold storage ID format",
      "INVALID_COLD_STORAGE_ID",
    );
  }

  const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);

  let farmerStorageLinkIds: mongoose.Types.ObjectId[];
  if (
    overrideFarmerStorageLinkIds != null &&
    overrideFarmerStorageLinkIds.length > 0
  ) {
    farmerStorageLinkIds = overrideFarmerStorageLinkIds;
  } else {
    farmerStorageLinkIds = await FarmerStorageLink.find(
      { coldStorageId: coldStorageObjectId },
      { _id: 1 },
    )
      .lean()
      .then((links) => links.map((l) => l._id));

    if (farmerStorageLinkIds.length === 0) {
      logger?.info({ coldStorageId }, "Daybook: no farmer-storage links");
      return {
        daybook: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      };
    }
  }

  const col = {
    farmerStorageLinks: FarmerStorageLink.collection.name,
    farmers: Farmer.collection.name,
    storeAdmins: StoreAdmin.collection.name,
    incomingGatePasses: IncomingGatePass.collection.name,
    outgoingGatePasses: OutgoingGatePass.collection.name,
  };

  const pipeline: mongoose.PipelineStage[] = [
    {
      $match: {
        farmerStorageLinkId: { $in: farmerStorageLinkIds },
      },
    },
    { $sort: { date: sortDir, gatePassNo: sortDir } },
    {
      $lookup: {
        from: col.farmerStorageLinks,
        localField: "farmerStorageLinkId",
        foreignField: "_id",
        as: "linkDoc",
      },
    },
    { $unwind: { path: "$linkDoc", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: col.farmers,
        localField: "linkDoc.farmerId",
        foreignField: "_id",
        as: "farmerArr",
      },
    },
    {
      $lookup: {
        from: col.storeAdmins,
        localField: "createdBy",
        foreignField: "_id",
        as: "incomingCreatedByArr",
        pipeline: [{ $project: { name: 1, mobileNumber: 1 } }],
      },
    },
    {
      $lookup: {
        from: col.outgoingGatePasses,
        let: { incomingId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $in: ["$$incomingId", "$incomingGatePassSnapshots._id"],
              },
            },
          },
          { $sort: { date: -1, gatePassNo: -1 } },
          {
            $lookup: {
              from: col.storeAdmins,
              localField: "createdBy",
              foreignField: "_id",
              as: "createdByPopulated",
              pipeline: [{ $project: { name: 1, mobileNumber: 1 } }],
            },
          },
          {
            $addFields: {
              createdBy: { $arrayElemAt: ["$createdByPopulated", 0] },
            },
          },
          { $project: { createdByPopulated: 0 } },
        ],
        as: "outgoingPasses",
      },
    },
    {
      $addFields: {
        summaries: {
          totalBagsIncoming: {
            $sum: "$bagSizes.initialQuantity",
          },
          totalBagsOutgoing: {
            $reduce: {
              input: { $ifNull: ["$outgoingPasses", []] },
              initialValue: 0,
              in: {
                $add: [
                  "$$value",
                  { $sum: "$$this.orderDetails.quantityIssued" },
                ],
              },
            },
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        incoming: {
          _id: "$_id",
          farmerStorageLinkId: "$farmerStorageLinkId",
          createdBy: { $arrayElemAt: ["$incomingCreatedByArr", 0] },
          gatePassNo: "$gatePassNo",
          manualParchiNumber: "$manualParchiNumber",
          date: "$date",
          type: "$type",
          variety: "$variety",
          truckNumber: "$truckNumber",
          bagSizes: "$bagSizes",
          status: "$status",
          remarks: "$remarks",
          createdAt: "$createdAt",
          updatedAt: "$updatedAt",
        },
        farmer: {
          $mergeObjects: [
            { $ifNull: [{ $arrayElemAt: ["$farmerArr", 0] }, {}] },
            { accountNumber: "$linkDoc.accountNumber" },
          ],
        },
        outgoingPasses: 1,
        summaries: 1,
      },
    },
  ];

  if (gatePassTypes && gatePassTypes.length > 0) {
    const selectedStage =
      gatePassTypes.length === 1
        ? gatePassTypes[0]
        : (gatePassTypes.reduce((max, t) => {
            const maxIdx = DAYBOOK_STAGE_ORDER.indexOf(max);
            const idx = DAYBOOK_STAGE_ORDER.indexOf(t);
            return idx > maxIdx ? t : max;
          }) as DaybookGatePassType);
    const stageIndex = DAYBOOK_STAGE_ORDER.indexOf(selectedStage);
    const andConditions: mongoose.PipelineStage.Match["$match"][string][] = [];

    if (stageIndex >= 1) {
      andConditions.push({
        $gt: [{ $size: { $ifNull: ["$outgoingPasses", []] } }, 0],
      });
    }
    if (stageIndex < 1) {
      andConditions.push({
        $eq: [{ $size: { $ifNull: ["$outgoingPasses", []] } }, 0],
      });
    }

    pipeline.push({
      $match: {
        $expr: { $and: andConditions },
      },
    });

    const passProject: Record<string, unknown> = {
      incoming: "$incoming",
      farmer: "$farmer",
      summaries: "$summaries",
    };
    passProject["outgoingPasses"] = stageIndex >= 1 ? "$outgoingPasses" : [];
    pipeline.push({ $project: passProject });
  }

  pipeline.push({
    $sort: { "incoming.date": sortDir, "incoming.gatePassNo": sortDir },
  });

  pipeline.push({
    $facet: {
      totalCount: [{ $count: "value" }],
      items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
    },
  });

  const result = await IncomingGatePass.aggregate(pipeline).allowDiskUse(true);

  const totalCount =
    result[0]?.totalCount?.[0]?.value != null
      ? result[0].totalCount[0].value
      : 0;
  const daybook = (result[0]?.items ?? []) as DaybookEntry[];
  const totalPages = Math.ceil(totalCount / limit);

  logger?.info(
    { coldStorageId, entryCount: daybook.length, totalCount, page, limit },
    "Daybook retrieved",
  );

  return {
    daybook,
    pagination: { page, limit, total: totalCount, totalPages },
  };
}

/* =======================
   NEXT VOUCHER NUMBER
======================= */

/** Voucher types supported by getNextVoucherNumber: incoming and outgoing only */
export const VOUCHER_TYPES = ["incoming", "outgoing"] as const;

export type VoucherType = (typeof VOUCHER_TYPES)[number];

/**
 * Get the next voucher (gate pass) number for the given cold storage and voucher type.
 * Only "incoming" (IncomingGatePass) and "outgoing" (OutgoingGatePass) are supported.
 * Scopes by farmerStorageLinkIds for this cold storage.
 */
export async function getNextVoucherNumber(
  coldStorageId: string,
  type: VoucherType,
  logger?: FastifyBaseLogger,
): Promise<number> {
  const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);

  const farmerStorageLinkIds = await FarmerStorageLink.find({
    coldStorageId: coldStorageObjectId,
  })
    .distinct("_id")
    .lean();

  if (type === "incoming") {
    const IncomingGatePassModel = mongoose.model("IncomingGatePass");
    const last = await IncomingGatePassModel.findOne({
      farmerStorageLinkId: { $in: farmerStorageLinkIds },
    })
      .sort({ gatePassNo: -1 })
      .select("gatePassNo")
      .lean();
    const next =
      ((last as { gatePassNo?: number } | null)?.gatePassNo ?? 0) + 1;
    logger?.debug({ coldStorageId, type, next }, "Next voucher number");
    return next;
  }

  if (type === "outgoing") {
    const OutgoingGatePassModel = mongoose.model("OutgoingGatePass");
    const last = await OutgoingGatePassModel.findOne({
      farmerStorageLinkId: { $in: farmerStorageLinkIds },
    })
      .sort({ gatePassNo: -1 })
      .select("gatePassNo")
      .lean();
    const next =
      ((last as { gatePassNo?: number } | null)?.gatePassNo ?? 0) + 1;
    logger?.debug({ coldStorageId, type, next }, "Next voucher number");
    return next;
  }

  throw new ValidationError(
    `Invalid voucher type: ${type}. Must be one of ${VOUCHER_TYPES.join(", ")}`,
    "INVALID_VOUCHER_TYPE",
  );
}
