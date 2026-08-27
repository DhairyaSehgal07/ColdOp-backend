import { z } from "zod";
import mongoose from "mongoose";
import {
  createVoucherSchema as createVoucherBodySchema,
  updateVoucherSchema as updateVoucherBodySchema,
  dateFilterSchema,
  queryDateRangeSchema,
} from "../../../utils/accounting/validation-schemas.js";

export const objectIdString = z
  .string()
  .trim()
  .refine(
    (val) => mongoose.Types.ObjectId.isValid(val),
    "Invalid ObjectId format",
  );

export const createVoucherSchema = z.object({
  body: createVoucherBodySchema,
});
/** Optional farmerStorageLinkId is validated in controller and passed to service. */
export type CreateVoucherInput = z.infer<typeof createVoucherSchema>["body"] & {
  farmerStorageLinkId?: string | null;
};

export const updateVoucherSchema = z.object({
  body: updateVoucherBodySchema,
});
export type UpdateVoucherInput = z.infer<typeof updateVoucherSchema>["body"];

/** List vouchers: from/to or startDate/endDate, optional ledgerId. */
export const listVouchersQuerySchema = z.object({
  ...dateFilterSchema.shape,
  ...queryDateRangeSchema.shape,
});
export type ListVouchersQuery = z.infer<typeof listVouchersQuerySchema>;

export const voucherIdParamsSchema = z.object({
  id: objectIdString,
});
export type VoucherIdParams = z.infer<typeof voucherIdParamsSchema>;

export const createLabourExpenseSchema = z.object({
  body: z.object({
    date: z
      .string()
      .datetime()
      .or(z.date())
      .transform((val) => (typeof val === "string" ? new Date(val) : val)),
    debits: z
      .array(
        z.object({
          debitLedgerId: objectIdString,
          amount: z.number().min(0.01, "Amount must be at least 0.01"),
        }),
      )
      .min(1, "At least one debit entry is required"),
  }),
});
export type CreateLabourExpenseInput = z.infer<
  typeof createLabourExpenseSchema
>["body"];
