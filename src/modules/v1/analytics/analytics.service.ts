import mongoose from "mongoose";
import type { FastifyBaseLogger } from "fastify";
import { FarmerStorageLink } from "../farmer-storage-link/farmer-storage-link-model.js";
import { IncomingGatePass } from "../incoming-gate-pass/incoming-gate-pass.model.js";
import { ValidationError } from "../../../utils/errors.js";

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

  // Restrict to links for this cold storage only (current logged-in store admin's cold storage)
  const farmerStorageLinkIds = await FarmerStorageLink.find(
    { coldStorageId: coldStorageObjectId },
    { _id: 1 },
  )
    .lean()
    .then((links) => links.map((l) => l._id));

  if (farmerStorageLinkIds.length === 0) {
    logger?.info({ coldStorageId }, "Stock summary: no farmer-storage links");
    return {
      stockSummary: [],
      chartData: {
        flatSeries: [],
        varieties: [],
        sizes: [],
      },
      totalInventory: { initial: 0, current: 0 },
      topVariety: null,
      topSize: null,
    };
  }

  // Aggregation: only IncomingGatePass docs whose farmerStorageLinkId belongs to this cold storage
  const pipeline: mongoose.PipelineStage[] = [
    {
      $match: {
        farmerStorageLinkId: { $in: farmerStorageLinkIds },
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
  ];

  const aggregated = await IncomingGatePass.aggregate<
    { variety: string; sizes: Array<{ size: string; initialQuantity: number; currentQuantity: number; quantityRemoved: number }> }
  >(pipeline);

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

  const chartData: StockSummaryChartData = {
    flatSeries,
    varieties: Array.from(varietySet).sort(),
    sizes: Array.from(sizeSet).sort(),
  };

  // Total inventory (initial and current) across all varieties and sizes
  let totalInitial = 0;
  let totalCurrent = 0;
  const currentByVariety = new Map<string, number>();
  const currentBySize = new Map<string, number>();

  for (const row of aggregated) {
    let varietyCurrent = 0;
    for (const s of row.sizes) {
      totalInitial += s.initialQuantity;
      totalCurrent += s.currentQuantity;
      varietyCurrent += s.currentQuantity;
      currentBySize.set(
        s.size,
        (currentBySize.get(s.size) ?? 0) + s.currentQuantity,
      );
    }
    currentByVariety.set(row.variety, varietyCurrent);
  }

  const totalInventory: TotalInventory = { initial: totalInitial, current: totalCurrent };

  // Top variety by current quantity (first if tie)
  let topVariety: TopVariety | null = null;
  if (currentByVariety.size > 0) {
    const [variety, currentQuantity] = [...currentByVariety.entries()].reduce(
      (best, curr) => (curr[1] > best[1] ? curr : best),
      ["", 0] as [string, number],
    );
    topVariety = { variety, currentQuantity };
  }

  // Top bag size by current quantity (first if tie)
  let topSize: TopSize | null = null;
  if (currentBySize.size > 0) {
    const [size, currentQuantity] = [...currentBySize.entries()].reduce(
      (best, curr) => (curr[1] > best[1] ? curr : best),
      ["", 0] as [string, number],
    );
    topSize = { size, currentQuantity };
  }

  return {
    stockSummary,
    chartData,
    totalInventory,
    topVariety,
    topSize,
  };
}
