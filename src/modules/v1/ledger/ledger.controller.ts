import { FastifyReply, FastifyRequest } from "fastify";
import type { AuthenticatedRequest } from "../../../utils/auth.js";
import { AppError } from "../../../utils/errors.js";
import {
  createLedger,
  createDefaultLedgersForColdStorage,
  getAllLedgers,
  getLedgerById,
  updateLedger,
  deleteLedger,
  getLedgerEntries,
} from "./ledger.service.js";
import {
  createLedgerSchema,
  updateLedgerSchema,
  listLedgersQuerySchema,
  ledgerIdParamsSchema,
  objectIdString,
  type CreateLedgerInput,
  type UpdateLedgerInput,
  type ListLedgersQuery,
  type LedgerIdParams,
} from "./ledger.schema.js";
import { ZodError } from "zod";

function getColdStorageId(request: FastifyRequest): string {
  const req = request as AuthenticatedRequest;
  if (!req.user?.coldStorageId) {
    throw new AppError(
      "Cold storage context is required",
      400,
      "MISSING_COLD_STORAGE",
    );
  }
  const coldStorageId =
    typeof req.user.coldStorageId === "object" &&
    req.user.coldStorageId !== null &&
    "_id" in req.user.coldStorageId
      ? (req.user.coldStorageId as { _id: string })._id
      : (req.user.coldStorageId as string);
  return coldStorageId;
}

function getCreatedById(request: FastifyRequest): string {
  const req = request as AuthenticatedRequest;
  if (!req.user?.id) {
    throw new AppError("User ID is required", 400, "MISSING_USER_ID");
  }
  return req.user.id;
}

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

export async function createLedgerHandler(
  request: FastifyRequest<{ Body: CreateLedgerInput }>,
  reply: FastifyReply,
) {
  try {
    const parsed = createLedgerSchema.parse({ body: request.body });
    const payload: CreateLedgerInput = { ...parsed.body };
    const raw = request.body as Record<string, unknown> | undefined;
    if (raw?.farmerStorageLinkId != null && raw.farmerStorageLinkId !== "") {
      payload.farmerStorageLinkId = objectIdString.parse(
        raw.farmerStorageLinkId as string,
      ) as string;
    } else if (raw && "farmerStorageLinkId" in raw) {
      payload.farmerStorageLinkId = null;
    }
    const coldStorageId = getColdStorageId(request);
    const createdById = getCreatedById(request);
    const ledger = await createLedger(
      payload,
      coldStorageId,
      createdById,
      request.log,
    );
    return reply.code(201).send({
      success: true,
      data: ledger,
      message: "Ledger created successfully",
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: error.flatten(),
        },
      });
    }
    request.log.error(
      { error, body: request.body },
      "Error in createLedgerHandler",
    );
    return sendErrorReply(reply, error);
  }
}

export async function createDefaultLedgersHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const coldStorageId = getColdStorageId(request);
    const createdById = getCreatedById(request);
    const ledgers = await createDefaultLedgersForColdStorage(
      coldStorageId,
      createdById,
      request.log,
    );
    return reply.code(201).send({
      success: true,
      data: { ledgers },
      message: "Default ledgers created successfully",
    });
  } catch (error) {
    request.log.error({ error }, "Error in createDefaultLedgersHandler");
    return sendErrorReply(reply, error);
  }
}

export async function getAllLedgersHandler(
  request: FastifyRequest<{ Querystring: ListLedgersQuery }>,
  reply: FastifyReply,
) {
  try {
    const query = listLedgersQuerySchema.parse(request.query);
    const coldStorageId = getColdStorageId(request);
    const data = await getAllLedgers(coldStorageId, query, request.log);
    return reply.code(200).send({
      success: true,
      data,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid query parameters",
          details: error.flatten(),
        },
      });
    }
    request.log.error(
      { error, query: request.query },
      "Error in getAllLedgersHandler",
    );
    return sendErrorReply(reply, error);
  }
}

export async function getLedgerByIdHandler(
  request: FastifyRequest<{ Params: LedgerIdParams }>,
  reply: FastifyReply,
) {
  try {
    const params = ledgerIdParamsSchema.parse(request.params);
    const coldStorageId = getColdStorageId(request);
    const ledger = await getLedgerById(
      params.id,
      coldStorageId,
      request.log,
    );
    return reply.code(200).send({
      success: true,
      data: ledger,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid ledger ID",
          details: error.flatten(),
        },
      });
    }
    request.log.error(
      { error, params: request.params },
      "Error in getLedgerByIdHandler",
    );
    return sendErrorReply(reply, error);
  }
}

export async function updateLedgerHandler(
  request: FastifyRequest<{
    Params: LedgerIdParams;
    Body: UpdateLedgerInput;
  }>,
  reply: FastifyReply,
) {
  try {
    const parsed = updateLedgerSchema.parse({
      body: request.body,
    });
    const params = ledgerIdParamsSchema.parse(request.params);
    const coldStorageId = getColdStorageId(request);
    const ledger = await updateLedger(
      params.id,
      coldStorageId,
      parsed.body,
      request.log,
    );
    return reply.code(200).send({
      success: true,
      data: ledger,
      message: "Ledger updated successfully",
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: error.flatten(),
        },
      });
    }
    request.log.error(
      { error, params: request.params, body: request.body },
      "Error in updateLedgerHandler",
    );
    return sendErrorReply(reply, error);
  }
}

export async function deleteLedgerHandler(
  request: FastifyRequest<{ Params: LedgerIdParams }>,
  reply: FastifyReply,
) {
  try {
    const params = ledgerIdParamsSchema.parse(request.params);
    const coldStorageId = getColdStorageId(request);
    await deleteLedger(params.id, coldStorageId, request.log);
    return reply.code(200).send({
      success: true,
      message: "Ledger deleted successfully",
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid ledger ID",
          details: error.flatten(),
        },
      });
    }
    request.log.error(
      { error, params: request.params },
      "Error in deleteLedgerHandler",
    );
    return sendErrorReply(reply, error);
  }
}

export async function getLedgerEntriesHandler(
  request: FastifyRequest<{ Params: LedgerIdParams }>,
  reply: FastifyReply,
) {
  try {
    const params = ledgerIdParamsSchema.parse(request.params);
    const coldStorageId = getColdStorageId(request);
    const result = await getLedgerEntries(
      params.id,
      coldStorageId,
      request.log,
    );
    return reply.code(200).send({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid ledger ID",
          details: error.flatten(),
        },
      });
    }
    request.log.error(
      { error, params: request.params },
      "Error in getLedgerEntriesHandler",
    );
    return sendErrorReply(reply, error);
  }
}
