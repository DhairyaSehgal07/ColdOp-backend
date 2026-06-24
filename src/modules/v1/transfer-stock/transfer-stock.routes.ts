import { FastifyInstance } from "fastify";
import {
  createTransferStockHandler,
  getTransferStockGatePassesForCurrentStoreHandler,
  getTransferStockReportHandler,
} from "./transfer-stock.controller.js";
import { createTransferStockSchema } from "./transfer-stock.schema.js";
import { authenticate } from "../../../utils/auth.js";

/**
 * Register transfer stock routes.
 * @param fastify - Fastify instance
 */
export async function transferStockRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/report",
    {
      schema: {
        description:
          "Get all transfer stock gate pass records for the authenticated store admin's cold storage without pagination. Optional dateFrom/dateTo filter (YYYY-MM-DD, UTC day boundaries).",
        tags: ["Transfer Stock"],
        summary: "Get transfer stock report",
        querystring: {
          type: "object",
          properties: {
            dateFrom: {
              type: "string",
              description:
                "Filter by date range start (inclusive), ISO date YYYY-MM-DD",
            },
            dateTo: {
              type: "string",
              description:
                "Filter by date range end (inclusive), ISO date YYYY-MM-DD",
            },
          },
        },
        response: {
          200: {
            description: "Transfer stock report",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  transferStockGatePasses: {
                    type: "array",
                    items: { type: "object", additionalProperties: true },
                  },
                },
                required: ["transferStockGatePasses"],
              },
              message: { type: "string" },
            },
          },
          400: {
            description: "Bad request - invalid date format",
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          401: {
            description: "Unauthorized or missing cold storage in token",
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          500: {
            description: "Server error",
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
    getTransferStockReportHandler as never,
  );

  fastify.get(
    "/",
    {
      schema: {
        description:
          "List all transfer stock gate passes for the logged-in store's cold storage",
        tags: ["Transfer Stock"],
        summary: "List transfer stock gate passes for current cold storage",
        response: {
          200: {
            description:
              "List of transfer stock gate passes for current cold storage",
            type: "object",
            properties: {
              status: { type: "string" },
              data: {
                type: "array",
                items: { type: "object", additionalProperties: true },
              },
            },
          },
          400: {
            description: "Bad request / missing cold storage context",
            type: "object",
            properties: {
              status: { type: "string" },
              statusCode: { type: "number" },
              errorCode: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
    getTransferStockGatePassesForCurrentStoreHandler as never,
  );

  fastify.post(
    "/",
    {
      schema: {
        ...createTransferStockSchema,
        description:
          "Create a transfer stock gate pass (move stock from one farmer to another within the warehouse)",
        tags: ["Transfer Stock"],
        summary: "Create transfer stock gate pass",
        response: {
          201: {
            description: "Transfer stock gate pass created successfully",
            type: "object",
            properties: {
              status: { type: "string" },
              message: { type: "string" },
              data: { type: "object", additionalProperties: true },
            },
          },
          400: {
            description: "Bad request / validation error / insufficient stock",
            type: "object",
            properties: {
              status: { type: "string" },
              statusCode: { type: "number" },
              errorCode: { type: "string" },
              message: { type: "string" },
            },
          },
          404: {
            description: "Farmer storage link or incoming gate pass not found",
            type: "object",
            properties: {
              status: { type: "string" },
              statusCode: { type: "number" },
              errorCode: { type: "string" },
              message: { type: "string" },
            },
          },
          409: {
            description:
              "Conflict - duplicate gate pass number or concurrent modification",
            type: "object",
            properties: {
              status: { type: "string" },
              statusCode: { type: "number" },
              errorCode: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
    createTransferStockHandler as never,
  );
}
