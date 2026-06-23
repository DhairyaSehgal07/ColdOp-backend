import { z } from "zod";
import { Role } from "./store-admin.model.js";
import mongoose from "mongoose";
import { updateColdStorageBodySchema } from "../cold-storage/cold-storage.schema.js";

export const createStoreAdminSchema = z.object({
  body: z.object({
    coldStorageId: z
      .string()
      .trim()
      .min(1, "Cold storage ID is required")
      .refine(
        (val) => mongoose.Types.ObjectId.isValid(val),
        "Invalid cold storage ID format",
      ),

    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters long")
      .max(100, "Name must not exceed 100 characters"),

    mobileNumber: z
      .string()
      .trim()
      .length(10, "Mobile number must be exactly 10 digits")
      .regex(
        /^[6-9]\d{9}$/,
        "Mobile number must be a valid 10-digit Indian mobile number starting with 6-9",
      ),

    password: z
      .string()
      .min(6, "Password must be at least 6 characters long")
      .max(100, "Password must not exceed 100 characters"),

    role: z.nativeEnum(Role).default(Role.Manager),

    isVerified: z.boolean().optional().default(false),
  }),
});

export const getStoreAdminByIdParamsSchema = z.object({
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
});

export const updateStoreAdminSchema = z.object({
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
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters long")
      .max(100, "Name must not exceed 100 characters")
      .optional(),

    mobileNumber: z
      .string()
      .trim()
      .length(10, "Mobile number must be exactly 10 digits")
      .regex(
        /^[6-9]\d{9}$/,
        "Mobile number must be a valid 10-digit Indian mobile number starting with 6-9",
      )
      .optional(),

    password: z
      .string()
      .min(6, "Password must be at least 6 characters long")
      .max(100, "Password must not exceed 100 characters")
      .optional(),

    role: z.nativeEnum(Role).optional(),

    isVerified: z.boolean().optional(),
  }),
});

export const updateStoreAdminProfileSchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters long")
      .max(100, "Name must not exceed 100 characters")
      .optional(),

    mobileNumber: z
      .string()
      .trim()
      .length(10, "Mobile number must be exactly 10 digits")
      .regex(
        /^[6-9]\d{9}$/,
        "Mobile number must be a valid 10-digit Indian mobile number starting with 6-9",
      )
      .optional(),

    password: z
      .string()
      .min(6, "Password must be at least 6 characters long")
      .max(100, "Password must not exceed 100 characters")
      .optional(),

    role: z.nativeEnum(Role).optional(),

    isVerified: z.boolean().optional(),

    coldStorage: updateColdStorageBodySchema.optional(),
  }),
});

export const deleteStoreAdminParamsSchema = z.object({
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
});

export type CreateStoreAdminInput = z.infer<
  typeof createStoreAdminSchema
>["body"];

export type GetStoreAdminByIdParams = z.infer<
  typeof getStoreAdminByIdParamsSchema
>["params"];

export type UpdateStoreAdminInput = z.infer<
  typeof updateStoreAdminSchema
>["body"];

export type UpdateStoreAdminParams = z.infer<
  typeof updateStoreAdminSchema
>["params"];

export type UpdateStoreAdminProfileInput = z.infer<
  typeof updateStoreAdminProfileSchema
>["body"];

export type DeleteStoreAdminParams = z.infer<
  typeof deleteStoreAdminParamsSchema
>["params"];

export const checkMobileNumberQuerySchema = z.object({
  querystring: z.object({
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

export const loginStoreAdminSchema = z.object({
  body: z.object({
    mobileNumber: z
      .string()
      .trim()
      .length(10, "Mobile number must be exactly 10 digits")
      .regex(
        /^[6-9]\d{9}$/,
        "Mobile number must be a valid 10-digit Indian mobile number starting with 6-9",
      ),
    password: z
      .string()
      .min(1, "Password is required")
      .max(100, "Password must not exceed 100 characters"),
  }),
});

export type CheckMobileNumberQuery = z.infer<
  typeof checkMobileNumberQuerySchema
>["querystring"];

export type LoginStoreAdminInput = z.infer<
  typeof loginStoreAdminSchema
>["body"];

/** Query for GET /next-voucher-number: only "incoming" and "outgoing" allowed */
export const nextVoucherNumberQuerySchema = z.object({
  querystring: z.object({
    type: z.enum(["incoming", "outgoing"], {
      message: "type must be 'incoming' or 'outgoing'",
    }),
  }),
});

export type NextVoucherNumberQuery = z.infer<
  typeof nextVoucherNumberQuerySchema
>["querystring"];

/** Daybook filter: "incoming" = only entries with no outgoing; "outgoing" = entries that have at least one outgoing pass */
export const DAYBOOK_GATE_PASS_TYPES = ["incoming", "outgoing"] as const;

export type DaybookGatePassType = (typeof DAYBOOK_GATE_PASS_TYPES)[number];

/** Daybook list type: "all" = merged incoming + outgoing; "incoming" | "outgoing" = filter by type */
export const DAYBOOK_LIST_TYPES = ["all", "incoming", "outgoing"] as const;

export type DaybookListType = (typeof DAYBOOK_LIST_TYPES)[number];

export const getDaybookQuerySchema = z.object({
  querystring: z.object({
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
    limit: z.coerce
      .number()
      .int()
      .min(1, "Limit must be at least 1")
      .max(100, "Limit must not exceed 100")
      .optional()
      .default(10),
    page: z.coerce
      .number()
      .int()
      .min(1, "Page must be at least 1")
      .optional()
      .default(1),
  }),
});

export type GetDaybookQuery = z.infer<
  typeof getDaybookQuerySchema
>["querystring"];

const searchOrderByReceiptSearchBySchema = z.enum([
  "gatePassNumber",
  "manualParchiNumber",
  "marka",
  "customMarka",
  "remarks",
]);

/** Body for POST /search: gate pass no, manual parchi, marka (gatePassNo/totalBags + customMarka), customMarka, or remarks substring (by searchBy) */
export const searchOrderByReceiptNumberBodySchema = z.object({
  body: z.object({
    receiptNumber: z.string().trim().min(1, "Receipt number is required"),
    searchBy: searchOrderByReceiptSearchBySchema
      .optional()
      .default("gatePassNumber"),
  }),
});

export type SearchOrderByReceiptNumberBody = z.infer<
  typeof searchOrderByReceiptNumberBodySchema
>["body"];
