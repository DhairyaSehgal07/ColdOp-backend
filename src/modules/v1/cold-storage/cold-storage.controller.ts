import { FastifyReply, FastifyRequest } from "fastify";
import {
  createColdStorage,
  getColdStorages,
  getColdStorageById,
  deleteColdStorageData,
} from "./cold-storage.service.js";
import {
  CreateColdStorageInput,
  GetColdStoragesQuery,
  GetColdStorageByIdParams,
  DeleteColdStorageDataParams,
} from "./cold-storage.schema.js";
import {
  AppError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from "../../../utils/errors.js";

/**
 * Sends a consistent error response with the correct status code and body.
 */
function sendErrorResponse(
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
 * Handles any error and sends the appropriate response.
 */
function handleError(
  error: unknown,
  reply: FastifyReply,
  fallbackMessage: string = "Something went wrong. Please try again later.",
) {
  if (error instanceof NotFoundError) {
    return sendErrorResponse(
      reply,
      error.statusCode,
      error.code,
      error.message,
    );
  }
  if (error instanceof ValidationError) {
    return sendErrorResponse(
      reply,
      error.statusCode,
      error.code,
      error.message,
    );
  }
  if (error instanceof ConflictError) {
    return sendErrorResponse(
      reply,
      error.statusCode,
      error.code,
      error.message,
    );
  }
  if (error instanceof AppError) {
    return sendErrorResponse(
      reply,
      error.statusCode,
      error.code,
      error.message,
    );
  }
  const message =
    process.env.NODE_ENV === "development" && error instanceof Error
      ? error.message
      : fallbackMessage;
  return sendErrorResponse(reply, 500, "INTERNAL_SERVER_ERROR", message);
}

/**
 * Handler for creating a new cold storage
 */
export async function createColdStorageHandler(
  request: FastifyRequest<{ Body: CreateColdStorageInput }>,
  reply: FastifyReply,
) {
  try {
    const coldStorage = await createColdStorage(request.body, request.log);

    return reply.code(201).send({
      success: true,
      data: coldStorage,
      message: "Cold storage created successfully",
    });
  } catch (error) {
    request.log.error(
      { err: error, body: request.body },
      "Error in createColdStorageHandler",
    );
    return handleError(
      error,
      reply,
      "We couldn't create the cold storage. Please try again later.",
    );
  }
}

/**
 * Handler for retrieving a list of cold storages with pagination
 */
export async function getColdStoragesHandler(
  request: FastifyRequest<{ Querystring: GetColdStoragesQuery }>,
  reply: FastifyReply,
) {
  try {
    const result = await getColdStorages(request.query, request.log);

    return reply.send({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    request.log.error(
      { err: error, query: request.query },
      "Error in getColdStoragesHandler",
    );
    return handleError(
      error,
      reply,
      "We couldn't load the cold storages list. Please try again later.",
    );
  }
}

/**
 * Handler for retrieving a cold storage by ID
 */
export async function getColdStorageByIdHandler(
  request: FastifyRequest<{ Params: GetColdStorageByIdParams }>,
  reply: FastifyReply,
) {
  try {
    const coldStorage = await getColdStorageById(
      request.params.id,
      request.log,
    );

    return reply.send({
      success: true,
      data: coldStorage,
    });
  } catch (error) {
    request.log.error(
      { err: error, params: request.params },
      "Error in getColdStorageByIdHandler",
    );
    return handleError(
      error,
      reply,
      "We couldn't load this cold storage. Please try again later.",
    );
  }
}

/**
 * Handler for deleting all data associated with a cold storage (farmers only if not linked elsewhere,
 * incoming/outgoing orders, ledgers, vouchers, edit histories). Returns farmers linked to another storage.
 */
export async function deleteColdStorageDataHandler(
  request: FastifyRequest<{ Params: DeleteColdStorageDataParams }>,
  reply: FastifyReply,
) {
  try {
    const result = await deleteColdStorageData(
      request.params.id,
      request.log,
    );

    return reply.send({
      success: true,
      data: {
        farmersLinkedElsewhere: result.farmersLinkedElsewhere,
      },
      message:
        result.farmersLinkedElsewhere.length > 0
          ? "Cold storage data deleted. Some farmers were not deleted because they are linked to another cold storage."
          : "Cold storage data deleted successfully.",
    });
  } catch (error) {
    request.log.error(
      { err: error, params: request.params },
      "Error in deleteColdStorageDataHandler",
    );
    return handleError(
      error,
      reply,
      "We couldn't delete the cold storage data. Please try again later.",
    );
  }
}
