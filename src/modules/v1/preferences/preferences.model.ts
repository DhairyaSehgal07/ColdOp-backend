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

export interface StockFilterObj {
  enabled: boolean;
  options: string[];
}

export interface GenerationObj {
  enabled: boolean;
  options: string[];
}

export interface IPreferences extends Document {
  commodities: CommodityObj[];

  /** Report format identifier (e.g. "pdf", "excel", "default") */
  reportFormat: string;

  /** Whether financial data should be visible */
  showFinances: boolean;

  /** Whether view filters should be shown in the UI */
  showViewFilters?: boolean;

  /** Generation visibility and selectable options */
  generation: GenerationObj;

  /** Labour cost (default 0) */
  labourCost: number;

  /** Stock filter configuration */
  stockFilter: StockFilterObj;

  /** Whether custom marka is enabled */
  customMarka?: boolean;

  /** Marka type identifier (default: GatePass) */
  markaType: string;

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

const StockFilterSchema = new Schema<StockFilterObj>(
  {
    enabled: {
      type: Boolean,
      default: false,
    },
    options: {
      type: [String],
      default: [],
    },
  },
  { _id: false },
);

const GenerationSchema = new Schema<GenerationObj>(
  {
    enabled: {
      type: Boolean,
      default: false,
    },
    options: {
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

    showViewFilters: {
      type: Boolean,
    },

    generation: {
      type: GenerationSchema,
      default: () => ({ enabled: false, options: [] }),
    },

    labourCost: {
      type: Number,
      default: 0,
    },

    stockFilter: {
      type: StockFilterSchema,
      default: () => ({ enabled: false, options: [] }),
    },

    customMarka: {
      type: Boolean,
    },

    markaType: {
      type: String,
      default: "GatePass",
      trim: true,
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
