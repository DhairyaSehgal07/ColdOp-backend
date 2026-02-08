import { z } from "zod";
import { validateChartOfAccounts } from "./validate-chart-of-accounts.js";

export const createLedgerSchema = z
  .object({
    name: z
      .string()
      .min(1, "Name is required")
      .max(255, "Name too long")
      .trim(),
    type: z.enum(["Asset", "Liability", "Income", "Expense", "Equity"], {
      message: "Invalid ledger type",
    }),
    subType: z.string().min(1, "SubType is required"),
    category: z.string().min(1, "Category is required"),
    openingBalance: z.number().default(0),
    closingBalance: z.number().optional(),
  })
  .refine(
    (data) => validateChartOfAccounts(data.type, data.subType, data.category),
    {
      message: "Invalid type, subType, or category for chart of accounts",
      path: ["category"],
    },
  );

export const updateLedgerSchema = z
  .object({
    name: z.string().min(1).max(255).trim().optional(),
    type: z
      .enum(["Asset", "Liability", "Income", "Expense", "Equity"], {
        message: "Invalid ledger type",
      })
      .optional(),
    subType: z.preprocess(
      (val) => (val === "" || val === null ? undefined : val),
      z.string().min(1, "SubType must be at least 1 character").optional(),
    ),
    category: z.preprocess(
      (val) => (val === "" || val === null ? undefined : val),
      z.string().min(1, "Category must be at least 1 character").optional(),
    ),
    openingBalance: z.number().optional(),
    closingBalance: z.number().optional(),
  })
  .refine(
    (data) => {
      const type = data.type;
      const subType = data.subType;
      const category = data.category;
      if (!type || !subType || !category) return true;
      return validateChartOfAccounts(type, subType, category);
    },
    {
      message: "Invalid type, subType, or category for chart of accounts",
      path: ["category"],
    },
  );

const voucherBaseSchema = z.object({
  date: z
    .string()
    .datetime()
    .or(z.date())
    .transform((val) => (typeof val === "string" ? new Date(val) : val)),
  debitLedger: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid debit ledger ID"),
  creditLedger: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid credit ledger ID"),
  amount: z.number().min(0.01, "Amount must be at least 0.01"),
  narration: z.string().max(500, "Narration too long").trim().optional(),
});

export const createVoucherSchema = voucherBaseSchema.refine(
  (data) => data.debitLedger !== data.creditLedger,
  {
    message: "Debit and credit ledgers must be different",
    path: ["creditLedger"],
  },
);

export const updateVoucherSchema = voucherBaseSchema.partial().refine(
  (data) => {
    // Only validate if both debitLedger and creditLedger are provided
    if (data.debitLedger && data.creditLedger) {
      return data.debitLedger !== data.creditLedger;
    }
    return true;
  },
  {
    message: "Debit and credit ledgers must be different",
    path: ["creditLedger"],
  },
);

export const queryDateRangeSchema = z.object({
  startDate: z
    .string()
    .datetime()
    .or(z.date())
    .transform((val) => (typeof val === "string" ? new Date(val) : val))
    .optional(),
  endDate: z
    .string()
    .datetime()
    .or(z.date())
    .transform((val) => (typeof val === "string" ? new Date(val) : val))
    .optional(),
  ledgerId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid ledger ID")
    .optional(),
});

// Schema for date filtering with from/to parameters
export const dateFilterSchema = z.object({
  from: z
    .string()
    .datetime()
    .or(z.date())
    .transform((val) => (typeof val === "string" ? new Date(val) : val))
    .optional(),
  to: z
    .string()
    .datetime()
    .or(z.date())
    .transform((val) => (typeof val === "string" ? new Date(val) : val))
    .optional(),
});

export const trialBalanceQuerySchema = z.object({
  type: z.enum(["opening", "closing"]).default("closing"),
});
