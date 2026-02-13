import { FastifyInstance } from "fastify";
import {
  createLedgerHandler,
  createDefaultLedgersHandler,
  getAllLedgersHandler,
  getLedgerByIdHandler,
  updateLedgerHandler,
  deleteLedgerHandler,
  getLedgerEntriesHandler,
  getBalanceSheetHandler,
} from "./ledger.controller.js";
import { authenticate } from "../../../utils/auth.js";

const errorResponseSchema = {
  type: "object",
  properties: {
    success: { type: "boolean", const: false },
    error: {
      type: "object",
      properties: {
        code: { type: "string" },
        message: { type: "string" },
      },
    },
  },
};

const successDataResponse = (description: string) => ({
  description,
  type: "object",
  properties: {
    success: { type: "boolean", const: true },
    data: { type: "object", additionalProperties: true },
    message: { type: "string" },
  },
});

/**
 * Register ledger (accounting) routes
 */
export async function ledgerRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/",
    {
      schema: {
        description: "Create a new ledger",
        tags: ["Accounting - Ledgers"],
        summary: "Create ledger",
        body: {
          type: "object",
          required: ["name", "type", "subType", "category"],
          properties: {
            name: { type: "string" },
            type: {
              type: "string",
              enum: ["Asset", "Liability", "Income", "Expense", "Equity"],
            },
            subType: { type: "string" },
            category: { type: "string" },
            openingBalance: { type: "number" },
            farmerStorageLinkId: { type: "string", nullable: true },
          },
        },
        response: {
          201: successDataResponse("Ledger created successfully"),
          400: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" },
      },
    },
    createLedgerHandler as never,
  );

  fastify.post(
    "/default",
    {
      schema: {
        description:
          "Create default ledgers for the current logged-in cold storage (no farmer link). Idempotent: skips ledgers that already exist.",
        tags: ["Accounting - Ledgers"],
        summary: "Create default ledgers",
        body: {
          type: "object",
          additionalProperties: false,
          maxProperties: 0,
        },
        response: {
          201: {
            description: "Default ledgers created successfully",
            type: "object",
            properties: {
              success: { type: "boolean", const: true },
              data: {
                type: "object",
                properties: {
                  ledgers: {
                    type: "array",
                    items: { type: "object", additionalProperties: true },
                  },
                },
              },
              message: { type: "string" },
            },
          },
          400: errorResponseSchema,
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    createDefaultLedgersHandler as never,
  );

  fastify.get(
    "/",
    {
      schema: {
        description: "Get all ledgers for the cold storage",
        tags: ["Accounting - Ledgers"],
        summary: "List ledgers",
        querystring: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["Asset", "Liability", "Income", "Expense", "Equity"],
            },
            search: { type: "string" },
            farmerStorageLinkId: { type: "string", nullable: true },
            from: { type: "string", format: "date-time" },
            to: { type: "string", format: "date-time" },
          },
        },
        response: {
          200: {
            description: "List of ledgers with transaction count",
            type: "object",
            properties: {
              success: { type: "boolean", const: true },
              data: {
                type: "array",
                items: { type: "object", additionalProperties: true },
              },
            },
          },
          400: errorResponseSchema,
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" },
      },
    },
    getAllLedgersHandler as never,
  );

  fastify.get(
    "/balance-sheet",
    {
      schema: {
        description:
          "Get balance sheet (Indian standard: Assets, Liabilities, Equity; P&L net profit/loss to equity). Optional from/to for period balances.",
        tags: ["Accounting - Ledgers"],
        summary: "Get balance sheet",
        querystring: {
          type: "object",
          properties: {
            from: { type: "string", format: "date-time" },
            to: { type: "string", format: "date-time" },
          },
        },
        response: {
          200: {
            description: "Balance sheet data",
            type: "object",
            properties: {
              success: { type: "boolean", const: true },
              data: {
                type: "object",
                properties: {
                  assets: {
                    type: "object",
                    properties: {
                      fixedAssets: {
                        type: "object",
                        properties: {
                          total: { type: "number" },
                          breakdown: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                name: { type: "string" },
                                balance: { type: "number" },
                              },
                            },
                          },
                        },
                      },
                      currentAssets: {
                        type: "object",
                        properties: {
                          total: { type: "number" },
                          breakdown: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                name: { type: "string" },
                                balance: { type: "number" },
                              },
                            },
                          },
                        },
                      },
                      total: { type: "number" },
                    },
                  },
                  liabilitiesAndEquity: {
                    type: "object",
                    properties: {
                      currentLiabilities: { type: "object" },
                      longTermLiabilities: { type: "object" },
                      equity: { type: "object" },
                      netProfit: { type: ["number", "null"] },
                      netLoss: { type: ["number", "null"] },
                      total: { type: "number" },
                    },
                  },
                },
              },
            },
          },
          400: errorResponseSchema,
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" },
      },
    },
    getBalanceSheetHandler as never,
  );

  fastify.get(
    "/:id",
    {
      schema: {
        description: "Get ledger by ID",
        tags: ["Accounting - Ledgers"],
        summary: "Get ledger by ID",
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        response: {
          200: successDataResponse("Ledger details"),
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" },
      },
    },
    getLedgerByIdHandler as never,
  );

  fastify.put(
    "/:id",
    {
      schema: {
        description: "Update ledger",
        tags: ["Accounting - Ledgers"],
        summary: "Update ledger",
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: {
          type: "object",
          properties: {
            name: { type: "string" },
            type: {
              type: "string",
              enum: ["Asset", "Liability", "Income", "Expense", "Equity"],
            },
            subType: { type: "string" },
            category: { type: "string" },
            openingBalance: { type: "number" },
            closingBalance: { type: "number" },
          },
        },
        response: {
          200: successDataResponse("Ledger updated successfully"),
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" },
      },
    },
    updateLedgerHandler as never,
  );

  fastify.delete(
    "/:id",
    {
      schema: {
        description: "Delete ledger (only if it has no transactions)",
        tags: ["Accounting - Ledgers"],
        summary: "Delete ledger",
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        response: {
          200: {
            description: "Ledger deleted successfully",
            type: "object",
            properties: {
              success: { type: "boolean", const: true },
              message: { type: "string" },
            },
          },
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" },
      },
    },
    deleteLedgerHandler as never,
  );

  fastify.get(
    "/:id/entries",
    {
      schema: {
        description: "Get ledger entries (vouchers) with running balance",
        tags: ["Accounting - Ledgers"],
        summary: "Get ledger entries",
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        response: {
          200: {
            description: "Ledger with entries and running balance",
            type: "object",
            properties: {
              success: { type: "boolean", const: true },
              data: {
                type: "object",
                properties: {
                  ledger: {
                    type: "object",
                    properties: {
                      _id: { type: "string" },
                      name: { type: "string" },
                      type: { type: "string" },
                      openingBalance: { type: "number" },
                    },
                  },
                  entries: {
                    type: "array",
                    items: { type: "object", additionalProperties: true },
                  },
                },
              },
            },
          },
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" },
      },
    },
    getLedgerEntriesHandler as never,
  );
}
