import { FastifyReply, FastifyRequest } from "fastify";
import type { AuthenticatedRequest } from "../../../utils/auth.js";
import { AppError } from "../../../utils/errors.js";
import {
  createVoucher,
  getAllVouchers,
  getVoucherById,
  updateVoucher,
  deleteVoucher,
} from "./voucher.service.js";
import {
  createVoucherSchema,
  updateVoucherSchema,
  listVouchersQuerySchema,
  voucherIdParamsSchema,
  objectIdString,
  type CreateVoucherInput,
  type UpdateVoucherInput,
  type ListVouchersQuery,
  type VoucherIdParams,
} from "./voucher.schema.js";
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

export async function createVoucherHandler(
  request: FastifyRequest<{ Body: CreateVoucherInput }>,
  reply: FastifyReply,
) {
  try {
    const parsed = createVoucherSchema.parse({ body: request.body });
    const payload: CreateVoucherInput = { ...parsed.body };
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
    const data = await createVoucher(
      payload,
      coldStorageId,
      createdById,
      request.log,
    );
    return reply.code(201).send({
      success: true,
      data,
      message: "Voucher created successfully",
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
      "Error in createVoucherHandler",
    );
    return sendErrorReply(reply, error);
  }
}

export async function getAllVouchersHandler(
  request: FastifyRequest<{ Querystring: ListVouchersQuery }>,
  reply: FastifyReply,
) {
  try {
    const query = listVouchersQuerySchema.parse(request.query);
    const coldStorageId = getColdStorageId(request);
    const data = await getAllVouchers(coldStorageId, query, request.log);
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
      "Error in getAllVouchersHandler",
    );
    return sendErrorReply(reply, error);
  }
}

export async function getVoucherByIdHandler(
  request: FastifyRequest<{ Params: VoucherIdParams }>,
  reply: FastifyReply,
) {
  try {
    const params = voucherIdParamsSchema.parse(request.params);
    const coldStorageId = getColdStorageId(request);
    const data = await getVoucherById(params.id, coldStorageId, request.log);
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
          message: "Invalid voucher ID",
          details: error.flatten(),
        },
      });
    }
    request.log.error(
      { error, params: request.params },
      "Error in getVoucherByIdHandler",
    );
    return sendErrorReply(reply, error);
  }
}

export async function updateVoucherHandler(
  request: FastifyRequest<{
    Params: VoucherIdParams;
    Body: UpdateVoucherInput;
  }>,
  reply: FastifyReply,
) {
  try {
    const parsed = updateVoucherSchema.parse({ body: request.body });
    const params = voucherIdParamsSchema.parse(request.params);
    const coldStorageId = getColdStorageId(request);
    const updatedById = getCreatedById(request);
    const data = await updateVoucher(
      params.id,
      coldStorageId,
      parsed.body,
      updatedById,
      request.log,
    );
    return reply.code(200).send({
      success: true,
      data,
      message: "Voucher updated successfully",
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
      "Error in updateVoucherHandler",
    );
    return sendErrorReply(reply, error);
  }
}

export async function deleteVoucherHandler(
  request: FastifyRequest<{ Params: VoucherIdParams }>,
  reply: FastifyReply,
) {
  try {
    const params = voucherIdParamsSchema.parse(request.params);
    const coldStorageId = getColdStorageId(request);
    await deleteVoucher(params.id, coldStorageId, request.log);
    return reply.code(200).send({
      success: true,
      message: "Voucher deleted successfully",
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid voucher ID",
          details: error.flatten(),
        },
      });
    }
    request.log.error(
      { error, params: request.params },
      "Error in deleteVoucherHandler",
    );
    return sendErrorReply(reply, error);
  }
}
