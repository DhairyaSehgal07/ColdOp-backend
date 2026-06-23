import { z } from "zod";
import mongoose from "mongoose";

/** Body for POST /check – check if a farmer exists by mobile number */
export const checkFarmerMobileSchema = z.object({
  body: z.object({
    mobileNumber: z
      .string()
      .trim()
      .length(10, "Mobile number must be exactly 10 digits")
      .regex(
        /^[6-9]\d{9}$/,
        "Mobile number must be a valid 10-digit Indian mobile number starting with 6-9",
      ),
  }),
});

export type CheckFarmerMobileBody = z.infer<
  typeof checkFarmerMobileSchema
>["body"];

const storeFarmerMobileNumber = z
  .string()
  .trim()
  .length(10, "Mobile number must be exactly 10 digits")
  .regex(
    /^[6-9]\d{9}$/,
    "Mobile number must be a valid 10-digit Indian mobile number starting with 6-9",
  );

const storeFarmerName = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters long")
  .max(100, "Name must not exceed 100 characters");

const storeFarmerAddress = z
  .string()
  .trim()
  .min(1, "Address is required")
  .max(500, "Address must not exceed 500 characters");

/** Body for POST /quick-register-farmer – create farmer-storage-link for current cold storage */
export const quickRegisterFarmerSchema = z.object({
  body: z.object({
    name: storeFarmerName,
    address: storeFarmerAddress,
    mobileNumber: storeFarmerMobileNumber,
    imageUrl: z.string().trim().optional(),
    accountNumber: z.coerce
      .number()
      .int()
      .positive("Account number must be a positive integer")
      .optional(),
    openingBalance: z.coerce.number().default(0),
    costPerBag: z.coerce.number().positive().optional(),
  }),
});

export type QuickRegisterFarmerBody = z.infer<
  typeof quickRegisterFarmerSchema
>["body"];

export const updateFarmerStorageLinkSchema = z.object({
  params: z.object({
    id: z
      .string()
      .trim()
      .min(1, "ID is required")
      .refine(
        (val) => mongoose.Types.ObjectId.isValid(val),
        "Invalid ID format",
      ),
  }),
  body: z.object({
    name: storeFarmerName.optional(),
    address: storeFarmerAddress.optional(),
    mobileNumber: storeFarmerMobileNumber.optional(),
    imageUrl: z.string().trim().optional(),
    accountNumber: z.coerce
      .number()
      .int()
      .positive("Account number must be a positive integer")
      .optional(),
    isActive: z.boolean().optional(),
    notes: z.string().trim().optional(),
    linkedById: z
      .string()
      .trim()
      .refine(
        (val) => !val || mongoose.Types.ObjectId.isValid(val),
        "Invalid store admin ID format",
      )
      .optional(),
    openingBalance: z.coerce.number().optional(),
    costPerBag: z.coerce.number().positive().optional(),
  }),
});

export type UpdateFarmerStorageLinkParams = z.infer<
  typeof updateFarmerStorageLinkSchema
>["params"];

export type UpdateFarmerStorageLinkInput = z.infer<
  typeof updateFarmerStorageLinkSchema
>["body"];

export const GATE_PASS_LIST_TYPES = ["all", "incoming", "outgoing"] as const;

export type GatePassListType = (typeof GATE_PASS_LIST_TYPES)[number];

/** Params and querystring for GET /:id/gate-passes (no pagination) */
export const getFarmerStorageLinkGatePassesSchema = z.object({
  params: z.object({
    id: z
      .string()
      .trim()
      .min(1, "Farmer storage link ID is required")
      .refine(
        (val) => mongoose.Types.ObjectId.isValid(val),
        "Invalid farmer storage link ID format",
      ),
  }),
  querystring: z.object({
    from: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD")
      .optional(),
    to: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD")
      .optional(),
    type: z
      .enum(["all", "incoming", "outgoing"], {
        message: "type must be 'all', 'incoming', or 'outgoing'",
      })
      .optional()
      .default("all"),
    sortBy: z
      .string()
      .optional()
      .transform((s) => (s === "latest" ? "latest" : "oldest")),
  }),
});

export type GetFarmerStorageLinkGatePassesParams = z.infer<
  typeof getFarmerStorageLinkGatePassesSchema
>["params"];

export type GetFarmerStorageLinkGatePassesQuery = z.infer<
  typeof getFarmerStorageLinkGatePassesSchema
>["querystring"];
