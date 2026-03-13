#!/usr/bin/env bash
# Get all incoming gate passes for a farmer-storage-link – curl for Postman / terminal
# Replace BASE_URL, JWT_TOKEN, and FARMER_STORAGE_LINK_ID with your values.

BASE_URL="${BASE_URL:-http://localhost:3000}"
JWT_TOKEN="${JWT_TOKEN:-your-jwt-token-here}"
FARMER_STORAGE_LINK_ID="${FARMER_STORAGE_LINK_ID:-682b2245a3e03b66de157e00}"

curl -X GET "${BASE_URL}/api/v1/incoming-gate-pass/farmer-storage-link/${FARMER_STORAGE_LINK_ID}" \
  -H "Authorization: Bearer ${JWT_TOKEN}"
