/**
 * Sync MongoDB indexes to match the current Mongoose schemas.
 *
 * 1. Loads all models so their schema indexes are registered.
 * 2. Creates any missing indexes (syncIndexes).
 * 3. Drops known obsolete indexes that were removed from the schemas.
 *
 * Run: pnpm run sync-indexes (or tsx scripts/sync-indexes.ts)
 * Requires: MONGO_URI in env (e.g. from .env)
 */

import { config } from "dotenv";
config();

import mongoose from "mongoose";

// Load all models so schemas (and their indexes) are registered
import { ColdStorage } from "../src/modules/v1/cold-storage/cold-storage.model.js";
import { EditHistory } from "../src/modules/v1/edit-history/edit-history.model.js";
import { Farmer } from "../src/modules/v1/farmer/farmer-model.js";
import { FarmerStorageLink } from "../src/modules/v1/farmer-storage-link/farmer-storage-link-model.js";
import { IncomingGatePass } from "../src/modules/v1/incoming-gate-pass/incoming-gate-pass.model.js";
import Ledger from "../src/modules/v1/ledger/ledger.model.js";
import { OutgoingGatePass } from "../src/modules/v1/outgoing-gate-pass/outgoing-gate-pass.model.js";
import { Preferences } from "../src/modules/v1/preferences/preferences.model.js";
import { StoreAdmin } from "../src/modules/v1/store-admin/store-admin.model.js";
import Voucher from "../src/modules/v1/voucher/voucher.model.js";

const MODELS = [
  ColdStorage,
  EditHistory,
  Farmer,
  FarmerStorageLink,
  IncomingGatePass,
  Ledger,
  OutgoingGatePass,
  Preferences,
  StoreAdmin,
  Voucher,
] as const;

/** Index names to drop per collection (obsolete indexes removed from schemas). Do not drop _id_. */
const OBSOLETE_INDEXES: Record<string, string[]> = {
  outgoinggatepasses: [
    "date_-1",
    "farmerStorageLinkId_1_date_-1",
  ],
  farmerstoragelinks: [
    "farmerId_1",
    "createdAt_1",
  ],
  coldstorages: [
    "createdAt_1",
    "preferencesId_1",
  ],
  edithistories: [
    "entityType_1",
    "documentId_1",
    "coldStorageId_1",
    "editedBy_1",
    "editedAt_1",
    "action_1",
  ],
  farmers: [
    "name_1",
  ],
  ledgers: [
    "type_1",
    "coldStorageId_1",
    "farmerStorageLinkId_1",
    "createdBy_1",
  ],
  vouchers: [
    "farmerStorageLinkId_1_date_-1",
    "date_1",
    "debitLedger_1",
    "creditLedger_1",
    "coldStorageId_1",
    "farmerStorageLinkId_1",
    "createdBy_1",
    "updatedBy_1",
  ],
};

async function dropObsoleteIndexes(conn: mongoose.Connection): Promise<void> {
  for (const [collectionName, indexNames] of Object.entries(OBSOLETE_INDEXES)) {
    const coll = conn.collection(collectionName);
    try {
      const existing = await coll.indexes();
      const names = existing.map((idx) => idx.name).filter((n) => n !== "_id_");
      for (const name of indexNames) {
        if (names.includes(name)) {
          await coll.dropIndex(name);
          console.log(`  Dropped index: ${collectionName}.${name}`);
        }
      }
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err ? (err as { code: number }).code : undefined;
      if (code === 26) {
        // NamespaceNotFound – collection doesn't exist yet; skip silently
        return;
      }
      console.warn(`  Warning listing/dropping indexes on ${collectionName}:`, err);
    }
  }
}

async function main(): Promise<void> {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set. Set it in .env or the environment.");
    process.exit(1);
  }

  console.log("Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGO_URI);
  const conn = mongoose.connection;

  try {
    console.log("Dropping obsolete indexes (if any)...");
    await dropObsoleteIndexes(conn);

    console.log("Syncing indexes from schemas...");
    for (const model of MODELS) {
      const name = model.collection.name;
      try {
        await model.syncIndexes();
        console.log(`  Synced: ${name}`);
      } catch (err) {
        console.warn(`  Failed to sync ${name}:`, err);
      }
    }

    console.log("Done.");
  } finally {
    await conn.close();
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
