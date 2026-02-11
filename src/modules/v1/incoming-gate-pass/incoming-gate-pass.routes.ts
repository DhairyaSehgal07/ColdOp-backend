import { FastifyInstance } from "fastify";
import {
  createIncomingGatePassHandler,
  getIncomingGatePassesByFarmerStorageLinkIdHandler,
} from "./incoming-gate-pass.controller.js";
import { createIncomingGatePassSchema } from "./incoming-gate-pass.schema.js";
import { authenticate } from "../../../utils/auth.js";

/**
 * Register incoming gate pass routes
 * @param fastify - Fastify instance
 */
export async function incomingGatePassRoutes(fastify: FastifyInstance) {
  // Get all incoming gate passes for a farmer-storage-link
  fastify.get(
    "/farmer-storage-link/:farmerStorageLinkId",
    {
      schema: {
        description:
          "Get all incoming gate passes for a specific farmer-storage-link",
        tags: ["Incoming Gate Pass"],
        summary: "List incoming gate passes by farmer-storage-link",
        params: {
          type: "object",
          required: ["farmerStorageLinkId"],
          properties: {
            farmerStorageLinkId: {
              type: "string",
              description: "Farmer-storage-link ID",
            },
          },
        },
        response: {
          200: {
            description: "List of incoming gate passes",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "array",
                items: { type: "object", additionalProperties: true },
              },
              message: { type: "string" },
            },
          },
          400: {
            description: "Bad request - invalid farmer-storage-link ID",
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
          404: {
            description: "Farmer-storage-link not found",
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
    getIncomingGatePassesByFarmerStorageLinkIdHandler as never,
  );

  // Create incoming gate pass
  fastify.post(
    "/",
    {
      schema: {
        ...createIncomingGatePassSchema,
        description: "Create a new incoming gate pass",
        tags: ["Incoming Gate Pass"],
        summary: "Create incoming gate pass",
        response: {
          201: {
            description: "Incoming gate pass created successfully",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: { type: "object", additionalProperties: true },
              message: { type: "string" },
            },
          },
          400: {
            description: "Bad request",
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
          404: {
            description: "Farmer-storage-link not found",
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
          409: {
            description: "Conflict - resource already exists",
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
    createIncomingGatePassHandler as never,
  );
}
