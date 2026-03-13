import { FastifyReply, FastifyRequest } from "fastify";
import {
  getStockSummary,
  getTopFarmersForStore,
  getVarietyBreakdown,
  getReports,
  getIncomingGatePassesForStorage,
} from "./analytics.service.js";
import { AppError, ValidationError } from "../../../utils/errors.js";
import type { AuthenticatedRequest } from "../../../utils/auth.js";

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
 * GET /summary – stock summary by variety and size (initial, current, removed)
 * with chart-ready data for Recharts. Requires authentication.
 * Uses only the current logged-in store admin's cold storage (from JWT).
 * Query param stockFilter=true: group summary by stock filter (FARMER and OWNED).
 */
export async function getSummaryHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const req = request as AuthenticatedRequest;
    // coldStorageId only from JWT – ensures aggregation uses only this store admin's cold storage
    const coldStorageId =
      typeof req.user?.coldStorageId === "object" &&
      req.user.coldStorageId !== null &&
      "_id" in req.user.coldStorageId
        ? (req.user.coldStorageId as { _id: string })._id
        : (req.user?.coldStorageId as string);

    if (!coldStorageId) {
      return reply.code(401).send({
        success: false,
        error: {
          code: "MISSING_COLD_STORAGE",
          message: "Cold storage not found in token",
        },
      });
    }

    const stockFilter =
      (request.query as { stockFilter?: string }).stockFilter === "true";

    const result = await getStockSummary(coldStorageId, request.log, {
      groupByStockFilter: stockFilter,
    });

    if ("stockSummaryByFilter" in result) {
      return reply.code(200).send({
        success: true,
        data: {
          stockSummaryByFilter: result.stockSummaryByFilter,
        },
        message:
          "Stock summary retrieved successfully (grouped by stock filter)",
      });
    }

    return reply.code(200).send({
      success: true,
      data: {
        stockSummary: result.stockSummary,
        chartData: result.chartData,
        totalInventory: result.totalInventory,
        topVariety: result.topVariety,
        topSize: result.topSize,
      },
      message: "Stock summary retrieved successfully",
    });
  } catch (error) {
    request.log.error({ error }, "Error in getSummaryHandler");
    if (error instanceof ValidationError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    return sendErrorReply(reply, error);
  }
}

/**
 * GET /top-farmers – top 5 farmers by current quantity, initial quantity,
 * and quantity removed for the authenticated user's cold storage.
 * Response is chart-ready for Recharts (name + value per series).
 */
export async function getTopFarmersHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const req = request as AuthenticatedRequest;
    const coldStorageId =
      typeof req.user?.coldStorageId === "object" &&
      req.user.coldStorageId !== null &&
      "_id" in req.user.coldStorageId
        ? (req.user.coldStorageId as { _id: string })._id
        : (req.user?.coldStorageId as string);

    if (!coldStorageId) {
      return reply.code(401).send({
        success: false,
        error: {
          code: "MISSING_COLD_STORAGE",
          message: "Cold storage not found in token",
        },
      });
    }

    const chartData = await getTopFarmersForStore(coldStorageId, request.log);

    return reply.code(200).send({
      success: true,
      data: { chartData },
      message: "Top farmers retrieved successfully",
    });
  } catch (error) {
    request.log.error({ error }, "Error in getTopFarmersHandler");
    if (error instanceof ValidationError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    return sendErrorReply(reply, error);
  }
}

/**
 * GET /variety-breakdown – for a given variety (query param), returns all sizes
 * with their quantities (initial, current, quantityRemoved) and per-farmer
 * contribution for each size. Scoped to authenticated user's cold storage.
 */
export async function getVarietyBreakdownHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const req = request as AuthenticatedRequest;
    const coldStorageId =
      typeof req.user?.coldStorageId === "object" &&
      req.user.coldStorageId !== null &&
      "_id" in req.user.coldStorageId
        ? (req.user.coldStorageId as { _id: string })._id
        : (req.user?.coldStorageId as string);

    if (!coldStorageId) {
      return reply.code(401).send({
        success: false,
        error: {
          code: "MISSING_COLD_STORAGE",
          message: "Cold storage not found in token",
        },
      });
    }

    const variety =
      typeof (request.query as { variety?: string }).variety === "string"
        ? (request.query as { variety: string }).variety
        : "";

    const result = await getVarietyBreakdown(
      coldStorageId,
      variety,
      request.log,
    );

    return reply.code(200).send({
      success: true,
      data: result,
      message: "Variety breakdown retrieved successfully",
    });
  } catch (error) {
    request.log.error({ error }, "Error in getVarietyBreakdownHandler");
    if (error instanceof ValidationError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    return sendErrorReply(reply, error);
  }
}

/**
 * GET /incoming-gate-passes – all incoming gate passes for the logged-in cold storage.
 */
export async function getIncomingGatePassesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const req = request as AuthenticatedRequest;
    const coldStorageId =
      typeof req.user?.coldStorageId === "object" &&
      req.user.coldStorageId !== null &&
      "_id" in req.user.coldStorageId
        ? (req.user.coldStorageId as { _id: string })._id
        : (req.user?.coldStorageId as string);

    if (!coldStorageId) {
      return reply.code(401).send({
        success: false,
        error: {
          code: "MISSING_COLD_STORAGE",
          message: "Cold storage not found in token",
        },
      });
    }

    const incomingGatePasses = await getIncomingGatePassesForStorage(
      coldStorageId,
      request.log,
    );

    return reply.code(200).send({
      success: true,
      data: { incomingGatePasses },
      message: "Incoming gate passes retrieved successfully",
    });
  } catch (error) {
    request.log.error({ error }, "Error in getIncomingGatePassesHandler");
    if (error instanceof ValidationError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    return sendErrorReply(reply, error);
  }
}

/**
 * GET /get-reports – incoming and outgoing orders for the storage in a date range.
 * Same document shape as daybook for react-pdf. Optional groupByFarmers groups by farmer.
 */
export async function getReportsHandler(
  request: FastifyRequest<{
    Querystring: { from: string; to: string; groupByFarmers?: string };
  }>,
  reply: FastifyReply,
) {
  try {
    const req = request as AuthenticatedRequest;
    const coldStorageId =
      typeof req.user?.coldStorageId === "object" &&
      req.user.coldStorageId !== null &&
      "_id" in req.user.coldStorageId
        ? (req.user.coldStorageId as { _id: string })._id
        : (req.user?.coldStorageId as string);

    if (!coldStorageId) {
      return reply.code(401).send({
        success: false,
        error: {
          code: "MISSING_COLD_STORAGE",
          message: "Cold storage not found in token",
        },
      });
    }

    const from = (request.query as { from?: string }).from;
    const to = (request.query as { to?: string }).to;
    const groupByFarmers =
      (request.query as { groupByFarmers?: string }).groupByFarmers === "true";

    const result = await getReports(
      coldStorageId,
      { from: from ?? "", to: to ?? "", groupByFarmers },
      request.log,
    );

    return reply.code(200).send({
      success: true,
      data: result,
      message: "Reports retrieved successfully",
    });
  } catch (error) {
    request.log.error({ error }, "Error in getReportsHandler");
    if (error instanceof ValidationError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    return sendErrorReply(reply, error);
  }
}
