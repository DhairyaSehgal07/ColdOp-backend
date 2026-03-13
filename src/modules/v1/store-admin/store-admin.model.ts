import mongoose, { Schema, Document, Types } from "mongoose";
import bcrypt from "bcryptjs";

export enum Role {
  Admin = "Admin",
  Manager = "Manager",
  Staff = "Staff",
}

export interface IStoreAdmin extends Document {
  coldStorageId: Types.ObjectId;

  name: string;
  mobileNumber: string;
  password: string;
  role: Role;
  isVerified: boolean;

  // Security
  failedLoginAttempts: number;
  lockedUntil?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const StoreAdminSchema = new Schema<IStoreAdmin>(
  {
    coldStorageId: {
      type: Schema.Types.ObjectId,
      ref: "ColdStorage",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    mobileNumber: {
      type: String,
      required: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      enum: Object.values(Role),
      default: Role.Manager,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    failedLoginAttempts: {
      type: Number,
      default: 0,
    },

    lockedUntil: Date,
  },
  {
    timestamps: true,
  },
);

/* -------------------- PRE-SAVE HOOKS -------------------- */

StoreAdminSchema.pre(
  "save",
  async function (this: mongoose.Document & IStoreAdmin) {
    // Only hash the password if it has been modified (or is new)
    if (!this.isModified("password")) {
      return;
    }

    // Hash password with cost of 10
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  },
);

/* -------------------- INDEXES (only those used by queries) -------------------- */

// Unique admin per cold storage; findOne(coldStorageId, mobileNumber)
StoreAdminSchema.index({ coldStorageId: 1, mobileNumber: 1 }, { unique: true });

// Login: findOne(mobileNumber)
StoreAdminSchema.index({ mobileNumber: 1 });

export const StoreAdmin =
  mongoose.models.StoreAdmin ||
  mongoose.model<IStoreAdmin>("StoreAdmin", StoreAdminSchema);
