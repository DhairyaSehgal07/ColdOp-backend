import { Types } from "mongoose";

import Ledger, {
  LedgerType,
  ILedger,
} from "../../modules/v1/ledger/ledger.model.js";

/* =======================
   TYPES
======================= */

type DefaultLedgerInput = Pick<
  ILedger,
  | "name"
  | "type"
  | "subType"
  | "category"
  | "openingBalance"
  | "balance"
  | "closingBalance"
  | "isSystemLedger"
  | "coldStorageId"
  | "farmerStorageLinkId"
>;

/* =======================
   INITIALIZER
======================= */

/**
 * Create default ledgers for a farmer-storage link.
 * @param storeAdminId - Store admin ID (creator)
 * @param farmerStorageLinkId - Farmer-storage link ID (ledgers belong to this link)
 * @param coldStorageId - Cold storage ID (required by Ledger schema)
 */
export async function initializeDefaultLedgers(
  storeAdminId: string | Types.ObjectId,
  farmerStorageLinkId: string | Types.ObjectId,
  coldStorageId: string | Types.ObjectId,
): Promise<void> {
  try {
    const linkObjectId =
      typeof farmerStorageLinkId === "string"
        ? new Types.ObjectId(farmerStorageLinkId)
        : farmerStorageLinkId;
    const coldStorageObjectId =
      typeof coldStorageId === "string"
        ? new Types.ObjectId(coldStorageId)
        : coldStorageId;

    const defaultLedgers: Omit<
      DefaultLedgerInput,
      "coldStorageId" | "farmerStorageLinkId" | "createdBy"
    >[] = [
      {
        name: "Cash",
        type: LedgerType.Asset,
        subType: "Current Assets",
        category: "Cash",
        openingBalance: 0,
        balance: 0,
        closingBalance: null,
        isSystemLedger: true,
      },
      {
        name: "Bank",
        type: LedgerType.Asset,
        subType: "Current Assets",
        category: "Bank Accounts",
        openingBalance: 0,
        balance: 0,
        closingBalance: null,
        isSystemLedger: true,
      },
      {
        name: "Labour",
        type: LedgerType.Expense,
        subType: "Operating Expenses",
        category: "Utilities",
        openingBalance: 0,
        balance: 0,
        closingBalance: null,
        isSystemLedger: true,
      },
      {
        name: "Capital",
        type: LedgerType.Equity,
        subType: "Capital & Reserves",
        category: "Capital",
        openingBalance: 0,
        balance: 0,
        closingBalance: null,
        isSystemLedger: true,
      },
      {
        name: "Electricity",
        type: LedgerType.Expense,
        subType: "Operating Expenses",
        category: "Utilities",
        openingBalance: 0,
        balance: 0,
        closingBalance: null,
        isSystemLedger: true,
      },
      {
        name: "Electricity Payable",
        type: LedgerType.Liability,
        subType: "Current Liabilities",
        category: "Outstanding Expenses",
        openingBalance: 0,
        balance: 0,
        closingBalance: null,
        isSystemLedger: true,
      },
      {
        name: "Potato Sales",
        type: LedgerType.Income,
        subType: "Operating Income",
        category: "Sales",
        openingBalance: 0,
        balance: 0,
        closingBalance: null,
        isSystemLedger: true,
      },
      {
        name: "Store Rent",
        type: LedgerType.Income,
        subType: "Operating Income",
        category: "Rental Income",
        openingBalance: 0,
        balance: 0,
        closingBalance: null,
        isSystemLedger: true,
      },
      {
        name: "Potato Purchase",
        type: LedgerType.Expense,
        subType: "Direct Expenses",
        category: "Purchases",
        openingBalance: 0,
        balance: 0,
        closingBalance: null,
        isSystemLedger: true,
      },
      {
        name: "Depreciation",
        type: LedgerType.Expense,
        subType: "Operating Expenses",
        category: "Depreciation",
        openingBalance: 0,
        balance: 0,
        closingBalance: null,
        isSystemLedger: true,
      },
      {
        name: "Stock In Hand",
        type: LedgerType.Asset,
        subType: "Current Assets",
        category: "Stock in Hand",
        openingBalance: 0,
        balance: 0,
        closingBalance: 0,
        isSystemLedger: true,
      },
      {
        name: "Shed Income",
        type: LedgerType.Income,
        subType: "Operating Income",
        category: "Rental Income",
        openingBalance: 0,
        balance: 0,
        closingBalance: 0,
        isSystemLedger: true,
      },
      {
        name: "Discount",
        type: LedgerType.Expense,
        subType: "Other Expense",
        category: "Discount",
        openingBalance: 0,
        balance: 0,
        closingBalance: 0,
        isSystemLedger: true,
      },
      {
        name: "Other Income",
        type: LedgerType.Income,
        subType: "Operating Income",
        category: "Service Revenue",
        openingBalance: 0,
        balance: 0,
        closingBalance: null,
        isSystemLedger: true,
      },
    ];

    const adminObjectId =
      typeof storeAdminId === "string"
        ? new Types.ObjectId(storeAdminId)
        : storeAdminId;

    const ledgersToCreate: DefaultLedgerInput[] = defaultLedgers.map(
      (ledger) => ({
        ...ledger,
        coldStorageId: coldStorageObjectId,
        farmerStorageLinkId: linkObjectId,
        createdBy: adminObjectId,
      }),
    );

    // ordered:false → continues inserting even if some duplicates exist
    await Ledger.insertMany(ledgersToCreate, {
      ordered: false,
    });
  } catch (error: any) {
    // Ignore duplicate key errors
    if (error?.code !== 11000) {
      throw new Error(`Failed to initialize default ledgers: ${error.message}`);
    }
  }
}

/**
 * Create default ledgers for the cold storage (no farmer-storage link).
 * Uses the same default chart of accounts with farmerStorageLinkId = null.
 * Idempotent: duplicate key errors are ignored.
 *
 * @param storeAdminId - Store admin ID (creator)
 * @param coldStorageId - Cold storage ID
 */
export async function initializeDefaultLedgersForColdStorage(
  storeAdminId: string | Types.ObjectId,
  coldStorageId: string | Types.ObjectId,
): Promise<void> {
  try {
    const coldStorageObjectId =
      typeof coldStorageId === "string"
        ? new Types.ObjectId(coldStorageId)
        : coldStorageId;
    const adminObjectId =
      typeof storeAdminId === "string"
        ? new Types.ObjectId(storeAdminId)
        : storeAdminId;

    const defaultLedgers: Omit<
      DefaultLedgerInput,
      "coldStorageId" | "farmerStorageLinkId" | "createdBy"
    >[] = [
      {
        name: "Cash",
        type: LedgerType.Asset,
        subType: "Current Assets",
        category: "Cash",
        openingBalance: 0,
        balance: 0,
        closingBalance: null,
        isSystemLedger: true,
      },
      {
        name: "Bank",
        type: LedgerType.Asset,
        subType: "Current Assets",
        category: "Bank Accounts",
        openingBalance: 0,
        balance: 0,
        closingBalance: null,
        isSystemLedger: true,
      },
      {
        name: "Labour",
        type: LedgerType.Expense,
        subType: "Operating Expenses",
        category: "Utilities",
        openingBalance: 0,
        balance: 0,
        closingBalance: null,
        isSystemLedger: true,
      },
      {
        name: "Capital",
        type: LedgerType.Equity,
        subType: "Capital & Reserves",
        category: "Capital",
        openingBalance: 0,
        balance: 0,
        closingBalance: null,
        isSystemLedger: true,
      },
      {
        name: "Electricity",
        type: LedgerType.Expense,
        subType: "Operating Expenses",
        category: "Utilities",
        openingBalance: 0,
        balance: 0,
        closingBalance: null,
        isSystemLedger: true,
      },
      {
        name: "Electricity Payable",
        type: LedgerType.Liability,
        subType: "Current Liabilities",
        category: "Outstanding Expenses",
        openingBalance: 0,
        balance: 0,
        closingBalance: null,
        isSystemLedger: true,
      },
      {
        name: "Potato Sales",
        type: LedgerType.Income,
        subType: "Operating Income",
        category: "Sales",
        openingBalance: 0,
        balance: 0,
        closingBalance: null,
        isSystemLedger: true,
      },
      {
        name: "Store Rent",
        type: LedgerType.Income,
        subType: "Operating Income",
        category: "Rental Income",
        openingBalance: 0,
        balance: 0,
        closingBalance: null,
        isSystemLedger: true,
      },
      {
        name: "Potato Purchase",
        type: LedgerType.Expense,
        subType: "Direct Expenses",
        category: "Purchases",
        openingBalance: 0,
        balance: 0,
        closingBalance: null,
        isSystemLedger: true,
      },
      {
        name: "Depreciation",
        type: LedgerType.Expense,
        subType: "Operating Expenses",
        category: "Depreciation",
        openingBalance: 0,
        balance: 0,
        closingBalance: null,
        isSystemLedger: true,
      },
      {
        name: "Stock In Hand",
        type: LedgerType.Asset,
        subType: "Current Assets",
        category: "Stock in Hand",
        openingBalance: 0,
        balance: 0,
        closingBalance: 0,
        isSystemLedger: true,
      },
      {
        name: "Shed Income",
        type: LedgerType.Income,
        subType: "Operating Income",
        category: "Rental Income",
        openingBalance: 0,
        balance: 0,
        closingBalance: 0,
        isSystemLedger: true,
      },
      {
        name: "Discount",
        type: LedgerType.Expense,
        subType: "Other Expense",
        category: "Discount",
        openingBalance: 0,
        balance: 0,
        closingBalance: 0,
        isSystemLedger: true,
      },
      {
        name: "Other income",
        type: LedgerType.Income,
        subType: "Operating Income",
        category: "Service Revenue",
        openingBalance: 0,
        balance: 0,
        closingBalance: null,
        isSystemLedger: true,
      },
    ];

    const ledgersToCreate: (DefaultLedgerInput & {
      createdBy: Types.ObjectId;
    })[] = defaultLedgers.map((ledger) => ({
      ...ledger,
      coldStorageId: coldStorageObjectId,
      farmerStorageLinkId: null,
      createdBy: adminObjectId,
    }));

    await Ledger.insertMany(ledgersToCreate, {
      ordered: false,
    });
  } catch (error: any) {
    if (error?.code !== 11000) {
      throw new Error(
        `Failed to initialize default ledgers for cold storage: ${error.message}`,
      );
    }
  }
}
