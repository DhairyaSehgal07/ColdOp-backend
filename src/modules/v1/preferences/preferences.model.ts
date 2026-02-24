import mongoose, { Schema, Document } from "mongoose";

/**
 * Preferences document.
 * Contains commodity configuration, report format,
 * finance visibility flag, and extensible custom fields.
 */

export interface CommodityObj {
  name: string;
  varieties: string[];
  sizes: string[];
}

export interface IPreferences extends Document {
  commodities: CommodityObj[];

  /** Report format identifier (e.g. "pdf", "excel", "default") */
  reportFormat: string;

  /** Whether financial data should be visible */
  showFinances: boolean;

  /** Labour cost (default 0) */
  labourCost: number;

  /** Custom, user-defined fields for future customisations */
  customFields?: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

const CommoditySchema = new Schema<CommodityObj>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    varieties: {
      type: [String],
      default: [],
    },
    sizes: {
      type: [String],
      default: [],
    },
  },
  { _id: false },
);

const PreferencesSchema = new Schema<IPreferences>(
  {
    commodities: {
      type: [CommoditySchema],
      default: [],
    },

    reportFormat: {
      type: String,
      default: "default",
      trim: true,
    },

    showFinances: {
      type: Boolean,
      default: true,
    },

    labourCost: {
      type: Number,
      default: 0,
    },

    customFields: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

/* No indexes: only accessed by findById (ColdStorage.preferencesId). */

export const Preferences = mongoose.model<IPreferences>(
  "Preferences",
  PreferencesSchema,
);
