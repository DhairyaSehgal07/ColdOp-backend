import mongoose, { Schema, Document, Types, Model } from "mongoose";

export interface ResourcePermission {
  resource: string;
  actions: string[];
}

export interface IRolePermission extends Document {
  coldStorageId: Types.ObjectId;
  role: string;
  permissions: ResourcePermission[];
  createdById?: Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const rolePermissionSchema = new Schema<IRolePermission>(
  {
    coldStorageId: {
      type: Schema.Types.ObjectId,
      ref: "ColdStorage",
      required: true,
      index: true,
    },
    role: {
      type: String,
      required: true,
      index: true,
    },
    permissions: [
      {
        resource: { type: String, required: true },
        actions: [{ type: String }],
      },
    ],
    createdById: {
      type: Schema.Types.ObjectId,
      ref: "StoreAdmin",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

rolePermissionSchema.index({ coldStorageId: 1, role: 1 }, { unique: true });

export const RolePermission: Model<IRolePermission> =
  mongoose.models.RolePermission ||
  mongoose.model<IRolePermission>("RolePermission", rolePermissionSchema);
