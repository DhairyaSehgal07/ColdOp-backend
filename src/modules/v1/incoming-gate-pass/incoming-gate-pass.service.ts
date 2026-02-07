import { IncomingGatePass } from "./incoming-gate-pass.model.js";
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
import { getNextVoucherNumber } from "../store-admin/store-admin.service.js";

/**
 * Creates a new incoming gate pass.
 * Resolves farmer-storage-link, gets next gate pass number for the cold storage, then creates the document.
 *
 * @param payload - Create body (farmerStorageLinkId, date, type, variety, truckNumber, bagSizes, remarks?)
 * @param createdById - Optional store admin ID (from auth)
 * @param logger - Optional logger instance
 * @returns Created incoming gate pass document
 * @throws NotFoundError if farmer-storage-link not found
 * @throws ValidationError if input validation fails
 * @throws ConflictError on duplicate gate pass number (unique index)
 */
export async function createIncomingGatePass(
  payload: CreateIncomingGatePassInput,
  createdById: string | undefined,
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
      "incoming-gate-pass",
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
      type: payload.type,
      variety: payload.variety,
      ...(payload.truckNumber !== undefined && payload.truckNumber !== ""
        ? { truckNumber: payload.truckNumber }
        : {}),
      bagSizes: payload.bagSizes,
      remarks: payload.remarks,
    });

    logger?.info(
      {
        incomingGatePassId: doc._id,
        farmerStorageLinkId: payload.farmerStorageLinkId,
        gatePassNo: doc.gatePassNo,
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
