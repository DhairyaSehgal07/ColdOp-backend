import {
  IncomingGatePass,
  GatePassType,
  GatePassStatus,
} from "./incoming-gate-pass.model.js";
import {
  CreateIncomingGatePassInput,
  UpdateIncomingGatePassBody,
} from "./incoming-gate-pass.schema.js";
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
import {
  applyVoucherBalances,
  reverseVoucherBalances,
} from "../../../utils/accounting/update-balances.js";
import {
  recordEditHistory,
  EditHistoryEntityType,
  EditHistoryAction,
} from "../edit-history/edit-history.service.js";
import Voucher from "../voucher/voucher.model.js";

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

    // Check showFinances upfront and create voucher BEFORE gate pass
    let rentEntryVoucherId: mongoose.Types.ObjectId | undefined;

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

        const voucherParams: CreateVoucherParams = {
          creditLedgerId: new mongoose.Types.ObjectId(storeRentLedger._id),
          debitLedgerId: new mongoose.Types.ObjectId(farmerLedger._id),
          amount,
          narration,
          coldStorageId: coldIdObj,
          farmerStorageLinkId: linkIdObj,
          createdBy: createdByObjId,
          date: payload.date,
        };
        const voucher = await createVoucher(voucherParams);
        rentEntryVoucherId = voucher._id;

        logger?.info(
          {
            voucherId: voucher._id,
            gatePassNo,
          },
          "Rent entry voucher created before gate pass",
        );
      }

      // Labour cost voucher: debit Labour, credit Labour Contractor when preferences.labourCost > 0
      const labourCost =
        preferences?.labourCost != null ? Number(preferences.labourCost) : 0;
      if (labourCost > 0 && Array.isArray(payload.bagSizes)) {
        const totalBags = payload.bagSizes.reduce(
          (sum, b) => sum + (b.initialQuantity ?? 0),
          0,
        );
        if (totalBags > 0) {
          const labourAmount = labourCost * totalBags;
          const createdByObjId = payload.createdById
            ? new mongoose.Types.ObjectId(payload.createdById)
            : createdById
              ? new mongoose.Types.ObjectId(createdById)
              : undefined;
          if (!createdByObjId) {
            throw new ValidationError(
              "Created by (store admin) is required to create labour voucher",
              "CREATED_BY_REQUIRED",
            );
          }
          const loggedInColdStorageObj = new mongoose.Types.ObjectId(
            loggedInUserColdStorageId,
          );
          const labourLedger = await Ledger.findOne({
            coldStorageId: loggedInColdStorageObj,
            createdBy: createdByObjId,
            name: "Labour",
            farmerStorageLinkId: null,
            isSystemLedger: true,
          })
            .select("_id")
            .lean();
          const labourContractorLedger = await Ledger.findOne({
            coldStorageId: loggedInColdStorageObj,
            createdBy: createdByObjId,
            name: "Labour Contractor",
            farmerStorageLinkId: null,
            isSystemLedger: true,
          })
            .select("_id")
            .lean();
          if (!labourLedger) {
            throw new NotFoundError(
              "Labour ledger not found for the current store",
              "LABOUR_LEDGER_NOT_FOUND",
            );
          }
          if (!labourContractorLedger) {
            throw new NotFoundError(
              "Labour Contractor ledger not found for the current store",
              "LABOUR_CONTRACTOR_LEDGER_NOT_FOUND",
            );
          }
          const coldIdObj = new mongoose.Types.ObjectId(coldStorageId);
          const labourNarration = `Labour cost for gate pass no. ${gatePassNo} (${totalBags} bags @ ${labourCost})`;
          const labourVoucherParams: CreateVoucherParams = {
            debitLedgerId: new mongoose.Types.ObjectId(labourLedger._id),
            creditLedgerId: new mongoose.Types.ObjectId(
              labourContractorLedger._id,
            ),
            amount: labourAmount,
            narration: labourNarration,
            coldStorageId: coldIdObj,
            farmerStorageLinkId: null,
            createdBy: createdByObjId,
            date: payload.date,
          };
          await createVoucher(labourVoucherParams);
          logger?.info(
            {
              gatePassNo,
              labourAmount,
              totalBags,
            },
            "Labour cost voucher created before gate pass",
          );
        }
      }
    }

    // Now create the gate pass with the voucher ID if it exists
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
      ...(payload.stockFilter !== undefined && {
        stockFilter: payload.stockFilter,
      }),
      ...(payload.customMarka !== undefined && {
        customMarka: payload.customMarka,
      }),
      ...(rentEntryVoucherId ? { rentEntryVoucherId } : {}),
    });

    logger?.info(
      {
        incomingGatePassId: doc._id,
        farmerStorageLinkId: payload.farmerStorageLinkId,
        gatePassNo: doc.gatePassNo,
        ...(rentEntryVoucherId ? { rentEntryVoucherId } : {}),
      },
      "Incoming gate pass created successfully",
    );

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

/** Sanitize a lean document for edit-history snapshot (serializable, no __v). */
function sanitizeForSnapshot(
  doc: Record<string, unknown> | null,
): Record<string, unknown> | undefined {
  if (!doc) return undefined;
  const out = { ...doc };
  delete out.__v;
  if (out._id && typeof out._id === "object" && "toString" in out._id) {
    out._id = (out._id as { toString(): string }).toString();
  }
  if (Array.isArray(out.bagSizes)) {
    out.bagSizes = out.bagSizes.map((b: unknown) => {
      const item = b as Record<string, unknown>;
      const copy = { ...item };
      if (copy.location && typeof copy.location === "object") {
        copy.location = { ...(copy.location as Record<string, unknown>) };
      }
      if (copy.paltaiLocation && typeof copy.paltaiLocation === "object") {
        copy.paltaiLocation = {
          ...(copy.paltaiLocation as Record<string, unknown>),
        };
      }
      return copy;
    });
  }
  return out;
}

/**
 * Updates an existing incoming gate pass.
 * Only OPEN gate passes can be edited. Updates both initial and current quantities when bagSizes are provided.
 * Uses a MongoDB transaction so the document update and edit-history entry succeed or roll back together.
 *
 * @param id - Incoming gate pass document _id
 * @param payload - Fields to update (date, variety, truckNumber, remarks, manualParchiNumber, bagSizes)
 * @param editedById - Store admin ID performing the edit (for edit history)
 * @param loggedInUserColdStorageId - Cold storage ID of the logged-in user (for auth scope)
 * @param logger - Optional logger instance
 * @returns Updated incoming gate pass document (populated)
 * @throws ValidationError if id invalid, no fields to update, or gate pass is closed
 * @throws NotFoundError if gate pass not found or not in user's cold storage
 */
export async function updateIncomingGatePass(
  id: string,
  payload: UpdateIncomingGatePassBody,
  editedById: string | undefined,
  loggedInUserColdStorageId: string | undefined,
  logger?: FastifyBaseLogger,
) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError(
      "Invalid incoming gate pass ID format",
      "INVALID_INCOMING_GATE_PASS_ID",
    );
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const idObj = new mongoose.Types.ObjectId(id);
    const existing = await IncomingGatePass.findById(idObj)
      .session(session)
      .lean();

    if (!existing) {
      logger?.warn({ id }, "Incoming gate pass not found for update");
      throw new NotFoundError(
        "Incoming gate pass not found",
        "INCOMING_GATE_PASS_NOT_FOUND",
      );
    }

    const linkId =
      typeof existing.farmerStorageLinkId === "object" &&
      existing.farmerStorageLinkId !== null &&
      "_id" in existing.farmerStorageLinkId
        ? (existing.farmerStorageLinkId as { _id: mongoose.Types.ObjectId })._id
        : existing.farmerStorageLinkId;
    const linkIdObj =
      typeof linkId === "object" ? linkId : new mongoose.Types.ObjectId(linkId);
    const storageLink = await FarmerStorageLink.findById(linkIdObj)
      .session(session)
      .lean();

    if (!storageLink) {
      throw new NotFoundError(
        "Incoming gate pass not found",
        "INCOMING_GATE_PASS_NOT_FOUND",
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
        { id, linkColdStorageId, loggedInUserColdStorageId },
        "Incoming gate pass does not belong to user's cold storage",
      );
      throw new NotFoundError(
        "Incoming gate pass not found",
        "INCOMING_GATE_PASS_NOT_FOUND",
      );
    }

    const status = (existing as { status?: string }).status;
    if (status === GatePassStatus.CLOSED) {
      throw new ValidationError(
        "Cannot edit a closed gate pass",
        "GATE_PASS_CLOSED",
      );
    }

    const coldStorageObj = await ColdStorage.findById(linkColdStorageId)
      .select("preferencesId")
      .lean();
    const preferences = coldStorageObj?.preferencesId
      ? await Preferences.findById(coldStorageObj.preferencesId).lean()
      : null;

    const rentEntryVoucherId = (
      existing as { rentEntryVoucherId?: mongoose.Types.ObjectId }
    ).rentEntryVoucherId;

    const updateFields: Record<string, unknown> = {};
    if (payload.date !== undefined) updateFields.date = payload.date;
    if (payload.variety !== undefined) updateFields.variety = payload.variety;
    if (payload.truckNumber !== undefined)
      updateFields.truckNumber = payload.truckNumber;
    if (payload.remarks !== undefined) updateFields.remarks = payload.remarks;
    if (payload.manualParchiNumber !== undefined)
      updateFields.manualParchiNumber = payload.manualParchiNumber;
    if (payload.stockFilter !== undefined)
      updateFields.stockFilter = payload.stockFilter;
    if (payload.customMarka !== undefined)
      updateFields.customMarka = payload.customMarka;
    if (payload.bagSizes !== undefined) {
      updateFields.bagSizes = payload.bagSizes.map((b) => ({
        name: b.name,
        initialQuantity: b.initialQuantity,
        currentQuantity: b.currentQuantity,
        location: b.location,
        ...(b.paltaiLocation && { paltaiLocation: b.paltaiLocation }),
      }));
    }

    const hasRentAmountUpdate =
      preferences?.showFinances === true &&
      payload.amount !== undefined &&
      payload.amount > 0 &&
      rentEntryVoucherId != null;

    // Only validate or update amount/voucher when cold storage has showFinances enabled
    if (preferences?.showFinances === true) {
      if (payload.amount !== undefined && payload.amount <= 0) {
        throw new ValidationError(
          "Rent entry amount must be greater than 0",
          "INVALID_AMOUNT",
        );
      }
      if (payload.amount !== undefined && rentEntryVoucherId == null) {
        throw new ValidationError(
          "This gate pass has no rent entry voucher; amount cannot be updated",
          "NO_RENT_ENTRY_VOUCHER",
        );
      }
    }

    if (hasRentAmountUpdate) {
      const rentVoucher = await Voucher.findById(rentEntryVoucherId)
        .session(session)
        .select("debitLedger creditLedger amount")
        .lean();
      if (!rentVoucher) {
        throw new NotFoundError(
          "Rent entry voucher not found",
          "RENT_VOUCHER_NOT_FOUND",
        );
      }
      const debitLedgerId =
        typeof rentVoucher.debitLedger === "object" &&
        rentVoucher.debitLedger != null
          ? (rentVoucher.debitLedger as mongoose.Types.ObjectId)
          : new mongoose.Types.ObjectId(rentVoucher.debitLedger);
      const creditLedgerId =
        typeof rentVoucher.creditLedger === "object" &&
        rentVoucher.creditLedger != null
          ? (rentVoucher.creditLedger as mongoose.Types.ObjectId)
          : new mongoose.Types.ObjectId(rentVoucher.creditLedger);
      const oldAmount = Number(rentVoucher.amount);
      const newAmount = payload.amount as number;

      await reverseVoucherBalances(
        debitLedgerId,
        creditLedgerId,
        oldAmount,
        session,
      );
      await applyVoucherBalances(
        debitLedgerId,
        creditLedgerId,
        newAmount,
        session,
      );

      const voucherUpdate: Record<string, unknown> = {
        amount: newAmount,
      };
      if (editedById) {
        voucherUpdate.updatedBy = new mongoose.Types.ObjectId(editedById);
      }
      await Voucher.findByIdAndUpdate(
        rentEntryVoucherId,
        { $set: voucherUpdate },
        { session },
      );
    }

    if (Object.keys(updateFields).length === 0 && !hasRentAmountUpdate) {
      throw new ValidationError(
        "No valid fields to update",
        "NO_UPDATE_FIELDS",
      );
    }

    const snapshotBefore = sanitizeForSnapshot(
      existing as unknown as Record<string, unknown>,
    );

    const updated = await IncomingGatePass.findByIdAndUpdate(
      idObj,
      { $set: updateFields },
      { new: true, session, runValidators: true, lean: true },
    );

    if (!updated) {
      throw new NotFoundError(
        "Incoming gate pass not found",
        "INCOMING_GATE_PASS_NOT_FOUND",
      );
    }

    const snapshotAfter = sanitizeForSnapshot(
      updated as unknown as Record<string, unknown>,
    );

    const changeParts: string[] = [];
    if (payload.date !== undefined) changeParts.push("date");
    if (payload.variety !== undefined) changeParts.push("variety");
    if (payload.truckNumber !== undefined) changeParts.push("truck number");
    if (payload.remarks !== undefined) changeParts.push("remarks");
    if (payload.manualParchiNumber !== undefined)
      changeParts.push("manual parchi number");
    if (payload.stockFilter !== undefined) changeParts.push("stock filter");
    if (payload.customMarka !== undefined) changeParts.push("custom marka");
    if (payload.bagSizes !== undefined)
      changeParts.push("quantities (initial & current)");
    if (hasRentAmountUpdate) changeParts.push("rent entry amount");
    const changeSummary = `Incoming gate pass updated: ${changeParts.join(", ")}`;

    await recordEditHistory({
      entityType: EditHistoryEntityType.INCOMING_GATE_PASS,
      documentId: idObj,
      coldStorageId: new mongoose.Types.ObjectId(linkColdStorageId),
      editedById,
      action: EditHistoryAction.UPDATE,
      changeSummary,
      snapshotBefore,
      snapshotAfter,
      session,
      logger,
    });

    await session.commitTransaction();

    logger?.info(
      { incomingGatePassId: id, updatedFields: Object.keys(updateFields) },
      "Incoming gate pass updated successfully",
    );

    const populated = await IncomingGatePass.findById(idObj)
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
      return updated as unknown as Record<string, unknown>;
    }

    const raw = populated as unknown as Record<string, unknown>;
    type PopulatedLink = {
      accountNumber: number;
      farmerId: { name: string; address: string; mobileNumber: string };
    };
    type PopulatedAdmin = { _id: unknown; name: string };
    const populatedLink = raw.farmerStorageLinkId as
      | PopulatedLink
      | null
      | undefined;
    const populatedAdmin = raw.createdBy as PopulatedAdmin | null | undefined;

    return {
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
  } catch (error) {
    await session.abortTransaction();
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
    const errObj = error as Record<string, unknown>;
    if (
      errObj?.name === "ValidationError" &&
      errObj.errors &&
      typeof errObj.errors === "object"
    ) {
      const messages = Object.values(
        errObj.errors as Record<string, { message?: string }>,
      ).map((err) => err?.message ?? "Validation failed");
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
      { error, id, payload },
      "Unexpected error updating incoming gate pass",
    );
    throw new AppError(
      "Failed to update incoming gate pass",
      500,
      "UPDATE_INCOMING_GATE_PASS_ERROR",
    );
  } finally {
    await session.endSession();
  }
}
