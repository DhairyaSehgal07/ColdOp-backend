import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

/* =======================
   INTERFACES
======================= */

/** Snapshot of farmer document (audit); password excluded. */
export interface FarmerSnapshot {
  _id?: Types.ObjectId;
  name?: string;
  address?: string;
  mobileNumber?: string;
  imageUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
  [key: string]: unknown;
}

/** Snapshot of farmer-storage-link document (audit). */
export interface FarmerStorageLinkSnapshot {
  _id?: Types.ObjectId;
  farmerId?: Types.ObjectId;
  coldStorageId?: Types.ObjectId;
  linkedById?: Types.ObjectId;
  accountNumber?: number;
  isActive?: boolean;
  notes?: string;
  costPerBag?: number;
  createdAt?: Date;
  updatedAt?: Date;
  [key: string]: unknown;
}

export interface IFarmerEditHistory {
  /** Farmer document that was edited */
  farmerId: Types.ObjectId;

  /** Farmer-storage-link document that was edited (route id) */
  farmerStorageLinkId: Types.ObjectId;

  /** Cold storage this edit belongs to (for querying by storage) */
  coldStorageId: Types.ObjectId;

  /** Store admin who performed the edit */
  editedBy: Types.ObjectId;

  /** When the edit occurred */
  editedAt: Date;

  /** Full snapshot of farmer + farmerStorageLink before the edit */
  snapshotBefore: {
    farmer: FarmerSnapshot;
    farmerStorageLink: FarmerStorageLinkSnapshot;
  };

  /** Full snapshot of farmer + farmerStorageLink after the edit */
  snapshotAfter: {
    farmer: FarmerSnapshot;
    farmerStorageLink: FarmerStorageLinkSnapshot;
  };

  /** Optional human-readable summary of the change */
  changeSummary?: string;

  createdAt: Date;
}

export type FarmerEditHistoryDocument = HydratedDocument<IFarmerEditHistory>;

/* =======================
   MAIN SCHEMA
======================= */

const FarmerEditHistorySchema = new Schema<IFarmerEditHistory>(
  {
    farmerId: {
      type: Schema.Types.ObjectId,
      ref: "Farmer",
      required: true,
    },

    farmerStorageLinkId: {
      type: Schema.Types.ObjectId,
      ref: "FarmerStorageLink",
      required: true,
    },

    coldStorageId: {
      type: Schema.Types.ObjectId,
      ref: "ColdStorage",
      required: true,
    },

    editedBy: {
      type: Schema.Types.ObjectId,
      ref: "StoreAdmin",
      required: true,
    },

    editedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },

    snapshotBefore: {
      type: {
        farmer: { type: Schema.Types.Mixed, required: true },
        farmerStorageLink: { type: Schema.Types.Mixed, required: true },
      },
      required: true,
    },

    snapshotAfter: {
      type: {
        farmer: { type: Schema.Types.Mixed, required: true },
        farmerStorageLink: { type: Schema.Types.Mixed, required: true },
      },
      required: true,
    },

    changeSummary: {
      type: String,
      trim: true,
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

// List history by farmer-storage-link, latest first
FarmerEditHistorySchema.index({
  farmerStorageLinkId: 1,
  editedAt: -1,
});

// List history by farmer
FarmerEditHistorySchema.index({ farmerId: 1, editedAt: -1 });

// List history by cold storage
FarmerEditHistorySchema.index({ coldStorageId: 1, editedAt: -1 });

/* =======================
   MODEL EXPORT
======================= */

export const FarmerEditHistory: Model<IFarmerEditHistory> =
  mongoose.models.FarmerEditHistory ||
  mongoose.model<IFarmerEditHistory>(
    "FarmerEditHistory",
    FarmerEditHistorySchema,
  );
