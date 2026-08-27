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
import {
  FARMER_STORAGE_LINK_FARMER_POPULATE_SELECT,
  FARMER_STORAGE_LINK_POPULATE_SELECT,
  formatPopulatedFarmerStorageLinkDisplay,
  type PopulatedFarmerStorageLink,
} from "../farmer-storage-link/farmer-storage-link.utils.js";

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
      select: FARMER_STORAGE_LINK_POPULATE_SELECT,
      populate: {
        path: "farmerId",
        select: FARMER_STORAGE_LINK_FARMER_POPULATE_SELECT,
      },
    })
    .populate({ path: "createdBy", select: "name" })
    .lean();

  type PopulatedAdmin = { _id: unknown; name: string };

  return list.map((raw) => {
    const row = raw as unknown as Record<string, unknown>;
    const populatedLink = row.farmerStorageLinkId as
      | PopulatedFarmerStorageLink
      | null
      | undefined;
    const populatedAdmin = row.createdBy as PopulatedAdmin | null | undefined;
    const linkDisplay = formatPopulatedFarmerStorageLinkDisplay(populatedLink);
    return {
      ...row,
      farmerStorageLinkId: linkDisplay ?? row.farmerStorageLinkId,
      createdBy: populatedAdmin
        ? { _id: populatedAdmin._id, name: populatedAdmin.name }
        : row.createdBy,
    };
  });
}

export interface IncomingGatePassReportOptions {
  dateFrom?: string;
  dateTo?: string;
}

export interface IncomingGatePassReportResult {
  incomingGatePasses: Record<string, unknown>[];
  initialTotal: number;
  currentTotal: number;
}

type PopulatedAdmin = { _id: unknown; name: string };

type PopulatedLinkWithId = PopulatedFarmerStorageLink & { _id?: unknown };

function mapIncomingGatePassToReport(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const populatedLink = raw.farmerStorageLinkId as
    | PopulatedLinkWithId
    | null
    | undefined;
  const populatedAdmin = raw.createdBy as PopulatedAdmin | null | undefined;
  const linkDisplay = formatPopulatedFarmerStorageLinkDisplay(populatedLink);

  const bagSizes =
    (raw.bagSizes as {
      initialQuantity?: number;
      currentQuantity?: number;
    }[]) ?? [];
  const initialTotal = bagSizes.reduce(
    (sum, bag) => sum + (bag.initialQuantity ?? 0),
    0,
  );
  const currentTotal = bagSizes.reduce(
    (sum, bag) => sum + (bag.currentQuantity ?? 0),
    0,
  );

  const report: Record<string, unknown> = {
    _id:
      typeof raw._id === "object" && raw._id !== null && "toString" in raw._id
        ? (raw._id as { toString: () => string }).toString()
        : raw._id,
    gatePassNo: raw.gatePassNo,
    date:
      raw.date instanceof Date
        ? raw.date.toISOString()
        : raw.date,
    type: raw.type,
    variety: raw.variety,
    status: raw.status,
    bagSizes: raw.bagSizes,
    initialTotal,
    currentTotal,
    farmerStorageLinkId: linkDisplay
      ? {
          _id:
            populatedLink?._id != null
              ? typeof populatedLink._id === "object" &&
                populatedLink._id !== null &&
                "toString" in populatedLink._id
                ? (
                    populatedLink._id as { toString: () => string }
                  ).toString()
                : populatedLink._id
              : undefined,
          ...linkDisplay,
        }
      : raw.farmerStorageLinkId,
  };

  if (raw.manualParchiNumber != null && raw.manualParchiNumber !== "") {
    report.manualParchiNumber = raw.manualParchiNumber;
  }
  if (raw.truckNumber != null && raw.truckNumber !== "") {
    report.truckNumber = raw.truckNumber;
  }
  if (raw.remarks != null && raw.remarks !== "") {
    report.remarks = raw.remarks;
  }
  if (raw.stockFilter != null && raw.stockFilter !== "") {
    report.stockFilter = raw.stockFilter;
  }
  if (raw.customMarka != null && raw.customMarka !== "") {
    report.customMarka = raw.customMarka;
  }
  if (populatedAdmin) {
    report.createdBy = {
      _id: populatedAdmin._id,
      name: populatedAdmin.name,
    };
  }

  return report;
}

/**
 * Get all incoming gate passes for a cold storage as a report (no pagination).
 * Optional dateFrom/dateTo filter on gate pass date (UTC day boundaries).
 */
function sumBagQuantityAcrossPasses(
  passes: { bagSizes?: { initialQuantity?: number; currentQuantity?: number }[] }[],
  field: "initialQuantity" | "currentQuantity",
): number {
  return passes.reduce((sum, pass) => {
    const bagSizes = pass.bagSizes ?? [];
    return (
      sum +
      bagSizes.reduce((bagSum, bag) => bagSum + (bag[field] ?? 0), 0)
    );
  }, 0);
}

export async function getIncomingGatePassReport(
  coldStorageId: string,
  options: IncomingGatePassReportOptions = {},
  logger?: FastifyBaseLogger,
): Promise<IncomingGatePassReportResult> {
  try {
    if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
      throw new ValidationError(
        "Invalid cold storage ID format",
        "INVALID_COLD_STORAGE_ID",
      );
    }

    const { dateFrom, dateTo } = options;
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

    if (dateFrom != null && dateFrom !== "" && !isoDateRegex.test(dateFrom)) {
      throw new ValidationError(
        "Invalid dateFrom format. Use ISO date, e.g. 2026-03-01",
        "INVALID_DATE_FROM",
      );
    }
    if (dateTo != null && dateTo !== "" && !isoDateRegex.test(dateTo)) {
      throw new ValidationError(
        "Invalid dateTo format. Use ISO date, e.g. 2026-03-07",
        "INVALID_DATE_TO",
      );
    }

    const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);
    const linkIds = await FarmerStorageLink.distinct("_id", {
      coldStorageId: coldStorageObjectId,
    });

    if (linkIds.length === 0) {
      logger?.info(
        { coldStorageId, dateFrom, dateTo },
        "Incoming gate pass report: no farmer-storage links",
      );
      return { incomingGatePasses: [], initialTotal: 0, currentTotal: 0 };
    }

    const filter: Record<string, unknown> = {
      farmerStorageLinkId: { $in: linkIds },
    };

    if (dateFrom || dateTo) {
      const dateConditions: Record<string, Date> = {};
      if (dateFrom) {
        const from = new Date(dateFrom);
        from.setUTCHours(0, 0, 0, 0);
        dateConditions.$gte = from;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setUTCHours(23, 59, 59, 999);
        dateConditions.$lte = to;
      }
      filter.date = dateConditions;
    }

    const list = await IncomingGatePass.find(filter)
      .sort({ gatePassNo: -1, date: -1 })
      .populate({
        path: "farmerStorageLinkId",
        select: FARMER_STORAGE_LINK_POPULATE_SELECT,
        populate: {
          path: "farmerId",
          select: FARMER_STORAGE_LINK_FARMER_POPULATE_SELECT,
        },
      })
      .populate({ path: "createdBy", select: "name" })
      .lean();

    const incomingGatePasses = list.map((raw) =>
      mapIncomingGatePassToReport(raw as unknown as Record<string, unknown>),
    );

    const initialTotal = sumBagQuantityAcrossPasses(list, "initialQuantity");
    const currentTotal = sumBagQuantityAcrossPasses(list, "currentQuantity");

    logger?.info(
      {
        coldStorageId,
        count: incomingGatePasses.length,
        initialTotal,
        currentTotal,
        dateFrom,
        dateTo,
      },
      "Incoming gate pass report retrieved",
    );

    return { incomingGatePasses, initialTotal, currentTotal };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    logger?.error({ error, coldStorageId }, "Error retrieving incoming gate pass report");
    throw new AppError(
      "Failed to retrieve incoming gate pass report",
      500,
      "GET_INCOMING_GATE_PASS_REPORT_ERROR",
    );
  }
}

import { ColdStorage } from "../cold-storage/cold-storage.model.js";
import Ledger from "../ledger/ledger.model.js";
import { Preferences } from "../preferences/preferences.model.js";
import { getNextVoucherNumber } from "../store-admin/store-admin.service.js";
import {
  createVoucher,
  findLabourThekedarLedger,
  type CreateVoucherParams,
} from "../../../utils/accounting/helper-fns.js";
import {
  applyVoucherBalances,
  reverseVoucherBalances,
} from "../../../utils/accounting/update-balances.js";
import {
  buildIncomingGatePassAuditStates,
  recordIncomingGatePassAudit,
} from "./incoming-gate-pass-audit.service.js";
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

        // Current store's Store Rent ledger (credit): cold-storage-level ledger.
        const loggedInColdStorageObj = new mongoose.Types.ObjectId(
          loggedInUserColdStorageId,
        );
        const storeRentLedger = await Ledger.findOne({
          coldStorageId: loggedInColdStorageObj,
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

      // Labour cost voucher: debit Labour, credit Labour Thekedar when preferences.labourCost > 0
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
            name: "Labour",
            farmerStorageLinkId: null,
            isSystemLedger: true,
          })
            .select("_id")
            .lean();
          const labourThekedarLedger = await findLabourThekedarLedger(
            loggedInColdStorageObj,
          );
          if (!labourLedger) {
            throw new NotFoundError(
              "Labour ledger not found for the current store",
              "LABOUR_LEDGER_NOT_FOUND",
            );
          }
          if (!labourThekedarLedger) {
            throw new NotFoundError(
              "Labour Thekedar ledger not found for the current store",
              "LABOUR_CONTRACTOR_LEDGER_NOT_FOUND",
            );
          }
          const coldIdObj = new mongoose.Types.ObjectId(coldStorageId);
          const labourNarration = `Labour cost for gate pass no. ${gatePassNo} (${totalBags} bags @ ${labourCost})`;
          const labourVoucherParams: CreateVoucherParams = {
            debitLedgerId: new mongoose.Types.ObjectId(labourLedger._id),
            creditLedgerId: new mongoose.Types.ObjectId(
              labourThekedarLedger._id,
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
        select: FARMER_STORAGE_LINK_POPULATE_SELECT,
        populate: {
          path: "farmerId",
          select: FARMER_STORAGE_LINK_FARMER_POPULATE_SELECT,
        },
      })
      .populate({ path: "createdBy", select: "name" })
      .lean();

    if (!populated) {
      return doc.toObject();
    }

    const raw = populated as unknown as Record<string, unknown>;
    const populatedLink = raw.farmerStorageLinkId as
      | PopulatedFarmerStorageLink
      | null
      | undefined;
    type PopulatedAdmin = { _id: unknown; name: string };
    const populatedAdmin = raw.createdBy as PopulatedAdmin | null | undefined;
    const linkDisplay = formatPopulatedFarmerStorageLinkDisplay(populatedLink);

    const response = {
      ...raw,
      farmerStorageLinkId: linkDisplay ?? raw.farmerStorageLinkId,
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

export interface UpdateIncomingGatePassAuditContext {
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Updates an existing incoming gate pass.
 * Only OPEN gate passes can be edited. Updates both initial and current quantities when bagSizes are provided.
 * Uses a MongoDB transaction so the document update and audit entry succeed or roll back together.
 *
 * @param id - Incoming gate pass document _id
 * @param payload - Fields to update (date, variety, truckNumber, remarks, manualParchiNumber, bagSizes)
 * @param editedById - Store admin ID performing the edit (for audit)
 * @param loggedInUserColdStorageId - Cold storage ID of the logged-in user (for auth scope)
 * @param logger - Optional logger instance
 * @param auditContext - Optional request metadata (ipAddress, userAgent) for audit
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
  auditContext?: UpdateIncomingGatePassAuditContext,
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
    let rentCostLink = storageLink;

    if (payload.farmerStorageLinkId !== undefined) {
      const newLinkIdObj = new mongoose.Types.ObjectId(
        payload.farmerStorageLinkId,
      );
      const newLink = await FarmerStorageLink.findById(newLinkIdObj)
        .session(session)
        .lean();
      if (!newLink) {
        throw new NotFoundError(
          "Farmer-storage-link not found",
          "FARMER_STORAGE_LINK_NOT_FOUND",
        );
      }
      rentCostLink = newLink;
      const newLinkColdStorageId =
        typeof newLink.coldStorageId === "object" &&
        newLink.coldStorageId !== null
          ? (
              newLink.coldStorageId as { _id: mongoose.Types.ObjectId }
            )._id.toString()
          : (newLink.coldStorageId as string);
      if (
        loggedInUserColdStorageId &&
        newLinkColdStorageId !== loggedInUserColdStorageId
      ) {
        throw new NotFoundError(
          "Farmer-storage-link not found",
          "FARMER_STORAGE_LINK_NOT_FOUND",
        );
      }
      updateFields.farmerStorageLinkId = newLinkIdObj;
    }
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
        ...(b.previousLocation?.length && {
          previousLocation: b.previousLocation,
        }),
      }));
    }

    const bagSizesChanged = payload.bagSizes !== undefined;
    const farmerChanged = payload.farmerStorageLinkId !== undefined;
    const dateChanged = payload.date !== undefined;
    const explicitAmountUpdate =
      payload.amount !== undefined && payload.amount > 0;
    const rentFinanceFieldsChanged =
      bagSizesChanged ||
      farmerChanged ||
      explicitAmountUpdate ||
      dateChanged;

    const shouldUpdateRentVoucher =
      preferences?.showFinances === true &&
      rentEntryVoucherId != null &&
      rentFinanceFieldsChanged;

    // Only validate or update amount/voucher when cold storage has showFinances enabled
    if (preferences?.showFinances === true) {
      if (payload.amount !== undefined && payload.amount <= 0) {
        throw new ValidationError(
          "Rent entry amount must be greater than 0",
          "INVALID_AMOUNT",
        );
      }
      if (rentFinanceFieldsChanged && rentEntryVoucherId == null) {
        throw new ValidationError(
          "This gate pass has no rent entry voucher; rent-related fields cannot be updated",
          "NO_RENT_ENTRY_VOUCHER",
        );
      }
    }

    let rentAmountBefore: number | undefined;
    let rentAmountAfter: number | undefined;
    let rentVoucherSynced = false;

    if (shouldUpdateRentVoucher) {
      const rentVoucher = await Voucher.findById(rentEntryVoucherId)
        .session(session)
        .select("debitLedger creditLedger amount date farmerStorageLinkId")
        .lean();
      if (!rentVoucher) {
        throw new NotFoundError(
          "Rent entry voucher not found",
          "RENT_VOUCHER_NOT_FOUND",
        );
      }

      const oldDebitLedgerId = new mongoose.Types.ObjectId(
        (
          rentVoucher.debitLedger as mongoose.Types.ObjectId | string
        ).toString(),
      );
      const oldCreditLedgerId = new mongoose.Types.ObjectId(
        (
          rentVoucher.creditLedger as mongoose.Types.ObjectId | string
        ).toString(),
      );
      const oldAmount = Number(rentVoucher.amount);

      let newRentAmount: number;
      if (bagSizesChanged || farmerChanged) {
        const costPerBag = (rentCostLink as { costPerBag?: number }).costPerBag;
        if (costPerBag == null || costPerBag <= 0) {
          throw new ValidationError(
            "costPerBag must be set on the farmer storage link to recalculate rent voucher amount",
            "COST_PER_BAG_REQUIRED",
          );
        }
        const bagsForRent = bagSizesChanged
          ? payload.bagSizes!
          : ((existing as { bagSizes?: Array<{ initialQuantity?: number }> })
              .bagSizes ?? []);
        const totalBags = bagsForRent.reduce(
          (sum, b) => sum + (b.initialQuantity ?? 0),
          0,
        );
        newRentAmount = costPerBag * totalBags;
      } else if (explicitAmountUpdate) {
        newRentAmount = payload.amount as number;
      } else {
        // Date-only: keep existing voucher amount
        newRentAmount = oldAmount;
      }

      if (newRentAmount <= 0) {
        throw new ValidationError(
          "Rent entry amount must be greater than 0",
          "INVALID_AMOUNT",
        );
      }

      let newDebitLedgerId = oldDebitLedgerId;
      let newCreditLedgerId = oldCreditLedgerId;
      let newFarmerStorageLinkId: mongoose.Types.ObjectId | undefined;

      if (farmerChanged) {
        const newLinkIdObj = new mongoose.Types.ObjectId(
          payload.farmerStorageLinkId,
        );
        newFarmerStorageLinkId = newLinkIdObj;
        const coldIdObj = new mongoose.Types.ObjectId(linkColdStorageId);

        const farmerLedger = await Ledger.findOne({
          coldStorageId: coldIdObj,
          farmerStorageLinkId: newLinkIdObj,
          category: "Debtors",
        })
          .session(session)
          .select("_id")
          .lean();

        if (!farmerLedger) {
          throw new NotFoundError(
            "Farmer ledger not found for this farmer storage link",
            "FARMER_LEDGER_NOT_FOUND",
          );
        }

        const storeRentLedger = await Ledger.findOne({
          coldStorageId: coldIdObj,
          name: "Store Rent",
          farmerStorageLinkId: null,
        })
          .session(session)
          .select("_id")
          .lean();

        if (!storeRentLedger) {
          throw new NotFoundError(
            "Store Rent ledger not found for the current store",
            "STORE_RENT_LEDGER_NOT_FOUND",
          );
        }

        newDebitLedgerId = new mongoose.Types.ObjectId(farmerLedger._id);
        newCreditLedgerId = new mongoose.Types.ObjectId(storeRentLedger._id);
      }

      const oldDebitStr = oldDebitLedgerId.toString();
      const oldCreditStr = oldCreditLedgerId.toString();
      const newDebitStr = newDebitLedgerId.toString();
      const newCreditStr = newCreditLedgerId.toString();
      const amountChanged = Number(newRentAmount) !== Number(oldAmount);
      const debitLedgerChanged = newDebitStr !== oldDebitStr;
      const creditLedgerChanged = newCreditStr !== oldCreditStr;
      // Bags / farmer / explicit amount always reverse+reapply so Store Rent + debtor
      // balances stay in sync even when the numeric amount is unchanged.
      const needsBalanceUpdate =
        bagSizesChanged ||
        farmerChanged ||
        explicitAmountUpdate ||
        amountChanged ||
        debitLedgerChanged ||
        creditLedgerChanged;

      if (needsBalanceUpdate) {
        await reverseVoucherBalances(
          oldDebitLedgerId,
          oldCreditLedgerId,
          oldAmount,
          session,
        );
        await applyVoucherBalances(
          newDebitLedgerId,
          newCreditLedgerId,
          newRentAmount,
          session,
        );
      }

      const voucherUpdate: Record<string, unknown> = {};
      if (needsBalanceUpdate || amountChanged) {
        voucherUpdate.amount = newRentAmount;
      }
      if (farmerChanged) {
        voucherUpdate.debitLedger = newDebitLedgerId;
        voucherUpdate.creditLedger = newCreditLedgerId;
        voucherUpdate.farmerStorageLinkId = newFarmerStorageLinkId;
      }
      if (dateChanged) {
        voucherUpdate.date = payload.date;
      }
      if (editedById) {
        voucherUpdate.updatedBy = new mongoose.Types.ObjectId(editedById);
      }

      if (Object.keys(voucherUpdate).length > 0) {
        await Voucher.findByIdAndUpdate(
          rentEntryVoucherId,
          { $set: voucherUpdate },
          { session, runValidators: true },
        );
        rentVoucherSynced = true;
        logger?.info(
          {
            rentEntryVoucherId: rentEntryVoucherId.toString(),
            oldAmount,
            newRentAmount,
            amountChanged,
            farmerChanged,
            bagSizesChanged,
            dateChanged,
            debitLedgerChanged,
            creditLedgerChanged,
          },
          "Rent entry voucher synced on incoming gate pass edit",
        );
      }

      if (amountChanged || needsBalanceUpdate) {
        rentAmountBefore = oldAmount;
        rentAmountAfter = newRentAmount;
      }
    }

    // Keep labour cost voucher in sync when bag sizes change (labourCost × net bags).
    if (
      preferences?.showFinances === true &&
      bagSizesChanged &&
      preferences.labourCost != null &&
      Number(preferences.labourCost) > 0
    ) {
      const labourCost = Number(preferences.labourCost);
      const bagsForLabour = payload.bagSizes!;
      const totalBags = bagsForLabour.reduce(
        (sum, b) => sum + (b.initialQuantity ?? 0),
        0,
      );
      if (totalBags > 0) {
        const gatePassNo = (existing as { gatePassNo?: number }).gatePassNo;
        const coldIdObj = new mongoose.Types.ObjectId(linkColdStorageId);
        if (gatePassNo != null) {
          const labourVoucher = await Voucher.findOne({
            coldStorageId: coldIdObj,
            narration: {
              $regex: `^Labour cost for gate pass no\\. ${gatePassNo}\\b`,
            },
          })
            .session(session)
            .select("debitLedger creditLedger amount")
            .lean();

          if (labourVoucher) {
            const newLabourAmount = labourCost * totalBags;
            const oldLabourAmount = Number(labourVoucher.amount);
            if (newLabourAmount > 0 && newLabourAmount !== oldLabourAmount) {
              const labourDebitId =
                typeof labourVoucher.debitLedger === "object" &&
                labourVoucher.debitLedger != null
                  ? (labourVoucher.debitLedger as mongoose.Types.ObjectId)
                  : new mongoose.Types.ObjectId(labourVoucher.debitLedger);
              const labourCreditId =
                typeof labourVoucher.creditLedger === "object" &&
                labourVoucher.creditLedger != null
                  ? (labourVoucher.creditLedger as mongoose.Types.ObjectId)
                  : new mongoose.Types.ObjectId(labourVoucher.creditLedger);

              await reverseVoucherBalances(
                labourDebitId,
                labourCreditId,
                oldLabourAmount,
                session,
              );
              await applyVoucherBalances(
                labourDebitId,
                labourCreditId,
                newLabourAmount,
                session,
              );

              const labourNarration = `Labour cost for gate pass no. ${gatePassNo} (${totalBags} bags @ ${labourCost})`;
              const labourUpdate: Record<string, unknown> = {
                amount: newLabourAmount,
                narration: labourNarration,
              };
              if (editedById) {
                labourUpdate.updatedBy = new mongoose.Types.ObjectId(
                  editedById,
                );
              }
              await Voucher.findByIdAndUpdate(
                labourVoucher._id,
                { $set: labourUpdate },
                { session, runValidators: true },
              );
              logger?.info(
                {
                  labourVoucherId: labourVoucher._id.toString(),
                  oldLabourAmount,
                  newLabourAmount,
                  totalBags,
                },
                "Labour cost voucher synced on incoming gate pass edit",
              );
            }
          }
        }
      }
    }

    if (Object.keys(updateFields).length === 0 && !rentVoucherSynced) {
      throw new ValidationError(
        "No valid fields to update",
        "NO_UPDATE_FIELDS",
      );
    }

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

    const { previousState, modifiedState } = buildIncomingGatePassAuditStates({
      existing: existing as unknown as Record<string, unknown>,
      updated: updated as unknown as Record<string, unknown>,
      changedGatePassFields: Object.keys(updateFields),
      rentAmountBefore,
      rentAmountAfter,
    });

    await recordIncomingGatePassAudit({
      incomingGatePassId: idObj,
      editedById,
      previousState,
      modifiedState,
      ipAddress: auditContext?.ipAddress,
      userAgent: auditContext?.userAgent,
      session,
      logger,
    });

    await session.commitTransaction();

    logger?.info(
      {
        incomingGatePassId: id,
        updatedFields: Object.keys(updateFields),
        rentVoucherSynced,
        rentAmountBefore,
        rentAmountAfter,
      },
      "Incoming gate pass updated successfully",
    );

    const populated = await IncomingGatePass.findById(idObj)
      .populate({
        path: "farmerStorageLinkId",
        select: FARMER_STORAGE_LINK_POPULATE_SELECT,
        populate: {
          path: "farmerId",
          select: FARMER_STORAGE_LINK_FARMER_POPULATE_SELECT,
        },
      })
      .populate({ path: "createdBy", select: "name" })
      .populate({
        path: "rentEntryVoucherId",
        select:
          "voucherNumber date amount debitLedger creditLedger farmerStorageLinkId narration updatedAt",
        populate: [
          { path: "debitLedger", select: "name category" },
          { path: "creditLedger", select: "name category" },
        ],
      })
      .lean();

    if (!populated) {
      return updated as unknown as Record<string, unknown>;
    }

    const raw = populated as unknown as Record<string, unknown>;
    type PopulatedAdmin = { _id: unknown; name: string };
    const populatedLink = raw.farmerStorageLinkId as
      | PopulatedFarmerStorageLink
      | null
      | undefined;
    const populatedAdmin = raw.createdBy as PopulatedAdmin | null | undefined;
    const linkDisplay = formatPopulatedFarmerStorageLinkDisplay(populatedLink);

    return {
      ...raw,
      farmerStorageLinkId: linkDisplay ?? raw.farmerStorageLinkId,
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
