import mongoose, { Schema, Document, Types, Model } from "mongoose";

export interface IGradingGatePass extends Document {
  incomingGatePassId: Types.ObjectId;
  date: Date;
  gatePassNo: number;
  orderDetails?: { initialQuantity?: number[] };
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const gradingGatePassSchema = new Schema<IGradingGatePass>(
  {
    incomingGatePassId: {
      type: Schema.Types.ObjectId,
      ref: "IncomingGatePass",
      required: true,
      index: true,
    },
    date: { type: Date, required: true, index: true },
    gatePassNo: { type: Number, required: true },
    orderDetails: Schema.Types.Mixed,
    createdBy: { type: Schema.Types.ObjectId, ref: "StoreAdmin" },
  },
  { timestamps: true },
);

gradingGatePassSchema.index({ incomingGatePassId: 1, date: 1, gatePassNo: 1 });

export const GradingGatePass: Model<IGradingGatePass> =
  mongoose.models.GradingGatePass ||
  mongoose.model<IGradingGatePass>("GradingGatePass", gradingGatePassSchema);
