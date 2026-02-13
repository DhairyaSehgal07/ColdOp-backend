import { z } from "zod";
import mongoose from "mongoose";
import {
  createLedgerSchema as createLedgerBodySchemaFromUtils,
  updateLedgerSchema as updateLedgerBodySchemaFromUtils,
  dateFilterSchema,
} from "../../../utils/accounting/validation-schemas.js";
import { LedgerType } from "./ledger.model.js";

/* =======================
   SHARED
======================= */

/** 24-char hex ObjectId string. */
export const objectIdString = z
  .string()
  .trim()
  .refine(
    (val) => mongoose.Types.ObjectId.isValid(val),
    "Invalid ObjectId format",
  );

export const ledgerTypeEnum = z.enum(
  ["Asset", "Liability", "Income", "Expense", "Equity"],
  { message: "Invalid ledger type" },
);

/* =======================
   POST / — Create ledger
======================= */

const createLedgerBodySchema = createLedgerBodySchemaFromUtils.merge(
  z.object({
    farmerStorageLinkId: z.union([objectIdString, z.null()]).optional(),
  }),
);

export const createLedgerSchema = z.object({
  body: createLedgerBodySchema,
});

export type CreateLedgerInput = z.infer<typeof createLedgerSchema>["body"];

/* =======================
   POST /default — Create default ledgers
======================= */

/** Empty body; no query or params. */
export const createDefaultLedgersBodySchema = z.object({}).strict();

export type CreateDefaultLedgersBody = z.infer<
  typeof createDefaultLedgersBodySchema
>;

/* =======================
   GET / — List ledgers (querystring)
======================= */

export const listLedgersQuerySchema = z.object({
  type: z.nativeEnum(LedgerType).optional(),
  search: z.string().trim().optional(),
  farmerStorageLinkId: objectIdString.optional().nullable(),
  ...dateFilterSchema.shape,
});

export type ListLedgersQuery = z.infer<typeof listLedgersQuerySchema>;

/* =======================
   GET /:id — Get ledger by ID (params)
   PUT /:id — Update ledger (params + body)
   DELETE /:id — Delete ledger (params)
   GET /:id/entries — Get ledger entries (params)
======================= */

export const ledgerIdParamsSchema = z.object({
  id: objectIdString,
});

export type LedgerIdParams = z.infer<typeof ledgerIdParamsSchema>;

/* =======================
   PUT /:id — Update ledger (body)
======================= */

export const updateLedgerSchema = z.object({
  body: updateLedgerBodySchemaFromUtils,
});

export type UpdateLedgerInput = z.infer<typeof updateLedgerSchema>["body"];

/* =======================
   GET /balance-sheet — Balance sheet (querystring)
======================= */

export const balanceSheetQuerySchema = z.object({
  ...dateFilterSchema.shape,
});

export type BalanceSheetQuery = z.infer<typeof balanceSheetQuerySchema>;

/* =======================
   RE-EXPORTS (for consumers that need date filter shape)
======================= */

export const dateFilterSchemaReexport = dateFilterSchema;
