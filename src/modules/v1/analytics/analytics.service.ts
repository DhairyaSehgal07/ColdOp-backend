import mongoose from "mongoose";
import type { FastifyBaseLogger } from "fastify";
import { Farmer } from "../farmer/farmer-model.js";
import { FarmerStorageLink } from "../farmer-storage-link/farmer-storage-link-model.js";
import { IncomingGatePass } from "../incoming-gate-pass/incoming-gate-pass.model.js";
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

export interface StockSummaryResult {
  stockSummary: StockSummaryVariety[];
  chartData: StockSummaryChartData;
  totalInventory: TotalInventory;
  topVariety: TopVariety | null;
  topSize: TopSize | null;
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
 */
export async function getStockSummary(
  coldStorageId: string,
  logger?: FastifyBaseLogger,
): Promise<StockSummaryResult> {
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
            { $arrayElemAt: ["$_farmer.name", 0] },
            {
              $concat: ["Account #", { $toString: "$_linkDoc.accountNumber" }],
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
 */
export async function getVarietyBreakdown(
  coldStorageId: string,
  varietyName: string,
  _logger?: FastifyBaseLogger,
): Promise<VarietyBreakdownResult> {
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

  const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);

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
            { $arrayElemAt: ["$_farmer.name", 0] },
            {
              $concat: ["Account #", { $toString: "$_linkDoc.accountNumber" }],
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
