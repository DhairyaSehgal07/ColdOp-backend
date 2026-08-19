#!/usr/bin/env bash
# Edit (PATCH) Incoming Gate Pass – curl for Postman / terminal
# Replace BASE_URL, JWT_TOKEN, and INCOMING_GATE_PASS_ID with your values.
#
# Endpoint: PATCH /api/v1/incoming-gate-pass/:id
# Auth: Bearer token required
#
# When updating bagSizes, both initialQuantity and currentQuantity are updated.
# previousLocation is an optional array of prior chamber/floor/row placements
# (move history). location is the current placement.

BASE_URL="${BASE_URL:-http://localhost:3000}"
JWT_TOKEN="${JWT_TOKEN:-your-jwt-token-here}"
INCOMING_GATE_PASS_ID="${INCOMING_GATE_PASS_ID:-682b2245a3e03b66de157001}"

curl -X PATCH "${BASE_URL}/api/v1/incoming-gate-pass/${INCOMING_GATE_PASS_ID}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d '{
    "variety": "Chipsona",
    "truckNumber": "HR-01-AB-1234",
    "remarks": "Updated after location move",
    "bagSizes": [
      {
        "name": "50 kg",
        "initialQuantity": 100,
        "currentQuantity": 100,
        "location": {
          "chamber": "C",
          "floor": "3",
          "row": "R7"
        },
        "previousLocation": [
          {
            "chamber": "A",
            "floor": "1",
            "row": "R1"
          },
          {
            "chamber": "B",
            "floor": "2",
            "row": "R4"
          }
        ]
      }
    ]
  }'
