import {
  IncomingGatePass,
  GatePassType,
} from "./incoming-gate-pass.model.js";
import { CreateIncomingGatePassInput } from "./incoming-gate-pass.schema.js";
import {
  NotFoundError,
  ValidationError,
  AppError,
  ConflictError,
} from "../../../utils/errors.js";
import mongoose from "mongoose";
import type { FastifyBaseLogger } from "fastify";
import { FarmerStorageLink } from "../farmer-storage-link/farmer-storage-link-model.js";

/**
 * List all incoming gate passes for a farmer-storage-link.
 * Scopes to the given cold storage so the link must belong to that cold storage.
 *
 * @param farmerStorageLinkId - Farmer-storage link ID
 * @param loggedInUserColdStorageId - Cold storage ID of the logged-in user (for auth scope)
 * @param logger - Optional logger instance
 * @returns Array of incoming gate passes with populated farmerStorageLinkId (name, accountNumber, address, mobileNumber)
 * @throws ValidationError if farmerStorageLinkId is invalid
 * @throws NotFoundError if farmer-storage-link not found or not in user's cold storage
 */
export async function getIncomingGatePassesByFarmerStorageLinkId(
  farmerStorageLinkId: string,
  loggedInUserColdStorageId: string | undefined,
  logger?: FastifyBaseLogger,
) {
  if (!mongoose.Types.ObjectId.isValid(farmerStorageLinkId)) {
    throw new ValidationError(
      "Invalid farmer storage link ID format",
      "INVALID_FARMER_STORAGE_LINK_ID",
    );
  }

  const linkIdObj = new mongoose.Types.ObjectId(farmerStorageLinkId);
  const storageLink = await FarmerStorageLink.findById(linkIdObj).lean();

  if (!storageLink) {
    logger?.warn(
      { farmerStorageLinkId },
      "Farmer-storage-link not found for list incoming gate passes",
    );
    throw new NotFoundError(
      "Farmer-storage-link not found",
      "FARMER_STORAGE_LINK_NOT_FOUND",
    );
  }

  const linkColdStorageId =
    typeof storageLink.coldStorageId === "object" &&
    storageLink.coldStorageId !== null
      ? (
          storageLink.coldStorageId as { _id: mongoose.Types.ObjectId }
        )._id.toString()
      : (storageLink.coldStorageId as string);

  if (
    loggedInUserColdStorageId &&
    linkColdStorageId !== loggedInUserColdStorageId
  ) {
    logger?.warn(
      { farmerStorageLinkId, linkColdStorageId, loggedInUserColdStorageId },
      "Farmer-storage-link does not belong to user's cold storage",
    );
    throw new NotFoundError(
      "Farmer-storage-link not found",
      "FARMER_STORAGE_LINK_NOT_FOUND",
    );
  }

  const list = await IncomingGatePass.find({ farmerStorageLinkId: linkIdObj })
    .sort({ date: -1, gatePassNo: -1 })
    .populate({
      path: "farmerStorageLinkId",
      select: "accountNumber farmerId",
      populate: {
        path: "farmerId",
        select: "name address mobileNumber",
      },
    })
    .populate({ path: "createdBy", select: "name" })
    .lean();

  type PopulatedLink = {
    accountNumber: number;
    farmerId: { name: string; address: string; mobileNumber: string };
  };
  type PopulatedAdmin = { _id: unknown; name: string };

  return list.map((raw) => {
    const row = raw as unknown as Record<string, unknown>;
    const populatedLink = row.farmerStorageLinkId as
      | PopulatedLink
      | null
      | undefined;
    const populatedAdmin = row.createdBy as PopulatedAdmin | null | undefined;
    return {
      ...row,
      farmerStorageLinkId:
        populatedLink && populatedLink.farmerId
          ? {
              name: populatedLink.farmerId.name,
              accountNumber: populatedLink.accountNumber,
              address: populatedLink.farmerId.address,
              mobileNumber: populatedLink.farmerId.mobileNumber,
            }
          : row.farmerStorageLinkId,
      createdBy: populatedAdmin
        ? { _id: populatedAdmin._id, name: populatedAdmin.name }
        : row.createdBy,
    };
  });
}
import { ColdStorage } from "../cold-storage/cold-storage.model.js";
import Ledger from "../ledger/ledger.model.js";
import { Preferences } from "../preferences/preferences.model.js";
import { getNextVoucherNumber } from "../store-admin/store-admin.service.js";
import {
  createVoucher,
  type CreateVoucherParams,
} from "../../../utils/accounting/helper-fns.js";
import { getNextJournalVoucherNumber } from "../../../utils/accounting/generate-voucher-number.js";

/**
 * Creates a new incoming gate pass.
 * Resolves farmer-storage-link, gets next gate pass number for the cold storage, then creates the document.
 *
 * @param payload - Create body (farmerStorageLinkId, date, type, variety, truckNumber, bagSizes, remarks?, and optional voucher fields)
 * @param createdById - Optional store admin ID (from auth)
 * @param loggedInUserColdStorageId - Cold storage ID of the logged-in user (for preferences.showFinances check)
 * @param logger - Optional logger instance
 * @returns Created incoming gate pass document
 * @throws NotFoundError if farmer-storage-link not found
 * @throws ValidationError if input validation fails
 * @throws ConflictError on duplicate gate pass number (unique index)
 */
export async function createIncomingGatePass(
  payload: CreateIncomingGatePassInput,
  createdById: string | undefined,
  loggedInUserColdStorageId: string | undefined,
  logger?: FastifyBaseLogger,
) {
  try {
    if (!mongoose.Types.ObjectId.isValid(payload.farmerStorageLinkId)) {
      throw new ValidationError(
        "Invalid farmer storage link ID format",
        "INVALID_FARMER_STORAGE_LINK_ID",
      );
    }

    const storageLink = await FarmerStorageLink.findById(
      payload.farmerStorageLinkId,
    ).lean();

    if (!storageLink) {
      logger?.warn(
        { farmerStorageLinkId: payload.farmerStorageLinkId },
        "Farmer-storage-link not found for incoming gate pass",
      );
      throw new NotFoundError(
        "Farmer-storage-link not found",
        "FARMER_STORAGE_LINK_NOT_FOUND",
      );
    }

    const coldStorageId =
      typeof storageLink.coldStorageId === "object" &&
      storageLink.coldStorageId !== null
        ? (
            storageLink.coldStorageId as { _id: mongoose.Types.ObjectId }
          )._id.toString()
        : (storageLink.coldStorageId as string);

    const gatePassNo = await getNextVoucherNumber(
      coldStorageId,
      "incoming",
      logger,
    );

    const doc = await IncomingGatePass.create({
      farmerStorageLinkId: new mongoose.Types.ObjectId(
        payload.farmerStorageLinkId,
      ),
      createdBy: createdById
        ? new mongoose.Types.ObjectId(createdById)
        : undefined,
      gatePassNo,
      date: payload.date,
      type: GatePassType.RECEIPT,
      variety: payload.variety,
      ...(payload.truckNumber !== undefined && payload.truckNumber !== ""
        ? { truckNumber: payload.truckNumber }
        : {}),
      bagSizes: payload.bagSizes,
      remarks: payload.remarks,
      manualParchiNumber: payload.manualParchiNumber,
    });

    logger?.info(
      {
        incomingGatePassId: doc._id,
        farmerStorageLinkId: payload.farmerStorageLinkId,
        gatePassNo: doc.gatePassNo,
      },
      "Incoming gate pass created successfully",
    );

    // Create voucher when logged-in user's cold storage has showFinances enabled.
    // Ledgers are resolved on backend: debit = farmer's ledger (farmer storage link), credit = Store Rent ledger.
    if (loggedInUserColdStorageId) {
      const coldStorage = await ColdStorage.findById(loggedInUserColdStorageId)
        .select("preferencesId")
        .lean();
      const preferences = coldStorage?.preferencesId
        ? await Preferences.findById(coldStorage.preferencesId).lean()
        : null;

      if (preferences?.showFinances) {
        const amount = payload.amount;
        if (amount == null || amount <= 0) {
          throw new ValidationError(
            "Amount is required and must be greater than 0 when showFinances is enabled",
            "AMOUNT_REQUIRED_FOR_VOUCHER",
          );
        }

        const coldIdObj = new mongoose.Types.ObjectId(coldStorageId);
        const linkIdObj = new mongoose.Types.ObjectId(
          payload.farmerStorageLinkId,
        );
        const createdByObjId = payload.createdById
          ? new mongoose.Types.ObjectId(payload.createdById)
          : createdById
            ? new mongoose.Types.ObjectId(createdById)
            : undefined;

        if (!createdByObjId) {
          throw new ValidationError(
            "Created by (store admin) is required to create voucher",
            "CREATED_BY_REQUIRED",
          );
        }

        // Farmer's ledger (debit): ledger linked to this farmer storage link (Debtors category).
        const farmerLedger = await Ledger.findOne({
          coldStorageId: coldIdObj,
          farmerStorageLinkId: linkIdObj,
          category: "Debtors",
        })
          .select("_id")
          .lean();

        if (!farmerLedger) {
          throw new NotFoundError(
            "Farmer ledger not found for this farmer storage link",
            "FARMER_LEDGER_NOT_FOUND",
          );
        }

        // Current store's Store Rent ledger (credit): cold-storage-level ledger for logged-in store admin.
        const loggedInColdStorageObj = new mongoose.Types.ObjectId(
          loggedInUserColdStorageId,
        );
        const storeRentLedger = await Ledger.findOne({
          coldStorageId: loggedInColdStorageObj,
          createdBy: createdByObjId,
          name: "Store Rent",
          farmerStorageLinkId: null,
        })
          .select("_id")
          .lean();

        if (!storeRentLedger) {
          throw new NotFoundError(
            "Store Rent ledger not found for the current store",
            "STORE_RENT_LEDGER_NOT_FOUND",
          );
        }

        const manualParchi = payload.manualParchiNumber?.trim();
        const narration = manualParchi
          ? `Voucher rent entry for gate pass no. ${gatePassNo}, manual parchi no. ${manualParchi}`
          : `Voucher rent entry for gate pass no. ${gatePassNo}`;
        const voucherNumber = await getNextJournalVoucherNumber(
          coldStorageId,
          linkIdObj,
        );

        const voucherParams: CreateVoucherParams = {
          creditLedgerId: new mongoose.Types.ObjectId(storeRentLedger._id),
          debitLedgerId: new mongoose.Types.ObjectId(farmerLedger._id),
          voucherNumber,
          amount,
          narration,
          coldStorageId: coldIdObj,
          farmerStorageLinkId: linkIdObj,
          createdBy: createdByObjId,
          date: payload.date,
        };
        await createVoucher(voucherParams);
      }
    }

    const populated = await IncomingGatePass.findById(doc._id)
      .populate({
        path: "farmerStorageLinkId",
        select: "accountNumber farmerId",
        populate: {
          path: "farmerId",
          select: "name address mobileNumber",
        },
      })
      .populate({ path: "createdBy", select: "name" })
      .lean();

    if (!populated) {
      return doc.toObject();
    }

    const raw = populated as unknown as Record<string, unknown>;
    type PopulatedLink = {
      accountNumber: number;
      farmerId: { name: string; address: string; mobileNumber: string };
    };
    const populatedLink = raw.farmerStorageLinkId as
      | PopulatedLink
      | null
      | undefined;
    type PopulatedAdmin = { _id: unknown; name: string };
    const populatedAdmin = raw.createdBy as PopulatedAdmin | null | undefined;

    const response = {
      ...raw,
      farmerStorageLinkId:
        populatedLink && populatedLink.farmerId
          ? {
              name: populatedLink.farmerId.name,
              accountNumber: populatedLink.accountNumber,
              address: populatedLink.farmerId.address,
              mobileNumber: populatedLink.farmerId.mobileNumber,
            }
          : raw.farmerStorageLinkId,
      createdBy: populatedAdmin
        ? { _id: populatedAdmin._id, name: populatedAdmin.name }
        : raw.createdBy,
    };

    return response;
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof ValidationError ||
      error instanceof ConflictError
    ) {
      throw error;
    }

    if (error instanceof mongoose.Error.ValidationError) {
      const messages = Object.values(error.errors).map((err) => err.message);
      throw new ValidationError(
        messages.join(", "),
        "MONGOOSE_VALIDATION_ERROR",
      );
    }

    if (error instanceof Error && "code" in error && error.code === 11000) {
      const mongooseError = error as Error & {
        keyPattern?: Record<string, unknown>;
      };
      const field = Object.keys(mongooseError.keyPattern || {})[0] || "field";
      throw new ConflictError(`${field} already exists`, "DUPLICATE_KEY_ERROR");
    }

    logger?.error(
      { error, payload },
      "Unexpected error creating incoming gate pass",
    );

    throw new AppError(
      "Failed to create incoming gate pass",
      500,
      "CREATE_INCOMING_GATE_PASS_ERROR",
    );
  }
}
