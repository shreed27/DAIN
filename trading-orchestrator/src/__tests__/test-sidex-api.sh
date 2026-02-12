#!/bin/bash

# Sidex Pro API Test Script
# Run this with: bash src/__tests__/test-sidex-api.sh
# Make sure server is running on port 4000

BASE_URL="${BASE_URL:-http://localhost:4000}"
PASS=0
FAIL=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "  Sidex Pro API Test Suite"
echo "  Server: $BASE_URL"
echo "========================================"
echo ""

# Helper function to run tests
test_endpoint() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    local expected_status="$4"
    local description="$5"

    if [ -n "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data" 2>/dev/null)
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" 2>/dev/null)
    fi

    status_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$status_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓ PASS${NC}: $description (Status: $status_code)"
        ((PASS++))
    else
        echo -e "${RED}✗ FAIL${NC}: $description"
        echo "  Expected: $expected_status, Got: $status_code"
        echo "  Response: $body"
        ((FAIL++))
    fi
}

# Test if server is running
echo "Testing server connectivity..."
if ! curl -s "$BASE_URL/health" > /dev/null 2>&1; then
    echo -e "${RED}Error: Server not running at $BASE_URL${NC}"
    echo "Start the server with: cd trading-orchestrator && pnpm dev"
    exit 1
fi
echo -e "${GREEN}Server is running!${NC}"
echo ""

# ==================== Health Tests ====================
echo "--- Health Endpoints ---"
test_endpoint "GET" "/health" "" "200" "GET /health"
test_endpoint "GET" "/api/v1/health" "" "200" "GET /api/v1/health"

# ==================== Balance Tests ====================
echo ""
echo "--- Balance & Account ---"
test_endpoint "GET" "/api/v1/sidex/balance" "" "200" "GET /api/v1/sidex/balance"
test_endpoint "GET" "/api/v1/sidex/simulation" "" "200" "GET /api/v1/sidex/simulation"

# Reset account for clean state
echo ""
echo "Resetting account for clean tests..."
test_endpoint "POST" "/api/v1/sidex/reset" "" "200" "POST /api/v1/sidex/reset"

# ==================== Polymarket Markets ====================
echo ""
echo "--- Polymarket Markets ---"
test_endpoint "GET" "/api/v1/sidex/polymarket/markets" "" "200" "GET markets (default params)"
test_endpoint "GET" "/api/v1/sidex/polymarket/markets?limit=5" "" "200" "GET markets (limit=5)"
test_endpoint "GET" "/api/v1/sidex/polymarket/markets/trump-2024" "" "200" "GET market by ID"
test_endpoint "GET" "/api/v1/sidex/polymarket/markets/nonexistent-12345" "" "404" "GET non-existent market"
test_endpoint "GET" "/api/v1/sidex/polymarket/markets/search?q=trump" "" "200" "Search markets"
test_endpoint "GET" "/api/v1/sidex/polymarket/markets/search" "" "400" "Search without query (should fail)"
test_endpoint "GET" "/api/v1/sidex/polymarket/user/0x1234/trades" "" "200" "GET user trades"

# ==================== Crypto Trading ====================
echo ""
echo "--- Crypto Trading ---"

# Valid trade
test_endpoint "POST" "/api/v1/sidex/trade" \
    '{"symbol":"BTC/USDT","side":"buy","amount":500,"leverage":10}' \
    "200" "Open BTC long position"

# Get positions
test_endpoint "GET" "/api/v1/sidex/positions" "" "200" "GET all positions"
test_endpoint "GET" "/api/v1/sidex/positions/crypto" "" "200" "GET crypto positions"

# Close position
test_endpoint "POST" "/api/v1/sidex/close" \
    '{"symbol":"BTC/USDT","direction":"long"}' \
    "200" "Close BTC position"

# Missing fields
test_endpoint "POST" "/api/v1/sidex/trade" \
    '{"symbol":"BTC/USDT"}' \
    "400" "Missing required fields (should fail)"

# ==================== Polymarket Trading ====================
echo ""
echo "--- Polymarket Trading ---"

# Valid trade
test_endpoint "POST" "/api/v1/sidex/trade/polymarket" \
    '{"marketId":"trump-2024","side":"yes","shares":100}' \
    "200" "Open YES position"

# Get positions
test_endpoint "GET" "/api/v1/sidex/positions/polymarket" "" "200" "GET polymarket positions"

# Close position (may fail if position not found, that's OK)
echo "Note: Close position may fail if position ID doesn't exist"
curl -s -X POST "$BASE_URL/api/v1/sidex/close/polymarket" \
    -H "Content-Type: application/json" \
    -d '{"positionId":"poly_1"}' > /dev/null

# Missing fields
test_endpoint "POST" "/api/v1/sidex/trade/polymarket" \
    '{"side":"yes","shares":100}' \
    "400" "Missing marketId (should fail)"

# Invalid side
test_endpoint "POST" "/api/v1/sidex/trade/polymarket" \
    '{"marketId":"trump-2024","side":"invalid","shares":100}' \
    "400" "Invalid side (should fail)"

# ==================== NL Strategies ====================
echo ""
echo "--- NL Strategies ---"

# Create strategy
test_endpoint "POST" "/api/v1/sidex/strategies" \
    '{"platform":"polymarket","marketId":"trump-2024","description":"Buy YES if odds drop below 40 cents","capital":500}' \
    "201" "Create polymarket strategy"

test_endpoint "POST" "/api/v1/sidex/strategies" \
    '{"platform":"crypto","symbol":"BTC/USDT","description":"DCA $50 every 4 hours","capital":1000}' \
    "201" "Create crypto strategy"

# Get strategies
test_endpoint "GET" "/api/v1/sidex/nl-strategies" "" "200" "GET all strategies"

# Invalid platform
test_endpoint "POST" "/api/v1/sidex/strategies" \
    '{"platform":"invalid","description":"test","capital":100}' \
    "400" "Invalid platform (should fail)"

# Missing marketId for polymarket
test_endpoint "POST" "/api/v1/sidex/strategies" \
    '{"platform":"polymarket","description":"test","capital":100}' \
    "400" "Missing marketId for polymarket (should fail)"

# Missing symbol for crypto
test_endpoint "POST" "/api/v1/sidex/strategies" \
    '{"platform":"crypto","description":"test","capital":100}' \
    "400" "Missing symbol for crypto (should fail)"

# Strategy trades
test_endpoint "GET" "/api/v1/sidex/strategy-trades" "" "200" "GET strategy trades"

# ==================== Copy Trading ====================
echo ""
echo "--- Copy Trading ---"

# Create config
test_endpoint "POST" "/api/v1/sidex/copy-configs/polymarket" \
    '{"targetWallet":"0x1234567890abcdef","targetLabel":"Whale","sizingMode":"fixed","fixedSize":100}' \
    "201" "Create polymarket copy config"

# Get configs
test_endpoint "GET" "/api/v1/sidex/copy-configs" "" "200" "GET all copy configs"
test_endpoint "GET" "/api/v1/sidex/copy-configs/polymarket" "" "200" "GET polymarket copy configs"
test_endpoint "GET" "/api/v1/sidex/copy-configs/crypto" "" "200" "GET crypto copy configs"

# Missing fields
test_endpoint "POST" "/api/v1/sidex/copy-configs/polymarket" \
    '{}' \
    "400" "Missing required fields (should fail)"

# Copy trades
test_endpoint "GET" "/api/v1/sidex/copy-trades" "" "200" "GET copy trades"

# ==================== Prices ====================
echo ""
echo "--- Prices ---"
test_endpoint "GET" "/api/v1/sidex/prices" "" "200" "GET all prices"
test_endpoint "GET" "/api/v1/sidex/prices/BTC-USDT" "" "200" "GET BTC price"
test_endpoint "GET" "/api/v1/sidex/prices/INVALID-SYMBOL" "" "404" "GET invalid symbol (should fail)"

# ==================== AI Agents ====================
echo ""
echo "--- AI Agents ---"

# Create agent
test_endpoint "POST" "/api/v1/sidex/agents" \
    '{"name":"Test DCA Agent","strategy":"dca","capital":1000,"riskLevel":"moderate"}' \
    "201" "Create AI agent"

# Get agents
test_endpoint "GET" "/api/v1/sidex/agents" "" "200" "GET all agents"

# Missing fields
test_endpoint "POST" "/api/v1/sidex/agents" \
    '{"name":"Test Agent"}' \
    "400" "Missing required fields (should fail)"

# Agent trades
test_endpoint "GET" "/api/v1/sidex/agent-trades" "" "200" "GET agent trades"

# ==================== Account Operations ====================
echo ""
echo "--- Account Operations ---"
test_endpoint "GET" "/api/v1/sidex/health" "" "200" "GET Sidex health"
test_endpoint "POST" "/api/v1/sidex/simulation" '{"enabled":true}' "200" "Enable simulation mode"
test_endpoint "POST" "/api/v1/sidex/simulation" '{"enabled":false}' "200" "Disable simulation mode"

# Final reset
test_endpoint "POST" "/api/v1/sidex/reset" "" "200" "Final reset"

# ==================== Summary ====================
echo ""
echo "========================================"
echo "  Test Summary"
echo "========================================"
echo -e "  ${GREEN}Passed: $PASS${NC}"
echo -e "  ${RED}Failed: $FAIL${NC}"
echo "  Total: $((PASS + FAIL))"
echo "========================================"

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi
