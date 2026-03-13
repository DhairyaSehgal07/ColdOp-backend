#!/usr/bin/env bash
# Create Incoming Gate Pass – curl for Postman / terminal
# Replace BASE_URL and JWT_TOKEN with your values.

BASE_URL="${BASE_URL:-http://localhost:3000}"
JWT_TOKEN="${JWT_TOKEN:-your-jwt-token-here}"

# Required: farmerStorageLinkId (valid ObjectId), date (ISO), type, variety, bagSizes
# Optional: truckNumber, remarks, manualParchiNumber
# When cold storage showFinances is true: send amount (voucher is created with Store Rent credit, farmer ledger debit)
curl -X POST "${BASE_URL}/api/v1/incoming-gate-pass" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d '{
    "farmerStorageLinkId": "682b2245a3e03b66de157e00",
    "date": "2026-02-11T00:00:00.000Z",
    "type": "RECEIPT",
    "variety": "Chipsona",
    "truckNumber": "HR-01-AB-1234",
    "bagSizes": [
      {
        "name": "50 kg",
        "initialQuantity": 100,
        "currentQuantity": 100,
        "location": {
          "chamber": "A",
          "floor": "1",
          "row": "R1"
        }
      }
    ],
    "remarks": "Test incoming gate pass",
    "manualParchiNumber": "PARCHI-001",
    "amount": 5000
  }'
