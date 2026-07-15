import { z } from "zod";
import mongoose from "mongoose";

/* =======================
   Create transfer stock
======================= */

const locationSchema = z.object({
  chamber: z.string().trim().min(1, "Chamber is required"),
  floor: z.string().trim().min(1, "Floor is required"),
  row: z.string().trim().min(1, "Row is required"),
});

const transferStockItemSchema = z.object({
  incomingGatePassId: z
    .string()
    .trim()
    .min(1, "Incoming gate pass ID is required")
    .refine(
      (val) => mongoose.Types.ObjectId.isValid(val),
      "Invalid incoming gate pass ID format",
    ),
  bagSize: z.string().trim().min(1, "Bag size is required"),
  quantity: z.coerce
    .number()
    .int("Quantity must be an integer")
    .min(1, "Quantity must be at least 1"),
  location: locationSchema,
});

export const createTransferStockSchema = z.object({
  body: z
    .object({
      fromFarmerStorageLinkId: z
        .string()
        .trim()
        .min(1, "From farmer storage link ID is required")
        .refine(
          (val) => mongoose.Types.ObjectId.isValid(val),
          "Invalid from farmer storage link ID format",
        ),
      toFarmerStorageLinkId: z
        .string()
        .trim()
        .min(1, "To farmer storage link ID is required")
        .refine(
          (val) => mongoose.Types.ObjectId.isValid(val),
          "Invalid to farmer storage link ID format",
        ),
      date: z.coerce.date(),
      truckNumber: z.string().trim().optional(),
      items: z
        .array(transferStockItemSchema)
        .min(1, "At least one item is required"),
      remarks: z.string().trim().optional(),
      customMarka: z.string().trim().optional(),
      amount: z.coerce
        .number()
        .positive("Amount must be greater than 0")
        .optional(),
      narration: z.string().trim().optional(),
      isBuyPotato: z.boolean().optional().default(false),
      isSellPotato: z.boolean().optional().default(false),
    })
    .refine((data) => !(data.isBuyPotato && data.isSellPotato), {
      message: "isBuyPotato and isSellPotato cannot both be true",
      path: ["isBuyPotato"],
    })
    .refine(
      (data) =>
        !(data.isBuyPotato || data.isSellPotato) ||
        (data.amount != null && data.amount > 0),
      {
        message: "Amount is required when isBuyPotato or isSellPotato is true",
        path: ["amount"],
      },
    )
    .refine(
      (data) =>
        !(data.isBuyPotato || data.isSellPotato) ||
        (data.narration != null && data.narration.length > 0),
      {
        message:
          "Narration is required when isBuyPotato or isSellPotato is true",
        path: ["narration"],
      },
    ),
});

export type CreateTransferStockInput = z.infer<
  typeof createTransferStockSchema
>["body"];

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

/** Query params for GET /report */
export const getTransferStockReportQuerySchema = z.object({
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

export type GetTransferStockReportQuery = z.infer<
  typeof getTransferStockReportQuerySchema
>["querystring"];
