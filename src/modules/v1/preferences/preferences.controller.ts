import { FastifyReply, FastifyRequest } from "fastify";
import { getPreferencesByColdStorageId } from "./preferences.service.js";
import { AppError } from "../../../utils/errors.js";
import type { AuthenticatedRequest } from "../../../utils/auth.js";

/** Send error response: AppError → statusCode + code/message; else 500. */
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
 * Get preferences for the current logged-in store-admin's cold storage.
 * Uses JWT coldStorageId (same flow as store-admin routes).
 */
export async function getMyPreferencesHandler(
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
          code: "UNAUTHORIZED",
          message: "Cold storage not associated with this account",
        },
      });
    }

    const preferences = await getPreferencesByColdStorageId(
      coldStorageId,
      request.log,
    );

    return reply.send({
      success: true,
      data: preferences,
    });
  } catch (error) {
    request.log.error({ error }, "getMyPreferencesHandler");
    return sendErrorReply(reply, error);
  }
}

/**
 * Get preferences for a cold storage by ID (used by cold-storage routes with :id).
 * TODO: Implement when preferences service is ready for this path.
 */
export async function getPreferencesHandler(
  _request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  return reply.code(501).send({
    success: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: "Preferences endpoint is not implemented yet",
    },
  });
}

/**
 * Stub: Update preferences for a cold storage.
 * TODO: Implement when preferences service is ready.
 */
export async function updatePreferencesHandler(
  _request: FastifyRequest<{
    Params: { id: string };
    Body: { bagSizes?: unknown; reportFormat?: string; custom?: unknown };
  }>,
  reply: FastifyReply,
) {
  return reply.code(501).send({
    success: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: "Preferences endpoint is not implemented yet",
    },
  });
}
