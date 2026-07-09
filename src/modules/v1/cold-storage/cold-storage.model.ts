import mongoose, { Schema, Document, Types } from "mongoose";

// Enum for Plan
export enum Plan {
  BASE = "base",
}

export interface ChamberObj {
  name: string;
  capacity: number;
}

export interface StorageFloorObj {
  _id: Types.ObjectId;
  name: string;
  capacity: number;
}

export interface StorageChamberObj {
  _id: Types.ObjectId;
  name: string;
  floors: StorageFloorObj[];
}

// Interface for ColdStorage document
export interface IColdStorage extends Document {
  name: string;
  address: string;
  mobileNumber: string;
  capacity: number;
  chambers?: ChamberObj[];
  storageLayout?: StorageChamberObj[];
  imageUrl?: string;
  isPaid: boolean;
  isActive: boolean;
  plan: Plan;
  createdAt: Date;
  updatedAt: Date;

  preferencesId?: Types.ObjectId;
  // preferences?: Preferences; // You can populate this if you have Preferences model
}

const ChamberSchema = new Schema<ChamberObj>(
  {
    name: { type: String, required: true, trim: true },
    capacity: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const StorageFloorSchema = new Schema<StorageFloorObj>(
  {
    name: { type: String, required: true, trim: true },
    capacity: { type: Number, required: true, min: 0 },
  },
);

const StorageChamberSchema = new Schema<StorageChamberObj>(
  {
    name: { type: String, required: true, trim: true },
    floors: { type: [StorageFloorSchema], default: [] },
  },
);

// Mongoose schema
const ColdStorageSchema = new Schema<IColdStorage>(
  {
    name: { type: String, required: true },
    address: { type: String, required: true },
    mobileNumber: { type: String, required: true, unique: true },
    capacity: { type: Number, required: true },
    chambers: { type: [ChamberSchema], default: undefined },
    storageLayout: { type: [StorageChamberSchema], default: undefined },
    imageUrl: { type: String, default: "" },
    isPaid: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    plan: { type: String, enum: Object.values(Plan), default: Plan.BASE },
    preferencesId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Preferences",
    },
  },
  {
    timestamps: true,
  },
);

/* Indexes: mobileNumber unique in schema above (creates unique index). List/sort is dynamic (name, capacity, createdAt); no extra index. */

// Export model
export const ColdStorage = mongoose.model<IColdStorage>(
  "ColdStorage",
  ColdStorageSchema,
);
