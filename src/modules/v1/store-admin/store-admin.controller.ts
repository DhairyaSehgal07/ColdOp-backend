import { FastifyReply, FastifyRequest } from "fastify";
import {
  createStoreAdmin,
  getStoreAdminById,
  updateStoreAdmin,
  deleteStoreAdmin,
  checkMobileNumber,
  getFarmerStorageLinksByColdStorage,
  loginStoreAdmin,
  logoutStoreAdmin,
  quickRegisterFarmer,
  updateFarmerStorageLink,
} from "./store-admin.service.js";
import {
  CreateStoreAdminInput,
  GetStoreAdminByIdParams,
  UpdateStoreAdminInput,
  UpdateStoreAdminParams,
  DeleteStoreAdminParams,
  CheckMobileNumberQuery,
  LoginStoreAdminInput,
  QuickRegisterFarmerInput,
  UpdateFarmerStorageLinkInput,
  UpdateFarmerStorageLinkParams,
} from "./store-admin.schema.js";
import { AppError } from "../../../utils/errors.js";
import type { AuthenticatedRequest } from "../../../utils/auth.js";

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
 * Handler for creating a new store admin
 */
export async function createStoreAdminHandler(
  request: FastifyRequest<{ Body: CreateStoreAdminInput }>,
  reply: FastifyReply,
) {
  try {
    const storeAdmin = await createStoreAdmin(request.body, request.log);

    return reply.code(201).send({
      success: true,
      data: storeAdmin,
      message: "Store admin created successfully",
    });
  } catch (error) {
    request.log.error(
      { error, body: request.body },
      "Error in createStoreAdminHandler",
    );
    return sendErrorReply(reply, error);
  }
}

/**
 * Handler for retrieving a store admin by ID
 */
export async function getStoreAdminByIdHandler(
  request: FastifyRequest<{ Params: GetStoreAdminByIdParams }>,
  reply: FastifyReply,
) {
  try {
    const storeAdmin = await getStoreAdminById(request.params.id, request.log);

    return reply.send({
      success: true,
      data: storeAdmin,
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params },
      "Error in getStoreAdminByIdHandler",
    );
    return sendErrorReply(reply, error);
  }
}

/**
 * Handler for retrieving farmer-storage-links for the authenticated user's cold storage (farmerId populated with name, address, mobileNumber)
 */
export async function getFarmerStorageLinksByColdStorageHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const req = request as AuthenticatedRequest;
    const coldStorageId =
      typeof req.user.coldStorageId === "object" &&
      req.user.coldStorageId !== null &&
      "_id" in req.user.coldStorageId
        ? req.user.coldStorageId._id
        : (req.user.coldStorageId as string);

    if (!coldStorageId) {
      return reply.code(401).send({
        success: false,
        error: {
          code: "MISSING_COLD_STORAGE",
          message: "Cold storage not found in token",
        },
      });
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
 * Handler for retrieving daybook (all gate passes) for the authenticated user's cold storage.
 * Supports pagination (limit, page), sorting by date (sortOrder), and filtering by gate pass type.
 */
/**
 * Handler for updating a store admin
 */
export async function updateStoreAdminHandler(
  request: FastifyRequest<{
    Params: UpdateStoreAdminParams;
    Body: UpdateStoreAdminInput;
  }>,
  reply: FastifyReply,
) {
  try {
    const storeAdmin = await updateStoreAdmin(
      request.params.id,
      request.body,
      request.log,
    );

    return reply.send({
      success: true,
      data: storeAdmin,
      message: "Store admin updated successfully",
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params, body: request.body },
      "Error in updateStoreAdminHandler",
    );
    return sendErrorReply(reply, error);
  }
}

/**
 * Handler for deleting a store admin
 */
export async function deleteStoreAdminHandler(
  request: FastifyRequest<{ Params: DeleteStoreAdminParams }>,
  reply: FastifyReply,
) {
  try {
    const storeAdmin = await deleteStoreAdmin(request.params.id, request.log);

    return reply.send({
      success: true,
      data: storeAdmin,
      message: "Store admin deleted successfully",
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params },
      "Error in deleteStoreAdminHandler",
    );
    return sendErrorReply(reply, error);
  }
}

/**
 * Handler for checking if mobile number is available
 */
export async function checkMobileNumberHandler(
  request: FastifyRequest<{ Querystring: CheckMobileNumberQuery }>,
  reply: FastifyReply,
) {
  try {
    await checkMobileNumber(request.query.mobileNumber, request.log);

    return reply.send({
      success: true,
      data: { available: true },
      message: "Mobile number is available",
    });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      "Error in checkMobileNumberHandler",
    );
    return sendErrorReply(reply, error);
  }
}

/**
 * Standard error payload sent to client for all login error responses.
 * Ensures client always receives a consistent JSON shape (avoids "Network Error" from malformed responses).
 */
function sendLoginError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
) {
  return reply.code(statusCode).send({
    success: false,
    error: { code, message },
  });
}

/**
 * Handler for store admin login.
 * Ensures every path returns proper JSON so the client never sees "Network Error" from missing/malformed responses.
 */
export async function loginStoreAdminHandler(
  request: FastifyRequest<{ Body: LoginStoreAdminInput }>,
  reply: FastifyReply,
) {
  try {
    // Validate body early so we always return JSON (client often sees "Network Error" when body is missing/wrong)
    const body = request.body;
    if (!body || typeof body !== "object") {
      return sendLoginError(
        reply,
        400,
        "BAD_REQUEST",
        "Request body is required and must be a JSON object with mobileNumber and password",
      );
    }
    const { mobileNumber, password } = body as Record<string, unknown>;
    if (typeof mobileNumber !== "string" || !mobileNumber.trim()) {
      return sendLoginError(
        reply,
        400,
        "VALIDATION_ERROR",
        "Mobile number is required and must be a non-empty string",
      );
    }
    if (typeof password !== "string" || !password) {
      return sendLoginError(
        reply,
        400,
        "VALIDATION_ERROR",
        "Password is required",
      );
    }

    const result = await loginStoreAdmin(
      { mobileNumber: mobileNumber.trim(), password },
      request.log,
    );

    const payload = {
      id: result.storeAdmin._id,
      mobileNumber: result.storeAdmin.mobileNumber,
      role: result.storeAdmin.role,
      coldStorageId: result.storeAdmin.coldStorageId,
    };

    // Generate JWT token (1 week validity)
    const token = request.server.jwt.sign(payload, {
      expiresIn: process.env.JWT_TOKEN_EXPIRY || "7d",
    });

    return reply.send({
      success: true,
      data: {
        storeAdmin: result.storeAdmin,
        token,
      },
      message: "Login successful",
    });
  } catch (error) {
    request.log.error(
      { err: error, body: request.body },
      "Error in loginStoreAdminHandler",
    );
    if (error instanceof AppError) {
      return sendLoginError(reply, error.statusCode, error.code, error.message);
    }
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "An unexpected error occurred";
    const safeMessage =
      process.env.NODE_ENV === "development"
        ? message
        : "An unexpected error occurred";
    return sendLoginError(reply, 500, "INTERNAL_SERVER_ERROR", safeMessage);
  }
}

/**
 * Handler for store admin logout
 */
export async function logoutStoreAdminHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    await logoutStoreAdmin(request.log);

    return reply.send({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    request.log.error({ error }, "Error in logoutStoreAdminHandler");
    return sendErrorReply(reply, error);
  }
}

/**
 * Handler for quick registering a farmer
 */
export async function quickRegisterFarmerHandler(
  request: FastifyRequest<{ Body: QuickRegisterFarmerInput }>,
  reply: FastifyReply,
) {
  try {
    const result = await quickRegisterFarmer(request.body, request.log);

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
 * Handler for updating a farmer-storage-link
 */
export async function updateFarmerStorageLinkHandler(
  request: FastifyRequest<{
    Params: UpdateFarmerStorageLinkParams;
    Body: UpdateFarmerStorageLinkInput;
  }>,
  reply: FastifyReply,
) {
  try {
    const result = await updateFarmerStorageLink(
      request.params.id,
      request.body,
      request.log,
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
