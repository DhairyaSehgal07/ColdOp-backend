import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";
import type { ILocation } from "../incoming-gate-pass/incoming-gate-pass.model.js";

/* =======================
   INTERFACES
======================= */

export interface ITransferStockItem {
  incomingGatePassId: Types.ObjectId;
  gatePassNo: number;
  bagSize: string;
  quantity: number;
  location: ILocation;
}

export interface ITransferStockGatePass {
  fromFarmerStorageLinkId: Types.ObjectId;
  toFarmerStorageLinkId: Types.ObjectId;

  createdBy?: Types.ObjectId;

  gatePassNo: number;
  date: Date;

  truckNumber?: string;

  items: ITransferStockItem[];

  remarks?: string;

  createdIncomingGatePassId: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export type TransferStockGatePassDocument =
  HydratedDocument<ITransferStockGatePass>;

/* =======================
   SUB SCHEMAS
======================= */

const LocationSchema = new Schema<ILocation>(
  {
    chamber: { type: String, required: true },
    floor: { type: String, required: true },
    row: { type: String, required: true },
  },
  { _id: false },
);

const TransferStockItemSchema = new Schema<ITransferStockItem>(
  {
    incomingGatePassId: {
      type: Schema.Types.ObjectId,
      ref: "IncomingGatePass",
      required: true,
    },
    gatePassNo: {
      type: Number,
      required: true,
    },
    bagSize: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    location: {
      type: LocationSchema,
      required: true,
    },
  },
  { _id: false },
);

/* =======================
   MAIN SCHEMA
======================= */

const TransferStockGatePassSchema = new Schema<ITransferStockGatePass>(
  {
    fromFarmerStorageLinkId: {
      type: Schema.Types.ObjectId,
      ref: "FarmerStorageLink",
      required: true,
    },
    toFarmerStorageLinkId: {
      type: Schema.Types.ObjectId,
      ref: "FarmerStorageLink",
      required: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "StoreAdmin",
    },

    gatePassNo: {
      type: Number,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },

    truckNumber: {
      type: String,
      required: false,
      trim: true,
    },

    items: {
      type: [TransferStockItemSchema],
      required: true,
      validate: {
        validator: (v: ITransferStockItem[]) =>
          Array.isArray(v) && v.length > 0,
        message: "At least one item is required",
      },
    },

    remarks: {
      type: String,
      trim: true,
    },

    createdIncomingGatePassId: {
      type: Schema.Types.ObjectId,
      ref: "IncomingGatePass",
      required: true,
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

TransferStockGatePassSchema.index({
  fromFarmerStorageLinkId: 1,
  createdAt: -1,
});

TransferStockGatePassSchema.index({
  toFarmerStorageLinkId: 1,
  createdAt: -1,
});

TransferStockGatePassSchema.index(
  { fromFarmerStorageLinkId: 1, gatePassNo: 1 },
  { unique: true },
);

/* =======================
   MODEL EXPORT
======================= */

export const TransferStockGatePass: Model<ITransferStockGatePass> =
  mongoose.models.TransferStockGatePass ||
  mongoose.model<ITransferStockGatePass>(
    "TransferStockGatePass",
    TransferStockGatePassSchema,
  );
