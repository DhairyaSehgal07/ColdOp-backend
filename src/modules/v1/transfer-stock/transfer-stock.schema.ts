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
  body: z.object({
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
  }),
});

export type CreateTransferStockInput = z.infer<
  typeof createTransferStockSchema
>["body"];
