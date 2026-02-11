#!/usr/bin/env bash
# Search orders (incoming + outgoing gate passes) by receipt number (gatePassNo).
# Replace BASE_URL and JWT_TOKEN. Receipt number must be an integer (gate pass number).
#
# Usage:
#   JWT_TOKEN=xxx ./docs/curl-search-order-by-receipt.sh
#   RECEIPT_NUMBER=42 JWT_TOKEN=xxx ./docs/curl-search-order-by-receipt.sh
#
# One-liner (no script):
#   curl -s -X POST http://localhost:3000/api/v1/store-admin/search-order-by-receipt \
#     -H "Content-Type: application/json" \
#     -H "Authorization: Bearer YOUR_JWT" \
#     -d '{"receiptNumber": "123"}'

BASE_URL="${BASE_URL:-http://localhost:3000}"
API_PATH="${BASE_URL}/api/v1/store-admin/search-order-by-receipt"
JWT_TOKEN="${JWT_TOKEN:-your-jwt-token-here}"
RECEIPT_NUMBER="${RECEIPT_NUMBER:-1}"

curl -s -X POST "${API_PATH}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d "{\"receiptNumber\": \"${RECEIPT_NUMBER}\"}"
