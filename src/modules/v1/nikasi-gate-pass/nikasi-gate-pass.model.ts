import mongoose, { Schema, Document, Types, Model } from "mongoose";

export interface INikasiGatePass extends Document {
  gradingGatePassIds: Types.ObjectId[];
  date: Date;
  gatePassNo: number;
  orderDetails?: { initialQuantity?: number[] };
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const nikasiGatePassSchema = new Schema<INikasiGatePass>(
  {
    gradingGatePassIds: [
      { type: Schema.Types.ObjectId, ref: "GradingGatePass" },
    ],
    date: { type: Date, required: true, index: true },
    gatePassNo: { type: Number, required: true },
    orderDetails: Schema.Types.Mixed,
    createdBy: { type: Schema.Types.ObjectId, ref: "StoreAdmin" },
  },
  { timestamps: true },
);

nikasiGatePassSchema.index({ gradingGatePassIds: 1, date: 1, gatePassNo: 1 });

export const NikasiGatePass: Model<INikasiGatePass> =
  mongoose.models.NikasiGatePass ||
  mongoose.model<INikasiGatePass>("NikasiGatePass", nikasiGatePassSchema);
