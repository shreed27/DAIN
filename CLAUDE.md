# Collesium Project - Autonomous Trading Operating System

This is a **7-project integrated platform** for autonomous AI trading across prediction markets, crypto DEXs, and perpetual futures.

## Quick Reference - The 6 Repos + Frontend

| Repo | Purpose | Key Feature |
|------|---------|-------------|
| **agent-dex-main** | Solana DEX API for AI agents | Jupiter V6, limit orders |
| **AgentHub-Repo** | Orchestration core & types | Permission system, lifecycle |
| **clawdnet-main** | A2A protocol + X402 payments | 🚧 *Coming Soon* |
| **CloddsBot-main** | Comprehensive trading terminal | Real order execution |
| **openclaw-sidex-kit** | Multi-exchange + Survival Mode | Adaptive risk management |
| **trading-orchestrator** | Central coordination hub | 6 adapters, kill switch |
| **trading-frontend** | Next.js dashboard | 25 pages, real-time |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER LAYER                                   │
│   Telegram │ Discord │ Slack │ Web Dashboard │ API                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                    TRADING-ORCHESTRATOR                              │
│  AgentOrchestrator │ PermissionManager │ StrategyRegistry           │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
┌───────▼───────┐    ┌─────────▼─────────┐    ┌──────▼──────┐
│  CLODDSBOT    │    │   AGENT-DEX       │    │  OPENCLAW   │
│  (25+ feats)  │    │   (Solana DEX)    │    │  (Futures)  │
│  - 16 Feeds   │    │   - Jupiter V6    │    │  - Survival │
│  - Copy Trade │    │   - Limit Orders  │    │  - X402     │
│  - Execution  │    │   - Portfolio     │    │  - 5 Exch.  │
└───────────────┘    └───────────────────┘    └─────────────┘
        │                      │                      │
        └──────────────────────┼──────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                   CLAWDNET (Coming Soon)                             │
│              A2A Protocol │ X402 Payments │ Agent Registry           │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                        BLOCKCHAIN                                    │
│   Solana │ Base │ Ethereum │ Arbitrum │ Polygon                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. agent-dex-main (Solana DEX API)

**Location:** `/agent-dex-main/`

**Purpose:** REST API for AI agents to trade on Solana without wallet popups

### Key Files
- `/api/src/services/jupiter.ts` - Jupiter V6 integration
- `/api/src/services/limitOrderChecker.ts` - Auto-execution (30s polling)
- `/api/src/db/index.ts` - SQLite: agents, limit_orders, trade_history
- `/api/src/routes/` - 7 API endpoints

### API Endpoints
```
POST /api/v1/agents/register     - Create agent + keypair
GET  /api/v1/agents/me           - Agent info
GET  /api/v1/quote               - Jupiter swap quote
POST /api/v1/swap                - Execute swap
GET  /api/v1/prices/:mint        - Token price
GET  /api/v1/portfolio/:wallet   - Holdings + USD values
POST /api/v1/limit-order         - Create limit order
GET  /api/v1/limit-order         - List orders
DELETE /api/v1/limit-order/:id   - Cancel order
```

### Features
- Agent registration with auto keypair generation
- Jupiter V6 routing for best-price execution
- Limit orders with auto-execution every 30 seconds
- Portfolio tracking (SOL + SPL tokens)
- Trade history audit log

---

## 2. AgentHub-Repo (Orchestration Core)

**Location:** `/AgentHub-Repo/`

**Purpose:** Type system and orchestration backbone

### Key Files
- `/orchestrator/dist/orchestrator/AgentOrchestrator.js` - Lifecycle management
- `/orchestrator/dist/orchestrator/PermissionManager.js` - 7-point permission checks
- `/orchestrator/dist/orchestrator/StrategyRegistry.js` - Strategy CRUD
- `/orchestrator/dist/types/` - 6 type modules

### Core Concepts

**Permission System:**
```typescript
interface WalletPermission {
  allowedActions: Action[]        // SWAP, PLACE_ORDER, etc.
  limits: {
    maxTransactionValue: number   // Per-trade cap
    dailyLimit: number            // Daily aggregate
    weeklyLimit: number           // Weekly aggregate
    requiresApproval: boolean     // Manual gate
  }
  expiresAt: number               // Auto-revoke
}
```

**Signal Sources:**
- OSINT, Whale, AI, Arbitrage, Social, OnChain

**Survival Mode States:**
- GROWTH (≥120%), SURVIVAL (85-120%), DEFENSIVE (50-85%), CRITICAL (<50%)

---

## 3. clawdnet-main (A2A Protocol)

**Location:** `/clawdnet-main/`

**Purpose:** Agent-to-Agent communication and payments

### Key Files
- `/contracts/src/IdentityRegistry.sol` - ERC-8004 on-chain identity
- `/docs/concepts/a2a.md` - A2A protocol spec
- `/docs/concepts/payments.md` - X402 payment protocol

### A2A Protocol
```json
{
  "version": "a2a-v1",
  "from": { "id": "agent_abc", "handle": "@sol" },
  "to": { "handle": "@image-gen" },
  "type": "request",
  "skill": "image-generation",
  "payload": { "prompt": "..." },
  "payment": { "max_amount": "0.05", "currency": "USDC" }
}
```

### X402 Payment Flow
```
Request → 402 Payment Required → Parse address/amount
→ Sign USDC payment (Base) → Retry with proof → Service delivered
```

### Reputation System (0-5 scale)
- Transaction Success (40%)
- Response Quality (25%)
- Response Time (20%)
- Consistency (15%)

### CLI Commands
```bash
clawdnet init      # Initialize config
clawdnet join      # Register with network
clawdnet status    # Show connection status
clawdnet agents    # List network agents
```

---

## 4. CloddsBot-main (Trading Terminal)

**Location:** `/CloddsBot-main/`

**Purpose:** Multi-platform trading assistant with 25+ user-facing features

### Key Files
- `/src/skills/executor.ts` - Skills registry (25+ features + infrastructure modules)
- `/src/telegram-menu/` - Interactive Telegram UI
- `/src/trading/copy-trading-orchestrator.ts` - Copy trading engine
- `/src/execution/index.ts` - Order execution (EIP-712)
- `/src/feeds/` - 16 market data feeds
- `/src/credentials/index.ts` - AES-256-GCM encrypted storage
- `/src/pairing/index.ts` - Wallet-to-chat linking
- `/src/db/index.ts` - SQLite (17+ tables)

### 25+ Trading Features (Key Skill Categories)
**Trading:** arbitrage, backtest, trading-polymarket, trading-kalshi, trading-manifold, trading-solana, trading-evm, trading-futures, copy-trading, pump-swarm, hyperliquid, drift, jupiter, raydium, orca, meteora

**Analytics:** analytics, portfolio, positions, risk, metrics, signals, whale-tracking

**Automation:** alerts, automation, triggers, webhooks

**Data:** feeds, news, weather, embeddings, market-index, markets

**Infrastructure:** credentials, pairing, execution, routing, mev, sessions

### 16 Market Feeds
Polymarket, Kalshi, Manifold, Metaculus, PredictIt, Drift, Betfair, Smarkets, Opinion, Virtuals, PredictFun, Hedgehog, News, External, Weather

### Telegram Menu System
```
telegram-menu/
├── index.ts              # Orchestrator
├── types.ts              # MenuState, MenuResult
├── menus/
│   ├── main.ts           # Main menu
│   ├── portfolio.ts      # Positions view
│   ├── orders.ts         # Open orders
│   ├── wallet.ts         # Balance
│   ├── markets.ts        # Search
│   ├── copy-trading.ts   # Copy config
│   └── order-wizard.ts   # Size → Price → Execute
└── utils/
    ├── keyboard.ts       # Button builders
    └── format.ts         # Text formatting
```

**Callback Protocol (64-byte limit):**
```
menu:main, menu:portfolio, menu:orders, menu:wallet
search:query:page, market:marketId
buy:tokenId, sell:tokenId
order:size:tid:100, order:price:tid:0.5, order:exec:tid
copy:add, copy:toggle:cfgId, refresh
```

### Order Execution (Polymarket)
```typescript
// EIP-712 signed order
{
  order: {
    salt, maker, signer, taker, tokenId,
    makerAmount, takerAmount, expiration, nonce,
    feeRateBps, side, signatureType, signature
  },
  owner: apiKey,
  orderType: 'GTC' | 'GTD' | 'FOK'
}
```

### Credentials Encryption
- Algorithm: AES-256-GCM
- Per-credential salt (16 bytes) + IV (12 bytes)
- Format: `v2:salt:iv:authTag:encryptedData`
- Cooldown tracking with exponential backoff

### Copy Trading Orchestrator
```typescript
interface CopyTradingConfigRecord {
  userWallet, targetWallet, targetLabel
  enabled, dryRun
  sizingMode: 'fixed' | 'proportional' | 'percentage'
  fixedSize, proportionMultiplier, portfolioPercentage
  maxPositionSize, minTradeSize, copyDelayMs, maxSlippage
  stopLoss, takeProfit
  totalTrades, totalPnl
}
```

### Database Tables
users, sessions, alerts, positions, portfolio_snapshots, markets, market_index, trading_credentials, copy_trading_configs, copy_trades, pairing_requests, paired_users, wallet_pairing_codes, wallet_links, hyperliquid_*, binance_futures_*, bybit_futures_*

### AI/LLM Integration
- Primary: Claude (Opus 4.5, Sonnet 4, Haiku 3.5)
- Fallback: GPT-4, Gemini, Groq, Together, Ollama
- Adaptive selection: cost/speed/quality strategies
- Circuit breaker failover

---

## 5. openclaw-sidex-kit-main (Multi-Exchange)

**Location:** `/openclaw-sidex-kit-main/`

**Purpose:** Universal execution layer with Survival Mode

### Key Files
- `/core/survival/SurvivalManager.js` - Health-based state machine
- `/core/x402/X402Client.js` - Auto-payment negotiation
- `/core/x402/WalletManager.js` - viem-based EVM wallet
- `/pipelines/` - Exchange-specific adapters

### Supported Exchanges
| Exchange | Type | Auth |
|----------|------|------|
| Hyperliquid | DEX Perps | Private key |
| Binance | CEX Futures | HMAC-SHA256 |
| Bybit | CEX Unified | HMAC headers |
| Jupiter/Solana | DEX Spot | Solana key |
| Uniswap V3 | EVM DEX | viem signing |

### SURVIVAL MODE
```javascript
Health Ratio = currentBalance / initialBalance

≥ 120% → GROWTH:     X402 unlocked, aggressive mode
85-120% → SURVIVAL:  Normal operations
50-85%  → DEFENSIVE: Costs frozen, conservative only
< 50%   → CRITICAL:  Process exits (preserves capital)
```

### X402 Auto-Payment
```javascript
const response = await x402Client.fetch(paidServiceUrl);
// Automatically handles:
// 1. 402 Payment Required response
// 2. Parse payment address/amount from headers/body
// 3. Sign and send USDC payment on Base
// 4. Retry request with X-Payment-Hash proof
```

### Chains Supported
Base (default), Polygon, Arbitrum, custom RPC

### Execution Pattern
```bash
# Same pattern across all exchanges
node pipelines/binance/scripts/trade.mjs \
  --symbol="BTCUSDT" --side="buy" --amount="0.01" \
  --leverage="10" --api_key="..." --api_secret="..."
```

---

## 6. trading-orchestrator (Coordination Hub)

**Location:** `/trading-orchestrator/`

**Purpose:** Central coordination of all services

### Key Files
- `/src/orchestrator/AgentOrchestrator.ts` - Lifecycle, signals, kill switch
- `/src/orchestrator/PermissionManager.ts` - Wallet permissions
- `/src/orchestrator/StrategyRegistry.ts` - Strategy management
- `/src/adapters/` - 6 service adapters

### Adapters
| Adapter | Service | Purpose |
|---------|---------|---------|
| AgentDexAdapter | agent-dex | Solana DEX trading |
| OpenClawAdapter | openclaw | Multi-exchange + survival |
| CloddsBotAdapter | CloddsBot | Risk routing, arbitrage |
| OpusXAdapter | OpusX | Whale signals, AI analysis |
| OsintMarketAdapter | OSINT | Bounties, intelligence |
| ClawdnetAdapter | clawdnet | A2A network |

### Kill Switch Implementation
```typescript
async killAgent(agentId) {
  1. Set status = Stopped
  2. Close all positions (Solana via AgentDex, Futures via OpenClaw)
  3. Clear position records
  4. Revoke wallet permissions
  return { positionsClosed, fundsReturned, errors }
}
```

### Signal Flow
```
Signal arrives (Whale, AI, OSINT, Arbitrage)
  → AgentOrchestrator.processSignals()
  → Strategy.evaluate(signals) → TradeIntent
  → PermissionManager.checkPermission()
  → Route to adapter → Execute
  → recordExecution() → Update P&L
```

---

## 7. trading-frontend (Dashboard)

**Location:** `/trading-frontend/`

**Purpose:** Next.js web interface

### Tech Stack
- Next.js 15, React 19, Tailwind 4
- Framer Motion, Socket.io
- Solana wallet adapters

### Key Pages (25 total)
| Page | Status | Features |
|------|--------|----------|
| Dashboard | REAL | Metrics, agents, signals |
| Copy Trading | REAL | Full CRUD, history |
| Arbitrage | REAL | Live opps, 5s refresh |
| Risk | REAL | VaR, circuit breaker, kill switch |
| Backtest | REAL | Strategy testing |
| Leaderboard | REAL | Rankings, badges |
| Bounties | REAL | OSINT board |

### API Client
- Location: `/src/lib/api.ts`
- 1600+ endpoints
- Wallet signature authentication
- WebSocket for real-time updates

---

## Complete Feature Matrix

### Markets & Exchanges
| Category | Platforms |
|----------|-----------|
| Prediction | Polymarket, Kalshi, Manifold, Metaculus, PredictIt, Betfair, Smarkets |
| Solana DEX | Jupiter, Raydium, Orca, Meteora, Pump.fun |
| EVM DEX | Uniswap, 1inch |
| Perpetuals | Binance 125x, Bybit 100x, Hyperliquid 50x, Drift, MEXC 200x |

### Unique Capabilities
1. **Survival Mode** - Adaptive risk based on P&L health
2. **X402 Protocol** - Agents pay each other autonomously
3. **25+ Trading Features** - Comprehensive feature set
4. **A2A Network** - Agent discovery and collaboration
5. **ERC-8004** - On-chain agent identity
6. **Copy Trading** - Real-time whale replication
7. **Cross-Platform Arbitrage** - 8+ market detection

---

## Environment Variables

```env
# CloddsBot
TELEGRAM_BOT_TOKEN=
DATABASE_PATH=./data/bot.db
ENCRYPTION_KEY=              # 32-byte hex

# Polymarket CLOB
POLY_ADDRESS=
POLY_PRIVATE_KEY=
POLY_API_KEY=
POLY_API_SECRET=
POLY_API_PASSPHRASE=

# AI
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# OpenClaw
EVM_PRIVATE_KEY=             # For X402 payments
EVM_RPC_URL=https://mainnet.base.org

# Exchanges (optional)
HYPERLIQUID_PRIVATE_KEY=
BINANCE_API_KEY=
BINANCE_SECRET_KEY=
BYBIT_API_KEY=
BYBIT_SECRET_KEY=
```

---

## Quick Start

```bash
# CloddsBot (port 3001)
cd CloddsBot-main && pnpm install && pnpm dev

# Frontend (port 3000)
cd trading-frontend && pnpm install && pnpm dev

# Agent DEX API (port 3001)
cd agent-dex-main/api && pnpm install && pnpm dev

# Trading Orchestrator (port 4000)
cd trading-orchestrator && pnpm install && pnpm dev
```

---

## User Trading Flow

### Web Dashboard Flow
```
1. Connect Wallet → Solana adapter (Phantom, Solflare, etc.)
2. View AI Suggestions → AIReasoning panel streams via WebSocket
3. Analyze Token → Click "Analyze with AI" in SwapWidget
4. Execute Trade → Jupiter V6 swap, sign in wallet
```

**Key Files:**
- `trading-frontend/src/components/trading/SwapWidget.tsx` - Trading UI with AI analysis
- `trading-frontend/src/app/api/ai-analysis/route.ts` - On-demand AI analysis API
- `trading-frontend/src/lib/useTokenAnalysis.ts` - React hook for AI analysis
- `trading-frontend/src/components/trading/AIReasoning.tsx` - Streaming AI display

### Telegram Flow
```
1. Pair Wallet → /start → Enter 8-char code in web app
2. Find Trades → /findtrades → AI scans 500+ markets
3. Quick Buy → Tap "BUY $50" → Instant execution
4. Order Wizard → Select market → Size → Price → Execute
```

**Key Files:**
- `CloddsBot-main/src/telegram-menu/menus/find-trades.ts` - AI trade discovery
- `CloddsBot-main/src/telegram-menu/menus/order-wizard.ts` - Multi-step orders
- `CloddsBot-main/src/pairing/index.ts` - Wallet pairing
- `CloddsBot-main/src/execution/index.ts` - EIP-712 order execution

### Execution Platforms
| Platform | Web Dashboard | Telegram |
|----------|--------------|----------|
| Solana (Jupiter) | ✅ Full | ❌ |
| Polymarket | ❌ | ✅ Full |
| Kalshi | ❌ | ✅ Partial |

---

## Adding New Features

### New Telegram Menu
```typescript
// src/telegram-menu/menus/your-menu.ts
export async function yourMenuHandler(ctx: MenuContext, params: string[]): Promise<MenuResult> {
  return {
    text: '**Your Menu**\n\nContent...',
    buttons: [[btn('Action', 'your:action')], [mainMenuButton()]],
  };
}

// Register in src/telegram-menu/index.ts
case 'your': return yourMenuHandler;
```

### New Skill
```typescript
// src/skills/bundled/your-skill/index.ts
export default createSkill({
  name: 'your-skill',
  description: 'What it does',
  handler: async (ctx, params) => ({ content: 'Response' }),
});
```

### New Feed
```typescript
// src/feeds/your-platform/index.ts
export function createYourPlatformFeed(): Feed {
  return {
    platform: 'your-platform',
    async getMarkets(options) { ... },
    async searchMarkets(query) { ... },
  };
}
```

### New Orchestrator Adapter
```typescript
// trading-orchestrator/src/adapters/YourAdapter.ts
export class YourAdapter {
  constructor(config: { baseUrl: string }) { ... }
  async execute(intent: TradeIntent) { ... }
}
```

---

## Troubleshooting

### TypeScript Errors
```bash
pnpm tsc --noEmit  # See all errors
# Most are in Solana files (optional deps)
```

### Telegram Not Responding
- Check TELEGRAM_BOT_TOKEN
- Check /src/channels/telegram/index.ts

### Orders Not Executing
- Verify credentials in DB
- Check POLY_* env vars
- Test with dryRun: true

### Survival Mode Not Triggering
- Check initial balance set correctly
- Verify balance updates calling updateVitalSigns()

---

## Architecture Decisions

1. **SQLite over Postgres** - Simpler deployment, sufficient for single-node
2. **EIP-712 signing** - Standard for Polymarket CLOB
3. **AES-256-GCM** - Authenticated encryption for credentials
4. **viem over ethers** - Modern, tree-shakeable, better types
5. **Circuit breaker** - Prevent cascade failures in model calls
6. **Adapter pattern** - Loose coupling between orchestrator and services


##my updates: 
  ---                                                                                      
  What You Actually Built                                                                  
  Repo: agent-dex-main                                                                     
  What It Is: Solana DEX API for AI agents                                                 
  Lines of Real Code: ~1,500                                                               
  Status: REAL ✅                                                                          
  ────────────────────────────────────────                                                 
  Repo: AgentHub-Repo                                                                      
  What It Is: Orchestration core + type system                                             
  Lines of Real Code: ~7,500 compiled                                                      
  Status: REAL ✅                                                                          
  ────────────────────────────────────────                                                 
  Repo: clawdnet-main                                                                      
  What It Is: A2A protocol + X402 payments                                                 
  Lines of Real Code: Docs + Contracts                                                     
  Status: REAL ✅                                                                          
  ────────────────────────────────────────                                                 
  Repo: CloddsBot-main
  What It Is: 25+ feature trading terminal
  Lines of Real Code: ~50,000+                                                             
  Status: REAL ✅                                                                          
  ────────────────────────────────────────                                                 
  Repo: openclaw-sidex-kit                                                                 
  What It Is: Multi-exchange + Survival Mode                                               
  Lines of Real Code: ~1,500                                                               
  Status: REAL ✅                                                                          
  ────────────────────────────────────────                                                 
  Repo: trading-orchestrator                                                               
  What It Is: Central coordination hub                                                     
  Lines of Real Code: ~3,500                                                               
  Status: REAL ✅                                                                          
  ────────────────────────────────────────                                                 
  Repo: trading-frontend                                                                   
  What It Is: Next.js dashboard                                                            
  Lines of Real Code: ~15,000+                                                             
  Status: REAL ✅                                                                          
  Total: ~80,000+ lines of actual, working code across 7 integrated projects.              
                   