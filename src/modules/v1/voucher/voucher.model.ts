import mongoose, {
  Schema,
  Document,
  Model,
  Types,
  HydratedDocument,
} from "mongoose";

/* =======================
   ENUMS
======================= */

export enum VoucherType {
  Journal = "Journal",
}

/* =======================
   INTERFACE
======================= */

export interface IVoucher extends Document {
  type: VoucherType;

  voucherNumber: number;
  date: Date;

  debitLedger: Types.ObjectId;
  creditLedger: Types.ObjectId;

  amount: number;
  narration?: string;

  coldStorageId: Types.ObjectId;
  farmerStorageLinkId?: Types.ObjectId | null;

  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

/* =======================
   SCHEMA
======================= */

const voucherSchema = new Schema<IVoucher>(
  {
    type: {
      type: String,
      enum: Object.values(VoucherType),
      default: VoucherType.Journal,
      required: true,
    },

    voucherNumber: {
      type: Number,
      required: [true, "Voucher number is required"],
    },

    date: {
      type: Date,
      required: [true, "Voucher date is required"],
      index: true,
    },

    debitLedger: {
      type: Schema.Types.ObjectId,
      ref: "Ledger",
      required: [true, "Debit ledger is required"],
      index: true,
    },

    creditLedger: {
      type: Schema.Types.ObjectId,
      ref: "Ledger",
      required: [true, "Credit ledger is required"],
      index: true,
    },

    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0.01, "Amount must be greater than 0"],
    },

    narration: {
      type: String,
      trim: true,
      maxlength: [500, "Narration cannot exceed 500 characters"],
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

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "StoreAdmin",
      index: true,
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

voucherSchema.index(
  { voucherNumber: 1, coldStorageId: 1, farmerStorageLinkId: 1 },
  { unique: true },
);

voucherSchema.index({ coldStorageId: 1, date: -1 });
voucherSchema.index({ farmerStorageLinkId: 1, date: -1 });

/* =======================
   VALIDATION HOOKS
======================= */

voucherSchema.pre("save", async function (this: HydratedDocument<IVoucher>) {
  // debitLedger !== creditLedger
  if (this.debitLedger.toString() === this.creditLedger.toString()) {
    const error = new Error("Debit and credit ledgers must be different");
    error.name = "ValidationError";
    throw error;
  }

  const Ledger = mongoose.model("Ledger");
  const ledgerIds = [this.debitLedger, this.creditLedger];
  const ledgers = await Ledger.find(
    { _id: { $in: ledgerIds } },
    { coldStorageId: 1, farmerStorageLinkId: 1 },
  )
    .lean()
    .exec();

  if (ledgers.length !== 2) {
    const error = new Error("One or both ledgers not found");
    error.name = "ValidationError";
    throw error;
  }

  type LedgerScope = {
    _id: Types.ObjectId;
    coldStorageId: Types.ObjectId;
    farmerStorageLinkId?: Types.ObjectId | null;
  };
  const ledgerList = ledgers as unknown as LedgerScope[];
  const d = ledgerList.find(
    (l) => l._id.toString() === this.debitLedger.toString(),
  );
  const c = ledgerList.find(
    (l) => l._id.toString() === this.creditLedger.toString(),
  );
  if (!d || !c) {
    const error = new Error("One or both ledgers not found");
    error.name = "ValidationError";
    throw error;
  }
  const sameColdStorage =
    d.coldStorageId.toString() === c.coldStorageId.toString() &&
    this.coldStorageId.toString() === d.coldStorageId.toString();
  const linkD = d.farmerStorageLinkId?.toString() ?? null;
  const linkC = c.farmerStorageLinkId?.toString() ?? null;
  const linkV = this.farmerStorageLinkId?.toString() ?? null;
  // Same scope: both same link as voucher, OR one ledger is storage-level (null) and the other matches voucher's link (e.g. rent: Store Rent credit + farmer debit)
  const sameScope =
    (linkD === linkC && linkD === linkV) ||
    (linkD === linkV && linkC === null) ||
    (linkC === linkV && linkD === null);

  if (!sameColdStorage || !sameScope) {
    const error = new Error(
      "Ledgers must belong to the same cold storage and same scope (storage or same farmer-storage link)",
    );
    error.name = "ValidationError";
    throw error;
  }

  // amount > 0
  if (this.amount <= 0) {
    const error = new Error("Amount must be greater than 0");
    error.name = "ValidationError";
    throw error;
  }
});

/* =======================
   MODEL
======================= */

const Voucher: Model<IVoucher> =
  mongoose.models.Voucher || mongoose.model<IVoucher>("Voucher", voucherSchema);

export default Voucher;
