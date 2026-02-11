import { StoreAdmin, Role } from "./store-admin.model.js";
import {
  CreateStoreAdminInput,
  LoginStoreAdminInput,
  QuickRegisterFarmerInput,
  UpdateFarmerStorageLinkInput,
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

    // Get updated farmer if not already fetched
    if (!updatedFarmer) {
      updatedFarmer = await Farmer.findById(farmerId).lean();
      if (updatedFarmer) {
        delete (updatedFarmer as { password?: string }).password;
      }
    }

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
