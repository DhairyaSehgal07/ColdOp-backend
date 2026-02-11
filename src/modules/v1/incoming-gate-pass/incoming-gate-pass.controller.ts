import { FastifyReply, FastifyRequest } from "fastify";
import {
  createIncomingGatePass,
  getIncomingGatePassesByFarmerStorageLinkId,
} from "./incoming-gate-pass.service.js";
import { CreateIncomingGatePassInput } from "./incoming-gate-pass.schema.js";
import { AppError } from "../../../utils/errors.js";
import type { AuthenticatedRequest } from "../../../utils/auth.js";

function getLoggedInUserColdStorageId(
  request: FastifyRequest,
): string | undefined {
  const req = request as AuthenticatedRequest;
  if (!req.user?.coldStorageId) return undefined;
  return typeof req.user.coldStorageId === "object" &&
    req.user.coldStorageId !== null &&
    "_id" in req.user.coldStorageId
    ? (req.user.coldStorageId as { _id: string })._id
    : (req.user.coldStorageId as string);
}

/** Centralized error reply: AppError → statusCode + code/message; else 500. */
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
 * Handler for creating a new incoming gate pass
 */
export async function createIncomingGatePassHandler(
  request: FastifyRequest<{ Body: CreateIncomingGatePassInput }>,
  reply: FastifyReply,
) {
  try {
    const req = request as AuthenticatedRequest;
    const createdById = req.user?.id;
    const loggedInUserColdStorageId = getLoggedInUserColdStorageId(request);

    const incomingGatePass = await createIncomingGatePass(
      request.body,
      createdById,
      loggedInUserColdStorageId,
      request.log,
    );

    return reply.code(201).send({
      success: true,
      data: incomingGatePass,
      message: "Incoming gate pass created successfully",
    });
  } catch (error) {
    request.log.error(
      { error, body: request.body },
      "Error in createIncomingGatePassHandler",
    );
    return sendErrorReply(reply, error);
  }
}

/**
 * Handler for listing all incoming gate passes for a farmer-storage-link
 */
export async function getIncomingGatePassesByFarmerStorageLinkIdHandler(
  request: FastifyRequest<{
    Params: { farmerStorageLinkId: string };
  }>,
  reply: FastifyReply,
) {
  try {
    const { farmerStorageLinkId } = request.params;
    const loggedInUserColdStorageId = getLoggedInUserColdStorageId(request);

    const list = await getIncomingGatePassesByFarmerStorageLinkId(
      farmerStorageLinkId,
      loggedInUserColdStorageId,
      request.log,
    );

    return reply.code(200).send({
      success: true,
      data: list,
      message: "Incoming gate passes retrieved successfully",
    });
  } catch (error) {
    request.log.error(
      { error, farmerStorageLinkId: request.params?.farmerStorageLinkId },
      "Error in getIncomingGatePassesByFarmerStorageLinkIdHandler",
    );
    return sendErrorReply(reply, error);
  }
}
