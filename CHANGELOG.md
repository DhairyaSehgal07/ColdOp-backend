# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.0] - 2026-02-13

### Added

- **Ledger – Balance sheet**
  - `GET /api/v1/ledger/balance-sheet` — balance sheet (Indian standard: Assets, Liabilities, Equity; P&L net profit/loss to equity). Optional query `from`/`to` for period balances (JWT required).

### Changed

- **Ledger**
  - Create-ledger validation: response now includes first validation error message and flattened Zod details.
  - Create-ledger body: `farmerStorageLinkId` handling moved into schema (no manual parsing in controller).
- **Edit history**
  - List edit-history response and route schema now include `snapshotBefore` and `snapshotAfter` for each item.
- **Incoming gate pass**
  - Rent amount update: reverses and reapplies voucher balances via `reverseVoucherBalances`/`applyVoucherBalances` so ledger balances stay correct when rent is edited.
  - Rent voucher creation no longer passes voucher number; number is generated inside voucher flow.
- **Voucher**
  - `createVoucher` accepts optional Mongoose `session`; passes session to `getNextJournalVoucherNumber` and `applyVoucherBalances` for transactional consistency.
- **Accounting utils**
  - `getNextJournalVoucherNumber` accepts optional `session` for use inside transactions.
  - `applyVoucherBalances` and `reverseVoucherBalances` accept optional `session`.
  - Helper and validate-chart-of-accounts updates for session-aware balance and voucher handling.

## [1.6.0] - 2026-02-12

### Added

- **Store Admin – Daybook**
  - `GET /api/v1/store-admin/daybook` — list incoming and/or outgoing gate passes with farmer populated, pagination, and sort (JWT required)
  - Query: `type` (all | incoming | outgoing), `sortBy` (latest | oldest), `page`, `limit` (default 10, max 100)
  - Response: `status`, `message`, `data` (array of gate passes with bagSizes/orderDetails sorted), `pagination`
  - Service `getDaybookOrders` with cold-storage scoping and optional merge by type
- **Store Admin – Search order by receipt**
  - `POST /api/v1/store-admin/search-order-by-receipt` — search incoming and outgoing gate passes by receipt number (gate pass number or manual receipt number), JWT required
  - Body: `{ receiptNumber: string }`; returns matching orders or "No orders found" message
- **Store Admin – Next voucher number**
  - `GET /api/v1/store-admin/voucher-number?type=incoming|outgoing` — get next voucher (gate pass) number for the cold storage (JWT required)
- **Docs**
  - `docs/curl-get-daybook.sh` — curl examples for daybook (type, sortBy, page, limit)
  - `docs/curl-search-order-by-receipt.sh` — curl example for search-order-by-receipt

### Changed

- **Outgoing Gate Pass**
  - Model: added `type` (GatePassType: RECEIPT, DELIVERY, RESTORE) to OutgoingGatePass and snapshot bag sizes
- **Incoming Gate Pass**
  - Create schema: `type` removed from request body (set server-side to RECEIPT)

## [1.5.0] - 2026-02-11

### Added

- **Incoming Gate Pass**
  - `GET /api/v1/incoming-gate-pass/farmer-storage-link/:farmerStorageLinkId` — list all incoming gate passes for a farmer-storage-link (JWT required, scoped to cold storage)
  - Service `getIncomingGatePassesByFarmerStorageLinkId` with validation, auth scope, and populated farmer/link/createdBy
  - Docs: `docs/curl-get-incoming-gate-passes-by-farmer-storage-link.sh` for testing the endpoint

## [1.4.0] - 2026-02-08

### Added

- **Outgoing Gate Pass Module**
  - Create outgoing gate pass from incoming gate pass allocations (nikasi-style flow)
  - Route: `POST /api/v1/outgoing-gate-pass` with JWT authentication
  - Request: `gatePassNo`, `date`, `variety`, `from`, `to`, `incomingGatePasses` (array of `{ incomingGatePassId, allocations: [{ size, quantityToAllocate }] }`)
  - Updates IncomingGatePass `currentQuantity` for allocated bags in a transaction
  - Gate pass number unique per cold storage; optional `manualGatePassNumber`, `truckNumber`, `remarks`, `idempotencyKey`
  - Response shape: `{ status, message, data }`; errors: `{ status, statusCode, errorCode, message }`
  - Snapshot uses paltai location as latest bag location when present on incoming gate pass

### Changed

- **Application**
  - Registered `outgoingGatePassRoutes` in `app.ts` with prefix `/api/v1/outgoing-gate-pass`

## [1.3.0] - 2026-02-07

### Added

- **Incoming Gate Pass Module**
  - Dedicated module at `src/modules/v1/incoming-gate-pass/` with controller, routes, schema, and service
  - Routes registered at `/api/v1/incoming-gate-pass` (create, read, update, delete incoming gate passes)
  - Full CRUD and validation for incoming gate pass with JWT authentication

### Changed

- **Application**
  - Registered `incomingGatePassRoutes` in `app.ts` with prefix `/api/v1/incoming-gate-pass`
- **Store Admin**
  - Incoming gate pass logic moved out of store-admin into the new incoming-gate-pass module
  - Store admin controller, routes, schema, and service simplified (removed incoming gate pass handlers and schemas)
- **Incoming Gate Pass Model**
  - Expanded schema and logic in `incoming-gate-pass.model.ts` to support full CRUD operations

### Removed

- **Gate Pass Models**
  - Removed `grading-gate-pass.model.ts`, `nikasi-gate-pass.model.ts`, and `storage-gate-pass.model.ts` (consolidation/cleanup)

## [1.2.0] - 2026-02-07

### Added

- **Store Admin Module**
  - Store admin CRUD, login/logout, and farmer-storage-link management
  - Routes: create/read/update/delete store admin, check mobile, login, logout, quick-register farmer, update farmer-storage-link
  - New routes: `GET /daybook` (paginated daybook for cold storage), `GET /farmer-storage-links/:farmerStorageLinkId/vouchers`, `GET /next-voucher-number` (by type)
  - Schemas and handlers for daybook, vouchers-by-link, and next voucher number

- **Auth & Authorization**
  - `src/utils/auth.ts`: JWT authentication (`authenticate`), optional auth, cold-storage scoping
  - `authorize(...roles)` middleware for role-based access (e.g. Admin-only delete store admin)
  - `JWTPayload` extended with optional `role` for authorization

- **Error Handling**
  - `src/utils/errors.ts`: `AppError`, `NotFoundError`, `ConflictError`, `ValidationError`, `UnauthorizedError`, `ForbiddenError`
  - Centralized `sendErrorReply(reply, error)` in store-admin controller for consistent JSON error responses

- **Models**
  - Role-permission model for Admin permissions
  - Gate-pass models: IncomingGatePass, GradingGatePass, StorageGatePass, NikasiGatePass, OutgoingGatePass (minimal schemas for daybook/voucher flows)
  - Farmer and FarmerStorageLink models referenced with correct filenames (`farmer-model`, `farmer-storage-link-model`)

### Changed

- **Store Admin**
  - Fixed import paths: utils from `../../../utils` (routes, controller, service)
  - Farmer/FarmerStorageLink imports use `farmer-model.js` and `farmer-storage-link-model.js`
  - Controller catch blocks refactored to use `sendErrorReply`; removed duplicate error branches
  - Daybook link IDs: use `FarmerStorageLink.distinct("_id", filter)` for a single DB call
  - Typed `distinct` result for farmer-storage link IDs in daybook service

- **Application**
  - Modular v1 structure under `src/modules/v1/` (cold-storage, store-admin, farmer, farmer-storage-link, preferences, role-permission, gate-pass modules)
  - Removed `src/config/constants.ts`; config lives in database and app setup

### Fixed

- Store admin routes and controller TypeScript/lint errors (unknown error types, missing modules)
- Unused handler and schema imports in store-admin routes by registering daybook, vouchers, and next-voucher-number routes

## [1.1.0] - 2026-02-02

### Added

- **Application Structure**
  - Created modular application structure with separate config, types, and utils directories
  - Added `app.ts` for application initialization
  - Added `server.ts` for server startup logic

- **Configuration Management**
  - Created `config/constants.ts` for application constants
  - Created `config/database.ts` for database configuration

- **Utilities**
  - Added `logger.ts` utility for consistent logging across the application

- **Type Definitions**
  - Added `types/colors.d.ts` for color type definitions

### Changed

- Initial project setup completed and committed

## [1.0.0] - 2026-01-25

### Added

- **TypeScript Configuration**
  - Added `tsconfig.json` with strict type checking enabled
  - Configured for ES2022 target with ESNext modules
  - Set up source maps and declaration files for better development experience

- **ESLint Setup**
  - Configured ESLint 9 with flat config format (`eslint.config.js`)
  - Integrated TypeScript ESLint plugin for TypeScript-specific linting
  - Added Prettier integration to ensure consistent code formatting
  - Configured rules for unused variables with underscore prefix exception

- **Prettier Configuration**
  - Added `.prettierrc` with consistent formatting rules
  - Configured single quotes, semicolons, and 80 character line width
  - Added `.prettierignore` to exclude build artifacts and dependencies

- **Husky Git Hooks**
  - Set up Husky v9 for Git hooks management
  - Configured pre-commit hook to run lint-staged
  - Added lint-staged configuration to format and lint staged files automatically

- **Package Scripts**
  - `dev`: Development mode with hot reload using tsx
  - `build`: Compile TypeScript to JavaScript
  - `start`: Run production build
  - `lint`: Check for linting errors
  - `lint:fix`: Auto-fix linting errors
  - `format`: Format code with Prettier
  - `format:check`: Check if code is formatted
  - `type-check`: Type check without building

- **Project Structure**
  - Created `src/` directory for source code
  - Added basic `src/index.ts` entry point
  - Configured build output to `dist/` directory

- **Development Dependencies**
  - TypeScript 5.7.2
  - ESLint 9.17.0 with TypeScript support
  - Prettier 3.4.2
  - Husky 9.1.7
  - lint-staged 15.2.11
  - tsx 4.19.2 for development
  - @types/node for Node.js type definitions

### Changed

- Updated package.json to use pnpm as package manager
- Set module type to ES modules

### Technical Details

- All source code is organized in the `src/` directory
- Build output goes to `dist/` directory
- Pre-commit hooks ensure code quality before commits
- Strict TypeScript configuration for type safety
- Modern ESLint flat config format for better maintainability
