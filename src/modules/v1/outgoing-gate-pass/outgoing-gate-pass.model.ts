import mongoose, { Schema, Document, Types, Model } from "mongoose";

export interface IOutgoingGatePass extends Document {
  storageGatePassIds: Types.ObjectId[];
  date: Date;
  gatePassNo: number;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const outgoingGatePassSchema = new Schema<IOutgoingGatePass>(
  {
    storageGatePassIds: [
      { type: Schema.Types.ObjectId, ref: "StorageGatePass" },
    ],
    date: { type: Date, required: true, index: true },
    gatePassNo: { type: Number, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "StoreAdmin" },
  },
  { timestamps: true },
);

outgoingGatePassSchema.index({ storageGatePassIds: 1, date: 1, gatePassNo: 1 });

export const OutgoingGatePass: Model<IOutgoingGatePass> =
  mongoose.models.OutgoingGatePass ||
  mongoose.model<IOutgoingGatePass>(
    "OutgoingGatePass",
    outgoingGatePassSchema,
  );
