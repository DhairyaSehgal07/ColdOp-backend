#!/usr/bin/env bash
# Get daybook (incoming + outgoing gate passes) – curl examples for all param cases
# Replace BASE_URL and JWT_TOKEN.
#
# Params:
#   type    = all | incoming | outgoing   (default: all)
#   sortBy  = latest | oldest             (latest = higher gatePassNo first)
#   page    = integer >= 1                 (default: 1)
#   limit   = integer 1–100                (default: 10)
#
# Quick one-liner with env vars (run a single request):
#   TYPE=incoming SORT_BY=latest PAGE=1 LIMIT=10 JWT_TOKEN=xxx ./docs/curl-get-daybook.sh
# Or copy one of the curl commands below.

BASE_URL="${BASE_URL:-http://localhost:3000}"
API_PATH="${BASE_URL}/api/v1/store-admin/daybook"
JWT_TOKEN="${JWT_TOKEN:-your-jwt-token-here}"

# Optional: run only one request using env vars (TYPE, SORT_BY, PAGE, LIMIT)
if [ -n "${TYPE:-}" ] || [ -n "${SORT_BY:-}" ] || [ -n "${PAGE:-}" ] || [ -n "${LIMIT:-}" ]; then
  Q=""
  [ -n "${TYPE:-}" ]    && Q="${Q}type=${TYPE}&"
  [ -n "${SORT_BY:-}" ] && Q="${Q}sortBy=${SORT_BY}&"
  [ -n "${PAGE:-}" ]    && Q="${Q}page=${PAGE}&"
  [ -n "${LIMIT:-}" ]   && Q="${Q}limit=${LIMIT}&"
  curl -s -X GET "${API_PATH}?${Q}" -H "Authorization: Bearer ${JWT_TOKEN}"
  exit 0
fi

# --- 1) Default: type=all, sortBy=latest, page=1, limit=10 ---
echo "1) Default (all, latest first, page 1, limit 10)"
curl -s -X GET "${API_PATH}" \
  -H "Authorization: Bearer ${JWT_TOKEN}"

# --- 2) type: all | incoming | outgoing ---
echo ""
echo "2a) type=all (merged incoming + outgoing, default)"
curl -s -X GET "${API_PATH}?type=all" \
  -H "Authorization: Bearer ${JWT_TOKEN}"

echo ""
echo "2b) type=incoming (only incoming gate passes)"
curl -s -X GET "${API_PATH}?type=incoming" \
  -H "Authorization: Bearer ${JWT_TOKEN}"

echo ""
echo "2c) type=outgoing (only outgoing gate passes)"
curl -s -X GET "${API_PATH}?type=outgoing" \
  -H "Authorization: Bearer ${JWT_TOKEN}"

# --- 3) sortBy: latest (higher gatePassNo first) | oldest (lower gatePassNo first) ---
echo ""
echo "3a) sortBy=latest (higher voucher numbers first)"
curl -s -X GET "${API_PATH}?sortBy=latest" \
  -H "Authorization: Bearer ${JWT_TOKEN}"

echo ""
echo "3b) sortBy=oldest (lower voucher numbers first)"
curl -s -X GET "${API_PATH}?sortBy=oldest" \
  -H "Authorization: Bearer ${JWT_TOKEN}"

# --- 4) Pagination: page, limit (limit 1–100) ---
echo ""
echo "4a) page=1, limit=20"
curl -s -X GET "${API_PATH}?page=1&limit=20" \
  -H "Authorization: Bearer ${JWT_TOKEN}"

echo ""
echo "4b) page=2, limit=10"
curl -s -X GET "${API_PATH}?page=2&limit=10" \
  -H "Authorization: Bearer ${JWT_TOKEN}"

# --- 5) Combined examples ---
echo ""
echo "5a) type=incoming, sortBy=oldest, limit=5"
curl -s -X GET "${API_PATH}?type=incoming&sortBy=oldest&limit=5" \
  -H "Authorization: Bearer ${JWT_TOKEN}"

echo ""
echo "5b) type=outgoing, sortBy=latest, page=1, limit=25"
curl -s -X GET "${API_PATH}?type=outgoing&sortBy=latest&page=1&limit=25" \
  -H "Authorization: Bearer ${JWT_TOKEN}"

echo ""
echo "5c) type=all, sortBy=latest, page=2, limit=50"
curl -s -X GET "${API_PATH}?type=all&sortBy=latest&page=2&limit=50" \
  -H "Authorization: Bearer ${JWT_TOKEN}"

# --- Params reference ---
# type:    all (default) | incoming | outgoing
# sortBy:  latest (higher gatePassNo first) | oldest (lower gatePassNo first)
# page:    integer >= 1 (default 1)
# limit:   integer 1–100 (default 10)
