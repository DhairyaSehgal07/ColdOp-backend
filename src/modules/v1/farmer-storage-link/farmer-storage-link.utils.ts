import { Farmer } from "../farmer/farmer-model.js";
import { StoreAdmin } from "../store-admin/store-admin.model.js";

/** Minimal farmer fields used for display fallback. */
export type FarmerDisplaySource = {
  name?: string;
  address?: string;
  mobileNumber?: string;
};

/** Minimal link fields that may hold store-specific farmer display data. */
export type LinkFarmerDisplaySource = FarmerDisplaySource;

export type ResolvedLinkFarmerFields = {
  name: string;
  address: string;
  mobileNumber: string;
};

/** Populated farmer-storage-link shape used in gate-pass and transfer-stock responses. */
export type PopulatedFarmerStorageLink = {
  accountNumber: number;
  name?: string;
  address?: string;
  mobileNumber?: string;
  farmerId?: FarmerDisplaySource | null;
};

export const FARMER_STORAGE_LINK_POPULATE_SELECT =
  "accountNumber name address mobileNumber farmerId";

export const FARMER_STORAGE_LINK_FARMER_POPULATE_SELECT =
  "name address mobileNumber";

/** Mongoose select strings shared with daybook gate-pass list responses. */
export const GATE_PASS_LIST_INCOMING_SELECT =
  "_id farmerStorageLinkId createdBy gatePassNo date type variety truckNumber bagSizes status remarks manualParchiNumber stockFilter customMarka createdAt";

export const GATE_PASS_LIST_OUTGOING_SELECT =
  "_id farmerStorageLinkId createdBy gatePassNo date type from to truckNumber orderDetails remarks manualParchiNumber stockFilter incomingGatePassSnapshots isNull createdAt";

/** Populate config shared with daybook gate-pass list responses. */
export const GATE_PASS_LIST_POPULATE_LINK = [
  {
    path: "farmerStorageLinkId",
    select: FARMER_STORAGE_LINK_POPULATE_SELECT,
    populate: {
      path: "farmerId",
      model: Farmer,
      select: FARMER_STORAGE_LINK_FARMER_POPULATE_SELECT,
    },
  },
  {
    path: "createdBy",
    model: StoreAdmin,
    select: "name",
  },
];

/**
 * Resolve store-specific name, address, and mobileNumber from a farmer-storage link,
 * falling back to the global Farmer document when link fields are missing (pre-migration).
 */
export function resolveLinkFarmerFields(
  link: LinkFarmerDisplaySource,
  farmer?: FarmerDisplaySource | null,
): ResolvedLinkFarmerFields {
  return {
    name: link.name ?? farmer?.name ?? "",
    address: link.address ?? farmer?.address ?? "",
    mobileNumber: link.mobileNumber ?? farmer?.mobileNumber ?? "",
  };
}

/**
 * Format a populated farmer-storage-link for API responses (gate passes, transfer stock).
 */
export function formatPopulatedFarmerStorageLinkDisplay(
  populatedLink: PopulatedFarmerStorageLink | null | undefined,
): {
  name: string;
  accountNumber: number;
  address: string;
  mobileNumber: string;
} | null {
  if (!populatedLink) return null;
  const fields = resolveLinkFarmerFields(
    populatedLink,
    populatedLink.farmerId ?? undefined,
  );
  return {
    name: fields.name,
    accountNumber: populatedLink.accountNumber,
    address: fields.address,
    mobileNumber: fields.mobileNumber,
  };
}

export interface GatePassListPaginationMeta {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextPage: number | null;
  previousPage: number | null;
}

export interface GatePassListSummaries {
  totalIncomingBags: number;
  totalOutgoingBags: number;
  totalInternallyTransferredIncomingBags: number;
  totalInternallyTransferredOutgoingBags: number;
}

export interface GatePassListPaginationResult {
  status: "Success" | "Fail";
  message?: string;
  data?: Record<string, unknown>[];
  pagination: GatePassListPaginationMeta;
}

export interface GatePassListResult extends GatePassListPaginationResult {
  summaries: GatePassListSummaries;
}

const INCOMING_TRANSFER_TYPE = "Incoming-transfer";
const OUTGOING_TRANSFER_TYPE = "Outgoing-transfer";

function sumIncomingBagSizes(
  bagSizes: { initialQuantity?: number }[] | undefined,
): number {
  return (bagSizes ?? []).reduce(
    (sum, bag) => sum + (bag.initialQuantity ?? 0),
    0,
  );
}

function sumOutgoingQuantityIssued(
  orderDetails: { quantityIssued?: number }[] | undefined,
): number {
  return (orderDetails ?? []).reduce(
    (sum, detail) => sum + (detail.quantityIssued ?? 0),
    0,
  );
}

export function computeGatePassListSummaries(
  incomingList: Array<{
    type?: string;
    bagSizes?: { initialQuantity?: number }[];
  }>,
  outgoingList: Array<{
    type?: string;
    isNull?: boolean;
    orderDetails?: { quantityIssued?: number }[];
  }>,
): GatePassListSummaries {
  let totalIncomingBags = 0;
  let totalInternallyTransferredIncomingBags = 0;
  for (const pass of incomingList) {
    const bags = sumIncomingBagSizes(pass.bagSizes);
    totalIncomingBags += bags;
    if (pass.type === INCOMING_TRANSFER_TYPE) {
      totalInternallyTransferredIncomingBags += bags;
    }
  }

  let totalOutgoingBags = 0;
  let totalInternallyTransferredOutgoingBags = 0;
  for (const pass of outgoingList) {
    if (pass.isNull) continue;
    const bags = sumOutgoingQuantityIssued(pass.orderDetails);
    totalOutgoingBags += bags;
    if (pass.type === OUTGOING_TRANSFER_TYPE) {
      totalInternallyTransferredOutgoingBags += bags;
    }
  }

  return {
    totalIncomingBags,
    totalOutgoingBags,
    totalInternallyTransferredIncomingBags,
    totalInternallyTransferredOutgoingBags,
  };
}

export const EMPTY_GATE_PASS_LIST_SUMMARIES: GatePassListSummaries = {
  totalIncomingBags: 0,
  totalOutgoingBags: 0,
  totalInternallyTransferredIncomingBags: 0,
  totalInternallyTransferredOutgoingBags: 0,
};

export function createGatePassListPaginationMeta(
  total: number,
  page: number,
  limit: number,
): GatePassListPaginationMeta {
  const totalPages = Math.ceil(total / limit);
  return {
    currentPage: page,
    totalPages,
    totalItems: total,
    itemsPerPage: limit,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    nextPage: page < totalPages ? page + 1 : null,
    previousPage: page > 1 ? page - 1 : null,
  };
}

/** Sort bagSizes by name on incoming docs; sort orderDetails by size on outgoing docs. */
export function sortGatePassOrderDetails(
  orders: Array<
    | { bagSizes?: { name: string }[]; orderDetails?: { size: string }[] }
    | {
        toObject: () => Record<string, unknown>;
        bagSizes?: unknown;
        orderDetails?: unknown;
      }
  >,
): Record<string, unknown>[] {
  return orders.map((order) => {
    const hasToObject =
      typeof (order as { toObject?: () => Record<string, unknown> })
        .toObject === "function";
    const obj = hasToObject
      ? (order as { toObject: () => Record<string, unknown> }).toObject()
      : { ...(order as Record<string, unknown>) };
    if (Array.isArray(obj.bagSizes)) {
      (obj as { bagSizes: { name: string }[] }).bagSizes = [
        ...(obj.bagSizes as { name: string }[]),
      ].sort((a, b) => a.name.localeCompare(b.name));
    }
    if (Array.isArray(obj.orderDetails)) {
      (obj as { orderDetails: { variety?: string; size: string }[] }).orderDetails = [
        ...(obj.orderDetails as { variety?: string; size: string }[]),
      ].sort((a, b) => {
        const varietyCmp = (a.variety ?? "").localeCompare(b.variety ?? "");
        return varietyCmp !== 0 ? varietyCmp : a.size.localeCompare(b.size);
      });
    }
    return obj as Record<string, unknown>;
  });
}

export function mapGatePassListLinkDisplay<T extends Record<string, unknown>>(
  order: T,
): T {
  const populatedLink = order.farmerStorageLinkId as
    | PopulatedFarmerStorageLink
    | null
    | undefined;
  const linkDisplay = formatPopulatedFarmerStorageLinkDisplay(populatedLink);
  const withLink = {
    ...order,
    farmerStorageLinkId: linkDisplay ?? order.farmerStorageLinkId,
  };
  if (Array.isArray(order.orderDetails)) {
    return {
      ...withLink,
      isNull: (order.isNull as boolean | undefined) ?? false,
    };
  }
  return withLink;
}
