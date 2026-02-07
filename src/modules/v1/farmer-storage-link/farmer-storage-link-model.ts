import mongoose, { Schema, Types, Document, Model } from "mongoose";

export interface IFarmerStorageLink extends Document {
  farmerId: Types.ObjectId;
  coldStorageId: Types.ObjectId;
  linkedById?: Types.ObjectId;

  accountNumber: number;
  isActive: boolean;
  notes?: string;

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
  },
  {
    timestamps: true,
  },
);

/* ----------------- Indexes ----------------- */

// one farmer ↔ one cold storage
farmerStorageLinkSchema.index(
  { farmerId: 1, coldStorageId: 1 },
  { unique: true },
);

// account number unique inside cold storage
farmerStorageLinkSchema.index(
  { coldStorageId: 1, accountNumber: 1 },
  { unique: true },
);

farmerStorageLinkSchema.index({ farmerId: 1 });
farmerStorageLinkSchema.index({ coldStorageId: 1 });
farmerStorageLinkSchema.index({ createdAt: 1 });

export const FarmerStorageLink: Model<IFarmerStorageLink> =
  mongoose.models.FarmerStorageLink ||
  mongoose.model<IFarmerStorageLink>(
    "FarmerStorageLink",
    farmerStorageLinkSchema,
  );
