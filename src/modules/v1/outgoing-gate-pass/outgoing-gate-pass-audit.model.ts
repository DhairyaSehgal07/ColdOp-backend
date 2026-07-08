import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";
import type { IOutgoingGatePass } from "./outgoing-gate-pass.model.js";

/* =======================
   INTERFACES
======================= */

/** Snapshot of only the outgoing gate pass fields that changed in an edit */
export type OutgoingGatePassAuditState = Partial<
  Pick<
    IOutgoingGatePass,
    | "farmerStorageLinkId"
    | "date"
    | "from"
    | "to"
    | "truckNumber"
    | "orderDetails"
    | "incomingGatePassSnapshots"
    | "remarks"
    | "manualParchiNumber"
    | "stockFilter"
  >
> &
  Record<string, unknown>;

export interface IOutgoingGatePassAudit {
  outgoingGatePassId: Types.ObjectId;
  editedById?: Types.ObjectId;

  /** Field values before the edit (only modified fields) */
  previousState: OutgoingGatePassAuditState;
  /** Field values after the edit (only modified fields) */
  modifiedState: OutgoingGatePassAuditState;

  ipAddress?: string;
  userAgent?: string;

  createdAt: Date;
}

export type OutgoingGatePassAuditDocument =
  HydratedDocument<IOutgoingGatePassAudit>;

/* =======================
   SCHEMA
======================= */

const OutgoingGatePassAuditSchema = new Schema<IOutgoingGatePassAudit>(
  {
    outgoingGatePassId: {
      type: Schema.Types.ObjectId,
      ref: "OutgoingGatePass",
      required: true,
      index: true,
    },

    editedById: {
      type: Schema.Types.ObjectId,
      ref: "StoreAdmin",
      index: true,
    },

    previousState: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },

    modifiedState: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },

    ipAddress: {
      type: String,
    },

    userAgent: {
      type: String,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

/* =======================
   INDEXES
======================= */

OutgoingGatePassAuditSchema.index({ outgoingGatePassId: 1, createdAt: -1 });
OutgoingGatePassAuditSchema.index({ editedById: 1, createdAt: -1 });
OutgoingGatePassAuditSchema.index({ createdAt: -1 });

/* =======================
   MODEL
======================= */

export const OutgoingGatePassAudit: Model<IOutgoingGatePassAudit> =
  mongoose.models.OutgoingGatePassAudit ||
  mongoose.model<IOutgoingGatePassAudit>(
    "OutgoingGatePassAudit",
    OutgoingGatePassAuditSchema,
  );
