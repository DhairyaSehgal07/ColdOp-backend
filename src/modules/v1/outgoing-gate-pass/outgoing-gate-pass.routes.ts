import { FastifyInstance } from "fastify";
import {
  createOutgoingGatePassHandler,
  getOutgoingGatePassByIdHandler,
  getOutgoingGatePassReportHandler,
  getOutgoingGatePassEditHistoryHandler,
  nullOutgoingGatePassHandler,
  updateOutgoingGatePassHandler,
} from "./outgoing-gate-pass.controller.js";
import { createOutgoingGatePassSchema } from "./outgoing-gate-pass.schema.js";
import { authenticate } from "../../../utils/auth.js";

const outgoingOrderDetailItemSchema = {
  type: "object",
  properties: {
    variety: { type: "string" },
    size: { type: "string" },
    quantityAvailable: { type: "number" },
    quantityIssued: { type: "number" },
    location: {
      type: "object",
      properties: {
        chamber: { type: "string" },
        floor: { type: "string" },
        row: { type: "string" },
      },
    },
  },
  required: ["variety", "size", "quantityAvailable", "quantityIssued"],
} as const;

const outgoingGatePassDataSchema = {
  type: "object",
  properties: {
    _id: { type: "string" },
    gatePassNo: { type: "number" },
    date: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    truckNumber: { type: "string" },
    orderDetails: {
      type: "array",
      items: outgoingOrderDetailItemSchema,
    },
    incomingGatePassSnapshots: { type: "array", items: { type: "object" } },
    remarks: { type: "string" },
    stockFilter: { type: "string" },
    generation: { type: "string" },
    manualParchiNumber: { type: "number" },
    isNull: { type: "boolean" },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
  additionalProperties: true,
} as const;

const outgoingAllocationItemSchema = {
  type: "object",
  required: ["size", "quantityToAllocate"],
  properties: {
    size: { type: "string" },
    quantityToAllocate: { type: "number", minimum: 0 },
    location: {
      type: "object",
      properties: {
        chamber: { type: "string" },
        floor: { type: "string" },
        row: { type: "string" },
      },
    },
  },
} as const;

const outgoingIncomingGatePassAllocationBodySchema = {
  type: "object",
  required: ["incomingGatePassId", "variety", "allocations"],
  properties: {
    incomingGatePassId: { type: "string" },
    variety: { type: "string" },
    allocations: {
      type: "array",
      minItems: 1,
      items: outgoingAllocationItemSchema,
    },
  },
} as const;

/**
 * @param fastify - Fastify instance
 */
export async function outgoingGatePassRoutes(fastify: FastifyInstance) {
  const auditItemSchema = {
    type: "object",
    properties: {
      _id: { type: "string" },
      outgoingGatePassId: { type: "string" },
      editedBy: {
        type: "object",
        properties: {
          _id: { type: "string" },
          name: { type: "string" },
        },
      },
      previousState: {
        type: "object",
        additionalProperties: true,
        description: "Field values before the edit (changed fields only)",
      },
      modifiedState: {
        type: "object",
        additionalProperties: true,
        description: "Field values after the edit (changed fields only)",
      },
      ipAddress: { type: "string" },
      userAgent: { type: "string" },
      createdAt: { type: "string", format: "date-time" },
    },
  };

  // Edit history (audit entries) — must be registered before /:id routes
  fastify.get(
    "/edit-history",
    {
      schema: {
        description:
          "Get outgoing gate pass edit history (audit entries) for the current user's cold storage. Optionally filter by outgoingGatePassId. Supports pagination via page and limit.",
        tags: ["Outgoing Gate Pass"],
        summary: "Get outgoing gate pass edit history",
        querystring: {
          type: "object",
          properties: {
            outgoingGatePassId: {
              type: "string",
              description:
                "Optional outgoing gate pass ID to filter audit entries",
            },
            page: {
              type: "number",
              minimum: 1,
              default: 1,
              description: "Page number (default 1)",
            },
            limit: {
              type: "number",
              minimum: 1,
              maximum: 100,
              default: 10,
              description: "Items per page (default 10, max 100)",
            },
          },
        },
        response: {
          200: {
            description: "Outgoing gate pass edit history list",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: { type: "array", items: auditItemSchema },
              pagination: {
                type: "object",
                properties: {
                  page: { type: "number" },
                  limit: { type: "number" },
                  total: { type: "number" },
                  totalPages: { type: "number" },
                  hasNextPage: { type: "boolean" },
                  hasPreviousPage: { type: "boolean" },
                },
              },
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
            description: "Outgoing gate pass not found",
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
          max: 120,
          timeWindow: "1 minute",
        },
      },
    },
    getOutgoingGatePassEditHistoryHandler as never,
  );

  // Report – all outgoing gate passes for cold storage (optional date range, no pagination)
  fastify.get(
    "/report",
    {
      schema: {
        description:
          "Get all outgoing gate pass records for the authenticated store admin's cold storage without pagination. Optional dateFrom/dateTo filter (YYYY-MM-DD, UTC day boundaries).",
        tags: ["Outgoing Gate Pass"],
        summary: "Get outgoing gate pass report",
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
            stockFilter: {
              type: "string",
              description:
                "Optional stock filter. Use FARMER or OWNED to filter report data.",
            },
          },
        },
        response: {
          200: {
            description: "Outgoing gate pass report",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  outgoingGatePasses: {
                    type: "array",
                    items: { type: "object", additionalProperties: true },
                  },
                },
                required: ["outgoingGatePasses"],
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
    getOutgoingGatePassReportHandler as never,
  );

  fastify.post(
    "/",
    {
      schema: {
        ...createOutgoingGatePassSchema,
        description:
          "Create a new outgoing gate pass from incoming gate pass allocations. Multiple varieties are supported via multiple incomingGatePasses entries; each orderDetails line includes variety.",
        tags: ["Outgoing Gate Pass"],
        summary: "Create outgoing gate pass",
        response: {
          201: {
            description: "Outgoing gate pass created successfully",
            type: "object",
            properties: {
              status: { type: "string" },
              message: { type: "string" },
              data: outgoingGatePassDataSchema,
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

  fastify.post(
    "/:id/null",
    {
      schema: {
        description:
          "Null (void) an outgoing gate pass and restore issued quantities to incoming gate passes",
        tags: ["Outgoing Gate Pass"],
        summary: "Null outgoing gate pass",
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", description: "Outgoing gate pass ID" },
          },
        },
        body: {
          type: "object",
          properties: {
            remarks: { type: "string", maxLength: 500 },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            description: "Outgoing gate pass nulled successfully",
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
            description: "Outgoing gate pass not found",
            type: "object",
            properties: {
              status: { type: "string" },
              statusCode: { type: "number" },
              errorCode: { type: "string" },
              message: { type: "string" },
            },
          },
          409: {
            description: "Outgoing gate pass already nulled",
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
    nullOutgoingGatePassHandler as never,
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
              data: outgoingGatePassDataSchema,
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
          "Update outgoing gate pass header fields and/or allocation quantities. Send incomingGatePasses (same shape as create) to change allocations: previous issued quantities are restored on incoming gate passes, then new quantities are deducted (applied as net delta). Omit incomingGatePasses to change header fields only. An audit entry is created.",
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
                "Farmer-storage-link ID (must belong to same cold storage)",
            },
            date: { type: "string", format: "date-time" },
            from: { type: "string" },
            to: { type: "string" },
            truckNumber: { type: "string" },
            remarks: { type: "string" },
            stockFilter: { type: "string" },
            generation: { type: "string" },
            manualParchiNumber: { type: "number" },
            incomingGatePasses: {
              type: "array",
              minItems: 1,
              description:
                "Replaces full allocation set; same shape as create outgoing gate pass",
              items: outgoingIncomingGatePassAllocationBodySchema,
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
