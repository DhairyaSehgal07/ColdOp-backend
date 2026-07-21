import { FastifyInstance } from "fastify";
import {
  createIncomingGatePassHandler,
  getIncomingGatePassesByFarmerStorageLinkIdHandler,
  getIncomingGatePassReportHandler,
  updateIncomingGatePassHandler,
  getIncomingGatePassEditHistoryHandler,
} from "./incoming-gate-pass.controller.js";
import { createIncomingGatePassSchema } from "./incoming-gate-pass.schema.js";
import { authenticate } from "../../../utils/auth.js";

/**
 * Register incoming gate pass routes
 * @param fastify - Fastify instance
 */
export async function incomingGatePassRoutes(fastify: FastifyInstance) {
  const auditItemSchema = {
    type: "object",
    properties: {
      _id: { type: "string" },
      incomingGatePassId: { type: "string" },
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
          "Get incoming gate pass edit history (audit entries) for the current user's cold storage. Optionally filter by incomingGatePassId. Supports pagination via page and limit.",
        tags: ["Incoming Gate Pass"],
        summary: "Get incoming gate pass edit history",
        querystring: {
          type: "object",
          properties: {
            incomingGatePassId: {
              type: "string",
              description:
                "Optional incoming gate pass ID to filter audit entries",
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
            description: "Incoming gate pass edit history list",
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
    getIncomingGatePassEditHistoryHandler as never,
  );

  // Report – all incoming gate passes for cold storage (optional date range, no pagination)
  fastify.get(
    "/report",
    {
      schema: {
        description:
          "Get all incoming gate pass records for the authenticated store admin's cold storage without pagination. Optional dateFrom/dateTo filter (YYYY-MM-DD, UTC day boundaries).",
        tags: ["Incoming Gate Pass"],
        summary: "Get incoming gate pass report",
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
            description: "Incoming gate pass report",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  incomingGatePasses: {
                    type: "array",
                    items: { type: "object", additionalProperties: true },
                  },
                  initialTotal: {
                    type: "number",
                    description:
                      "Sum of initialQuantity across all bag sizes in the report",
                  },
                  currentTotal: {
                    type: "number",
                    description:
                      "Sum of currentQuantity across all bag sizes in the report",
                  },
                },
                required: ["incomingGatePasses", "initialTotal", "currentTotal"],
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
    getIncomingGatePassReportHandler as never,
  );

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
          "Update an existing incoming gate pass by ID. When updating bagSizes, both initial and current quantities are updated. When showFinances is enabled and a rent entry voucher exists, rent is synced: bagSizes and/or farmerStorageLinkId recalculate amount as costPerBag × Σ initialQuantity (net bags) and repoint the debit ledger to the farmer's Debtors ledger (credit remains Store Rent); date updates the voucher date; explicit amount alone updates voucher amount. An audit entry is created.",
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
            farmerStorageLinkId: {
              type: "string",
              description:
                "Farmer-storage-link ID to associate the gate pass with (must belong to same cold storage). When showFinances is on, also moves the rent voucher debit ledger to this farmer's Debtors ledger and recalculates amount from that link's costPerBag × net bags.",
            },
            date: {
              type: "string",
              format: "date-time",
              description:
                "Gate pass date. When showFinances is on, also updates the associated rent voucher date.",
            },
            variety: { type: "string" },
            truckNumber: { type: "string" },
            remarks: { type: "string" },
            manualParchiNumber: { type: "string" },
            stockFilter: { type: "string" },
            customMarka: { type: "string" },
            amount: {
              type: "number",
              minimum: 0.01,
              description:
                "Rent entry voucher amount (only when gate pass has an associated rent voucher). Ignored when bagSizes and/or farmerStorageLinkId is sent — amount is then auto-derived as costPerBag × Σ initialQuantity.",
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
                    type: "array",
                    items: {
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
