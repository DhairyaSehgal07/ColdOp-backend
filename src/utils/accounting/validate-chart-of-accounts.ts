import { LedgerType } from "../../modules/v1/ledger/ledger.model";
import { chartOfAccounts } from "./chart-of-accounts.js";

/**
 * Try to resolve subType to a key in the typeMap (accepts singular/plural variants).
 * e.g. "Current Asset" -> "Current Assets", "Fixed Asset" -> "Fixed Assets"
 */
function resolveSubType(
  typeMap: { readonly [subType: string]: readonly string[] },
  subType: string,
): readonly string[] | undefined {
  const exact = typeMap[subType];
  if (exact) return exact;
  const withS = typeMap[subType + "s"];
  if (withS) return withS;
  if (subType.endsWith("s")) {
    return typeMap[subType.slice(0, -1)];
  }
  return undefined;
}

/**
 * Validate type, subType, and category combinations against the chart of accounts.
 * Accepts singular/plural subType variants (e.g. "Current Asset" or "Current Assets").
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

  const categories = resolveSubType(typeMap, subType.trim());
  if (!categories) return false;

  return categories.includes(category);
}
