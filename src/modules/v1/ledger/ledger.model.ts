import mongoose, { Schema, Document, Model, Types } from "mongoose";

/* =======================
   ENUMS
======================= */

export enum LedgerType {
  Asset = "Asset",
  Liability = "Liability",
  Income = "Income",
  Expense = "Expense",
  Equity = "Equity",
}

/* =======================
   INTERFACE
======================= */

export interface ILedger extends Document {
  name: string;
  type: LedgerType;
  subType: string;
  category: string;

  openingBalance: number;
  balance: number;
  closingBalance: number | null;

  coldStorageId: Types.ObjectId;
  farmerStorageLinkId?: Types.ObjectId | null;

  createdBy: Types.ObjectId;

  isSystemLedger: boolean;

  createdAt: Date;
  updatedAt: Date;

  hasTransactions(): Promise<boolean>;
}

/* =======================
   SCHEMA
======================= */

const ledgerSchema = new Schema<ILedger>(
  {
    name: {
      type: String,
      required: [true, "Ledger name is required"],
      trim: true,
    },

    type: {
      type: String,
      required: [true, "Ledger type is required"],
      enum: Object.values(LedgerType),
      index: true,
    },

    subType: {
      type: String,
      required: [true, "Ledger subType is required"],
      trim: true,
    },

    category: {
      type: String,
      required: [true, "Ledger category is required"],
      trim: true,
    },

    openingBalance: {
      type: Number,
      default: 0,
      required: true,
    },

    balance: {
      type: Number,
      default: 0,
      required: true,
    },

    closingBalance: {
      type: Number,
      default: null,
    },

    /* =======================
       OWNERSHIP
    ======================= */

    coldStorageId: {
      type: Schema.Types.ObjectId,
      ref: "ColdStorage",
      required: true,
      index: true,
    },

    farmerStorageLinkId: {
      type: Schema.Types.ObjectId,
      ref: "FarmerStorageLink",
      required: false,
      default: null,
      index: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "StoreAdmin",
      required: true,
      index: true,
    },

    isSystemLedger: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

/* =======================
   INDEXES
======================= */

ledgerSchema.index(
  { coldStorageId: 1, farmerStorageLinkId: 1, name: 1 },
  { unique: true },
);

/* =======================
   HOOKS
======================= */

ledgerSchema.pre("save", function () {
  const name = this.name?.trim();
  if (
    name &&
    name.toLowerCase() === "stock in hand" &&
    this.closingBalance === null
  ) {
    this.closingBalance = this.balance;
  }
});

/* =======================
   METHODS
======================= */

ledgerSchema.methods.hasTransactions = async function (): Promise<boolean> {
  const Voucher = mongoose.model("Voucher");
  const doc = await Voucher.findOne(
    { $or: [{ debitLedger: this._id }, { creditLedger: this._id }] },
    { _id: 1 },
  )
    .limit(1)
    .lean();
  return doc !== null;
};

/* =======================
   MODEL
======================= */

const Ledger: Model<ILedger> =
  mongoose.models.Ledger || mongoose.model<ILedger>("Ledger", ledgerSchema);

export default Ledger;
