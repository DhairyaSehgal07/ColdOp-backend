import { LedgerType } from "../../modules/v1/ledger/ledger.model";
import { chartOfAccounts } from "./chart-of-accounts.js";

/**
 * Validate type, subType, and category combinations against the chart of accounts.
 * @param type - Ledger type (Asset, Liability, Income, Expense, Equity)
 * @param subType - Ledger subType
 * @param category - Ledger category
 * @returns True if valid, false otherwise
 */
export function validateChartOfAccounts(
  type: string,
  subType: string,
  category: string,
): boolean {
  const typeMap = chartOfAccounts[type as LedgerType];
  if (!typeMap) return false;

  const categories = typeMap[subType];
  if (!categories) return false;

  return categories.includes(category);
}
