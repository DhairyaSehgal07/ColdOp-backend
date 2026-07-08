import { FastifyReply, FastifyRequest } from "fastify";
import {
  createOutgoingGatePass,
  getOutgoingGatePassById,
  getOutgoingGatePassReport,
  nullOutgoingGatePass,
  updateOutgoingGatePass,
} from "./outgoing-gate-pass.service.js";
import {
  CreateOutgoingGatePassInput,
  NullOutgoingGatePassBody,
  UpdateOutgoingGatePassBody,
  getOutgoingGatePassByIdSchema,
  nullOutgoingGatePassSchema,
  getOutgoingGatePassReportQuerySchema,
  getOutgoingGatePassEditHistoryQuerySchema,
  updateOutgoingGatePassSchema,
} from "./outgoing-gate-pass.schema.js";
import { getOutgoingGatePassAudits } from "./outgoing-gate-pass-audit.service.js";
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../../utils/errors.js";
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

function sendReportErrorReply(
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
 * Handler for creating a new outgoing gate pass (nikasi-style flow).
 */
export async function createOutgoingGatePassHandler(
  request: FastifyRequest<{ Body: CreateOutgoingGatePassInput }>,
  reply: FastifyReply,
) {
  try {
    request.log.info(
      {
        incomingGatePassCount: request.body.incomingGatePasses?.length ?? 0,
        date: request.body.date,
      },
      "Create outgoing gate pass request",
    );

    const storeAdminId = (request as AuthenticatedRequest).user?.id;
    const result = await createOutgoingGatePass(
      request.body,
      storeAdminId,
      request.log,
    );

    return reply.code(201).send({
      status: "Success",
      message: "Outgoing gate pass created successfully.",
      data: result,
    });
  } catch (error) {
    request.log.error(
      { error, body: request.body },
      "Error in createOutgoingGatePassHandler",
    );

    if (error instanceof ConflictError) {
      return reply.code(error.statusCode).send({
        status: "error",
        statusCode: error.statusCode,
        errorCode: error.code,
        message: error.message,
      });
    }

    if (error instanceof ValidationError) {
      return reply.code(error.statusCode).send({
        status: "error",
        statusCode: error.statusCode,
        errorCode: error.code,
        message: error.message,
      });
    }

    if (error instanceof NotFoundError) {
      return reply.code(error.statusCode).send({
        status: "error",
        statusCode: error.statusCode,
        errorCode: error.code,
        message: error.message,
      });
    }

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        status: "error",
        statusCode: error.statusCode,
        errorCode: error.code,
        message: error.message,
      });
    }

    const statusCode = 500;
    return reply.code(statusCode).send({
      status: "error",
      statusCode,
      errorCode: "INTERNAL_SERVER_ERROR",
      message:
        process.env.NODE_ENV === "development"
          ? error instanceof Error
            ? error.message
            : "An unexpected error occurred"
          : "An unexpected error occurred",
    });
  }
}

/**
 * Handler for fetching a single outgoing gate pass by ID.
 */
export async function getOutgoingGatePassByIdHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const parsed = getOutgoingGatePassByIdSchema.safeParse({
      params: request.params,
    });
    if (!parsed.success) {
      const message =
        parsed.error.issues
          ?.map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ") ?? parsed.error.message;
      return reply.code(400).send({
        status: "error",
        statusCode: 400,
        errorCode: "VALIDATION_ERROR",
        message,
      });
    }

    request.log.info(
      { outgoingGatePassId: parsed.data.params.id },
      "Get outgoing gate pass by ID request",
    );

    const loggedInUserColdStorageId = getLoggedInUserColdStorageId(request);

    const result = await getOutgoingGatePassById(
      parsed.data.params.id,
      loggedInUserColdStorageId,
      request.log,
    );

    return reply.code(200).send({
      status: "Success",
      message: "Outgoing gate pass retrieved successfully.",
      data: result,
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params },
      "Error in getOutgoingGatePassByIdHandler",
    );

    if (error instanceof ConflictError) {
      return reply.code(error.statusCode).send({
        status: "error",
        statusCode: error.statusCode,
        errorCode: error.code,
        message: error.message,
      });
    }

    if (error instanceof ValidationError) {
      return reply.code(error.statusCode).send({
        status: "error",
        statusCode: error.statusCode,
        errorCode: error.code,
        message: error.message,
      });
    }

    if (error instanceof NotFoundError) {
      return reply.code(error.statusCode).send({
        status: "error",
        statusCode: error.statusCode,
        errorCode: error.code,
        message: error.message,
      });
    }

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        status: "error",
        statusCode: error.statusCode,
        errorCode: error.code,
        message: error.message,
      });
    }

    const statusCode = 500;
    return reply.code(statusCode).send({
      status: "error",
      statusCode,
      errorCode: "INTERNAL_SERVER_ERROR",
      message:
        process.env.NODE_ENV === "development"
          ? error instanceof Error
            ? error.message
            : "An unexpected error occurred"
          : "An unexpected error occurred",
    });
  }
}

/**
 * Handler for updating outgoing gate pass header fields and/or allocations.
 */
export async function updateOutgoingGatePassHandler(
  request: FastifyRequest<{
    Params: { id: string };
    Body: UpdateOutgoingGatePassBody;
  }>,
  reply: FastifyReply,
) {
  try {
    const parsed = updateOutgoingGatePassSchema.safeParse({
      params: request.params,
      body: request.body,
    });
    if (!parsed.success) {
      const message =
        parsed.error.issues
          ?.map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ") ?? parsed.error.message;
      return reply.code(400).send({
        status: "error",
        statusCode: 400,
        errorCode: "VALIDATION_ERROR",
        message,
      });
    }

    request.log.info(
      { outgoingGatePassId: parsed.data.params.id },
      "Update outgoing gate pass request",
    );

    const req = request as AuthenticatedRequest;
    const editedById = req.user?.id;
    const loggedInUserColdStorageId = getLoggedInUserColdStorageId(request);

    const userAgentHeader = request.headers["user-agent"];
    const userAgent =
      typeof userAgentHeader === "string"
        ? userAgentHeader
        : Array.isArray(userAgentHeader)
          ? userAgentHeader[0]
          : undefined;

    const result = await updateOutgoingGatePass(
      parsed.data.params.id,
      parsed.data.body,
      editedById,
      loggedInUserColdStorageId,
      request.log,
      {
        ipAddress: request.ip,
        userAgent,
      },
    );

    return reply.code(200).send({
      status: "Success",
      message: "Outgoing gate pass updated successfully.",
      data: result,
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params, body: request.body },
      "Error in updateOutgoingGatePassHandler",
    );

    if (error instanceof ConflictError) {
      return reply.code(error.statusCode).send({
        status: "error",
        statusCode: error.statusCode,
        errorCode: error.code,
        message: error.message,
      });
    }

    if (error instanceof ValidationError) {
      return reply.code(error.statusCode).send({
        status: "error",
        statusCode: error.statusCode,
        errorCode: error.code,
        message: error.message,
      });
    }

    if (error instanceof NotFoundError) {
      return reply.code(error.statusCode).send({
        status: "error",
        statusCode: error.statusCode,
        errorCode: error.code,
        message: error.message,
      });
    }

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        status: "error",
        statusCode: error.statusCode,
        errorCode: error.code,
        message: error.message,
      });
    }

    const statusCode = 500;
    return reply.code(statusCode).send({
      status: "error",
      statusCode,
      errorCode: "INTERNAL_SERVER_ERROR",
      message:
        process.env.NODE_ENV === "development"
          ? error instanceof Error
            ? error.message
            : "An unexpected error occurred"
          : "An unexpected error occurred",
    });
  }
}

/**
 * Handler for nulling (voiding) an outgoing gate pass and restoring stock.
 */
export async function nullOutgoingGatePassHandler(
  request: FastifyRequest<{
    Params: { id: string };
    Body: NullOutgoingGatePassBody;
  }>,
  reply: FastifyReply,
) {
  try {
    const parsed = nullOutgoingGatePassSchema.safeParse({
      params: request.params,
      body: request.body ?? {},
    });
    if (!parsed.success) {
      const message =
        parsed.error.issues
          ?.map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ") ?? parsed.error.message;
      return reply.code(400).send({
        status: "error",
        statusCode: 400,
        errorCode: "VALIDATION_ERROR",
        message,
      });
    }

    request.log.info(
      { outgoingGatePassId: parsed.data.params.id },
      "Null outgoing gate pass request",
    );

    const req = request as AuthenticatedRequest;
    const editedById = req.user?.id;
    const loggedInUserColdStorageId = getLoggedInUserColdStorageId(request);

    const result = await nullOutgoingGatePass(
      parsed.data.params.id,
      parsed.data.body,
      editedById,
      loggedInUserColdStorageId,
      request.log,
    );

    return reply.code(200).send({
      status: "Success",
      message: "Outgoing gate pass nulled successfully.",
      data: result,
    });
  } catch (error) {
    request.log.error(
      { error, params: request.params, body: request.body },
      "Error in nullOutgoingGatePassHandler",
    );

    if (error instanceof ConflictError) {
      return reply.code(error.statusCode).send({
        status: "error",
        statusCode: error.statusCode,
        errorCode: error.code,
        message: error.message,
      });
    }

    if (error instanceof ValidationError) {
      return reply.code(error.statusCode).send({
        status: "error",
        statusCode: error.statusCode,
        errorCode: error.code,
        message: error.message,
      });
    }

    if (error instanceof NotFoundError) {
      return reply.code(error.statusCode).send({
        status: "error",
        statusCode: error.statusCode,
        errorCode: error.code,
        message: error.message,
      });
    }

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        status: "error",
        statusCode: error.statusCode,
        errorCode: error.code,
        message: error.message,
      });
    }

    const statusCode = 500;
    return reply.code(statusCode).send({
      status: "error",
      statusCode,
      errorCode: "INTERNAL_SERVER_ERROR",
      message:
        process.env.NODE_ENV === "development"
          ? error instanceof Error
            ? error.message
            : "An unexpected error occurred"
          : "An unexpected error occurred",
    });
  }
}

/**
 * Handler for GET /report – all outgoing gate passes for the cold storage with optional date range.
 */
export async function getOutgoingGatePassEditHistoryHandler(
  request: FastifyRequest<{
    Querystring: {
      outgoingGatePassId?: string;
      page?: number;
      limit?: number;
    };
  }>,
  reply: FastifyReply,
) {
  try {
    const parsed = getOutgoingGatePassEditHistoryQuerySchema.safeParse({
      querystring: request.query,
    });
    if (!parsed.success) {
      const message =
        parsed.error.issues
          ?.map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ") ?? parsed.error.message;
      return reply.code(400).send({
        success: false,
        error: { code: "VALIDATION_ERROR", message },
      });
    }

    const { querystring } = parsed.data;
    const loggedInUserColdStorageId = getLoggedInUserColdStorageId(request);

    const result = await getOutgoingGatePassAudits(
      loggedInUserColdStorageId,
      {
        outgoingGatePassId: querystring.outgoingGatePassId,
        page: querystring.page,
        limit: querystring.limit,
      },
      request.log,
    );

    return reply.code(200).send({
      success: true,
      data: result.data,
      pagination: result.pagination,
      message: "Outgoing gate pass edit history retrieved successfully",
    });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      "Error in getOutgoingGatePassEditHistoryHandler",
    );
    return sendReportErrorReply(reply, error);
  }
}

/**
 * Handler for GET /report – all outgoing gate passes for the cold storage with optional date range.
 */
export async function getOutgoingGatePassReportHandler(
  request: FastifyRequest<{
    Querystring: { dateFrom?: string; dateTo?: string; stockFilter?: string };
  }>,
  reply: FastifyReply,
) {
  try {
    const loggedInUserColdStorageId = getLoggedInUserColdStorageId(request);
    if (!loggedInUserColdStorageId) {
      return reply.code(401).send({
        success: false,
        error: {
          code: "MISSING_COLD_STORAGE",
          message: "Cold storage not found in token",
        },
      });
    }

    const parsed = getOutgoingGatePassReportQuerySchema.safeParse({
      querystring: request.query,
    });
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const field = firstIssue?.path.join(".") ?? "";
      const isDateFrom = field.includes("dateFrom");
      const isDateTo = field.includes("dateTo");
      const code = isDateFrom
        ? "INVALID_DATE_FROM"
        : isDateTo
          ? "INVALID_DATE_TO"
          : "VALIDATION_ERROR";
      const message =
        parsed.error.issues
          ?.map((i) => i.message)
          .join("; ") ?? parsed.error.message;
      return reply.code(400).send({
        success: false,
        error: { code, message },
      });
    }

    const { dateFrom, dateTo, stockFilter } = parsed.data.querystring;
    const outgoingGatePasses = await getOutgoingGatePassReport(
      loggedInUserColdStorageId,
      { dateFrom, dateTo, stockFilter },
      request.log,
    );

    return reply.code(200).send({
      success: true,
      data: { outgoingGatePasses },
      message: "Outgoing gate pass report retrieved successfully",
    });
  } catch (error) {
    request.log.error(
      { error, query: request.query },
      "Error in getOutgoingGatePassReportHandler",
    );
    return sendReportErrorReply(reply, error);
  }
}
