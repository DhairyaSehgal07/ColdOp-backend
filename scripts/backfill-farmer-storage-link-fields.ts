/**
 * Backfill store-specific name, address, and mobileNumber on FarmerStorageLink
 * from the linked Farmer document.
 *
 * Deploy application code first (optional fields + read fallbacks), then run:
 *   pnpm run backfill-farmer-storage-link-fields
 *
 * Dry run (no writes):
 *   DRY_RUN=1 pnpm run backfill-farmer-storage-link-fields
 *
 * Requires: MONGO_URI in env (e.g. from .env)
 */

import { config } from "dotenv";
config();

import mongoose from "mongoose";
import { Farmer } from "../src/modules/v1/farmer/farmer-model.js";
import { FarmerStorageLink } from "../src/modules/v1/farmer-storage-link/farmer-storage-link-model.js";

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

async function main(): Promise<void> {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set. Set it in .env or the environment.");
    process.exit(1);
  }

  console.log(
    DRY_RUN
      ? "DRY RUN — no documents will be updated"
      : "LIVE RUN — documents will be updated",
  );

  await mongoose.connect(process.env.MONGO_URI);

  try {
    const links = await FarmerStorageLink.find({
      $or: [
        { name: { $exists: false } },
        { name: null },
        { name: "" },
        { address: { $exists: false } },
        { address: null },
        { address: "" },
        { mobileNumber: { $exists: false } },
        { mobileNumber: null },
        { mobileNumber: "" },
      ],
    })
      .select("_id farmerId name address mobileNumber")
      .lean();

    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const link of links) {
      processed++;
      try {
        const farmer = await Farmer.findById(link.farmerId)
          .select("name address mobileNumber")
          .lean();

        if (!farmer) {
          console.warn(
            `  Skip link ${link._id.toString()}: farmer ${link.farmerId.toString()} not found`,
          );
          skipped++;
          continue;
        }

        const update = {
          name: link.name || farmer.name,
          address: link.address || farmer.address,
          mobileNumber: link.mobileNumber || farmer.mobileNumber,
        };

        if (DRY_RUN) {
          console.log(
            `  Would update link ${link._id.toString()}: ${JSON.stringify(update)}`,
          );
        } else {
          await FarmerStorageLink.updateOne({ _id: link._id }, { $set: update });
        }
        updated++;
      } catch (err) {
        errors++;
        console.error(`  Error on link ${link._id.toString()}:`, err);
      }
    }

    console.log("\nSummary:");
    console.log(`  Processed: ${processed}`);
    console.log(`  ${DRY_RUN ? "Would update" : "Updated"}: ${updated}`);
    console.log(`  Skipped (missing farmer): ${skipped}`);
    console.log(`  Errors: ${errors}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
