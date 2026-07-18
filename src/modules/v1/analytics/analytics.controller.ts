import { FastifyReply, FastifyRequest } from "fastify";
import {
  getStockSummary,
  getTopFarmersForStore,
  getVarietyBreakdown,
  getIncomingGatePassesForStorage,
  getAdvancedAnalytics,
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
 * Query param stockFilter=true: group summary by every distinct non-empty
 * stockFilter value in data (returns NO_STOCK_FILTER if none exist).
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
 * Query param stockFilter=true: group breakdown by every distinct non-empty
 * stockFilter value in data (returns NO_STOCK_FILTER if none exist).
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
    const stockFilter =
      (request.query as { stockFilter?: string }).stockFilter === "true";

    const result = await getVarietyBreakdown(
      coldStorageId,
      variety,
      request.log,
      { groupByStockFilter: stockFilter },
    );

    if ("varietyBreakdownByFilter" in result) {
      return reply.code(200).send({
        success: true,
        data: {
          varietyBreakdownByFilter: result.varietyBreakdownByFilter,
        },
        message:
          "Variety breakdown retrieved successfully (grouped by stock filter)",
      });
    }

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
 * GET /location-analytics – pre-computed location drill-down (chambers → floors → orders)
 * and farmer grouping for the Advanced Analytics page.
 */
export async function getAdvancedAnalyticsHandler(
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

    const data = await getAdvancedAnalytics(coldStorageId, request.log);

    return reply.code(200).send({
      success: true,
      data,
      message: "Location analytics retrieved successfully",
    });
  } catch (error) {
    request.log.error({ error }, "Error in getAdvancedAnalyticsHandler");
    if (error instanceof ValidationError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    return sendErrorReply(reply, error);
  }
}
