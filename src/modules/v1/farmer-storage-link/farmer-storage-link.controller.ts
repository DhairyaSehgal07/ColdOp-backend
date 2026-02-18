import { FastifyReply, FastifyRequest } from "fastify";
import type { AuthenticatedRequest } from "../../../utils/auth.js";
import {
  checkFarmerByMobileNumber,
  linkFarmerToStore,
} from "./farmer-storage-link.service.js";
import type {
  CheckFarmerMobileBody,
  LinkFarmerToStoreBody,
} from "./farmer-storage-link.schema.js";
import { AppError } from "../../../utils/errors.js";

function sendErrorReply(
  reply: FastifyReply,
  error: unknown,
): ReturnType<FastifyReply["send"]> {
  if (error instanceof AppError) {
    return reply.code(error.statusCode).send({
      success: false,
      error: { code: error.code, message: error.message },
    });
  }
  const message =
    error instanceof Error ? error.message : "An unexpected error occurred";
  return reply.code(500).send({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message:
        process.env.NODE_ENV === "development"
          ? message
          : "An unexpected error occurred",
    },
  });
}

/**
 * Handler for POST /check – check if a farmer exists with the given mobile number.
 */
export async function checkFarmerMobileHandler(
  request: FastifyRequest<{ Body: CheckFarmerMobileBody }>,
  reply: FastifyReply,
) {
  try {
    const result = await checkFarmerByMobileNumber(
      request.body.mobileNumber,
      request.log,
    );

    if (result.exists && result.farmer) {
      return reply.send({
        success: true,
        message: "A farmer with this mobile number already exists",
        data: { farmer: result.farmer },
      });
    }

    return reply.send({
      success: true,
      message: "mobile number available",
    });
  } catch (error) {
    request.log.error(
      { error, body: request.body },
      "Error in checkFarmerMobileHandler",
    );
    return sendErrorReply(reply, error);
  }
}

function getColdStorageId(request: FastifyRequest): string | null {
  const req = request as AuthenticatedRequest;
  const raw = req.user?.coldStorageId;
  if (!raw) return null;
  return typeof raw === "object" && raw !== null && "_id" in raw
    ? raw._id
    : (raw as string);
}

/**
 * Handler for POST /link-farmer-to-store – link existing farmer to current cold storage.
 */
export async function linkFarmerToStoreHandler(
  request: FastifyRequest<{ Body: LinkFarmerToStoreBody }>,
  reply: FastifyReply,
) {
  try {
    const req = request as AuthenticatedRequest;
    const coldStorageId = getColdStorageId(request);
    if (!coldStorageId) {
      return reply.code(401).send({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Cold storage not associated with this account",
        },
      });
    }
    const linkedById = req.user?.id;
    if (!linkedById) {
      return reply.code(401).send({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "User ID not found",
        },
      });
    }

    const result = await linkFarmerToStore(
      {
        coldStorageId,
        linkedById,
        payload: request.body,
      },
      request.log,
    );

    return reply.send({
      success: true,
      message: "Farmer linked to store successfully",
      data: result,
    });
  } catch (error) {
    request.log.error(
      { error, body: request.body },
      "Error in linkFarmerToStoreHandler",
    );
    return sendErrorReply(reply, error);
  }
}
