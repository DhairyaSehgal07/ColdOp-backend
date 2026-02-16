import { FastifyReply, FastifyRequest } from "fastify";
import { createOutgoingGatePass } from "./outgoing-gate-pass.service.js";
import { CreateOutgoingGatePassInput } from "./outgoing-gate-pass.schema.js";
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../../utils/errors.js";
import type { AuthenticatedRequest } from "../../../utils/auth.js";

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
