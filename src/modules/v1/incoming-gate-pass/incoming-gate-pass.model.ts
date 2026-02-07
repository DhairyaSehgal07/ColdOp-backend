import mongoose, { Schema, Document, Types, Model } from "mongoose";

export interface IIncomingGatePass extends Document {
  farmerStorageLinkId: Types.ObjectId;
  date: Date;
  gatePassNo: number;
  bagsReceived?: number;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const incomingGatePassSchema = new Schema<IIncomingGatePass>(
  {
    farmerStorageLinkId: {
      type: Schema.Types.ObjectId,
      ref: "FarmerStorageLink",
      required: true,
      index: true,
    },
    date: { type: Date, required: true, index: true },
    gatePassNo: { type: Number, required: true },
    bagsReceived: { type: Number },
    createdBy: { type: Schema.Types.ObjectId, ref: "StoreAdmin" },
  },
  { timestamps: true },
);

incomingGatePassSchema.index({ farmerStorageLinkId: 1, date: 1, gatePassNo: 1 });

export const IncomingGatePass: Model<IIncomingGatePass> =
  mongoose.models.IncomingGatePass ||
  mongoose.model<IIncomingGatePass>(
    "IncomingGatePass",
    incomingGatePassSchema,
  );
