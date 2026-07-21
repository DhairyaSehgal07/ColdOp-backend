import { z } from "zod";
import mongoose from "mongoose";

const locationSchema = z.object({
  chamber: z.string().trim().min(1, "Chamber is required"),
  floor: z.string().trim().min(1, "Floor is required"),
  row: z.string().trim().min(1, "Row is required"),
});

const bagSizeSchema = z.object({
  name: z.string().trim().min(1, "Bag size name is required"),
  initialQuantity: z.coerce.number().min(0, "Initial quantity must be >= 0"),
  currentQuantity: z.coerce.number().min(0, "Current quantity must be >= 0"),
  location: locationSchema,
  paltaiLocation: z.array(locationSchema).optional(),
});

/** Create payload: type is set server-side (RECEIPT for regular incoming; transfer stock uses Incoming-transfer on the generated receipt) and must not be sent. */
export const createIncomingGatePassSchema = z.object({
  body: z.object({
    farmerStorageLinkId: z
      .string()
      .trim()
      .min(1, "Farmer storage link ID is required")
      .refine(
        (val) => mongoose.Types.ObjectId.isValid(val),
        "Invalid farmer storage link ID format",
      ),

    date: z.coerce.date(),

    variety: z.string().trim().min(1, "Variety is required"),

    truckNumber: z.string().trim().optional(),

    bagSizes: z
      .array(bagSizeSchema)
      .min(1, "At least one bag size is required"),

    remarks: z.string().trim().optional(),

    manualParchiNumber: z.string().trim().optional(),

    stockFilter: z.string().trim().optional(),

    customMarka: z.string().trim().optional(),

    // Voucher amount when cold storage showFinances is true (ledgers resolved on backend)
    amount: z.coerce
      .number()
      .positive("Amount must be greater than 0")
      .optional(),

    coldStorageId: z
      .string()
      .trim()
      .refine(
        (val) => !val || mongoose.Types.ObjectId.isValid(val),
        "Invalid cold storage ID format",
      )
      .optional(),

    createdById: z
      .string()
      .trim()
      .refine(
        (val) => !val || mongoose.Types.ObjectId.isValid(val),
        "Invalid createdById format",
      )
      .optional(),
  }),
});

export type CreateIncomingGatePassInput = z.infer<
  typeof createIncomingGatePassSchema
>["body"];

/** Update payload: all fields optional; at least one required. Quantities update both initial and current. */
export const updateIncomingGatePassSchema = z.object({
  params: z.object({
    id: z
      .string()
      .trim()
      .min(1, "Incoming gate pass ID is required")
      .refine(
        (val) => mongoose.Types.ObjectId.isValid(val),
        "Invalid incoming gate pass ID format",
      ),
  }),
  body: z
    .object({
      farmerStorageLinkId: z
        .string()
        .trim()
        .min(1, "Farmer storage link ID cannot be empty")
        .refine(
          (val) => mongoose.Types.ObjectId.isValid(val),
          "Invalid farmer storage link ID format",
        )
        .optional(),
      date: z.coerce.date().optional(),
      variety: z.string().trim().min(1, "Variety cannot be empty").optional(),
      truckNumber: z.string().trim().optional(),
      remarks: z.string().trim().optional(),
      manualParchiNumber: z.string().trim().optional(),
      bagSizes: z
        .array(bagSizeSchema)
        .min(1, "At least one bag size is required")
        .optional(),
      /** Rent entry voucher amount (when gate pass has an associated rent voucher). */
      amount: z.coerce
        .number()
        .positive("Amount must be greater than 0")
        .optional(),
      stockFilter: z.string().trim().optional(),
      customMarka: z.string().trim().optional(),
    })
    .refine(
      (data) =>
        data.farmerStorageLinkId !== undefined ||
        data.date !== undefined ||
        data.variety !== undefined ||
        data.truckNumber !== undefined ||
        data.remarks !== undefined ||
        data.manualParchiNumber !== undefined ||
        data.bagSizes !== undefined ||
        data.amount !== undefined ||
        data.stockFilter !== undefined ||
        data.customMarka !== undefined,
      "At least one field must be provided for update",
    ),
});

export type UpdateIncomingGatePassParams = z.infer<
  typeof updateIncomingGatePassSchema
>["params"];
export type UpdateIncomingGatePassBody = z.infer<
  typeof updateIncomingGatePassSchema
>["body"];

/** Query params for GET /edit-history */
export const getIncomingGatePassEditHistoryQuerySchema = z.object({
  querystring: z.object({
    incomingGatePassId: z
      .string()
      .trim()
      .refine(
        (val) => !val || mongoose.Types.ObjectId.isValid(val),
        "Invalid incoming gate pass ID format",
      )
      .optional(),
    page: z.coerce
      .number()
      .int()
      .min(1, "Page must be at least 1")
      .optional()
      .default(1),
    limit: z.coerce
      .number()
      .int()
      .min(1, "Limit must be at least 1")
      .max(100, "Limit must not exceed 100")
      .optional()
      .default(10),
  }),
});

export type GetIncomingGatePassEditHistoryQuery = z.infer<
  typeof getIncomingGatePassEditHistoryQuerySchema
>["querystring"];

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

/** Query params for GET /report */
export const getIncomingGatePassReportQuerySchema = z.object({
  querystring: z.object({
    dateFrom: z
      .string()
      .trim()
      .regex(
        isoDateRegex,
        "dateFrom must be an ISO date, e.g. 2026-03-01",
      )
      .optional(),
    dateTo: z
      .string()
      .trim()
      .regex(isoDateRegex, "dateTo must be an ISO date, e.g. 2026-03-07")
      .optional(),
  }),
});

export type GetIncomingGatePassReportQuery = z.infer<
  typeof getIncomingGatePassReportQuerySchema
>["querystring"];

