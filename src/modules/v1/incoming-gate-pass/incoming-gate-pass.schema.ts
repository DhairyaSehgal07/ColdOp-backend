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
  paltaiLocation: locationSchema.optional(),
});

/** Create payload: type is set server-side (RECEIPT for regular incoming, TRANSFER for transfer stock) and must not be sent. */
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
