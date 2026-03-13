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
export {};
//# sourceMappingURL=sync-indexes.d.ts.map