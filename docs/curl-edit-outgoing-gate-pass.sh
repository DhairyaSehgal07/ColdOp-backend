#!/usr/bin/env bash
# Edit (PATCH) Outgoing Gate Pass – curl for Postman / terminal
# Replace BASE_URL, JWT_TOKEN, and OUTGOING_GATE_PASS_ID with your values.
#
# Endpoint: PATCH /api/v1/outgoing-gate-pass/:id
# Auth: Bearer token required
#
# Two edit modes:
#   1. Header-only — send metadata fields; stock unchanged
#   2. Allocation edit — send incomingGatePasses (same shape as create); replaces
#      the full allocation set and adjusts incoming stock by net delta
#
# ---------------------------------------------------------------------------
# 1) HEADER-ONLY EDIT
# ---------------------------------------------------------------------------
# Expected 200:
# {
#   "status": "Success",
#   "message": "Outgoing gate pass updated successfully.",
#   "data": {
#     "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
#     "gatePassNo": 101,
#     "date": "2026-06-28T00:00:00.000Z",
#     "from": "Cold Storage A",
#     "to": "Mandi Delhi",
#     "truckNumber": "HR-26-AB-1234",
#     "remarks": "Updated truck number",
#     "orderDetails": [ "..." ],
#     "incomingGatePassSnapshots": [ "..." ],
#     "farmerStorageLinkId": { "_id": "...", "farmerName": "...", "accountNo": "..." },
#     "createdBy": { "_id": "...", "name": "Store Admin" },
#     "createdAt": "2026-06-28T10:00:00.000Z",
#     "updatedAt": "2026-06-28T12:30:00.000Z"
#   }
# }

BASE_URL="${BASE_URL:-http://localhost:3000}"
JWT_TOKEN="${JWT_TOKEN:-your-jwt-token-here}"
OUTGOING_GATE_PASS_ID="${OUTGOING_GATE_PASS_ID:-64f1a2b3c4d5e6f7a8b9c0d1}"

curl -X PATCH "${BASE_URL}/api/v1/outgoing-gate-pass/${OUTGOING_GATE_PASS_ID}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d '{
    "truckNumber": "HR-26-AB-1234",
    "remarks": "Updated truck number"
  }'

# ---------------------------------------------------------------------------
# 2) ALLOCATION EDIT (change quantities)
# ---------------------------------------------------------------------------
# Replaces the full allocation set. Previously issued bags are credited back
# when checking availability; stock is updated by net delta.
#
# Example: pass originally issued 50 bags of 50kg; edit to issue 80 bags.
# Incoming currentQuantity decreases by 30.
#
# Expected 200: same envelope as header-only; orderDetails and
# incomingGatePassSnapshots reflect new quantities.

# curl -X PATCH "${BASE_URL}/api/v1/outgoing-gate-pass/${OUTGOING_GATE_PASS_ID}" \
#   -H "Content-Type: application/json" \
#   -H "Authorization: Bearer ${JWT_TOKEN}" \
#   -d '{
#     "incomingGatePasses": [
#       {
#         "incomingGatePassId": "682b2245a3e03b66de157001",
#         "variety": "Chipsona",
#         "allocations": [
#           {
#             "size": "50 kg",
#             "quantityToAllocate": 80,
#             "location": { "chamber": "A", "floor": "1", "row": "R1" }
#           }
#         ]
#       }
#     ]
#   }'

# ---------------------------------------------------------------------------
# 3) COMBINED HEADER + ALLOCATION EDIT
# ---------------------------------------------------------------------------

# curl -X PATCH "${BASE_URL}/api/v1/outgoing-gate-pass/${OUTGOING_GATE_PASS_ID}" \
#   -H "Content-Type: application/json" \
#   -H "Authorization: Bearer ${JWT_TOKEN}" \
#   -d '{
#     "truckNumber": "HR-26-XY-9999",
#     "from": "Cold Storage A",
#     "to": "Mandi Jaipur",
#     "incomingGatePasses": [
#       {
#         "incomingGatePassId": "682b2245a3e03b66de157001",
#         "variety": "Chipsona",
#         "allocations": [
#           {
#             "size": "50 kg",
#             "quantityToAllocate": 30,
#             "location": { "chamber": "A", "floor": "1", "row": "R1" }
#           }
#         ]
#       }
#     ]
#   }'

# ---------------------------------------------------------------------------
# 4) ERROR RESPONSES
# ---------------------------------------------------------------------------
#
# 400 VALIDATION_ERROR (empty body / Zod failure):
# {
#   "status": "error",
#   "statusCode": 400,
#   "errorCode": "VALIDATION_ERROR",
#   "message": "At least one field must be provided for update"
# }
#
# 400 INSUFFICIENT_STOCK:
# {
#   "status": "error",
#   "statusCode": 400,
#   "errorCode": "INSUFFICIENT_STOCK",
#   "message": "Insufficient quantity for size \"50 kg\" at location A/1/R1 in incoming gate pass 682b2245a3e03b66de157001: available 45 (current 20 + 25 from this pass), requested 80"
# }
#
# 400 INVALID_ALLOCATION_QUANTITY (identical allocations sent):
# {
#   "status": "error",
#   "statusCode": 400,
#   "errorCode": "INVALID_ALLOCATION_QUANTITY",
#   "message": "No allocation changes to apply; incoming gate passes and quantities match the current pass."
# }
#
# 400 OUTGOING_SNAPSHOT_MISSING (legacy pass without snapshots):
# {
#   "status": "error",
#   "statusCode": 400,
#   "errorCode": "OUTGOING_SNAPSHOT_MISSING",
#   "message": "This outgoing gate pass has no allocation snapshot; quantities cannot be edited."
# }
#
# 400 OUTGOING_GATE_PASS_NULLED:
# {
#   "status": "error",
#   "statusCode": 400,
#   "errorCode": "OUTGOING_GATE_PASS_NULLED",
#   "message": "Cannot update a nulled outgoing gate pass"
# }
#
# 404 OUTGOING_GATE_PASS_NOT_FOUND (missing ID or wrong cold storage):
# {
#   "status": "error",
#   "statusCode": 404,
#   "errorCode": "OUTGOING_GATE_PASS_NOT_FOUND",
#   "message": "Outgoing gate pass not found"
# }
#
# 409 CONCURRENT_MODIFICATION (stock changed concurrently):
# {
#   "status": "error",
#   "statusCode": 409,
#   "errorCode": "CONCURRENT_MODIFICATION",
#   "message": "Expected 1 incoming updates, got 0. Concurrent modification detected."
# }
