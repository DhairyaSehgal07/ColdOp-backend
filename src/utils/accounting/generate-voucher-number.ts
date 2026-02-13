import mongoose, { Types } from "mongoose";
import Voucher from "../../modules/v1/voucher/voucher.model.js";

type ClientSession = mongoose.mongo.ClientSession;

/**
 * Get the next Journal voucher number for the given cold storage scope (storage-level or farmer-level).
 * Call with the current logged-in user's cold storage ID (e.g. from request.user.coldStorageId).
 * Uses a single aggregation to find max voucherNumber per (coldStorageId, farmerStorageLinkId).
 * Pass session when calling from within a transaction so the read participates in the transaction.
 *
 * @param coldStorageId - **Required.** Cold storage ID (use the logged-in user's cold storage).
 * @param farmerStorageLinkId - Farmer-storage link ID, or null/omit for storage-level vouchers
 * @param session - Optional MongoDB session; use when generating number inside a transaction
 * @returns Next voucher number (1 if no vouchers exist)
 */
export async function getNextJournalVoucherNumber(
  coldStorageId: string | Types.ObjectId,
  farmerStorageLinkId?: string | Types.ObjectId | null,
  session?: ClientSession,
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

  let agg = Voucher.aggregate<{ maxNo: number | null }>([
    { $match: match },
    { $group: { _id: null, maxNo: { $max: "$voucherNumber" } } },
    { $project: { maxNo: 1, _id: 0 } },
  ]);
  if (session) {
    agg = agg.session(session);
  }
  const result = await agg.exec();

  const maxNo = result[0]?.maxNo ?? 0;
  return maxNo + 1;
}
