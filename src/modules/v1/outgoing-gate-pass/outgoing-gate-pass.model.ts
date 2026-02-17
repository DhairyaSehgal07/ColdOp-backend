import mongoose, { Schema, Types, Model } from "mongoose";

/* =======================
   INTERFACES
======================= */

interface IOutgoingOrderDetail {
  size: string;
  quantityAvailable: number;
  quantityIssued: number;
  /** When same size exists at multiple locations, breakdown per location */
  location?: {
    chamber: string;
    floor: string;
    row: string;
  };
}

/** Snapshot of an incoming gate pass at creation time */
export interface IOutgoingIncomingGatePassSnapshotBagSize {
  name: string;
  currentQuantity: number;
  initialQuantity: number;

  type: GatePassType;

  location: {
    chamber: string;
    floor: string;
    row: string;
  };
}

export enum GatePassType {
  RECEIPT = "RECEIPT",
  DELIVERY = "DELIVERY",
  RESTORE = "RESTORE",
}

export interface IOutgoingIncomingGatePassSnapshot {
  _id: Types.ObjectId;
  gatePassNo: number;
  variety: string;
  bagSizes: IOutgoingIncomingGatePassSnapshotBagSize[];
}

export interface IOutgoingGatePass extends mongoose.Document {
  farmerStorageLinkId: Types.ObjectId;
  createdBy?: Types.ObjectId;

  /** Snapshot of each incoming gate pass state */
  incomingGatePassSnapshots: IOutgoingIncomingGatePassSnapshot[];

  gatePassNo: number;
  manualParchiNumber?: number;
  date: Date;

  type: GatePassType;

  variety?: string;

  from?: string;
  to?: string;

  truckNumber: string;

  orderDetails: IOutgoingOrderDetail[];

  remarks?: string;

  idempotencyKey?: string;

  createdAt: Date;
  updatedAt: Date;
}

/* =======================
   SUB SCHEMAS
======================= */

const OutgoingOrderDetailLocationSchema = new Schema(
  {
    chamber: { type: String, required: true },
    floor: { type: String, required: true },
    row: { type: String, required: true },
  },
  { _id: false },
);

const OutgoingOrderDetailSchema = new Schema<IOutgoingOrderDetail>(
  {
    size: {
      type: String,
      required: true,
      trim: true,
    },

    quantityAvailable: {
      type: Number,
      required: true,
      min: 0,
    },

    quantityIssued: {
      type: Number,
      required: true,
      min: 0,
    },

    location: {
      type: OutgoingOrderDetailLocationSchema,
      required: false,
    },
  },
  { _id: false },
);

const OutgoingIncomingGatePassSnapshotBagSizeSchema =
  new Schema<IOutgoingIncomingGatePassSnapshotBagSize>(
    {
      name: {
        type: String,
        required: true,
        trim: true,
      },

      currentQuantity: {
        type: Number,
        required: true,
        min: 0,
      },

      initialQuantity: {
        type: Number,
        required: true,
        min: 0,
      },

      type: {
        type: String,
        enum: Object.values(GatePassType),
        required: true,
      },

      location: {
        chamber: {
          type: String,
          required: true,
          trim: true,
        },
        floor: {
          type: String,
          required: true,
          trim: true,
        },
        row: {
          type: String,
          required: true,
          trim: true,
        },
      },
    },
    { _id: false },
  );

const OutgoingIncomingGatePassSnapshotSchema =
  new Schema<IOutgoingIncomingGatePassSnapshot>(
    {
      _id: {
        type: Schema.Types.ObjectId,
        ref: "IncomingGatePass",
        required: true,
      },

      gatePassNo: {
        type: Number,
        required: true,
      },

      variety: {
        type: String,
        required: true,
        trim: true,
      },

      bagSizes: {
        type: [OutgoingIncomingGatePassSnapshotBagSizeSchema],
        required: true,
      },
    },
    { _id: false },
  );

/* =======================
   MAIN SCHEMA
======================= */

const OutgoingGatePassSchema = new Schema<IOutgoingGatePass>(
  {
    farmerStorageLinkId: {
      type: Schema.Types.ObjectId,
      ref: "FarmerStorageLink",
      required: true,
      index: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "StoreAdmin",
      index: true,
    },

    incomingGatePassSnapshots: {
      type: [OutgoingIncomingGatePassSnapshotSchema],
      required: true,
    },

    gatePassNo: {
      type: Number,
      required: true,
      index: true,
    },

    manualParchiNumber: {
      type: Number,
    },

    date: {
      type: Date,
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: Object.values(GatePassType),
      required: false,
    },

    variety: {
      type: String,
      required: false,
      trim: true,
      index: true,
    },

    from: {
      type: String,
      trim: true,
    },

    to: {
      type: String,
      trim: true,
    },

    truckNumber: {
      type: String,
      trim: true,
    },

    orderDetails: {
      type: [OutgoingOrderDetailSchema],
      required: true,
      validate: {
        validator: (details: IOutgoingOrderDetail[]) =>
          Array.isArray(details) && details.length > 0,
        message: "At least one order detail is required",
      },
    },

    remarks: {
      type: String,
      trim: true,
    },

    idempotencyKey: {
      type: String,
      trim: true,
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

OutgoingGatePassSchema.index(
  { idempotencyKey: 1 },
  { unique: true, sparse: true },
);

OutgoingGatePassSchema.index({ farmerStorageLinkId: 1, date: -1 });

OutgoingGatePassSchema.index(
  { farmerStorageLinkId: 1, gatePassNo: 1 },
  { unique: true },
);

OutgoingGatePassSchema.index({ date: -1 });

/* =======================
   MODEL
======================= */

export const OutgoingGatePass: Model<IOutgoingGatePass> =
  mongoose.models.OutgoingGatePass ||
  mongoose.model<IOutgoingGatePass>("OutgoingGatePass", OutgoingGatePassSchema);
