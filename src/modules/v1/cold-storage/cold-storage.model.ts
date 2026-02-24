import mongoose, { Schema, Document, Types } from "mongoose";

// Enum for Plan
export enum Plan {
  BASE = "base",
}

// Interface for ColdStorage document
export interface IColdStorage extends Document {
  name: string;
  address: string;
  mobileNumber: string;
  capacity: number;
  imageUrl?: string;
  isPaid: boolean;
  isActive: boolean;
  plan: Plan;
  createdAt: Date;
  updatedAt: Date;

  preferencesId?: Types.ObjectId;
  // preferences?: Preferences; // You can populate this if you have Preferences model
}

// Mongoose schema
const ColdStorageSchema = new Schema<IColdStorage>(
  {
    name: { type: String, required: true },
    address: { type: String, required: true },
    mobileNumber: { type: String, required: true, unique: true, index: true },
    capacity: { type: Number, required: true },
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

/* Indexes: mobileNumber unique + index in schema above. List/sort is dynamic (name, capacity, createdAt); no extra index. */

// Export model
export const ColdStorage = mongoose.model<IColdStorage>(
  "ColdStorage",
  ColdStorageSchema,
);
