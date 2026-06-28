import { StoreAdmin, Role } from "./store-admin.model.js";
import {
  CreateStoreAdminInput,
  LoginStoreAdminInput,
  type DaybookGatePassType,
  type DaybookListType,
  type UpdateStoreAdminProfileInput,
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
import {
  FARMER_STORAGE_LINK_FARMER_POPULATE_SELECT,
  FARMER_STORAGE_LINK_POPULATE_SELECT,
  GATE_PASS_LIST_INCOMING_SELECT,
  GATE_PASS_LIST_OUTGOING_SELECT,
  GATE_PASS_LIST_POPULATE_LINK,
  createGatePassListPaginationMeta,
  sortGatePassOrderDetails,
  mapGatePassListLinkDisplay,
  type GatePassListPaginationResult,
} from "../farmer-storage-link/farmer-storage-link.utils.js";
import { IncomingGatePass } from "../incoming-gate-pass/incoming-gate-pass.model.js";
import { OutgoingGatePass } from "../outgoing-gate-pass/outgoing-gate-pass.model.js";
import {
  getColdStorageById,
  updateColdStorage,
} from "../cold-storage/cold-storage.service.js";

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
 * Retrieves store admin profile with linked cold storage details
 */
export async function getStoreAdminProfile(
  storeAdminId: string,
  logger?: FastifyBaseLogger,
) {
  const storeAdmin = await getStoreAdminById(storeAdminId, logger);
  const coldStorage = await getColdStorageById(
    String(storeAdmin.coldStorageId),
    logger,
  );

  return { storeAdmin, coldStorage };
}

/**
 * Updates store admin profile and optionally linked cold storage details
 */
export async function updateStoreAdminProfile(
  storeAdminId: string,
  payload: UpdateStoreAdminProfileInput,
  logger?: FastifyBaseLogger,
) {
  const { coldStorage: coldStoragePayload, ...storeAdminFields } = payload;

  const hasStoreAdminFields = Object.keys(storeAdminFields).length > 0;

  if (hasStoreAdminFields) {
    await updateStoreAdmin(storeAdminId, storeAdminFields, logger);
  }

  if (coldStoragePayload && Object.keys(coldStoragePayload).length > 0) {
    const existing = await StoreAdmin.findById(storeAdminId).select(
      "coldStorageId",
    );

    if (!existing) {
      throw new NotFoundError("Store admin not found", "STORE_ADMIN_NOT_FOUND");
    }

    await updateColdStorage(
      String(existing.coldStorageId),
      coldStoragePayload,
      logger,
    );
  }

  return getStoreAdminProfile(storeAdminId, logger);
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

    // Update the store admin (use save() so pre-save password hashing runs)
    if (payload.name !== undefined) existing.name = payload.name;
    if (payload.mobileNumber !== undefined) {
      existing.mobileNumber = payload.mobileNumber;
    }
    if (payload.password !== undefined) existing.password = payload.password;
    if (payload.role !== undefined) existing.role = payload.role;
    if (payload.isVerified !== undefined) {
      existing.isVerified = payload.isVerified;
    }

    await existing.save();

    const updatedStoreAdmin = await StoreAdmin.findById(id)
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
export type DaybookOrdersPaginationMeta = import("../farmer-storage-link/farmer-storage-link.utils.js").GatePassListPaginationMeta;

export type GetDaybookOrdersResult = GatePassListPaginationResult;

export interface GetDaybookOptions {
  limit?: number;
  page?: number;
  sortOrder?: "asc" | "desc";
  gatePassTypes?: DaybookGatePassType[];
}

const DAYBOOK_STAGE_ORDER: DaybookGatePassType[] = ["incoming", "outgoing"];

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
      pagination: createGatePassListPaginationMeta(0, page, limit),
    };
  }

  const incomingSelect = GATE_PASS_LIST_INCOMING_SELECT;
  const outgoingSelect = GATE_PASS_LIST_OUTGOING_SELECT;
  const populateLink = GATE_PASS_LIST_POPULATE_LINK;

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
          pagination: createGatePassListPaginationMeta(0, page, limit),
        };
      }

      const [allIncoming, allOutgoing] = await Promise.all([
        IncomingGatePass.find({
          farmerStorageLinkId: { $in: farmerStorageLinkIds },
        })
          .sort({ createdAt: sortOrder })
          .select(incomingSelect)
          .populate(populateLink)
          .lean(),
        OutgoingGatePass.find({
          farmerStorageLinkId: { $in: farmerStorageLinkIds },
        })
          .sort({ createdAt: sortOrder })
          .select(outgoingSelect)
          .populate(populateLink)
          .lean(),
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
      const sorted = sortGatePassOrderDetails(
        paginated as {
          bagSizes?: { name: string }[];
          orderDetails?: { size: string }[];
        }[],
      ).map(mapGatePassListLinkDisplay);

      logger?.info(
        { coldStorageId, totalCount, page, limit },
        "Daybook orders (all) retrieved",
      );
      return {
        status: "Success",
        data: sorted,
        pagination: createGatePassListPaginationMeta(totalCount, page, limit),
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
          pagination: createGatePassListPaginationMeta(0, page, limit),
        };
      }

      const incomingOrders = await IncomingGatePass.find({
        farmerStorageLinkId: { $in: farmerStorageLinkIds },
      })
        .sort({ createdAt: sortOrder })
        .skip(skip)
        .limit(limit)
        .select(incomingSelect)
        .populate(populateLink)
        .lean();

      const sorted = sortGatePassOrderDetails(
        incomingOrders as unknown as { bagSizes?: { name: string }[] }[],
      ).map(mapGatePassListLinkDisplay);

      return {
        status: "Success",
        data: sorted,
        pagination: createGatePassListPaginationMeta(totalCount, page, limit),
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
          pagination: createGatePassListPaginationMeta(0, page, limit),
        };
      }

      const outgoingOrders = await OutgoingGatePass.find({
        farmerStorageLinkId: { $in: farmerStorageLinkIds },
      })
        .sort({ createdAt: sortOrder })
        .skip(skip)
        .limit(limit)
        .select(outgoingSelect)
        .populate(populateLink)
        .lean();

      const sorted = sortGatePassOrderDetails(
        outgoingOrders as unknown as { orderDetails?: { size: string }[] }[],
      ).map(mapGatePassListLinkDisplay);

      return {
        status: "Success",
        data: sorted,
        pagination: createGatePassListPaginationMeta(totalCount, page, limit),
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
 * Search incoming and outgoing gate passes by gate pass number, manual parchi, marka (gatePassNo/totalBags and/or customMarka on incoming), or remarks (case-insensitive substring, both pass types).
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
    "_id farmerStorageLinkId createdBy gatePassNo date type from to truckNumber orderDetails remarks manualParchiNumber incomingGatePassSnapshots isNull createdAt";
  const populateLink = [
    {
      path: "farmerStorageLinkId",
      select: FARMER_STORAGE_LINK_POPULATE_SELECT,
      populate: {
        path: "farmerId",
        model: Farmer,
        select: FARMER_STORAGE_LINK_FARMER_POPULATE_SELECT,
      },
    },
  ];

  if (searchBy === "marka") {
    const linkMatch = { farmerStorageLinkId: { $in: farmerStorageLinkIds } };
    const parsedMarka = parseMarkaSearchString(trimmed);

    let markaIncomingIds: mongoose.Types.ObjectId[] = [];
    let markaOutgoingIds: mongoose.Types.ObjectId[] = [];

    if (parsedMarka) {
      const { gatePassNo, totalBags } = parsedMarka;

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

      markaIncomingIds = incomingIdDocs.map((d) => d._id);
      markaOutgoingIds = outgoingIdDocs.map((d) => d._id);
    }

    const customMarkaIdDocs = await IncomingGatePass.find({
      ...linkMatch,
      customMarka: trimmed,
    })
      .select("_id")
      .lean();

    const incomingIdSet = new Set<string>([
      ...markaIncomingIds.map((id) => id.toString()),
      ...customMarkaIdDocs.map((d) => d._id.toString()),
    ]);
    const incomingIds = [...incomingIdSet].map(
      (id) => new mongoose.Types.ObjectId(id),
    );
    const outgoingIds = markaOutgoingIds;

    if (incomingIds.length === 0 && outgoingIds.length === 0) {
      logger?.info(
        { marka: trimmed, coldStorageId },
        "No orders found for marka or customMarka search",
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

    const processedIncoming = sortGatePassOrderDetails(
      incomingOrders as unknown as {
        bagSizes?: { name: string }[];
        orderDetails?: { size: string }[];
      }[],
    );
    const processedOutgoing = sortGatePassOrderDetails(
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
        usedGatePassTotalBags: Boolean(parsedMarka),
        usedCustomMarka: customMarkaIdDocs.length > 0,
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

  const processedIncoming = sortGatePassOrderDetails(
    incomingOrders as unknown as {
      bagSizes?: { name: string }[];
      orderDetails?: { size: string }[];
    }[],
  );
  const processedOutgoing = sortGatePassOrderDetails(
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
            {
              accountNumber: "$linkDoc.accountNumber",
              name: {
                $ifNull: [
                  "$linkDoc.name",
                  { $arrayElemAt: ["$farmerArr.name", 0] },
                ],
              },
              address: {
                $ifNull: [
                  "$linkDoc.address",
                  { $arrayElemAt: ["$farmerArr.address", 0] },
                ],
              },
              mobileNumber: {
                $ifNull: [
                  "$linkDoc.mobileNumber",
                  { $arrayElemAt: ["$farmerArr.mobileNumber", 0] },
                ],
              },
            },
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
