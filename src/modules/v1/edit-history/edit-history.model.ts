import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

/* =======================
   ENUMS
======================= */

export enum EditHistoryEntityType {
  INCOMING_GATE_PASS = "incoming_gate_pass",
  OUTGOING_GATE_PASS = "outgoing_gate_pass",
}

export enum EditHistoryAction {
  CREATE = "create",
  UPDATE = "update",
  QUANTITY_ADJUSTMENT = "quantity_adjustment",
  CLOSE = "close",
  OTHER = "other",
}

/* =======================
   INTERFACES
======================= */

export interface IEditHistory {
  /** Which entity was edited (incoming or outgoing gate pass) */
  entityType: EditHistoryEntityType;

  /** The gate pass document _id that was edited */
  documentId: Types.ObjectId;

  /** Cold storage this edit belongs to (for fetching all edit history of a storage) */
  coldStorageId: Types.ObjectId;

  /** Store admin who performed the edit */
  editedBy: Types.ObjectId;

  /** When the edit occurred */
  editedAt: Date;

  /** What kind of edit (create, update, quantity_adjustment, etc.) */
  action: EditHistoryAction;

  /** Optional human-readable summary of the change */
  changeSummary?: string;

  /** Optional snapshot of document state before edit (for audit) */
  snapshotBefore?: Record<string, unknown>;

  /** Optional snapshot of document state after edit (for audit) */
  snapshotAfter?: Record<string, unknown>;

  createdAt: Date;
}

export type EditHistoryDocument = HydratedDocument<IEditHistory>;

/* =======================
   MAIN SCHEMA
======================= */

const EditHistorySchema = new Schema<IEditHistory>(
  {
    entityType: {
      type: String,
      enum: Object.values(EditHistoryEntityType),
      required: true,
    },

    documentId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    coldStorageId: {
      type: Schema.Types.ObjectId,
      ref: "ColdStorage",
      required: true,
    },

    editedBy: {
      type: Schema.Types.ObjectId,
      ref: "StoreAdmin",
      required: true,
    },

    editedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },

    action: {
      type: String,
      enum: Object.values(EditHistoryAction),
      required: true,
    },

    changeSummary: {
      type: String,
      trim: true,
    },

    snapshotBefore: {
      type: Schema.Types.Mixed,
    },

    snapshotAfter: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

/* =======================
   INDEXES (only those used by queries)
======================= */

// find(entityType, documentId).sort({ editedAt: -1 })
EditHistorySchema.index({ entityType: 1, documentId: 1, editedAt: -1 });

// find(coldStorageId).sort({ editedAt: -1 })
EditHistorySchema.index({ coldStorageId: 1, editedAt: -1 });

/* =======================
   MODEL EXPORT
======================= */

export const EditHistory: Model<IEditHistory> =
  mongoose.models.EditHistory ||
  mongoose.model<IEditHistory>("EditHistory", EditHistorySchema);
