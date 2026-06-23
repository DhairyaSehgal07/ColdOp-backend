import mongoose, { Schema, Types, Document, Model } from "mongoose";

export interface IFarmerStorageLink extends Document {
  farmerId: Types.ObjectId;
  coldStorageId: Types.ObjectId;
  linkedById?: Types.ObjectId;

  accountNumber: number;
  isActive: boolean;
  notes?: string;
  costPerBag?: number;

  /** Store-specific display fields (optional until backfill; fallback to Farmer). */
  name?: string;
  address?: string;
  mobileNumber?: string;

  createdAt: Date;
  updatedAt: Date;
}

const farmerStorageLinkSchema = new Schema<IFarmerStorageLink>(
  {
    farmerId: {
      type: Schema.Types.ObjectId,
      ref: "Farmer",
      required: true,
    },

    coldStorageId: {
      type: Schema.Types.ObjectId,
      ref: "ColdStorage",
      required: true,
    },

    linkedById: {
      type: Schema.Types.ObjectId,
      ref: "StoreAdmin",
    },

    accountNumber: {
      type: Number,
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    notes: {
      type: String,
    },

    costPerBag: {
      type: Number,
    },

    name: {
      type: String,
      trim: true,
    },

    address: {
      type: String,
      trim: true,
    },

    mobileNumber: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

/* ----------------- Indexes (only those used by queries) ----------------- */

// Unique: one farmer per cold storage; findOne(farmerId, coldStorageId)
farmerStorageLinkSchema.index(
  { farmerId: 1, coldStorageId: 1 },
  { unique: true },
);

// Unique: account number per cold storage; findOne(coldStorageId, accountNumber); find(coldStorageId).sort({ accountNumber: -1 }) uses prefix
farmerStorageLinkSchema.index(
  { coldStorageId: 1, accountNumber: 1 },
  { unique: true },
);

export const FarmerStorageLink: Model<IFarmerStorageLink> =
  mongoose.models.FarmerStorageLink ||
  mongoose.model<IFarmerStorageLink>(
    "FarmerStorageLink",
    farmerStorageLinkSchema,
  );
