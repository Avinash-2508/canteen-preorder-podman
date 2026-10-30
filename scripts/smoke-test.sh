#!/usr/bin/env bash
# End-to-end test through nginx -> Node API. Run from Git Bash / Linux:
#   bash scripts/smoke-test.sh            (defaults to http://localhost:8085)
#   bash scripts/smoke-test.sh http://localhost:9090
set -u
BASE="${1:-http://localhost:8085}"
PASS=0; FAIL=0

check() {  # check "<description>" "<expected text>" <curl args...>
  local desc="$1" expect="$2"; shift 2
  local out
  out=$(curl -s "$@")
  if [[ "$out" == *"$expect"* ]]; then
    echo "PASS  $desc"; PASS=$((PASS+1))
  else
    echo "FAIL  $desc"; echo "      expected to contain: $expect"; echo "      got: $out"; FAIL=$((FAIL+1))
  fi
}

check "React page is served by nginx"   '<div id="root">' "$BASE/"
check "API health is UP (via nginx)"    '"status":"UP"'   "$BASE/api/health"
check "menu lists Masala Dosa"          'Masala Dosa'     "$BASE/api/menu"

# 2 x Masala Dosa (50) + 1 x Tea (12) = 112
check "create order calculates total"   '"total":112' -X POST -H "Content-Type: application/json" \
      -d '{"customer":"Smoke Test","items":[{"menuItemId":1,"qty":2},{"menuItemId":6,"qty":1}]}' "$BASE/api/orders"
ID=$(curl -s "$BASE/api/orders" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)

check "update status to READY"          '"status":"READY"' -X PATCH -H "Content-Type: application/json" \
      -d '{"status":"READY"}' "$BASE/api/orders/$ID/status"
check "filter orders by status READY"   "\"id\":$ID"       "$BASE/api/orders?status=READY"
check "daily order count is returned"   '"orderCount":'    "$BASE/api/stats"

check "rejects order without items"     'Select at least one item' -X POST -H "Content-Type: application/json" \
      -d '{"customer":"Nobody","items":[]}' "$BASE/api/orders"
check "rejects unknown status"          'Status must be one of' -X PATCH -H "Content-Type: application/json" \
      -d '{"status":"EATEN"}' "$BASE/api/orders/$ID/status"
check "mark order COLLECTED"            '"status":"COLLECTED"' -X PATCH -H "Content-Type: application/json" \
      -d '{"status":"COLLECTED"}' "$BASE/api/orders/$ID/status"
check "collected order cannot change"   'cannot change' -X PATCH -H "Content-Type: application/json" \
      -d '{"status":"PLACED"}' "$BASE/api/orders/$ID/status"

echo
echo "$PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]]
