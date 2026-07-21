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
  TRANSFER = "TRANSFER",
  /** Receipt created when stock is transferred in from another farmer at the same cold storage */
  INCOMING_TRANSFER = "Incoming-transfer",
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
  paltaiLocation?: ILocation[];
}

export interface IIncomingGatePass {
  farmerStorageLinkId: Types.ObjectId;
  createdBy?: Types.ObjectId;

  gatePassNo: number;
  date: Date;

  type: GatePassType;

  variety: string;
  truckNumber?: string;

  bagSizes: IBagSize[];

  status: GatePassStatus;

  remarks?: string;

  manualParchiNumber?: string;

  /** Reference to the rent entry voucher created when showFinances is enabled */
  rentEntryVoucherId?: Types.ObjectId;

  stockFilter?: string;

  customMarka?: string;

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
      type: [LocationSchema],
      required: false,
      default: undefined,
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

    type: {
      type: String,
      enum: Object.values(GatePassType),
      required: true,
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

    rentEntryVoucherId: {
      type: Schema.Types.ObjectId,
      ref: "Voucher",
      required: false,
    },

    stockFilter: {
      type: String,
      required: false,
      trim: true,
    },

    customMarka: {
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

// List by link + analytics: find(farmerStorageLinkId).sort({ date: -1, gatePassNo: -1 })
IncomingGatePassSchema.index({
  farmerStorageLinkId: 1,
  date: -1,
  gatePassNo: -1,
});

// Daybook/reports: find(farmerStorageLinkId).sort({ createdAt })
IncomingGatePassSchema.index({ farmerStorageLinkId: 1, createdAt: -1 });

// Unique gate pass per link; lookup by receipt; getNextVoucherNumber sort({ gatePassNo: -1 })
IncomingGatePassSchema.index(
  { farmerStorageLinkId: 1, gatePassNo: 1 },
  { unique: true },
);

/* =======================
   LOCATION HELPERS
======================= */

export function locationMatches(a: ILocation, b: ILocation): boolean {
  return (
    (a.chamber ?? "").trim() === (b.chamber ?? "").trim() &&
    (a.floor ?? "").trim() === (b.floor ?? "").trim() &&
    (a.row ?? "").trim() === (b.row ?? "").trim()
  );
}

/** Latest storage location: last paltai entry if any, else original location. */
export function getEffectiveLocation(bag: IBagSize): ILocation {
  const paltai = bag.paltaiLocation;
  if (Array.isArray(paltai) && paltai.length > 0) {
    const last = paltai[paltai.length - 1];
    if (last?.chamber && last?.floor && last?.row) return last;
  }
  return bag.location;
}

/** Whether a bag is stored at the given location (original or any paltai). */
export function bagHasLocation(bag: IBagSize, location: ILocation): boolean {
  if (locationMatches(bag.location, location)) return true;
  const paltai = bag.paltaiLocation;
  if (!Array.isArray(paltai)) return false;
  return paltai.some((p) => locationMatches(p, location));
}

export function buildBagLocationArrayFilter(
  location: ILocation,
): Record<string, unknown> {
  return {
    $or: [
      {
        "elem.location.chamber": location.chamber,
        "elem.location.floor": location.floor,
        "elem.location.row": location.row,
      },
      {
        "elem.paltaiLocation": {
          $elemMatch: {
            chamber: location.chamber,
            floor: location.floor,
            row: location.row,
          },
        },
      },
    ],
  };
}

/* =======================
   MODEL EXPORT
======================= */

export const IncomingGatePass: Model<IIncomingGatePass> =
  mongoose.models.IncomingGatePass ||
  mongoose.model<IIncomingGatePass>("IncomingGatePass", IncomingGatePassSchema);
