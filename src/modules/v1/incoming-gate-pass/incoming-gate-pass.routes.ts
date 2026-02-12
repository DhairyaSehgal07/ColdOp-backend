import { FastifyInstance } from "fastify";
import {
  createIncomingGatePassHandler,
  getIncomingGatePassesByFarmerStorageLinkIdHandler,
  updateIncomingGatePassHandler,
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

  // Update (edit) incoming gate pass by ID
  fastify.patch(
    "/:id",
    {
      schema: {
        description:
          "Update an existing incoming gate pass by ID. When updating bagSizes, both initial and current quantities are updated. An edit-history entry is created.",
        tags: ["Incoming Gate Pass"],
        summary: "Edit incoming gate pass",
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", description: "Incoming gate pass ID" },
          },
        },
        body: {
          type: "object",
          minProperties: 1,
          properties: {
            date: { type: "string", format: "date-time" },
            variety: { type: "string" },
            truckNumber: { type: "string" },
            remarks: { type: "string" },
            manualParchiNumber: { type: "string" },
            amount: {
              type: "number",
              minimum: 0.01,
              description:
                "Rent entry voucher amount (only when gate pass has an associated rent voucher)",
            },
            bagSizes: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: [
                  "name",
                  "initialQuantity",
                  "currentQuantity",
                  "location",
                ],
                properties: {
                  name: { type: "string" },
                  initialQuantity: { type: "number", minimum: 0 },
                  currentQuantity: { type: "number", minimum: 0 },
                  location: {
                    type: "object",
                    required: ["chamber", "floor", "row"],
                    properties: {
                      chamber: { type: "string" },
                      floor: { type: "string" },
                      row: { type: "string" },
                    },
                  },
                  paltaiLocation: {
                    type: "object",
                    properties: {
                      chamber: { type: "string" },
                      floor: { type: "string" },
                      row: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
        response: {
          200: {
            description: "Incoming gate pass updated successfully",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: { type: "object", additionalProperties: true },
              message: { type: "string" },
            },
          },
          400: {
            description:
              "Bad request - invalid ID, closed gate pass, or validation error",
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
            description: "Incoming gate pass not found",
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
            description: "Conflict",
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
    updateIncomingGatePassHandler as never,
  );
}
