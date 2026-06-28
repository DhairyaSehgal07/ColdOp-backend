#!/usr/bin/env bash
# Create Outgoing Gate Pass – curl for Postman / terminal
# Replace BASE_URL and JWT_TOKEN with your values.
#
# Multi-variety: send multiple incomingGatePasses entries, each with its own variety.
# Variety is stored on each orderDetails line (not at pass root).
#
# Expected 201 response shape:
# {
#   "status": "Success",
#   "message": "Outgoing gate pass created successfully.",
#   "data": {
#     "_id": "...",
#     "gatePassNo": 101,
#     "date": "2026-06-28T00:00:00.000Z",
#     "from": "Cold Storage A",
#     "to": "Mandi Delhi",
#     "truckNumber": "HR-01-AB-1234",
#     "orderDetails": [
#       {
#         "variety": "Chipsona",
#         "size": "50 kg",
#         "quantityAvailable": 80,
#         "quantityIssued": 20,
#         "location": { "chamber": "A", "floor": "1", "row": "R1" }
#       },
#       {
#         "variety": "Kufri Jyoti",
#         "size": "50 kg",
#         "quantityAvailable": 35,
#         "quantityIssued": 15,
#         "location": { "chamber": "B", "floor": "2", "row": "R3" }
#       }
#     ],
#     "incomingGatePassSnapshots": [ "... per incoming pass ..." ],
#     "remarks": "Mixed variety nikasi",
#     "createdBy": { "_id": "...", "name": "Store Admin" },
#     "createdAt": "...",
#     "updatedAt": "..."
#   }
# }

BASE_URL="${BASE_URL:-http://localhost:3000}"
JWT_TOKEN="${JWT_TOKEN:-your-jwt-token-here}"

curl -X POST "${BASE_URL}/api/v1/outgoing-gate-pass" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d '{
    "farmerStorageLinkId": "682b2245a3e03b66de157e00",
    "gatePassNo": 101,
    "date": "2026-06-28T00:00:00.000Z",
    "from": "Cold Storage A",
    "to": "Mandi Delhi",
    "truckNumber": "HR-01-AB-1234",
    "incomingGatePasses": [
      {
        "incomingGatePassId": "682b2245a3e03b66de157001",
        "variety": "Chipsona",
        "allocations": [
          {
            "size": "50 kg",
            "quantityToAllocate": 20,
            "location": { "chamber": "A", "floor": "1", "row": "R1" }
          }
        ]
      },
      {
        "incomingGatePassId": "682b2245a3e03b66de157002",
        "variety": "Kufri Jyoti",
        "allocations": [
          {
            "size": "50 kg",
            "quantityToAllocate": 15,
            "location": { "chamber": "B", "floor": "2", "row": "R3" }
          }
        ]
      }
    ],
    "remarks": "Mixed variety nikasi"
  }'
