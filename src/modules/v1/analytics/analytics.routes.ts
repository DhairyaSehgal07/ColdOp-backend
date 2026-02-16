import { FastifyInstance } from "fastify";
import { getSummaryHandler } from "./analytics.controller.js";
import { authenticate } from "../../../utils/auth.js";

/** Reusable error response schema for OpenAPI */
const errorResponse = {
  type: "object" as const,
  properties: {
    success: { type: "boolean" as const, const: false },
    error: {
      type: "object" as const,
      properties: {
        code: { type: "string" },
        message: { type: "string" },
      },
      required: ["code", "message"],
    },
  },
  required: ["success", "error"],
};

const sizeItemSchema = {
  type: "object" as const,
  properties: {
    size: { type: "string" },
    initialQuantity: { type: "number" },
    currentQuantity: { type: "number" },
  },
  required: ["size", "initialQuantity", "currentQuantity"],
};

const varietyItemSchema = {
  type: "object" as const,
  properties: {
    variety: { type: "string" },
    sizes: {
      type: "array" as const,
      items: sizeItemSchema,
    },
  },
  required: ["variety", "sizes"],
};

const chartDataPointSchema = {
  type: "object" as const,
  properties: {
    name: { type: "string" },
    variety: { type: "string" },
    size: { type: "string" },
    initialQuantity: { type: "number" },
    currentQuantity: { type: "number" },
  },
  required: ["name", "variety", "size", "initialQuantity", "currentQuantity"],
};

const totalInventorySchema = {
  type: "object" as const,
  properties: {
    initial: { type: "number" },
    current: { type: "number" },
  },
  required: ["initial", "current"],
};

const topVarietySchema = {
  type: "object" as const,
  properties: {
    variety: { type: "string" },
    currentQuantity: { type: "number" },
  },
  required: ["variety", "currentQuantity"],
};

const topSizeSchema = {
  type: "object" as const,
  properties: {
    size: { type: "string" },
    currentQuantity: { type: "number" },
  },
  required: ["size", "currentQuantity"],
};

/**
 * Register analytics routes
 * @param fastify - Fastify instance
 */
export async function analyticsRoutes(fastify: FastifyInstance) {
  fastify.get("/", (_request, reply) => {
    return reply.code(200).send({
      success: true,
      data: {},
      message: "Analytics created successfully",
    });
  });

  // GET /summary – stock summary by variety and size with chart data for Recharts
  fastify.get(
    "/summary",
    {
      schema: {
        description:
          "Get stock summary: all bag varieties and sizes with initial/current quantity and quantity removed (initial − current); total inventory (initial and current); top variety and top bag size by current quantity; chart-ready data for Recharts. Quantities are aggregated from IncomingGatePass only (outgoing gate pass snapshots are not used). Scoped to authenticated user's cold storage.",
        tags: ["Analytics"],
        summary: "Get stock summary",
        response: {
          200: {
            description: "Stock summary and chart data",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  stockSummary: {
                    type: "array",
                    items: varietyItemSchema,
                  },
                  chartData: {
                    type: "object",
                    properties: {
                      flatSeries: {
                        type: "array",
                        items: chartDataPointSchema,
                      },
                      varieties: {
                        type: "array",
                        items: { type: "string" },
                      },
                      sizes: {
                        type: "array",
                        items: { type: "string" },
                      },
                    },
                    required: ["flatSeries", "varieties", "sizes"],
                  },
                  totalInventory: totalInventorySchema,
                  topVariety: {
                    oneOf: [topVarietySchema, { type: "null" }],
                  },
                  topSize: {
                    oneOf: [topSizeSchema, { type: "null" }],
                  },
                },
                required: [
                  "stockSummary",
                  "chartData",
                  "totalInventory",
                  "topVariety",
                  "topSize",
                ],
              },
              message: { type: "string" },
            },
            required: ["success", "data", "message"],
          },
          401: {
            description: "Unauthorized or missing cold storage in token",
            ...errorResponse,
          },
          500: {
            description: "Server error",
            ...errorResponse,
          },
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: {
          max: 100,
          timeWindow: "1 minute",
        },
      },
    },
    getSummaryHandler as never,
  );
}
