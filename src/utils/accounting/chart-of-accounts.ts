import { LedgerType } from "../../modules/v1/ledger/ledger.model";

/* =======================
   TYPES
======================= */

export type AccountCategoryMap = {
  readonly [subType: string]: readonly string[];
};

export type ChartOfAccounts = {
  readonly [key in LedgerType]: AccountCategoryMap;
};

/* =======================
   DATA
======================= */

export const chartOfAccounts: ChartOfAccounts = {
  [LedgerType.Asset]: {
    "Fixed Assets": ["Property", "Plant", "Equipment", "Furniture", "Vehicles"],
    "Current Assets": [
      "Cash",
      "Bank Accounts",
      "Cash Equivalents",
      "Stock in Hand",
      "Debtors",
      "Prepaid Expenses",
      "Other Current Assets",
    ],
  },

  [LedgerType.Liability]: {
    "Current Liabilities": [
      "Creditors",
      "Short-term Loans",
      "Outstanding Expenses",
    ],
    "Long-term Liabilities": ["Long-term Loans", "Deferred Revenue"],
  },

  [LedgerType.Income]: {
    "Operating Income": ["Sales", "Service Revenue", "Rental Income"],
    "Non-Operating Income": ["Interest Received", "Dividends", "Other Income"],
  },

  [LedgerType.Expense]: {
    "Direct Expenses": ["Purchases"],
    "Operating Expenses": [
      "Rent",
      "Salaries",
      "Utilities",
      "Supplies",
      "Depreciation",
    ],
    "Non-Operating Expenses": [
      "Interest Expense",
      "Loss on Sale",
      "Miscellaneous",
    ],
    "Other Expense": ["Discount"],
  },

  [LedgerType.Equity]: {
    "Capital & Reserves": [
      "Capital",
      "Reserves & Surplus",
      "Retained Earnings",
    ],
  },
} as const;
