import { z } from "zod";
import { Role } from "./store-admin.model.js";
import mongoose from "mongoose";

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

export const quickRegisterFarmerSchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters long")
      .max(100, "Name must not exceed 100 characters"),

    address: z
      .string()
      .trim()
      .min(1, "Address is required")
      .max(500, "Address must not exceed 500 characters"),

    mobileNumber: z
      .string()
      .trim()
      .length(10, "Mobile number must be exactly 10 digits")
      .regex(
        /^[6-9]\d{9}$/,
        "Mobile number must be a valid 10-digit Indian mobile number starting with 6-9",
      ),

    imageUrl: z.string().trim().optional(),

    coldStorageId: z
      .string()
      .trim()
      .min(1, "Cold storage ID is required")
      .refine(
        (val) => mongoose.Types.ObjectId.isValid(val),
        "Invalid cold storage ID format",
      ),

    linkedById: z
      .string()
      .trim()
      .min(1, "Store admin ID is required")
      .refine(
        (val) => mongoose.Types.ObjectId.isValid(val),
        "Invalid store admin ID format",
      ),

    accountNumber: z.coerce
      .number()
      .int()
      .positive("Account number must be a positive integer")
      .optional(),
  }),
});

export type QuickRegisterFarmerInput = z.infer<
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
    // Farmer fields (all optional, password NOT included)
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters long")
      .max(100, "Name must not exceed 100 characters")
      .optional(),

    address: z
      .string()
      .trim()
      .min(1, "Address is required")
      .max(500, "Address must not exceed 500 characters")
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

    imageUrl: z.string().trim().optional(),

    // Farmer-storage-link fields
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
  }),
});

export type UpdateFarmerStorageLinkParams = z.infer<
  typeof updateFarmerStorageLinkSchema
>["params"];

export type UpdateFarmerStorageLinkInput = z.infer<
  typeof updateFarmerStorageLinkSchema
>["body"];

/** Allowed voucher types for Get Voucher Number route */
export const VOUCHER_TYPE_VALUES = [
  "incoming-gate-pass",
  "grading-gate-pass",
  "storage-gate-pass",
  "nikasi-gate-pass",
  "outgoing-gate-pass",
] as const;

export const getVoucherNumberQuerySchema = z.object({
  querystring: z.object({
    type: z.enum(VOUCHER_TYPE_VALUES, {
      message: `Type must be one of: ${VOUCHER_TYPE_VALUES.join(", ")}`,
    }),
  }),
});

export type GetVoucherNumberQuery = z.infer<
  typeof getVoucherNumberQuerySchema
>["querystring"];

/** Allowed gate pass types for daybook filter */
export const DAYBOOK_GATE_PASS_TYPES = [
  "incoming",
  "grading",
  "storage",
  "nikasi",
  "outgoing",
] as const;

export const getDaybookQuerySchema = z.object({
  querystring: z.object({
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
    sortOrder: z
      .enum(["asc", "desc"], {
        message: 'sortOrder must be "asc" or "desc"',
      })
      .optional()
      .default("desc"),
    gatePassType: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .transform((s) => {
        if (s == null) return undefined;
        const arr = Array.isArray(s) ? s : [s];
        const types = arr
          .flatMap((x) => x.split(",").map((t) => t.trim().toLowerCase()))
          .filter((t) =>
            DAYBOOK_GATE_PASS_TYPES.includes(
              t as (typeof DAYBOOK_GATE_PASS_TYPES)[number],
            ),
          ) as (typeof DAYBOOK_GATE_PASS_TYPES)[number][];
        return types.length ? types : undefined;
      }),
  }),
});

export type GetDaybookQuery = z.infer<
  typeof getDaybookQuerySchema
>["querystring"];

/** Params for vouchers-by-farmer-storage-link route */
export const getVouchersByFarmerStorageLinkParamsSchema = z.object({
  params: z.object({
    farmerStorageLinkId: z
      .string()
      .trim()
      .min(1, "Farmer storage link ID is required")
      .refine(
        (val) => mongoose.Types.ObjectId.isValid(val),
        "Invalid farmer storage link ID format",
      ),
  }),
});

export type GetVouchersByFarmerStorageLinkParams = z.infer<
  typeof getVouchersByFarmerStorageLinkParamsSchema
>["params"];
