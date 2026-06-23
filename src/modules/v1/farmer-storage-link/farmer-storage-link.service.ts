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
import type {
  QuickRegisterFarmerBody,
  UpdateFarmerStorageLinkInput,
  GatePassListType,
} from "./farmer-storage-link.schema.js";
import {
  resolveLinkFarmerFields,
  GATE_PASS_LIST_INCOMING_SELECT,
  GATE_PASS_LIST_OUTGOING_SELECT,
  GATE_PASS_LIST_POPULATE_LINK,
  createGatePassListPaginationMeta,
  sortGatePassOrderDetails,
  mapGatePassListLinkDisplay,
  computeGatePassListSummaries,
  type GatePassListResult,
} from "./farmer-storage-link.utils.js";
import Ledger from "../ledger/ledger.model.js";
import { updateLedger } from "../ledger/ledger.service.js";
import { recordFarmerEditHistory } from "../farmer-edit-history/farmer-edit-history.service.js";
import { IncomingGatePass } from "../incoming-gate-pass/incoming-gate-pass.model.js";
import { OutgoingGatePass } from "../outgoing-gate-pass/outgoing-gate-pass.model.js";

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

function handleFarmerStorageLinkMutationError(
  error: unknown,
  logger: FastifyBaseLogger | undefined,
  context: Record<string, unknown>,
  fallbackMessage: string,
  fallbackCode: string,
): never {
  if (
    error instanceof ConflictError ||
    error instanceof ValidationError ||
    error instanceof NotFoundError
  ) {
    throw error;
  }
  if (error instanceof mongoose.Error.ValidationError) {
    const messages = Object.values(error.errors).map((e) => e.message);
    throw new ValidationError(messages.join(", "), "MONGOOSE_VALIDATION_ERROR");
  }
  if (error instanceof Error && "code" in error && error.code === 11000) {
    const mongooseError = error as Error & {
      keyPattern?: Record<string, unknown>;
    };
    const field = Object.keys(mongooseError.keyPattern ?? {})[0] ?? "field";
    throw new ConflictError(`${field} already exists`, "DUPLICATE_KEY_ERROR");
  }
  logger?.error({ error, ...context }, fallbackMessage);
  throw new AppError(fallbackMessage, 500, fallbackCode);
}

async function resolveAccountNumber(
  coldStorageId: string,
  requestedAccountNumber?: number,
): Promise<number> {
  if (requestedAccountNumber !== undefined) {
    const existingAccountLink = await FarmerStorageLink.findOne({
      coldStorageId,
      accountNumber: requestedAccountNumber,
    });

    if (existingAccountLink) {
      throw new ConflictError(
        "Account number already exists for this cold storage",
        "ACCOUNT_NUMBER_EXISTS",
      );
    }

    return requestedAccountNumber;
  }

  const maxAccountLink = await FarmerStorageLink.findOne({ coldStorageId })
    .sort({ accountNumber: -1 })
    .select("accountNumber")
    .lean();

  return maxAccountLink ? maxAccountLink.accountNumber + 1 : 1;
}

/**
 * List all farmer-storage-links for a cold storage with store-specific display fields.
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
      .populate("farmerId", "name address mobileNumber imageUrl")
      .lean();

    const enrichedLinks = links.map((link) => {
      const farmer = link.farmerId as unknown as {
        _id: mongoose.Types.ObjectId;
        name: string;
        address: string;
        mobileNumber: string;
        imageUrl?: string;
      } | null;
      const storeFields = resolveLinkFarmerFields(link, farmer);
      const {
        farmerId: _farmerId,
        coldStorageId: _coldStorageId,
        ...linkWithoutRefs
      } = link;
      return {
        ...linkWithoutRefs,
        name: storeFields.name,
        address: storeFields.address,
        mobileNumber: storeFields.mobileNumber,
      };
    });

    logger?.info(
      { coldStorageId, count: enrichedLinks.length },
      "Retrieved farmer-storage-links by cold storage",
    );

    return enrichedLinks;
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

export interface QuickRegisterFarmerParams {
  coldStorageId: string;
  linkedById: string;
  payload: QuickRegisterFarmerBody;
}

/**
 * Create a farmer-storage-link for the current cold storage.
 * Creates a new global farmer when the mobile is new; otherwise reuses the existing farmer.
 */
export async function quickRegisterFarmer(
  params: QuickRegisterFarmerParams,
  logger?: FastifyBaseLogger,
) {
  const { coldStorageId, linkedById, payload } = params;

  try {
    const coldStorage = await ColdStorage.findById(coldStorageId);
    if (!coldStorage) {
      logger?.warn({ coldStorageId }, "Cold storage not found");
      throw new NotFoundError("Cold storage not found", "COLD_STORAGE_NOT_FOUND");
    }

    const storeAdmin = await StoreAdmin.findById(linkedById);
    if (!storeAdmin) {
      logger?.warn({ linkedById }, "Store admin not found");
      throw new NotFoundError("Store admin not found", "STORE_ADMIN_NOT_FOUND");
    }

    const existingFarmer = await Farmer.findOne({
      mobileNumber: payload.mobileNumber,
    }).select("-password");

    if (existingFarmer) {
      const existingLink = await FarmerStorageLink.findOne({
        farmerId: existingFarmer._id,
        coldStorageId,
      });

      if (existingLink) {
        throw new ConflictError(
          "Farmer is already linked to this cold storage",
          "LINK_ALREADY_EXISTS",
        );
      }
    }

    const accountNumber = await resolveAccountNumber(
      coldStorageId,
      payload.accountNumber,
    );

    const farmer =
      existingFarmer ??
      (await Farmer.create({
        name: payload.name,
        address: payload.address,
        mobileNumber: payload.mobileNumber,
        imageUrl: payload.imageUrl || "",
        password: "123456",
      }));

    const farmerStorageLink = await FarmerStorageLink.create({
      farmerId: farmer._id,
      coldStorageId,
      linkedById,
      accountNumber,
      isActive: true,
      name: payload.name,
      address: payload.address,
      mobileNumber: payload.mobileNumber,
      ...(payload.costPerBag !== undefined && {
        costPerBag: payload.costPerBag,
      }),
    });

    logger?.info(
      {
        linkId: farmerStorageLink._id,
        farmerId: farmer._id,
        coldStorageId,
        accountNumber,
        reusedExistingFarmer: Boolean(existingFarmer),
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
        name: payload.name,
        openingBalance: payload.openingBalance,
        createdBy: new mongoose.Types.ObjectId(linkedById),
      });
    }

    const { password: _, ...farmerWithoutPassword } = farmer.toObject();

    return {
      farmer: farmerWithoutPassword,
      farmerStorageLink: farmerStorageLink.toObject(),
    };
  } catch (error) {
    handleFarmerStorageLinkMutationError(
      error,
      logger,
      { params },
      "Failed to quick register farmer",
      "QUICK_REGISTER_FARMER_ERROR",
    );
  }
}

/**
 * Update a farmer-storage-link; store-specific name/address/mobileNumber update the link only.
 */
export async function updateFarmerStorageLink(
  id: string,
  payload: UpdateFarmerStorageLinkInput,
  coldStorageId: string,
  logger?: FastifyBaseLogger,
  editedByStoreAdminId?: string,
) {
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ValidationError(
        "Invalid farmer-storage-link ID format",
        "INVALID_ID",
      );
    }

    const farmerStorageLink =
      await FarmerStorageLink.findById(id).populate("farmerId");

    if (!farmerStorageLink) {
      throw new NotFoundError(
        "Farmer-storage-link not found",
        "FARMER_STORAGE_LINK_NOT_FOUND",
      );
    }

    if (farmerStorageLink.coldStorageId.toString() !== coldStorageId) {
      throw new NotFoundError(
        "Farmer-storage-link not found",
        "FARMER_STORAGE_LINK_NOT_FOUND",
      );
    }

    const farmerIdRaw = farmerStorageLink.farmerId as
      | mongoose.Types.ObjectId
      | { _id: mongoose.Types.ObjectId };
    const farmerId =
      typeof farmerIdRaw === "object" &&
      farmerIdRaw !== null &&
      "_id" in farmerIdRaw
        ? farmerIdRaw._id
        : (farmerIdRaw as mongoose.Types.ObjectId);
    const linkColdStorageId = farmerStorageLink.coldStorageId;

    const farmerBefore = await Farmer.findById(farmerId).lean();
    if (farmerBefore) {
      delete (farmerBefore as { password?: string }).password;
    }
    const linkBefore = await FarmerStorageLink.findById(id).lean();
    const snapshotBefore = {
      farmer: (farmerBefore ?? {}) as Record<string, unknown>,
      farmerStorageLink: (linkBefore ?? {}) as Record<string, unknown>,
    };

    if (payload.accountNumber !== undefined) {
      const existingAccountLink = await FarmerStorageLink.findOne({
        coldStorageId: linkColdStorageId,
        accountNumber: payload.accountNumber,
        _id: { $ne: id },
      });

      if (existingAccountLink) {
        throw new ConflictError(
          "Account number already exists for this cold storage",
          "ACCOUNT_NUMBER_EXISTS",
        );
      }
    }

    if (payload.linkedById !== undefined) {
      const storeAdmin = await StoreAdmin.findById(payload.linkedById);
      if (!storeAdmin) {
        throw new NotFoundError("Store admin not found", "STORE_ADMIN_NOT_FOUND");
      }
    }

    const farmerUpdateData: Partial<{ imageUrl: string }> = {};
    if (payload.imageUrl !== undefined) {
      farmerUpdateData.imageUrl = payload.imageUrl;
    }

    const linkUpdateData: Partial<{
      accountNumber: number;
      isActive: boolean;
      notes: string;
      linkedById: mongoose.Types.ObjectId;
      costPerBag: number;
      name: string;
      address: string;
      mobileNumber: string;
    }> = {};

    if (payload.name !== undefined) linkUpdateData.name = payload.name;
    if (payload.address !== undefined) linkUpdateData.address = payload.address;
    if (payload.mobileNumber !== undefined) {
      linkUpdateData.mobileNumber = payload.mobileNumber;
    }
    if (payload.accountNumber !== undefined) {
      linkUpdateData.accountNumber = payload.accountNumber;
    }
    if (payload.isActive !== undefined) linkUpdateData.isActive = payload.isActive;
    if (payload.notes !== undefined) linkUpdateData.notes = payload.notes;
    if (payload.linkedById !== undefined) {
      linkUpdateData.linkedById = new mongoose.Types.ObjectId(
        payload.linkedById,
      );
    }
    if (payload.costPerBag !== undefined) {
      linkUpdateData.costPerBag = payload.costPerBag;
    }

    let updatedFarmer = null;
    if (Object.keys(farmerUpdateData).length > 0) {
      updatedFarmer = await Farmer.findByIdAndUpdate(
        farmerId,
        farmerUpdateData,
        { new: true, runValidators: true },
      ).lean();

      if (!updatedFarmer) {
        throw new NotFoundError("Farmer not found", "FARMER_NOT_FOUND");
      }

      delete (updatedFarmer as { password?: string }).password;
    }

    const updatedLink = await FarmerStorageLink.findByIdAndUpdate(
      id,
      linkUpdateData,
      { new: true, runValidators: true },
    )
      .populate("farmerId")
      .lean();

    if (!updatedLink) {
      throw new NotFoundError(
        "Farmer-storage-link not found",
        "FARMER_STORAGE_LINK_NOT_FOUND",
      );
    }

    if (payload.openingBalance !== undefined || payload.name !== undefined) {
      const debtorLedger = await Ledger.findOne({
        coldStorageId: linkColdStorageId,
        farmerStorageLinkId: new mongoose.Types.ObjectId(id),
        category: "Debtors",
      }).lean();

      if (debtorLedger) {
        const ledgerUpdates: { openingBalance?: number; name?: string } = {};
        if (payload.openingBalance !== undefined) {
          ledgerUpdates.openingBalance = payload.openingBalance;
        }
        if (payload.name !== undefined) {
          ledgerUpdates.name = payload.name;
        }
        await updateLedger(
          debtorLedger._id.toString(),
          linkColdStorageId.toString(),
          ledgerUpdates,
          logger,
        );
      }
    }

    if (!updatedFarmer) {
      updatedFarmer = await Farmer.findById(farmerId).lean();
      if (updatedFarmer) {
        delete (updatedFarmer as { password?: string }).password;
      }
    }

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
      coldStorageId: linkColdStorageId as mongoose.Types.ObjectId,
      editedById: editedByStoreAdminId,
      snapshotBefore,
      snapshotAfter,
      logger,
    });

    const farmerIdPopulated: unknown = updatedLink.farmerId;
    const farmerPopulated =
      farmerIdPopulated &&
      typeof farmerIdPopulated === "object" &&
      "name" in farmerIdPopulated
        ? (farmerIdPopulated as {
            name: string;
            address: string;
            mobileNumber: string;
          })
        : null;
    const storeFields = resolveLinkFarmerFields(updatedLink, farmerPopulated);
    const enrichedLink = {
      ...updatedLink,
      name: storeFields.name,
      address: storeFields.address,
      mobileNumber: storeFields.mobileNumber,
    };

    return {
      farmer: updatedFarmer,
      farmerStorageLink: enrichedLink,
    };
  } catch (error) {
    handleFarmerStorageLinkMutationError(
      error,
      logger,
      { id, payload, coldStorageId },
      "Failed to update farmer-storage-link",
      "UPDATE_FARMER_STORAGE_LINK_ERROR",
    );
  }
}

/**
 * Get all incoming and outgoing gate passes for a single farmer-storage-link.
 * Returns same format as daybook: status, data (merged/filtered array), pagination (single page).
 * Optional filter: from, to (YYYY-MM-DD). Optional: type (all | incoming | outgoing), sortBy.
 * sortBy latest/oldest orders by createdAt (desc / asc), same as daybook.
 * Scoped to the given cold storage.
 */
export async function getFarmerStorageLinkGatePasses(
  farmerStorageLinkId: string,
  coldStorageId: string,
  options: {
    from?: string;
    to?: string;
    type?: GatePassListType;
    sortBy?: "latest" | "oldest";
  } = {},
  logger?: FastifyBaseLogger,
): Promise<GatePassListResult> {
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

  const [incomingList, outgoingList] = await Promise.all([
    IncomingGatePass.find(incomingFilter)
      .sort({ createdAt: sortOrder })
      .select(GATE_PASS_LIST_INCOMING_SELECT)
      .populate(GATE_PASS_LIST_POPULATE_LINK)
      .lean(),
    OutgoingGatePass.find(outgoingFilter)
      .sort({ createdAt: sortOrder })
      .select(GATE_PASS_LIST_OUTGOING_SELECT)
      .populate(GATE_PASS_LIST_POPULATE_LINK)
      .lean(),
  ]);

  const summaries = computeGatePassListSummaries(incomingList, outgoingList);

  switch (type) {
    case "all": {
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
          summaries,
          pagination: createGatePassListPaginationMeta(0, 1, 1),
        };
      }

      const sorted = sortGatePassOrderDetails(
        allOrders as {
          bagSizes?: { name: string }[];
          orderDetails?: { size: string }[];
        }[],
      ).map(mapGatePassListLinkDisplay);

      logger?.info(
        { farmerStorageLinkId, totalCount },
        "Gate passes by farmer-storage-link (all) retrieved",
      );
      return {
        status: "Success",
        data: sorted,
        summaries,
        pagination: createGatePassListPaginationMeta(totalCount, 1, totalCount),
      };
    }
    case "incoming": {
      const totalCount = incomingList.length;
      if (totalCount === 0) {
        return {
          status: "Fail",
          message: "No incoming gate passes found.",
          summaries,
          pagination: createGatePassListPaginationMeta(0, 1, 1),
        };
      }

      const sorted = sortGatePassOrderDetails(
        incomingList as unknown as { bagSizes?: { name: string }[] }[],
      ).map(mapGatePassListLinkDisplay);
      return {
        status: "Success",
        data: sorted,
        summaries,
        pagination: createGatePassListPaginationMeta(totalCount, 1, totalCount),
      };
    }
    case "outgoing": {
      const totalCount = outgoingList.length;
      if (totalCount === 0) {
        return {
          status: "Fail",
          message: "No outgoing gate passes found.",
          summaries,
          pagination: createGatePassListPaginationMeta(0, 1, 1),
        };
      }

      const sorted = sortGatePassOrderDetails(
        outgoingList as unknown as { orderDetails?: { size: string }[] }[],
      ).map(mapGatePassListLinkDisplay);
      return {
        status: "Success",
        data: sorted,
        summaries,
        pagination: createGatePassListPaginationMeta(totalCount, 1, totalCount),
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
