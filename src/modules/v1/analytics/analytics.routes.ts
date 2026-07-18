import { FastifyInstance } from "fastify";
import {
  getSummaryHandler,
  getTopFarmersHandler,
  getVarietyBreakdownHandler,
  getIncomingGatePassesHandler,
  getAdvancedAnalyticsHandler,
} from "./analytics.controller.js";
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

/** One stock-summary bucket (used for ungrouped summary and per stockFilter group) */
const stockSummaryResultSchema = {
  type: "object" as const,
  properties: {
    stockSummary: {
      type: "array" as const,
      items: varietyItemSchema,
    },
    chartData: {
      type: "object" as const,
      properties: {
        flatSeries: {
          type: "array" as const,
          items: chartDataPointSchema,
        },
        varieties: {
          type: "array" as const,
          items: { type: "string" },
        },
        sizes: {
          type: "array" as const,
          items: { type: "string" },
        },
      },
      required: ["flatSeries", "varieties", "sizes"],
    },
    totalInventory: totalInventorySchema,
    topVariety: {
      oneOf: [topVarietySchema, { type: "null" }],
    },
    topSize: { oneOf: [topSizeSchema, { type: "null" }] },
  },
  required: [
    "stockSummary",
    "chartData",
    "totalInventory",
    "topVariety",
    "topSize",
  ],
};

const topFarmerChartPointSchema = {
  type: "object" as const,
  properties: {
    name: { type: "string" },
    value: { type: "number" },
  },
  required: ["name", "value"],
};

const topFarmersChartDataSchema = {
  type: "object" as const,
  properties: {
    byCurrentQuantity: {
      type: "array" as const,
      items: topFarmerChartPointSchema,
    },
    byInitialQuantity: {
      type: "array" as const,
      items: topFarmerChartPointSchema,
    },
    byQuantityRemoved: {
      type: "array" as const,
      items: topFarmerChartPointSchema,
    },
  },
  required: ["byCurrentQuantity", "byInitialQuantity", "byQuantityRemoved"],
};

const varietyBreakdownFarmerContributionSchema = {
  type: "object" as const,
  properties: {
    farmerName: { type: "string" },
    initialQuantity: { type: "number" },
    currentQuantity: { type: "number" },
    quantityRemoved: { type: "number" },
  },
  required: [
    "farmerName",
    "initialQuantity",
    "currentQuantity",
    "quantityRemoved",
  ],
};

const varietyBreakdownSizeSchema = {
  type: "object" as const,
  properties: {
    size: { type: "string" },
    initialQuantity: { type: "number" },
    currentQuantity: { type: "number" },
    quantityRemoved: { type: "number" },
    farmerBreakdown: {
      type: "array" as const,
      items: varietyBreakdownFarmerContributionSchema,
    },
  },
  required: [
    "size",
    "initialQuantity",
    "currentQuantity",
    "quantityRemoved",
    "farmerBreakdown",
  ],
};

const varietyBreakdownResultSchema = {
  type: "object" as const,
  properties: {
    variety: { type: "string" },
    sizes: {
      type: "array" as const,
      items: varietyBreakdownSizeSchema,
    },
  },
  required: ["variety", "sizes"],
};

const advancedAnalyticsLocationSchema = {
  type: "object" as const,
  properties: {
    chamber: { type: "string" },
    floor: { type: "string" },
    row: { type: "string" },
  },
  required: ["chamber", "floor", "row"],
};

const advancedAnalyticsBagSchema = {
  type: "object" as const,
  properties: {
    name: { type: "string" },
    initialQuantity: { type: "number" },
    currentQuantity: { type: "number" },
    location: advancedAnalyticsLocationSchema,
  },
  required: ["name", "initialQuantity", "currentQuantity", "location"],
};

const advancedAnalyticsOrderSummarySchema = {
  type: "object" as const,
  properties: {
    _id: { type: "string" },
    gatePassNo: { type: "number" },
    date: { type: "string" },
    variety: { type: "string" },
    farmerId: { type: "string" },
    farmerName: { type: "string" },
    bagSizes: {
      type: "array" as const,
      items: advancedAnalyticsBagSchema,
    },
  },
  required: [
    "_id",
    "gatePassNo",
    "date",
    "variety",
    "farmerId",
    "farmerName",
    "bagSizes",
  ],
};

const advancedAnalyticsFloorSchema = {
  type: "object" as const,
  properties: {
    floor: { type: "string" },
    initialTotal: { type: "number" },
    currentTotal: { type: "number" },
  },
  required: ["floor", "initialTotal", "currentTotal"],
};

const advancedAnalyticsChamberSchema = {
  type: "object" as const,
  properties: {
    chamber: { type: "string" },
    initialTotal: { type: "number" },
    currentTotal: { type: "number" },
    orderCount: { type: "number" },
    floors: {
      type: "array" as const,
      items: advancedAnalyticsFloorSchema,
    },
    orders: {
      type: "array" as const,
      items: advancedAnalyticsOrderSummarySchema,
    },
  },
  required: [
    "chamber",
    "initialTotal",
    "currentTotal",
    "orderCount",
    "floors",
    "orders",
  ],
};

const advancedAnalyticsFarmerSchema = {
  type: "object" as const,
  properties: {
    farmerId: { type: "string" },
    farmerName: { type: "string" },
    accountNumber: { oneOf: [{ type: "number" }, { type: "null" }] },
    orderCount: { type: "number" },
    orders: {
      type: "array" as const,
      items: advancedAnalyticsOrderSummarySchema,
    },
  },
  required: ["farmerId", "farmerName", "accountNumber", "orderCount", "orders"],
};

const advancedAnalyticsDataSchema = {
  type: "object" as const,
  properties: {
    byLocation: {
      type: "object" as const,
      properties: {
        chambers: {
          type: "array" as const,
          items: advancedAnalyticsChamberSchema,
        },
      },
      required: ["chambers"],
    },
    byFarmer: {
      type: "array" as const,
      items: advancedAnalyticsFarmerSchema,
    },
  },
  required: ["byLocation", "byFarmer"],
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
          "Get stock summary: all bag varieties and sizes with initial/current quantity and quantity removed (initial − current); total inventory (initial and current); top variety and top bag size by current quantity; chart-ready data for Recharts. Quantities are aggregated from IncomingGatePass only (outgoing gate pass snapshots are not used). Scoped to authenticated user's cold storage. If stockFilter=true, summary is grouped by every distinct non-empty stockFilter value found in data. Returns 400 if no stock filter values exist.",
        tags: ["Analytics"],
        summary: "Get stock summary",
        querystring: {
          type: "object",
          properties: {
            stockFilter: {
              type: "string",
              description:
                "If 'true', group summary by all distinct stockFilter values in data",
              enum: ["true", "false"],
            },
          },
        },
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
                    description:
                      "Present when stockFilter is not true (default)",
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
                  stockSummaryByFilter: {
                    type: "object",
                    description:
                      "Present when stockFilter=true: summary keyed by each distinct stockFilter string",
                    additionalProperties: stockSummaryResultSchema,
                  },
                },
                required: [],
              },
              message: { type: "string" },
            },
            required: ["success", "data", "message"],
          },
          400: {
            description:
              "No stock filter values found (disable stock filter from preferences)",
            ...errorResponse,
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

  // GET /top-farmers – top 5 farmers by current/initial/quantityRemoved for Recharts
  fastify.get(
    "/top-farmers",
    {
      schema: {
        description:
          "Get top 5 farmers by current quantity, initial quantity, and quantity removed for the authenticated store. Response is formatted for Recharts: each series is an array of { name, value }.",
        tags: ["Analytics"],
        summary: "Get top 5 farmers (chart-ready)",
        response: {
          200: {
            description: "Top farmers chart data",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  chartData: topFarmersChartDataSchema,
                },
                required: ["chartData"],
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
    getTopFarmersHandler as never,
  );

  // GET /incoming-gate-passes – all incoming gate passes for the logged-in storage
  fastify.get(
    "/incoming-gate-passes",
    {
      schema: {
        description:
          "Get all incoming gate passes for the authenticated cold storage. Documents include populated farmer and createdBy.",
        tags: ["Analytics"],
        summary: "Get all incoming gate passes for storage",
        response: {
          200: {
            description: "List of incoming gate passes",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  incomingGatePasses: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: true,
                    },
                  },
                },
                required: ["incomingGatePasses"],
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
    getIncomingGatePassesHandler as never,
  );

  // GET /location-analytics – pre-computed location drill-down and farmer grouping
  fastify.get(
    "/location-analytics",
    {
      schema: {
        description:
          "Get location analytics for the authenticated cold storage: chamber-wise location drill-down (chambers, floors, orders) and farmer grouping. Returns both initial and current quantities; the client toggles display mode. Aggregated from IncomingGatePass bag locations.",
        tags: ["Analytics"],
        summary: "Get location analytics (location + farmer)",
        response: {
          200: {
            description: "Location analytics data",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: advancedAnalyticsDataSchema,
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
    getAdvancedAnalyticsHandler as never,
  );

  // GET /variety-breakdown?variety=... – sizes and per-farmer contribution for a variety
  fastify.get(
    "/variety-breakdown",
    {
      schema: {
        description:
          "Get breakdown for a variety: all sizes with initial/current/quantityRemoved and per-farmer contribution per size. Scoped to authenticated store. If stockFilter=true, breakdown is grouped by every distinct stockFilter value found in data. Returns 400 if no stock filter values exist.",
        tags: ["Analytics"],
        summary: "Get variety breakdown by size and farmer",
        querystring: {
          type: "object",
          required: ["variety"],
          properties: {
            variety: {
              type: "string",
              description: "Variety name (e.g. Potato)",
            },
            stockFilter: {
              type: "string",
              description:
                "If 'true', group breakdown by all distinct stockFilter values in data",
              enum: ["true", "false"],
            },
          },
        },
        response: {
          200: {
            description:
              "Variety breakdown with sizes and farmer contributions",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  variety: { type: "string" },
                  sizes: {
                    type: "array",
                    items: varietyBreakdownSizeSchema,
                    description:
                      "Present when stockFilter is not true (default)",
                  },
                  varietyBreakdownByFilter: {
                    type: "object",
                    description:
                      "Present when stockFilter=true: breakdown keyed by each distinct stockFilter string",
                    additionalProperties: varietyBreakdownResultSchema,
                  },
                },
                required: [],
              },
              message: { type: "string" },
            },
            required: ["success", "data", "message"],
          },
          401: {
            description: "Unauthorized or missing cold storage in token",
            ...errorResponse,
          },
          400: {
            description:
              "Variety name missing/invalid, or no stock filter values found (disable stock filter from preferences)",
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
    getVarietyBreakdownHandler as never,
  );
}
