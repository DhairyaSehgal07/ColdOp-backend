import { LedgerType } from "../../modules/v1/ledger/ledger.model.js";

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
    "Fixed Assets": [
      "Land",
      "Building",
      "Machinery",
      "Vehicle",
      "Furniture",
      "Computer",
    ],
    "Current Assets": [
      "Cash",
      "Bank Accounts",
      "Debtors",
      "Stock in Hand",
      "Prepaid Expenses",
      "Other Current Assets",
    ],
  },

  [LedgerType.Liability]: {
    "Current Liabilities": [
      "Creditors",
      "Short-term Loan",
      "Outstanding Expenses",
      "Other Current Liabilities",
    ],
    "Non Current Liabilities": ["Bank Loan", "Other Non Current Liabilities"],
  },

  [LedgerType.Income]: {
    "Operating Income": ["Sales"],
    "Non-Operating Income": [
      "Interest Income",
      "Rental Income",
      "Other Income",
    ],
  },

  [LedgerType.Expense]: {
    "Direct Expenses": ["Purchases", "Freight", "Packaging"],
    "Indirect Expenses": [
      "Utilities",
      "Salary",
      "Supplies",
      "Labour expense",
      "Other Indirect",
    ],
    "Financial Expenses": ["Bank Charges", "Loan Interest"],
  },

  [LedgerType.Equity]: {
    Capital: ["Owner Capital", "Partner Capital"],
    Reserves: ["Retained Earnings"],
    Drawings: ["Owner Drawings"],
  },
} as const;
