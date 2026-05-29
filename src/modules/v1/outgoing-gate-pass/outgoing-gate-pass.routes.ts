import { FastifyInstance } from "fastify";
import {
  createOutgoingGatePassHandler,
  getOutgoingGatePassByIdHandler,
  updateOutgoingGatePassHandler,
} from "./outgoing-gate-pass.controller.js";
import { createOutgoingGatePassSchema } from "./outgoing-gate-pass.schema.js";
import { authenticate } from "../../../utils/auth.js";

/**
 * @param fastify - Fastify instance
 */
export async function outgoingGatePassRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/",
    {
      schema: {
        ...createOutgoingGatePassSchema,
        description:
          "Create a new outgoing gate pass from incoming gate pass allocations",
        tags: ["Outgoing Gate Pass"],
        summary: "Create outgoing gate pass",
        response: {
          201: {
            description: "Outgoing gate pass created successfully",
            type: "object",
            properties: {
              status: { type: "string" },
              message: { type: "string" },
              data: { type: "object", additionalProperties: true },
            },
          },
          400: {
            description: "Bad request",
            type: "object",
            properties: {
              status: { type: "string" },
              statusCode: { type: "number" },
              errorCode: { type: "string" },
              message: { type: "string" },
            },
          },
          404: {
            description: "Incoming gate pass not found",
            type: "object",
            properties: {
              status: { type: "string" },
              statusCode: { type: "number" },
              errorCode: { type: "string" },
              message: { type: "string" },
            },
          },
          409: {
            description: "Conflict - gate pass number already exists",
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
    createOutgoingGatePassHandler as never,
  );

  fastify.get(
    "/:id",
    {
      schema: {
        description: "Get a single outgoing gate pass by ID",
        tags: ["Outgoing Gate Pass"],
        summary: "Get outgoing gate pass by ID",
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", description: "Outgoing gate pass ID" },
          },
        },
        response: {
          200: {
            description: "Outgoing gate pass retrieved successfully",
            type: "object",
            properties: {
              status: { type: "string" },
              message: { type: "string" },
              data: { type: "object", additionalProperties: true },
            },
          },
          400: {
            description: "Bad request - invalid ID format",
            type: "object",
            properties: {
              status: { type: "string" },
              statusCode: { type: "number" },
              errorCode: { type: "string" },
              message: { type: "string" },
            },
          },
          404: {
            description: "Outgoing gate pass not found",
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
    getOutgoingGatePassByIdHandler as never,
  );

  fastify.patch(
    "/:id",
    {
      schema: {
        description:
          "Update an outgoing gate pass. Send incomingGatePasses (same shape as create) to change allocations: previous issued quantities are restored on incoming gate passes, then new quantities are deducted. Optional header fields mirror incoming PATCH.",
        tags: ["Outgoing Gate Pass"],
        summary: "Edit outgoing gate pass",
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", description: "Outgoing gate pass ID" },
          },
        },
        body: {
          type: "object",
          minProperties: 1,
          properties: {
            farmerStorageLinkId: {
              type: "string",
              description:
                "Farmer-storage-link ID (must belong to the same cold storage)",
            },
            date: { type: "string", format: "date-time" },
            from: { type: "string" },
            to: { type: "string" },
            truckNumber: { type: "string" },
            remarks: { type: "string" },
            manualParchiNumber: { type: "number" },
            incomingGatePasses: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["incomingGatePassId", "variety", "allocations"],
                properties: {
                  incomingGatePassId: { type: "string" },
                  variety: { type: "string" },
                  allocations: {
                    type: "array",
                    minItems: 1,
                    items: {
                      type: "object",
                      required: ["size", "quantityToAllocate"],
                      properties: {
                        size: { type: "string" },
                        quantityToAllocate: { type: "integer", minimum: 0 },
                        location: {
                          type: "object",
                          required: ["chamber", "floor", "row"],
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
            },
          },
        },
        response: {
          200: {
            description: "Outgoing gate pass updated successfully",
            type: "object",
            properties: {
              status: { type: "string" },
              message: { type: "string" },
              data: { type: "object", additionalProperties: true },
            },
          },
          400: {
            description: "Bad request or validation error",
            type: "object",
            properties: {
              status: { type: "string" },
              statusCode: { type: "number" },
              errorCode: { type: "string" },
              message: { type: "string" },
            },
          },
          404: {
            description: "Outgoing gate pass or related resource not found",
            type: "object",
            properties: {
              status: { type: "string" },
              statusCode: { type: "number" },
              errorCode: { type: "string" },
              message: { type: "string" },
            },
          },
          409: {
            description: "Conflict / concurrent modification",
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
    updateOutgoingGatePassHandler as never,
  );
}
