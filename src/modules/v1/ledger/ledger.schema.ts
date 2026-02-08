import { z } from "zod";
import mongoose from "mongoose";
import {
  createLedgerSchema as createLedgerBodySchema,
  updateLedgerSchema as updateLedgerBodySchema,
  dateFilterSchema,
} from "../../../utils/accounting/validation-schemas.js";
import { LedgerType } from "./ledger.model.js";

export const objectIdString = z
  .string()
  .trim()
  .refine(
    (val) => mongoose.Types.ObjectId.isValid(val),
    "Invalid ObjectId format",
  );

/** Body schema for create (chart of accounts validated by createLedgerBodySchema). */
export const createLedgerSchema = z.object({
  body: createLedgerBodySchema,
});
/** Optional farmerStorageLinkId is validated in controller and passed to service. */
export type CreateLedgerInput = z.infer<typeof createLedgerSchema>["body"] & {
  farmerStorageLinkId?: string | null;
};

export const updateLedgerSchema = z.object({
  body: updateLedgerBodySchema,
});
export type UpdateLedgerInput = z.infer<typeof updateLedgerSchema>["body"];

export const listLedgersQuerySchema = z.object({
  type: z.nativeEnum(LedgerType).optional(),
  search: z.string().trim().optional(),
  farmerStorageLinkId: objectIdString.optional().nullable(),
  ...dateFilterSchema.shape,
});
export type ListLedgersQuery = z.infer<typeof listLedgersQuerySchema>;

export const ledgerIdParamsSchema = z.object({
  id: objectIdString,
});
export type LedgerIdParams = z.infer<typeof ledgerIdParamsSchema>;

export const dateFilterSchemaReexport = dateFilterSchema;
