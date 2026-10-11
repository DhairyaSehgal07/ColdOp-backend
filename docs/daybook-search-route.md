# Daybook search route

Implementation spec for `POST /api/v1/store-admin/search`.

This is the search used alongside the daybook list (`GET /api/v1/store-admin/daybook`). It finds incoming and outgoing gate passes for the authenticated store admin's cold storage. Results use the same document shape as the daybook list, but they are returned in two arrays (`incoming` and `outgoing`) and are not paginated.

Source files in this repo:

- Route: `src/modules/v1/store-admin/store-admin.routes.ts` (`fastify.post("/search")`)
- Schema: `src/modules/v1/store-admin/store-admin.schema.ts` (`searchOrderByReceiptNumberBodySchema`)
- Controller: `src/modules/v1/store-admin/store-admin.controller.ts` (`searchOrderByReceiptNumberHandler`)
- Service: `src/modules/v1/store-admin/store-admin.service.ts` (`searchOrdersByReceiptNumber`)
- Shared list helpers: `src/modules/v1/farmer-storage-link/farmer-storage-link.utils.ts`
- Mounted in `src/app.ts` with prefix `/api/v1/store-admin`

---

## Endpoint

| | |
|---|---|
| Method | `POST` |
| Path | `/api/v1/store-admin/search` |
| Auth | Required (`authenticate` preHandler). Cold storage id comes from the token, not the body. |
| Rate limit | 200 requests per minute |
| Pagination | None. Every match is returned. |

### Body

```json
{
  "receiptNumber": "42",
  "searchBy": "gatePassNumber"
}
```

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `receiptNumber` | string | yes | — | Trimmed. Must be non-empty after trim. Meaning depends on `searchBy`. |
| `searchBy` | enum | no | `gatePassNumber` | `gatePassNumber` \| `manualParchiNumber` \| `marka` \| `customMarka` \| `remarks` |

`receiptNumber` is the search value for every mode. The name is historical. It is not always a receipt or gate-pass number.

---

## Schema

Zod schema. The handler wraps the raw body as `{ body: request.body }` before parsing, so field errors live under `fieldErrors.body`.

```ts
const searchOrderByReceiptSearchBySchema = z.enum([
  "gatePassNumber",
  "manualParchiNumber",
  "marka",
  "customMarka",
  "remarks",
]);

export const searchOrderByReceiptNumberBodySchema = z.object({
  body: z.object({
    receiptNumber: z.string().trim().min(1, "Receipt number is required"),
    searchBy: searchOrderByReceiptSearchBySchema
      .optional()
      .default("gatePassNumber"),
  }),
});
```

Validation failure is HTTP 400:

```json
{ "status": "Fail", "message": "<first receiptNumber or searchBy error, else \"Receipt number is required\">" }
```

---

## Controller

`searchOrderByReceiptNumberHandler(request, reply)`:

1. Parse the body with the schema above. On failure, log a warning and return 400 as shown.
2. Resolve `coldStorageId` from the authenticated user:
   - If `user.coldStorageId` is an object with `_id`, use `_id`.
   - Otherwise use `user.coldStorageId` as a string.
3. If there is no cold storage id, return 401:

```json
{
  "success": false,
  "error": {
    "code": "MISSING_COLD_STORAGE",
    "message": "Cold storage not found in token"
  }
}
```

4. Call `searchOrdersByReceiptNumber(coldStorageId, receiptNumber, logger, { searchBy })`.
5. If the service returns `status === "Fail"` and a `message`, return **404** (not 200):

```json
{ "status": "Fail", "message": "No orders found with this receipt number" }
```

6. Otherwise return 200:

```json
{
  "status": "Success",
  "data": {
    "incoming": [],
    "outgoing": []
  }
}
```

7. Thrown errors go through a shared error helper:
   - `ValidationError` / other `AppError` → that error's status (400 for validation) with `{ success: false, error: { code, message } }`.
   - Anything else → 500 `{ success: false, error: { code: "INTERNAL_SERVER_ERROR", message } }`. In development the message is the real error; otherwise it is `"An unexpected error occurred"`.

Service validation errors that matter here:

| Code | When | Message |
|---|---|---|
| `MISSING_RECEIPT_NUMBER` | Empty after trim (also caught by schema) | `Receipt number is required` |
| `INVALID_COLD_STORAGE_ID` | `coldStorageId` is not a valid ObjectId | `Invalid cold storage ID format` |
| `INVALID_RECEIPT_NUMBER` | `searchBy` is `gatePassNumber` and the value is not an integer | `Receipt number must be a valid gate pass number (integer)` |

---

## Service

`searchOrdersByReceiptNumber(coldStorageId, receiptNumber, logger?, { searchBy? })`

Return type:

```ts
{
  status: "Success" | "Fail";
  message?: string;
  data?: {
    incoming: Record<string, unknown>[];
    outgoing: Record<string, unknown>[];
  };
}
```

`searchBy` defaults to `"gatePassNumber"` when omitted.

### 1. Scope to the cold storage

Gate passes do not store `coldStorageId`. They store `farmerStorageLinkId`.

1. Load every `FarmerStorageLink` where `coldStorageId` equals the token cold storage. Select only `_id`.
2. If there are zero links, return Fail (controller turns this into 404):

```ts
{
  status: "Fail",
  message: "No orders found with this receipt number",
  data: { incoming: [], outgoing: [] },
}
```

All later queries use:

```ts
{ farmerStorageLinkId: { $in: farmerStorageLinkIds } }
```

### 2. Branch on `searchBy`

Trim `receiptNumber` once and use that string (`trimmed`) for every comparison.

#### `gatePassNumber` (default)

- Parse `trimmed` with `Number`.
- Reject unless it is a finite integer (`Number.isInteger` and not `NaN`). Empty string is also rejected. Throw `ValidationError` `INVALID_RECEIPT_NUMBER`.
- Query both collections with `{ farmerStorageLinkId: { $in }, gatePassNo: <integer> }`.
- Exact numeric match on `gatePassNo`. Not a substring.

#### `manualParchiNumber`

Incoming stores `manualParchiNumber` as a string. Outgoing stores it as a number. One filter covers both:

- Always include `{ manualParchiNumber: trimmed }` (string).
- If `Number(trimmed)` is an integer, also include `{ manualParchiNumber: <that number> }`.
- Combine with `$or` when both exist.
- Query both collections with that filter plus the link scope.

Examples:

- `"15"` matches incoming `"15"` and outgoing `15`.
- `"15A"` matches only the string `"15A"` (not a number, so no numeric clause).

#### `customMarka` (legacy, incoming only)

- Query **incoming only** with `{ farmerStorageLinkId: { $in }, customMarka: trimmed }`.
- Exact string match. Case-sensitive. Not a substring.
- Outgoing is always `[]`. Do not query outgoing.

#### `remarks`

- Query both collections.
- Match `remarks` with a case-insensitive substring regex.
- Escape regex metacharacters in the user string first so `.`, `*`, `(`, etc. are literal:

```ts
function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Mongo filter fragment
remarks: { $regex: escapeRegexLiteral(trimmed), $options: "i" }
```

#### `marka`

This mode is the union of two searches. A hit on either is included. Incoming ids are deduped.

**A. `gatePassNo/totalBags`** — both collections, only if the string parses.

Parse with `/^(\d+)\s*\/\s*(\d+)$/` after trim.

- Group 1 = `gatePassNo` (integer `>= 0`).
- Group 2 = `totalBags` (integer `>= 1`).
- Spaces around `/` are allowed (`"42 / 300"`).
- If it does not match, skip this half. Do not error. The custom-marka half still runs.
- `"42/0"` is invalid (`totalBags` must be `>= 1`) and is treated as not a marka pattern.

Bag totals are not a stored field. Compute them in an aggregation:

- Incoming: sum `bagSizes[].initialQuantity` (treat missing array or quantity as 0).
- Outgoing: sum `orderDetails[].quantityIssued` (same null handling).

Pipeline shape:

```ts
[
  { $match: { farmerStorageLinkId: { $in: linkIds }, gatePassNo } },
  { $addFields: { _markaTotalBags: /* $reduce sum above */ } },
  { $match: { _markaTotalBags: totalBags } },
  { $project: { _id: 1 } },
]
```

Run incoming and outgoing aggregations in parallel.

**B. Exact `customMarka`** — incoming only.

```ts
IncomingGatePass.find({
  farmerStorageLinkId: { $in: linkIds },
  customMarka: trimmed, // exact, case-sensitive
}).select("_id")
```

Then:

- Incoming ids = unique set of aggregation ids + customMarka ids.
- Outgoing ids = aggregation ids only (empty if the string was not `n/n`).
- If both id lists are empty, return the same Fail / "No orders found..." result.
- Otherwise load full documents by `_id: { $in: ids }` (skip a collection whose id list is empty).

Log fields used in this repo for the marka success path: `marka`, `coldStorageId`, `incomingCount`, `outgoingCount`, `usedGatePassTotalBags` (boolean, true when the string parsed), `usedCustomMarka` (true when at least one customMarka doc matched).

### 3. Load, sort, and flatten

For every mode except the early Fail returns, load matches with the selects and populate below, then post-process.

Run the two finds in `Promise.all`. `customMarka` resolves outgoing as `[]` without a query. `marka` uses the id lists as described.

If both result arrays are empty, return Fail with `"No orders found with this receipt number"`.

Otherwise:

1. Sort nested arrays (see below).
2. Flatten `farmerStorageLinkId` (see below).
3. Return `{ status: "Success", data: { incoming, outgoing } }`.

There is no sort on the gate passes themselves and no `limit`. Order is whatever the database returns.

---

## Document fields

### Incoming select

`_id farmerStorageLinkId createdBy gatePassNo date type variety truckNumber bagSizes status remarks manualParchiNumber stockFilter customMarka createdAt`

### Outgoing select

`_id farmerStorageLinkId createdBy gatePassNo date type from to truckNumber orderDetails remarks manualParchiNumber stockFilter incomingGatePassSnapshots isNull createdAt`

### Populate

- `farmerStorageLinkId`: select `accountNumber name address mobileNumber farmerId`, then populate `farmerId` (Farmer) with `name address mobileNumber`.
- `createdBy`: StoreAdmin, select `name`.

### Sort nested lines

On each document (plain object, not a mongoose doc):

- If `bagSizes` is an array, sort a copy by `name` (`localeCompare`).
- If `orderDetails` is an array, sort a copy by `variety` (`localeCompare`, missing variety as `""`), then by `size`.

### Flatten `farmerStorageLinkId`

Replace the populated link with a flat display object. Do not leave the nested `farmerId`.

```ts
{
  name: link.name ?? link.farmerId?.name ?? "",
  accountNumber: link.accountNumber,
  address: link.address ?? link.farmerId?.address ?? "",
  mobileNumber: link.mobileNumber ?? link.farmerId?.mobileNumber ?? "",
}
```

If the link did not populate, leave `farmerStorageLinkId` as stored.

### `isNull` on outgoing only

If the document has an `orderDetails` array, set `isNull` to the stored boolean, or `false` when missing. Incoming documents are left unchanged (they have `bagSizes`, not `orderDetails`).

---

## HTTP responses

| Status | When | Body |
|---|---|---|
| 200 | At least one incoming or outgoing match | `{ status: "Success", data: { incoming, outgoing } }` |
| 400 | Schema failure | `{ status: "Fail", message }` |
| 400 | Service `ValidationError` (bad ObjectId, non-integer gate pass number) | `{ success: false, error: { code, message } }` |
| 401 | No cold storage on the token | `{ success: false, error: { code: "MISSING_COLD_STORAGE", message } }` |
| 404 | No farmer links, or no matching passes | `{ status: "Fail", message: "No orders found with this receipt number" }` |
| 500 | Unexpected error | `{ success: false, error: { code: "INTERNAL_SERVER_ERROR", message } }` |

200 items:

- `farmerStorageLinkId` is `{ name, accountNumber, address, mobileNumber }`.
- Outgoing items include `isNull`.
- `bagSizes` sorted by name. `orderDetails` sorted by variety then size.
- Extra stored fields from the selects are included (`additionalProperties` allowed).

---

## Examples

Gate pass number (default):

```http
POST /api/v1/store-admin/search
{ "receiptNumber": "42" }
```

Matches incoming and outgoing whose `gatePassNo` is `42`.

Manual parchi:

```http
POST /api/v1/store-admin/search
{ "receiptNumber": "15", "searchBy": "manualParchiNumber" }
```

Marka as gate pass / bag total, and also as a custom marka string:

```http
POST /api/v1/store-admin/search
{ "receiptNumber": "42/300", "searchBy": "marka" }
```

Matches:

- Incoming with `gatePassNo === 42` and sum of `bagSizes.initialQuantity === 300`.
- Outgoing with `gatePassNo === 42` and sum of `orderDetails.quantityIssued === 300`.
- Incoming whose `customMarka` is exactly `"42/300"`.

Custom marka only:

```http
POST /api/v1/store-admin/search
{ "receiptNumber": "RED-A", "searchBy": "customMarka" }
```

Incoming exact match only. `outgoing` is `[]` even if nothing else matches — if incoming is also empty, the whole response is 404.

Remarks substring:

```http
POST /api/v1/store-admin/search
{ "receiptNumber": "torn bag", "searchBy": "remarks" }
```

Case-insensitive substring on `remarks` for both collections. `"bag."` does not become a regex; the dot is escaped.

---

## Invariants to preserve

- Scope is always the token cold storage, via its farmer-storage links. Never search across storages.
- No pagination and no client-supplied sort.
- Empty result is 404 with `status: "Fail"`, not 200 with empty arrays. The service still attaches `data: { incoming: [], outgoing: [] }`, but the controller does not send `data` on that path.
- `customMarka` never queries outgoing.
- `marka` always also tries exact incoming `customMarka`, even when `gatePassNo/totalBags` parsing succeeds.
- `marka` that does not look like `n/n` is not an error. It only does the custom-marka lookup.
- `gatePassNumber` that is not an integer is 400 `INVALID_RECEIPT_NUMBER`, not a 404.
- Remarks search is a literal substring. User input must not be interpolated into a regex unescaped.
- Farmer display prefers store-link `name` / `address` / `mobileNumber`, then the global farmer document, then `""`. `accountNumber` always comes from the link.
