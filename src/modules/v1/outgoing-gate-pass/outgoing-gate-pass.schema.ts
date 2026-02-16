import { z } from "zod";
import mongoose from "mongoose";

/* =======================
   Create (from incoming gate passes)
======================= */

const outgoingAllocationSchema = z.object({
  size: z.string().trim().min(1, "Size is required"),
  quantityToAllocate: z.coerce
    .number()
    .int()
    .min(0, "Quantity to allocate must be non-negative"),
});

const outgoingIncomingGatePassAllocationSchema = z.object({
  incomingGatePassId: z
    .string()
    .trim()
    .min(1, "Incoming gate pass ID is required")
    .refine(
      (val) => mongoose.Types.ObjectId.isValid(val),
      "Invalid incoming gate pass ID format",
    ),
  variety: z
    .string()
    .trim()
    .min(1, "Variety is required")
    .max(100, "Variety must not exceed 100 characters"),
  allocations: z
    .array(outgoingAllocationSchema)
    .min(1, "At least one allocation is required"),
});

/** Create payload: type is set server-side to DELIVERY (on snapshot bag sizes) and must not be sent. */
export const createOutgoingGatePassSchema = z.object({
  body: z.object({
    farmerStorageLinkId: z
      .string()
      .trim()
      .min(1, "Farmer storage link ID is required")
      .refine(
        (val) => mongoose.Types.ObjectId.isValid(val),
        "Invalid farmer storage link ID format",
      ),

    gatePassNo: z.coerce
      .number()
      .int("Gate pass number must be an integer")
      .positive("Gate pass number must be a positive number"),

    manualGatePassNumber: z.coerce
      .number()
      .int("Manual gate pass number must be an integer")
      .positive("Manual gate pass number must be a positive number")
      .optional(),

    date: z.coerce.date(),

    from: z
      .string()
      .trim()
      .max(200, "From must not exceed 200 characters")
      .optional(),
    to: z
      .string()
      .trim()
      .max(200, "To must not exceed 200 characters")
      .optional(),

    truckNumber: z
      .string()
      .trim()
      .max(50, "Truck number must not exceed 50 characters")
      .optional(),

    incomingGatePasses: z
      .array(outgoingIncomingGatePassAllocationSchema)
      .min(1, "At least one incoming gate pass with allocations is required"),

    remarks: z
      .string()
      .trim()
      .max(500, "Remarks must not exceed 500 characters")
      .optional(),

    idempotencyKey: z
      .string()
      .trim()
      .min(1, "Idempotency key must be non-empty if provided")
      .max(128)
      .optional(),
  }),
});

export type CreateOutgoingGatePassInput = z.infer<
  typeof createOutgoingGatePassSchema
>["body"];
