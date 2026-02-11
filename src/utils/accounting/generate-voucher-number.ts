import { Types } from "mongoose";
import Voucher from "../../modules/v1/voucher/voucher.model";

/**
 * Get the next Journal voucher number for the given cold storage scope (storage-level or farmer-level).
 * Call with the current logged-in user's cold storage ID (e.g. from request.user.coldStorageId).
 * Uses a single aggregation to find max voucherNumber per (coldStorageId, farmerStorageLinkId).
 *
 * @param coldStorageId - **Required.** Cold storage ID (use the logged-in user's cold storage).
 * @param farmerStorageLinkId - Farmer-storage link ID, or null/omit for storage-level vouchers
 * @returns Next voucher number (1 if no vouchers exist)
 */
export async function getNextJournalVoucherNumber(
  coldStorageId: string | Types.ObjectId,
  farmerStorageLinkId?: string | Types.ObjectId | null,
): Promise<number> {
  if (coldStorageId == null || coldStorageId === "") {
    throw new Error("coldStorageId is required to generate voucher number");
  }
  const coldId =
    typeof coldStorageId === "string"
      ? new Types.ObjectId(coldStorageId)
      : coldStorageId;
  const linkId =
    farmerStorageLinkId == null
      ? null
      : typeof farmerStorageLinkId === "string"
        ? new Types.ObjectId(farmerStorageLinkId)
        : farmerStorageLinkId;

  const match: {
    coldStorageId: Types.ObjectId;
    farmerStorageLinkId: Types.ObjectId | null;
  } = {
    coldStorageId: coldId,
    farmerStorageLinkId: linkId ?? null,
  };

  const result = await Voucher.aggregate<{ maxNo: number | null }>([
    { $match: match },
    { $group: { _id: null, maxNo: { $max: "$voucherNumber" } } },
    { $project: { maxNo: 1, _id: 0 } },
  ]).exec();

  const maxNo = result[0]?.maxNo ?? 0;
  return maxNo + 1;
}
