import { FastifyReply, FastifyRequest } from "fastify";
import type { AuthenticatedRequest } from "../../../utils/auth.js";
import {
  checkFarmerByMobileNumber,
  getFarmerStorageLinksByColdStorage,
  quickRegisterFarmer,
  updateFarmerStorageLink,
  getFarmerStorageLinkGatePasses,
} from "./farmer-storage-link.service.js";
import type {
  CheckFarmerMobileBody,
  QuickRegisterFarmerBody,
  UpdateFarmerStorageLinkInput,
  UpdateFarmerStorageLinkParams,
  GetFarmerStorageLinkGatePassesParams,
  GetFarmerStorageLinkGatePassesQuery,
} from "./farmer-storage-link.schema.js";
import { getFarmerStorageLinkGatePassesSchema } from "./farmer-storage-link.schema.js";
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

function getLinkedById(request: FastifyRequest): string | null {
  const req = request as AuthenticatedRequest;
  return req.user?.id ?? null;
}

function unauthorizedColdStorage(reply: FastifyReply) {
  return reply.code(401).send({
    success: false,
    error: {
      code: "UNAUTHORIZED",
      message: "Cold storage not associated with this account",
    },
  });
}

function unauthorizedUser(reply: FastifyReply) {
  return reply.code(401).send({
    success: false,
    error: {
      code: "UNAUTHORIZED",
      message: "User ID not found",
    },
  });
}

/**
 * Handler for GET / – list farmer-storage-links for the authenticated cold storage.
 */
export async function getFarmerStorageLinksByColdStorageHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const coldStorageId = getColdStorageId(request);
    if (!coldStorageId) {
      return unauthorizedColdStorage(reply);
    }

    const links = await getFarmerStorageLinksByColdStorage(
      coldStorageId,
      request.log,
    );

    return reply.send({
      success: true,
      data: links,
    });
  } catch (error) {
    request.log.error(
      { error },
      "Error in getFarmerStorageLinksByColdStorageHandler",
    );
    return sendErrorReply(reply, error);
  }
}

/**
 * Handler for POST /quick-register-farmer – register a new farmer for the current cold storage.
 */
export async function quickRegisterFarmerHandler(
  request: FastifyRequest<{ Body: QuickRegisterFarmerBody }>,
  reply: FastifyReply,
) {
  try {
    const coldStorageId = getColdStorageId(request);
    if (!coldStorageId) {
      return unauthorizedColdStorage(reply);
    }
    const linkedById = getLinkedById(request);
    if (!linkedById) {
      return unauthorizedUser(reply);
    }

    const result = await quickRegisterFarmer(
      {
        coldStorageId,
        linkedById,
        payload: request.body,
      },
      request.log,
    );

    return reply.code(201).send({
      success: true,
      data: result,
      message: "Farmer registered successfully",
    });
  } catch (error) {
    request.log.error(
      { error, body: request.body },
      "Error in quickRegisterFarmerHandler",
    );
    return sendErrorReply(reply, error);
  }
}

/**
 * Handler for PUT /:id – update a farmer-storage-link for the current cold storage.
 */
export async function updateFarmerStorageLinkHandler(
  request: FastifyRequest<{
    Params: UpdateFarmerStorageLinkParams;
    Body: UpdateFarmerStorageLinkInput;
  }>,
  reply: FastifyReply,
) {
  try {
    const coldStorageId = getColdStorageId(request);
    if (!coldStorageId) {
      return unauthorizedColdStorage(reply);
    }
    const storeAdminId = getLinkedById(request);

    const result = await updateFarmerStorageLink(
      request.params.id,
      request.body,
      coldStorageId,
      request.log,
      storeAdminId ?? undefined,
    );

    return reply.send({
      success: true,
      data: result,
      message: "Farmer-storage-link updated successfully",
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params, body: request.body },
      "Error in updateFarmerStorageLinkHandler",
    );
    return sendErrorReply(reply, error);
  }
}

/**
 * Handler for GET /:id/gate-passes – incoming and outgoing gate passes for a farmer-storage-link.
 */
export async function getFarmerStorageLinkGatePassesHandler(
  request: FastifyRequest<{
    Params: GetFarmerStorageLinkGatePassesParams;
    Querystring: GetFarmerStorageLinkGatePassesQuery;
  }>,
  reply: FastifyReply,
) {
  try {
    const coldStorageId = getColdStorageId(request);
    if (!coldStorageId) {
      return unauthorizedColdStorage(reply);
    }

    const parsed = getFarmerStorageLinkGatePassesSchema.safeParse({
      params: request.params,
      querystring: request.query ?? {},
    });
    if (!parsed.success) {
      const msg = parsed.error.flatten().formErrors?.[0] ?? "Invalid request";
      return reply.code(400).send({
        success: false,
        error: { code: "VALIDATION_ERROR", message: msg },
      });
    }

    const { id } = parsed.data.params;
    const { from, to, type, sortBy } = parsed.data.querystring;

    const result = await getFarmerStorageLinkGatePasses(
      id,
      coldStorageId,
      { from, to, type, sortBy },
      request.log,
    );

    if (result.status === "Fail" && result.message && !result.data) {
      return reply.code(200).send({
        status: result.status,
        message: result.message,
        summaries: result.summaries,
        pagination: result.pagination,
      });
    }

    if (
      result.status === "Fail" &&
      result.message?.includes("Invalid type parameter")
    ) {
      return reply.code(400).send({
        message: result.message,
      });
    }

    return reply.code(200).send({
      status: result.status,
      ...(result.data != null && { data: result.data }),
      summaries: result.summaries,
      pagination: result.pagination,
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params, query: request.query },
      "Error in getFarmerStorageLinkGatePassesHandler",
    );
    return sendErrorReply(reply, error);
  }
}
