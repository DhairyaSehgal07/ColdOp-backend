import { FastifyInstance } from "fastify";
import {
  createVoucherHandler,
  createLabourExpenseHandler,
  getAllVouchersHandler,
  getVoucherByIdHandler,
  updateVoucherHandler,
  deleteVoucherHandler,
} from "./voucher.controller.js";
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
 * Register voucher (accounting) routes
 */
export async function voucherRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/",
    {
      schema: {
        description: "Create a new voucher",
        tags: ["Accounting - Vouchers"],
        summary: "Create voucher",
        body: {
          type: "object",
          required: ["date", "debitLedger", "creditLedger", "amount"],
          properties: {
            date: { type: "string", format: "date-time" },
            debitLedger: { type: "string" },
            creditLedger: { type: "string" },
            amount: { type: "number" },
            narration: { type: "string" },
            farmerStorageLinkId: { type: "string", nullable: true },
          },
        },
        response: {
          201: successDataResponse("Voucher created successfully"),
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
    createVoucherHandler as never,
  );

  fastify.post(
    "/labour-expense",
    {
      schema: {
        description:
          "Create one journal voucher per labour-expense debit row. Credit ledger is resolved as Labour Thekedar.",
        tags: ["Accounting - Vouchers"],
        summary: "Create labour expense vouchers",
        body: {
          type: "object",
          required: ["date", "debits"],
          properties: {
            date: { type: "string", format: "date-time" },
            debits: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["debitLedgerId", "amount"],
                properties: {
                  debitLedgerId: { type: "string" },
                  amount: { type: "number" },
                  narration: { type: "string" },
                },
              },
            },
          },
        },
        response: {
          201: successDataResponse("Labour expense vouchers created successfully"),
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" },
      },
    },
    createLabourExpenseHandler as never,
  );

  fastify.get(
    "/",
    {
      schema: {
        description: "Get all vouchers for the cold storage",
        tags: ["Accounting - Vouchers"],
        summary: "List vouchers",
        querystring: {
          type: "object",
          properties: {
            from: { type: "string", format: "date-time" },
            to: { type: "string", format: "date-time" },
            startDate: { type: "string", format: "date-time" },
            endDate: { type: "string", format: "date-time" },
            ledgerId: { type: "string" },
          },
        },
        response: {
          200: {
            description: "List of vouchers",
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
    getAllVouchersHandler as never,
  );

  fastify.get(
    "/:id",
    {
      schema: {
        description: "Get voucher by ID",
        tags: ["Accounting - Vouchers"],
        summary: "Get voucher by ID",
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        response: {
          200: successDataResponse("Voucher details"),
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" },
      },
    },
    getVoucherByIdHandler as never,
  );

  fastify.put(
    "/:id",
    {
      schema: {
        description: "Update voucher",
        tags: ["Accounting - Vouchers"],
        summary: "Update voucher",
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: {
          type: "object",
          properties: {
            date: { type: "string", format: "date-time" },
            debitLedger: { type: "string" },
            creditLedger: { type: "string" },
            amount: { type: "number" },
            narration: { type: "string" },
          },
        },
        response: {
          200: successDataResponse("Voucher updated successfully"),
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" },
      },
    },
    updateVoucherHandler as never,
  );

  fastify.delete(
    "/:id",
    {
      schema: {
        description: "Delete voucher",
        tags: ["Accounting - Vouchers"],
        summary: "Delete voucher",
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        response: {
          200: {
            description: "Voucher deleted successfully",
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
    deleteVoucherHandler as never,
  );
}
