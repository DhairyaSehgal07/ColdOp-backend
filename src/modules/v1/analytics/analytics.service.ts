import mongoose from "mongoose";
import type { FastifyBaseLogger } from "fastify";
import { Farmer } from "../farmer/farmer-model.js";
import { FarmerStorageLink } from "../farmer-storage-link/farmer-storage-link-model.js";
import { IncomingGatePass } from "../incoming-gate-pass/incoming-gate-pass.model.js";
import { StoreAdmin } from "../store-admin/store-admin.model.js";
import { ValidationError } from "../../../utils/errors.js";

const col = {
  farmerStorageLinks: FarmerStorageLink.collection.name,
  farmers: Farmer.collection.name,
};

/** Single size entry in stock summary (quantityRemoved = initialQuantity - currentQuantity on frontend) */
export interface StockSummarySize {
  size: string;
  initialQuantity: number;
  currentQuantity: number;
}

/** One variety with its sizes in stock summary */
export interface StockSummaryVariety {
  variety: string;
  sizes: StockSummarySize[];
}

/** Flat row for Recharts (e.g. BarChart, LineChart); quantityRemoved = initialQuantity - currentQuantity on frontend */
export interface StockChartDataPoint {
  name: string;
  variety: string;
  size: string;
  initialQuantity: number;
  currentQuantity: number;
}

/** Chart-ready datasets for Recharts */
export interface StockSummaryChartData {
  /** Flat list for bar/line by variety-size (name = "variety - size") */
  flatSeries: StockChartDataPoint[];
  /** Variety names for legends / filters */
  varieties: string[];
  /** Size names for legends / filters */
  sizes: string[];
}

/** Total inventory across all varieties and sizes */
export interface TotalInventory {
  initial: number;
  current: number;
}

/** Top variety by current quantity */
export interface TopVariety {
  variety: string;
  currentQuantity: number;
}

/** Top bag size by current quantity (across all varieties) */
export interface TopSize {
  size: string;
  currentQuantity: number;
}

/** Recharts-ready data point: name (e.g. farmer name) + value for a single metric */
export interface TopFarmerChartPoint {
  name: string;
  value: number;
}

/** Top 5 farmers chart data for a store: one array per metric for Recharts */
export interface TopFarmersChartData {
  byCurrentQuantity: TopFarmerChartPoint[];
  byInitialQuantity: TopFarmerChartPoint[];
  byQuantityRemoved: TopFarmerChartPoint[];
}

/** Per-farmer contribution for a size in variety breakdown */
export interface VarietyBreakdownFarmerContribution {
  farmerName: string;
  initialQuantity: number;
  currentQuantity: number;
  quantityRemoved: number;
}

/** One size with totals and per-farmer breakdown */
export interface VarietyBreakdownSize {
  size: string;
  initialQuantity: number;
  currentQuantity: number;
  quantityRemoved: number;
  farmerBreakdown: VarietyBreakdownFarmerContribution[];
}

/** Variety breakdown: one variety with all sizes and farmer contributions per size */
export interface VarietyBreakdownResult {
  variety: string;
  sizes: VarietyBreakdownSize[];
}

/** Result when groupByStockFilter is true: breakdown keyed by distinct stockFilter values */
export interface VarietyBreakdownByFilterResult {
  varietyBreakdownByFilter: Record<string, VarietyBreakdownResult>;
}

export interface StockSummaryResult {
  stockSummary: StockSummaryVariety[];
  chartData: StockSummaryChartData;
  totalInventory: TotalInventory;
  topVariety: TopVariety | null;
  topSize: TopSize | null;
}

/** Result when groupByStockFilter is true: summary keyed by distinct stockFilter values */
export interface StockSummaryByFilterResult {
  stockSummaryByFilter: Record<string, StockSummaryResult>;
}

/**
 * Distinct non-empty stockFilter values on IncomingGatePasses for a cold storage.
 */
async function getDistinctStockFilters(
  coldStorageId: string,
): Promise<string[]> {
  const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);

  const result = await IncomingGatePass.aggregate<{ values: string[] }>([
    {
      $lookup: {
        from: col.farmerStorageLinks,
        localField: "farmerStorageLinkId",
        foreignField: "_id",
        as: "_link",
      },
    },
    { $unwind: "$_link" },
    {
      $match: {
        "_link.coldStorageId": coldStorageObjectId,
        stockFilter: { $exists: true, $nin: [null, ""] },
      },
    },
    {
      $group: {
        _id: null,
        values: { $addToSet: "$stockFilter" },
      },
    },
  ]);

  const values = result[0]?.values ?? [];
  return values.filter((v): v is string => typeof v === "string" && v.trim() !== "").sort();
}

/**
 * Get stock summary for a cold storage: all bag varieties and sizes with
 * initial quantity, current quantity, and quantity removed (initial - current).
 * Only documents belonging to the given cold storage are used (via farmer-storage links).
 * Caller must pass the logged-in store admin's coldStorageId from the JWT.
 *
 * Aggregation source: IncomingGatePass only. Quantities are summed from each
 * incoming gate pass's bagSizes (initialQuantity, currentQuantity). This is
 * unaffected by OutgoingGatePass; outgoing passes only decrement currentQuantity
 * on IncomingGatePass at creation time, so this summary always reflects the
 * current stock correctly. OutgoingGatePass.incomingGatePassSnapshots (which
 * now only stores sizes that were updated per outgoing pass) is not used here.
 *
 * When options.groupByStockFilter is true, returns summary grouped by every
 * distinct non-empty stockFilter value found in data. If none exist, throws
 * ValidationError (NO_STOCK_FILTER).
 */
export async function getStockSummary(
  coldStorageId: string,
  logger?: FastifyBaseLogger,
  options?: { groupByStockFilter?: boolean },
): Promise<StockSummaryResult | StockSummaryByFilterResult> {
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      "Invalid cold storage ID format",
      "INVALID_COLD_STORAGE_ID",
    );
  }

  if (options?.groupByStockFilter) {
    const distinctFilters = await getDistinctStockFilters(coldStorageId);
    if (distinctFilters.length === 0) {
      throw new ValidationError(
        "No stock filter found. Please disable it from preferences.",
        "NO_STOCK_FILTER",
      );
    }

    const results = await Promise.all(
      distinctFilters.map((filterValue) =>
        getStockSummaryForFilter(coldStorageId, filterValue, logger),
      ),
    );

    const stockSummaryByFilter: Record<string, StockSummaryResult> = {};
    for (let i = 0; i < distinctFilters.length; i++) {
      stockSummaryByFilter[distinctFilters[i]] = results[i];
    }
    return { stockSummaryByFilter };
  }

  return getStockSummaryForFilter(coldStorageId, undefined, logger);
}

/**
 * Internal: get stock summary optionally filtered by stockFilter value.
 * When filterValue is set, only documents with that exact stockFilter are included.
 * When filterValue is undefined, no stockFilter filter is applied (all documents).
 */
async function getStockSummaryForFilter(
  coldStorageId: string,
  filterValue: string | undefined,
  logger?: FastifyBaseLogger,
): Promise<StockSummaryResult> {
  const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);

  const stockFilterMatch: mongoose.PipelineStage[] = filterValue
    ? [{ $match: { stockFilter: filterValue } }]
    : [];

  const pipeline: mongoose.PipelineStage[] = [
    {
      $lookup: {
        from: col.farmerStorageLinks,
        localField: "farmerStorageLinkId",
        foreignField: "_id",
        as: "_link",
      },
    },
    { $unwind: "$_link" },
    {
      $match: {
        "_link.coldStorageId": coldStorageObjectId,
      },
    },
    ...stockFilterMatch,
    { $unwind: "$bagSizes" },
    {
      $group: {
        _id: {
          variety: "$variety",
          size: "$bagSizes.name",
        },
        initialQuantity: { $sum: "$bagSizes.initialQuantity" },
        currentQuantity: { $sum: "$bagSizes.currentQuantity" },
      },
    },
    {
      $addFields: {
        quantityRemoved: {
          $subtract: ["$initialQuantity", "$currentQuantity"],
        },
      },
    },
    { $sort: { "_id.variety": 1, "_id.size": 1 } },
    {
      $facet: {
        stockSummary: [
          {
            $group: {
              _id: "$_id.variety",
              sizes: {
                $push: {
                  size: "$_id.size",
                  initialQuantity: "$initialQuantity",
                  currentQuantity: "$currentQuantity",
                  quantityRemoved: "$quantityRemoved",
                },
              },
            },
          },
          { $sort: { _id: 1 } },
          {
            $project: {
              _id: 0,
              variety: "$_id",
              sizes: 1,
            },
          },
        ],
        totals: [
          {
            $group: {
              _id: null,
              initial: { $sum: "$initialQuantity" },
              current: { $sum: "$currentQuantity" },
            },
          },
          { $project: { _id: 0 } },
        ],
        topVariety: [
          {
            $group: {
              _id: "$_id.variety",
              currentQuantity: { $sum: "$currentQuantity" },
            },
          },
          { $sort: { currentQuantity: -1 } },
          { $limit: 1 },
          {
            $project: {
              _id: 0,
              variety: "$_id",
              currentQuantity: 1,
            },
          },
        ],
        topSize: [
          {
            $group: {
              _id: "$_id.size",
              currentQuantity: { $sum: "$currentQuantity" },
            },
          },
          { $sort: { currentQuantity: -1 } },
          { $limit: 1 },
          {
            $project: {
              _id: 0,
              size: "$_id",
              currentQuantity: 1,
            },
          },
        ],
      },
    },
  ];

  interface StockSummaryFacetResult {
    stockSummary: Array<{
      variety: string;
      sizes: Array<{
        size: string;
        initialQuantity: number;
        currentQuantity: number;
        quantityRemoved: number;
      }>;
    }>;
    totals: Array<{ initial: number; current: number }>;
    topVariety: Array<{ variety: string; currentQuantity: number }>;
    topSize: Array<{ size: string; currentQuantity: number }>;
  }

  const result =
    await IncomingGatePass.aggregate<StockSummaryFacetResult>(pipeline);
  const facet = result[0];
  const aggregated = facet?.stockSummary ?? [];

  if (aggregated.length === 0) {
    logger?.info({ coldStorageId }, "Stock summary: no matching gate passes");
    return {
      stockSummary: [],
      chartData: {
        flatSeries: [],
        varieties: [],
        sizes: [],
      },
      totalInventory: {
        initial: facet?.totals[0]?.initial ?? 0,
        current: facet?.totals[0]?.current ?? 0,
      },
      topVariety: facet?.topVariety[0] ?? null,
      topSize: facet?.topSize[0] ?? null,
    };
  }

  const stockSummary: StockSummaryVariety[] = aggregated.map((row) => ({
    variety: row.variety,
    sizes: row.sizes.map((s) => ({
      size: s.size,
      initialQuantity: s.initialQuantity,
      currentQuantity: s.currentQuantity,
    })),
  }));

  const flatSeries: StockChartDataPoint[] = [];
  const varietySet = new Set<string>();
  const sizeSet = new Set<string>();
  for (const row of aggregated) {
    varietySet.add(row.variety);
    for (const s of row.sizes) {
      sizeSet.add(s.size);
      flatSeries.push({
        name: `${row.variety} - ${s.size}`,
        variety: row.variety,
        size: s.size,
        initialQuantity: s.initialQuantity,
        currentQuantity: s.currentQuantity,
      });
    }
  }

  return {
    stockSummary,
    chartData: {
      flatSeries,
      varieties: Array.from(varietySet).sort(),
      sizes: Array.from(sizeSet).sort(),
    },
    totalInventory: {
      initial: facet.totals[0]?.initial ?? 0,
      current: facet.totals[0]?.current ?? 0,
    },
    topVariety: facet.topVariety[0] ?? null,
    topSize: facet.topSize[0] ?? null,
  };
}

const TOP_FARMERS_LIMIT = 5;

/**
 * Get top 5 farmers by current quantity, initial quantity, and quantity removed
 * for the given cold storage. Response is formatted for Recharts (name + value per series).
 */
export async function getTopFarmersForStore(
  coldStorageId: string,
  logger?: FastifyBaseLogger,
): Promise<TopFarmersChartData> {
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      "Invalid cold storage ID format",
      "INVALID_COLD_STORAGE_ID",
    );
  }

  const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);

  const pipeline: mongoose.PipelineStage[] = [
    {
      $lookup: {
        from: col.farmerStorageLinks,
        localField: "farmerStorageLinkId",
        foreignField: "_id",
        as: "_link",
      },
    },
    { $unwind: "$_link" },
    {
      $match: {
        "_link.coldStorageId": coldStorageObjectId,
      },
    },
    { $unwind: "$bagSizes" },
    {
      $group: {
        _id: "$farmerStorageLinkId",
        initialQuantity: { $sum: "$bagSizes.initialQuantity" },
        currentQuantity: { $sum: "$bagSizes.currentQuantity" },
      },
    },
    {
      $addFields: {
        quantityRemoved: {
          $subtract: ["$initialQuantity", "$currentQuantity"],
        },
      },
    },
    {
      $lookup: {
        from: col.farmerStorageLinks,
        localField: "_id",
        foreignField: "_id",
        as: "_linkDoc",
      },
    },
    { $unwind: "$_linkDoc" },
    {
      $lookup: {
        from: col.farmers,
        localField: "_linkDoc.farmerId",
        foreignField: "_id",
        as: "_farmer",
      },
    },
    {
      $addFields: {
        farmerName: {
          $ifNull: [
            "$_linkDoc.name",
            {
              $ifNull: [
                { $arrayElemAt: ["$_farmer.name", 0] },
                {
                  $concat: [
                    "Account #",
                    { $toString: "$_linkDoc.accountNumber" },
                  ],
                },
              ],
            },
          ],
        },
      },
    },
    {
      $facet: {
        byCurrentQuantity: [
          { $sort: { currentQuantity: -1 } },
          { $limit: TOP_FARMERS_LIMIT },
          {
            $project: {
              _id: 0,
              name: "$farmerName",
              value: "$currentQuantity",
            },
          },
        ],
        byInitialQuantity: [
          { $sort: { initialQuantity: -1 } },
          { $limit: TOP_FARMERS_LIMIT },
          {
            $project: {
              _id: 0,
              name: "$farmerName",
              value: "$initialQuantity",
            },
          },
        ],
        byQuantityRemoved: [
          { $sort: { quantityRemoved: -1 } },
          { $limit: TOP_FARMERS_LIMIT },
          {
            $project: {
              _id: 0,
              name: "$farmerName",
              value: "$quantityRemoved",
            },
          },
        ],
      },
    },
  ];

  interface TopFarmersFacetResult {
    byCurrentQuantity: TopFarmerChartPoint[];
    byInitialQuantity: TopFarmerChartPoint[];
    byQuantityRemoved: TopFarmerChartPoint[];
  }

  const result =
    await IncomingGatePass.aggregate<TopFarmersFacetResult>(pipeline);
  const facet = result[0];

  if (!facet) {
    logger?.info({ coldStorageId }, "Top farmers: no matching gate passes");
    return {
      byCurrentQuantity: [],
      byInitialQuantity: [],
      byQuantityRemoved: [],
    };
  }

  return {
    byCurrentQuantity: facet.byCurrentQuantity ?? [],
    byInitialQuantity: facet.byInitialQuantity ?? [],
    byQuantityRemoved: facet.byQuantityRemoved ?? [],
  };
}

/**
 * Get breakdown for a single variety: all sizes with their quantities (initial,
 * current, quantityRemoved) and per-farmer contribution for each size.
 * Scoped to the given cold storage.
 *
 * When options.groupByStockFilter is true, returns breakdown grouped by every
 * distinct non-empty stockFilter value found in data. If none exist, throws
 * ValidationError (NO_STOCK_FILTER).
 */
export async function getVarietyBreakdown(
  coldStorageId: string,
  varietyName: string,
  _logger?: FastifyBaseLogger,
  options?: { groupByStockFilter?: boolean },
): Promise<VarietyBreakdownResult | VarietyBreakdownByFilterResult> {
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      "Invalid cold storage ID format",
      "INVALID_COLD_STORAGE_ID",
    );
  }

  const trimmedVariety = varietyName.trim();
  if (!trimmedVariety) {
    throw new ValidationError(
      "Variety name is required",
      "VARIETY_NAME_REQUIRED",
    );
  }

  if (options?.groupByStockFilter) {
    const distinctFilters = await getDistinctStockFilters(coldStorageId);
    if (distinctFilters.length === 0) {
      throw new ValidationError(
        "No stock filter found. Please disable it from preferences.",
        "NO_STOCK_FILTER",
      );
    }

    const results = await Promise.all(
      distinctFilters.map((filterValue) =>
        getVarietyBreakdownForFilter(
          coldStorageId,
          trimmedVariety,
          filterValue,
        ),
      ),
    );

    const varietyBreakdownByFilter: Record<string, VarietyBreakdownResult> =
      {};
    for (let i = 0; i < distinctFilters.length; i++) {
      varietyBreakdownByFilter[distinctFilters[i]] = results[i];
    }
    return { varietyBreakdownByFilter };
  }

  return getVarietyBreakdownForFilter(
    coldStorageId,
    trimmedVariety,
    undefined,
  );
}

/**
 * Internal: get variety breakdown optionally filtered by stockFilter value.
 * When filterValue is set, only documents with that exact stockFilter are included.
 * When filterValue is undefined, no stockFilter filter is applied (all documents).
 */
async function getVarietyBreakdownForFilter(
  coldStorageId: string,
  trimmedVariety: string,
  filterValue: string | undefined,
): Promise<VarietyBreakdownResult> {
  const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);

  const stockFilterMatch: mongoose.PipelineStage[] = filterValue
    ? [{ $match: { stockFilter: filterValue } }]
    : [];

  const pipeline: mongoose.PipelineStage[] = [
    {
      $match: { variety: trimmedVariety },
    },
    {
      $lookup: {
        from: col.farmerStorageLinks,
        localField: "farmerStorageLinkId",
        foreignField: "_id",
        as: "_link",
      },
    },
    { $unwind: "$_link" },
    {
      $match: {
        "_link.coldStorageId": coldStorageObjectId,
      },
    },
    ...stockFilterMatch,
    { $unwind: "$bagSizes" },
    {
      $group: {
        _id: {
          size: "$bagSizes.name",
          farmerStorageLinkId: "$farmerStorageLinkId",
        },
        initialQuantity: { $sum: "$bagSizes.initialQuantity" },
        currentQuantity: { $sum: "$bagSizes.currentQuantity" },
      },
    },
    {
      $addFields: {
        quantityRemoved: {
          $subtract: ["$initialQuantity", "$currentQuantity"],
        },
      },
    },
    {
      $lookup: {
        from: col.farmerStorageLinks,
        localField: "_id.farmerStorageLinkId",
        foreignField: "_id",
        as: "_linkDoc",
      },
    },
    { $unwind: "$_linkDoc" },
    {
      $lookup: {
        from: col.farmers,
        localField: "_linkDoc.farmerId",
        foreignField: "_id",
        as: "_farmer",
      },
    },
    {
      $addFields: {
        farmerName: {
          $ifNull: [
            "$_linkDoc.name",
            {
              $ifNull: [
                { $arrayElemAt: ["$_farmer.name", 0] },
                {
                  $concat: [
                    "Account #",
                    { $toString: "$_linkDoc.accountNumber" },
                  ],
                },
              ],
            },
          ],
        },
      },
    },
    {
      $group: {
        _id: "$_id.size",
        initialQuantity: { $sum: "$initialQuantity" },
        currentQuantity: { $sum: "$currentQuantity" },
        quantityRemoved: { $sum: "$quantityRemoved" },
        farmerBreakdown: {
          $push: {
            farmerName: "$farmerName",
            initialQuantity: "$initialQuantity",
            currentQuantity: "$currentQuantity",
            quantityRemoved: "$quantityRemoved",
          },
        },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        size: "$_id",
        initialQuantity: 1,
        currentQuantity: 1,
        quantityRemoved: 1,
        farmerBreakdown: 1,
      },
    },
  ];

  interface VarietyBreakdownAggregateRow {
    size: string;
    initialQuantity: number;
    currentQuantity: number;
    quantityRemoved: number;
    farmerBreakdown: VarietyBreakdownFarmerContribution[];
  }

  const sizes =
    await IncomingGatePass.aggregate<VarietyBreakdownAggregateRow>(pipeline);

  return {
    variety: trimmedVariety,
    sizes,
  };
}

/**
 * Get all incoming gate passes for the logged-in cold storage.
 * Returns documents with populated farmerStorageLinkId (farmerId, accountNumber) and farmer details.
 */
export async function getIncomingGatePassesForStorage(
  coldStorageId: string,
  logger?: FastifyBaseLogger,
): Promise<Record<string, unknown>[]> {
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      "Invalid cold storage ID format",
      "INVALID_COLD_STORAGE_ID",
    );
  }

  const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);
  const links = await FarmerStorageLink.find(
    { coldStorageId: coldStorageObjectId },
    { _id: 1 },
  )
    .lean()
    .then((list) => list.map((l) => l._id));

  if (links.length === 0) {
    logger?.info(
      { coldStorageId },
      "Incoming gate passes: no farmer-storage links",
    );
    return [];
  }

  const select =
    "_id farmerStorageLinkId createdBy gatePassNo date type variety truckNumber bagSizes status remarks manualParchiNumber rentEntryVoucherId createdAt updatedAt";
  const populateLink = [
    {
      path: "farmerStorageLinkId",
      select: "farmerId accountNumber",
      populate: {
        path: "farmerId",
        model: Farmer,
        select: "name mobileNumber address",
      },
    },
    {
      path: "createdBy",
      model: StoreAdmin,
      select: "name",
    },
  ];

  const list = await IncomingGatePass.find({
    farmerStorageLinkId: { $in: links },
  })
    .sort({ date: -1, gatePassNo: -1 })
    .select(select)
    .populate(populateLink)
    .lean();

  return list as unknown as Record<string, unknown>[];
}

/* =======================
   Advanced analytics
======================= */

const EMPTY_CHAMBER = "(No chamber)";
const EMPTY_FLOOR = "(No floor)";

function normalizeChamber(v?: string | null): string {
  return (v ?? "").trim() || EMPTY_CHAMBER;
}

function normalizeFloor(v?: string | null): string {
  return (v ?? "").trim() || EMPTY_FLOOR;
}

export interface AdvancedAnalyticsBag {
  name: string;
  initialQuantity: number;
  currentQuantity: number;
  location: {
    chamber: string;
    floor: string;
    row: string;
  };
}

export interface AdvancedAnalyticsOrderSummary {
  _id: string;
  gatePassNo: number;
  date: string;
  variety: string;
  farmerId: string;
  farmerName: string;
  bagSizes: AdvancedAnalyticsBag[];
}

export interface AdvancedAnalyticsFloor {
  floor: string;
  initialTotal: number;
  currentTotal: number;
}

export interface AdvancedAnalyticsChamber {
  chamber: string;
  initialTotal: number;
  currentTotal: number;
  orderCount: number;
  floors: AdvancedAnalyticsFloor[];
  orders: AdvancedAnalyticsOrderSummary[];
}

export interface AdvancedAnalyticsFarmer {
  farmerId: string;
  farmerName: string;
  accountNumber: number | null;
  orderCount: number;
  orders: AdvancedAnalyticsOrderSummary[];
}

export interface AdvancedAnalyticsData {
  byLocation: {
    chambers: AdvancedAnalyticsChamber[];
  };
  byFarmer: AdvancedAnalyticsFarmer[];
}

interface AdvancedAnalyticsPassBag {
  name: string;
  initialQuantity: number;
  currentQuantity: number;
  location?: {
    chamber?: string;
    floor?: string;
    row?: string;
  };
}

interface AdvancedAnalyticsPassFarmer {
  _id?: string;
  name?: string;
}

interface AdvancedAnalyticsPassLink {
  farmerId?: AdvancedAnalyticsPassFarmer | string;
  accountNumber?: number;
}

interface AdvancedAnalyticsPass {
  _id: string | { toString(): string };
  gatePassNo: number;
  date: Date | string;
  variety: string;
  farmerStorageLinkId?: AdvancedAnalyticsPassLink;
  bagSizes?: AdvancedAnalyticsPassBag[];
}

type ChamberEntry = {
  pass: AdvancedAnalyticsPass;
  bagSizesInChamber: AdvancedAnalyticsPassBag[];
};

function passId(pass: AdvancedAnalyticsPass): string {
  if (typeof pass._id === "string") return pass._id;
  return pass._id.toString();
}

function passDateIso(pass: AdvancedAnalyticsPass): string {
  const d = pass.date;
  return d instanceof Date ? d.toISOString() : String(d);
}

function farmerIdFromPass(pass: AdvancedAnalyticsPass): string {
  const farmer = pass.farmerStorageLinkId?.farmerId;
  if (farmer && typeof farmer === "object" && farmer._id) {
    return String(farmer._id);
  }
  return "(Unknown)";
}

function farmerNameFromPass(pass: AdvancedAnalyticsPass): string {
  const farmer = pass.farmerStorageLinkId?.farmerId;
  if (farmer && typeof farmer === "object" && farmer.name) {
    return farmer.name;
  }
  return "Unknown";
}

function toAdvancedAnalyticsBag(bag: AdvancedAnalyticsPassBag): AdvancedAnalyticsBag {
  return {
    name: bag.name,
    initialQuantity: bag.initialQuantity,
    currentQuantity: bag.currentQuantity,
    location: {
      chamber: normalizeChamber(bag.location?.chamber),
      floor: normalizeFloor(bag.location?.floor),
      row: bag.location?.row ?? "",
    },
  };
}

function sumBags(
  entries: ChamberEntry[],
  getQty: (bag: AdvancedAnalyticsPassBag) => number,
): number {
  let total = 0;
  for (const entry of entries) {
    for (const bag of entry.bagSizesInChamber) {
      total += getQty(bag);
    }
  }
  return total;
}

function groupBagsByChamber(
  bagSizes: AdvancedAnalyticsPassBag[],
): Map<string, AdvancedAnalyticsPassBag[]> {
  const byChamber = new Map<string, AdvancedAnalyticsPassBag[]>();
  for (const bag of bagSizes) {
    const chamber = normalizeChamber(bag.location?.chamber);
    const list = byChamber.get(chamber) ?? [];
    list.push(bag);
    byChamber.set(chamber, list);
  }
  return byChamber;
}

function buildAdvancedAnalytics(
  passes: AdvancedAnalyticsPass[],
): AdvancedAnalyticsData {
  const chamberMap = new Map<
    string,
    {
      entries: ChamberEntry[];
      floorTotals: Map<string, { initial: number; current: number }>;
    }
  >();

  for (const pass of passes) {
    const byChamber = groupBagsByChamber(pass.bagSizes ?? []);
    for (const [chamber, bags] of byChamber) {
      if (bags.length === 0) continue;

      if (!chamberMap.has(chamber)) {
        chamberMap.set(chamber, { entries: [], floorTotals: new Map() });
      }
      const bucket = chamberMap.get(chamber)!;
      bucket.entries.push({ pass, bagSizesInChamber: bags });

      for (const bag of bags) {
        const floor = normalizeFloor(bag.location?.floor);
        const prev = bucket.floorTotals.get(floor) ?? { initial: 0, current: 0 };
        prev.initial += bag.initialQuantity;
        prev.current += bag.currentQuantity;
        bucket.floorTotals.set(floor, prev);
      }
    }
  }

  const chambers: AdvancedAnalyticsChamber[] = [...chamberMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([chamber, { entries, floorTotals }]) => ({
      chamber,
      orderCount: entries.length,
      initialTotal: sumBags(entries, (b) => b.initialQuantity),
      currentTotal: sumBags(entries, (b) => b.currentQuantity),
      floors: [...floorTotals.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([floor, t]) => ({
          floor,
          initialTotal: t.initial,
          currentTotal: t.current,
        })),
      orders: entries.map((entry) => ({
        _id: passId(entry.pass),
        gatePassNo: entry.pass.gatePassNo,
        date: passDateIso(entry.pass),
        variety: entry.pass.variety,
        farmerId: farmerIdFromPass(entry.pass),
        farmerName: farmerNameFromPass(entry.pass),
        bagSizes: entry.bagSizesInChamber.map(toAdvancedAnalyticsBag),
      })),
    }));

  const farmerMap = new Map<string, AdvancedAnalyticsPass[]>();
  for (const pass of passes) {
    const id = farmerIdFromPass(pass);
    const list = farmerMap.get(id) ?? [];
    list.push(pass);
    farmerMap.set(id, list);
  }

  const byFarmer: AdvancedAnalyticsFarmer[] = [...farmerMap.entries()]
    .sort(([, a], [, b]) =>
      farmerNameFromPass(a[0]!).localeCompare(farmerNameFromPass(b[0]!)),
    )
    .map(([farmerId, farmerPasses]) => ({
      farmerId,
      farmerName: farmerNameFromPass(farmerPasses[0]!),
      accountNumber: farmerPasses[0]?.farmerStorageLinkId?.accountNumber ?? null,
      orderCount: farmerPasses.length,
      orders: farmerPasses.map((pass) => ({
        _id: passId(pass),
        gatePassNo: pass.gatePassNo,
        date: passDateIso(pass),
        variety: pass.variety,
        farmerId,
        farmerName: farmerNameFromPass(pass),
        bagSizes: (pass.bagSizes ?? []).map(toAdvancedAnalyticsBag),
      })),
    }));

  return { byLocation: { chambers }, byFarmer };
}

/**
 * Get advanced analytics for a cold storage: location drill-down (chambers → floors → orders)
 * and farmer grouping. Aggregates incoming gate passes server-side.
 */
export async function getAdvancedAnalytics(
  coldStorageId: string,
  logger?: FastifyBaseLogger,
): Promise<AdvancedAnalyticsData> {
  const rawPasses = await getIncomingGatePassesForStorage(coldStorageId, logger);
  const passes = rawPasses as unknown as AdvancedAnalyticsPass[];
  return buildAdvancedAnalytics(passes);
}
