import { FastifyReply, FastifyRequest } from "fastify";
import {
  createTransferStock,
  getTransferStockGatePassesForColdStorage,
} from "./transfer-stock.service.js";
import {
  createTransferStockSchema,
  type CreateTransferStockInput,
} from "./transfer-stock.schema.js";
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../../utils/errors.js";
import type { AuthenticatedRequest } from "../../../utils/auth.js";
import { ZodError } from "zod";

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

/**
 * Handler for creating a transfer stock gate pass (stock move between two farmers).
 */
export async function createTransferStockHandler(
  request: FastifyRequest<{ Body: CreateTransferStockInput }>,
  reply: FastifyReply,
) {
  try {
    const parsed = createTransferStockSchema.safeParse({
      body: request.body,
    });
    if (!parsed.success) {
      const flattened = parsed.error.flatten();
      const firstError =
        (flattened.fieldErrors as Record<string, string[] | undefined>)
          ?.body?.[0] ??
        flattened.formErrors?.[0] ??
        "Invalid request body";
      return reply.code(400).send({
        status: "error",
        statusCode: 400,
        errorCode: "VALIDATION_ERROR",
        message:
          typeof firstError === "string"
            ? firstError
            : String(firstError ?? "Validation failed"),
      });
    }
    const body = parsed.data.body;

    request.log.info(
      {
        fromFarmerStorageLinkId: body.fromFarmerStorageLinkId,
        toFarmerStorageLinkId: body.toFarmerStorageLinkId,
        itemCount: body.items?.length ?? 0,
        date: body.date,
      },
      "Create transfer stock request",
    );

    const createdById = (request as AuthenticatedRequest).user?.id;
    const result = await createTransferStock(body, createdById, request.log);

    return reply.code(201).send({
      status: "Success",
      message: "Transfer stock gate pass created successfully.",
      data: result,
    });
  } catch (error) {
    request.log.error(
      { error, body: request.body },
      "Error in createTransferStockHandler",
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

    if (error instanceof ZodError) {
      const flattened = error.flatten();
      const firstError =
        (flattened.fieldErrors as Record<string, string[] | undefined>)
          ?.body?.[0] ??
        flattened.formErrors?.[0] ??
        "Validation failed";
      return reply.code(400).send({
        status: "error",
        statusCode: 400,
        errorCode: "VALIDATION_ERROR",
        message:
          typeof firstError === "string"
            ? firstError
            : String(firstError ?? "Validation failed"),
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
 * Handler for listing all transfer stock gate passes for the logged-in store's cold storage.
 */
export async function getTransferStockGatePassesForCurrentStoreHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const coldStorageId = getLoggedInUserColdStorageId(request);
    if (!coldStorageId) {
      return reply.code(400).send({
        status: "error",
        statusCode: 400,
        errorCode: "COLD_STORAGE_CONTEXT_REQUIRED",
        message:
          "Cold storage context is required to list transfer stock gate passes",
      });
    }

    request.log.info(
      { coldStorageId },
      "List transfer stock gate passes for current cold storage",
    );

    const data = await getTransferStockGatePassesForColdStorage(
      coldStorageId,
      request.log,
    );

    return reply.code(200).send({
      status: "Success",
      data,
    });
  } catch (error) {
    request.log.error(
      { error },
      "Error in getTransferStockGatePassesForCurrentStoreHandler",
    );

    if (error instanceof ValidationError) {
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
