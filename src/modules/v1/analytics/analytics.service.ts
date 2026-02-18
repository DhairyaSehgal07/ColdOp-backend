import mongoose from "mongoose";
import type { FastifyBaseLogger } from "fastify";
import { Farmer } from "../farmer/farmer-model.js";
import { FarmerStorageLink } from "../farmer-storage-link/farmer-storage-link-model.js";
import { IncomingGatePass } from "../incoming-gate-pass/incoming-gate-pass.model.js";
import { OutgoingGatePass } from "../outgoing-gate-pass/outgoing-gate-pass.model.js";
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

/** Sort bagSizes by name on incoming docs; sort orderDetails by size on outgoing docs (report/daybook style). */
function sortOrderDetailsForReport(
  orders: Array<
    | { bagSizes?: { name: string }[]; orderDetails?: { size: string }[] }
    | { toObject: () => Record<string, unknown>; bagSizes?: unknown; orderDetails?: unknown }
  >,
): Record<string, unknown>[] {
  return orders.map((order) => {
    const hasToObject =
      typeof (order as { toObject?: () => Record<string, unknown> }).toObject === "function";
    const obj = hasToObject
      ? (order as { toObject: () => Record<string, unknown> }).toObject()
      : { ...(order as Record<string, unknown>) };
    if (Array.isArray(obj.bagSizes)) {
      (obj as { bagSizes: { name: string }[] }).bagSizes = [
        ...(obj.bagSizes as { name: string }[]),
      ].sort((a, b) => a.name.localeCompare(b.name));
    }
    if (Array.isArray(obj.orderDetails)) {
      (obj as { orderDetails: { size: string }[] }).orderDetails = [
        ...(obj.orderDetails as { size: string }[]),
      ].sort((a, b) => a.size.localeCompare(b.size));
    }
    return obj as Record<string, unknown>;
  });
}

/** Report response when groupByFarmers is false: flat incoming/outgoing arrays (daybook-style for react-pdf). */
export interface ReportsDataFlat {
  from: string;
  to: string;
  incoming: Record<string, unknown>[];
  outgoing: Record<string, unknown>[];
}

/** Farmer info for grouped report (minimal for PDF display). */
export interface ReportFarmerInfo {
  name: string;
  mobileNumber?: string;
  address?: string;
  accountNumber?: number;
}

/** One farmer's block when groupByFarmers is true. */
export interface ReportFarmerBlock {
  farmer: ReportFarmerInfo;
  incoming: Record<string, unknown>[];
  outgoing: Record<string, unknown>[];
}

/** Report response when groupByFarmers is true: grouped by farmer for react-pdf. */
export interface ReportsDataGroupedByFarmer {
  from: string;
  to: string;
  groupedByFarmer: true;
  farmers: ReportFarmerBlock[];
}

export type GetReportsResult = ReportsDataFlat | ReportsDataGroupedByFarmer;

/**
 * Get reports: all incoming and outgoing orders for the storage in a date range.
 * Response is daybook-style (same document shape as daybook) for use in react-pdf.
 * Optional groupByFarmers: when true, groups documents by farmer (incoming/outgoing per farmer).
 */
export async function getReports(
  coldStorageId: string,
  options: { from: string; to: string; groupByFarmers?: boolean },
  logger?: FastifyBaseLogger,
): Promise<GetReportsResult> {
  if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
    throw new ValidationError(
      "Invalid cold storage ID format",
      "INVALID_COLD_STORAGE_ID",
    );
  }

  const { from, to, groupByFarmers = false } = options;
  const fromRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!from?.trim() || !fromRegex.test(from)) {
    throw new ValidationError("from must be YYYY-MM-DD", "INVALID_FROM_DATE");
  }
  if (!to?.trim() || !fromRegex.test(to)) {
    throw new ValidationError("to must be YYYY-MM-DD", "INVALID_TO_DATE");
  }

  const fromDate = new Date(from);
  const toEnd = new Date(to);
  toEnd.setHours(23, 59, 59, 999);
  const dateFilter = { date: { $gte: fromDate, $lte: toEnd } };

  const coldStorageObjectId = new mongoose.Types.ObjectId(coldStorageId);
  const farmerStorageLinkIds = await FarmerStorageLink.find(
    { coldStorageId: coldStorageObjectId },
    { _id: 1, farmerId: 1, accountNumber: 1 },
  )
    .lean()
    .then((links) => links.map((l) => l._id));

  if (farmerStorageLinkIds.length === 0) {
    logger?.info({ coldStorageId, from, to }, "Reports: no farmer-storage links");
    return groupByFarmers
      ? { from, to, groupedByFarmer: true, farmers: [] }
      : { from, to, incoming: [], outgoing: [] };
  }

  const incomingSelect =
    "_id farmerStorageLinkId createdBy gatePassNo date type variety truckNumber bagSizes status remarks manualParchiNumber createdAt";
  const outgoingSelect =
    "_id farmerStorageLinkId createdBy gatePassNo date type variety from to truckNumber orderDetails remarks manualParchiNumber incomingGatePassSnapshots createdAt";

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

  const [incomingList, outgoingList] = await Promise.all([
    IncomingGatePass.find({
      farmerStorageLinkId: { $in: farmerStorageLinkIds },
      ...dateFilter,
    })
      .sort({ createdAt: 1 })
      .select(incomingSelect)
      .populate(populateLink)
      .lean(),
    OutgoingGatePass.find({
      farmerStorageLinkId: { $in: farmerStorageLinkIds },
      ...dateFilter,
    })
      .sort({ createdAt: 1 })
      .select(outgoingSelect)
      .populate(populateLink)
      .lean(),
  ]);

  const incomingSorted = sortOrderDetailsForReport(
    incomingList as { bagSizes?: { name: string }[] }[],
  );
  const outgoingSorted = sortOrderDetailsForReport(
    outgoingList as { orderDetails?: { size: string }[] }[],
  );

  if (!groupByFarmers) {
    logger?.info(
      { coldStorageId, from, to, incomingCount: incomingSorted.length, outgoingCount: outgoingSorted.length },
      "Reports (flat) retrieved",
    );
    return { from, to, incoming: incomingSorted, outgoing: outgoingSorted };
  }

  type PopulatedLink = {
    _id: mongoose.Types.ObjectId;
    farmerId: { name: string; mobileNumber?: string; address?: string };
    accountNumber: number;
  };

  const farmerBlocks = new Map<
    string,
    { farmer: ReportFarmerInfo; incoming: Record<string, unknown>[]; outgoing: Record<string, unknown>[] }
  >();

  function getLinkKey(doc: Record<string, unknown>): string | null {
    const link = doc.farmerStorageLinkId as PopulatedLink | undefined;
    if (!link?._id) return null;
    return link._id.toString();
  }

  function farmerFromDoc(doc: Record<string, unknown>): ReportFarmerInfo {
    const link = doc.farmerStorageLinkId as PopulatedLink | undefined;
    const f = link?.farmerId;
    return {
      name: f?.name ?? "—",
      mobileNumber: f?.mobileNumber,
      address: f?.address,
      accountNumber: (link as { accountNumber?: number })?.accountNumber,
    };
  }

  for (const doc of incomingSorted) {
    const key = getLinkKey(doc);
    if (!key) continue;
    if (!farmerBlocks.has(key)) {
      farmerBlocks.set(key, { farmer: farmerFromDoc(doc), incoming: [], outgoing: [] });
    }
    farmerBlocks.get(key)!.incoming.push(doc);
  }
  for (const doc of outgoingSorted) {
    const key = getLinkKey(doc);
    if (!key) continue;
    if (!farmerBlocks.has(key)) {
      farmerBlocks.set(key, { farmer: farmerFromDoc(doc), incoming: [], outgoing: [] });
    }
    farmerBlocks.get(key)!.outgoing.push(doc);
  }

  const farmers = Array.from(farmerBlocks.values());

  logger?.info(
    { coldStorageId, from, to, farmerCount: farmers.length },
    "Reports (grouped by farmer) retrieved",
  );

  return { from, to, groupedByFarmer: true, farmers };
}
