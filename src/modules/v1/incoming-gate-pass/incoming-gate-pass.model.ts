import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

/* =======================
   ENUMS
======================= */

export enum GatePassStatus {
  OPEN = "OPEN",
  CLOSED = "CLOSED",
}

export enum GatePassType {
  RECEIPT = "RECEIPT",
  DELIVERY = "DELIVERY",
  RESTORE = "RESTORE",
}

/* =======================
   INTERFACES
======================= */

export interface ILocation {
  chamber: string;
  floor: string;
  row: string;
}

export interface IBagSize {
  name: string;
  initialQuantity: number;
  currentQuantity: number;
  location: ILocation;
  paltaiLocation?: ILocation;
}

export interface IIncomingGatePass {
  farmerStorageLinkId: Types.ObjectId;
  createdBy?: Types.ObjectId;

  gatePassNo: {
    type: number;
    required: true;
  };
  date: Date;

  type: GatePassType;

  variety: string;
  truckNumber?: string;

  bagSizes: IBagSize[];

  status: GatePassStatus;

  remarks?: string;

  manualParchiNumber?: string;

  createdAt: Date;
  updatedAt: Date;
}

export type IncomingGatePassDocument = HydratedDocument<IIncomingGatePass>;

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

const BagSizeSchema = new Schema<IBagSize>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    initialQuantity: {
      type: Number,
      required: true,
      min: 0,
    },

    currentQuantity: {
      type: Number,
      required: true,
      min: 0,
    },

    location: {
      type: LocationSchema,
      required: true,
    },

    paltaiLocation: {
      type: LocationSchema,
      required: false,
    },
  },
  { _id: false },
);

/* =======================
   MAIN SCHEMA
======================= */

const IncomingGatePassSchema = new Schema<IIncomingGatePass>(
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

    gatePassNo: {
      type: Number,
      required: true,
      index: true,
    },

    date: {
      type: Date,
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: Object.values(GatePassType),
      required: true,
      index: true,
    },

    variety: {
      type: String,
      required: true,
      trim: true,
    },

    truckNumber: {
      type: String,
      required: false,
      trim: true,
    },

    bagSizes: {
      type: [BagSizeSchema],
      required: true,
      validate: {
        validator: (v: IBagSize[]) => v.length > 0,
        message: "At least one bag size is required",
      },
    },

    status: {
      type: String,
      enum: Object.values(GatePassStatus),
      default: GatePassStatus.OPEN,
      index: true,
    },

    remarks: {
      type: String,
      trim: true,
    },

    manualParchiNumber: {
      type: String,
      required: false,
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

// By farmer storage link
IncomingGatePassSchema.index({ farmerStorageLinkId: 1, date: -1 });

// Daybook queries
IncomingGatePassSchema.index({
  farmerStorageLinkId: 1,
  date: -1,
  gatePassNo: -1,
});

// Reporting
IncomingGatePassSchema.index({ date: -1 });

// Status filter
IncomingGatePassSchema.index({ status: 1, date: -1 });

// Unique voucher per farmer-storage link
IncomingGatePassSchema.index(
  { farmerStorageLinkId: 1, gatePassNo: 1 },
  { unique: true },
);

/* =======================
   MODEL EXPORT
======================= */

export const IncomingGatePass: Model<IIncomingGatePass> =
  mongoose.models.IncomingGatePass ||
  mongoose.model<IIncomingGatePass>("IncomingGatePass", IncomingGatePassSchema);
