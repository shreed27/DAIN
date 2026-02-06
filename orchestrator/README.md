# Trading Orchestrator

Autonomous trading agent orchestration layer for the Collesium trading platform.

## Overview

This component provides the integration layer that coordinates:
- Agent lifecycle management (via OpenClaw runtime)
- Signal aggregation (from OSINT, whale tracking, AI analysis)
- User-defined trading strategies with risk controls
- Smart routing (via opus-x)
- Execution (via agent-dex and CloddsBot)
- Agent networking (via clawdnet)

## Architecture

```
USER (Wallet + Permissions)
    ↓
ORCHESTRATOR
    ↓
┌───────────────┬───────────────┬───────────────┐
│ AGENT RUNTIME │ SIGNAL NETWORK│ DECISION LAYER│
│  (OpenClaw)   │  (ClawdNet)   │ (Custom Logic)│
└───────────────┴───────────────┴───────────────┘
    ↓
INTELLIGENCE (OSINT + Opus-X + CloddsBot)
    ↓
EXECUTION (agent-dex + CloddsBot)
    ↓
BLOCKCHAIN (Solana, Base, etc.)
```

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required environment variables:
- `PORT` - API server port (default: 4000)
- `OSINT_MARKET_URL` - OSINT market API URL
- `AGENT_DEX_URL` - Agent DEX API URL
- `CLODDSBOT_URL` - CloddsBot API URL
- `OPUS_X_URL` - Opus-X API URL
- `SOLANA_RPC_URL` - Solana RPC endpoint

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run tests
npm test

# Run integration tests
npm run test:integration
```

## Project Structure

```
src/
├── orchestrator/          # Core orchestration logic
│   ├── AgentOrchestrator.ts
│   ├── PermissionManager.ts
│   └── StrategyRegistry.ts
├── decision-layer/        # Trading decision logic
│   ├── TradingStrategy.ts
│   ├── SignalAggregator.ts
│   ├── RiskValidator.ts
│   └── strategies/
├── adapters/              # External service adapters
│   ├── OsintAdapter.ts
│   ├── OpusXAdapter.ts
│   ├── AgentDexAdapter.ts
│   ├── CloddsBotAdapter.ts
│   └── ClawdnetAdapter.ts
├── api/                   # REST API
│   ├── routes/
│   └── server.ts
└── types/                 # TypeScript definitions
```

## Usage

### Creating an Agent

```typescript
import { orchestrator, strategyRegistry } from './src';

// Register a strategy
const strategy = new MyTradingStrategy();
strategyRegistry.register(strategy);

// Create agent
const agent = await orchestrator.createAgent({
  userId: 'user_123',
  strategyId: strategy.id,
  walletAddress: '7G7co8fLDdddRNbFwPWH9gots93qB4EXPwBoshd3x2va',
  permissions: {
    allowedActions: ['swap', 'place_order'],
    limits: {
      maxTransactionValue: 1000,
      dailyLimit: 2000,
      weeklyLimit: 10000,
      requiresApproval: false
    },
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
  }
});
```

### Processing Signals

```typescript
// Process signals for an agent
const signals = [
  {
    id: 'sig_1',
    source: 'whale',
    type: 'buy_detected',
    data: { token: 'SOL', amount: 1000 },
    confidence: 85,
    timestamp: Date.now()
  }
];

const intent = await orchestrator.processSignals(agent.id, signals);
```

### Kill Switch

```typescript
// Emergency stop
const result = await orchestrator.killAgent(agent.id);
console.log(`Closed ${result.positionsClosed} positions, returned ${result.fundsReturned} USD`);
```

## Security

- **No Private Key Access**: Agents never access private keys
- **Explicit Permissions**: All trades require wallet permission
- **Risk Limits**: Position size, daily loss, and position count limits
- **Kill Switch**: Immediate halt and position closure

## API Endpoints

See [API Documentation](./docs/API.md) for full endpoint reference.

### Quick Reference

- `POST /api/agents` - Create agent
- `GET /api/agents/:id` - Get agent status
- `POST /api/agents/:id/kill` - Emergency stop
- `POST /api/strategies` - Create strategy
- `POST /api/permissions` - Grant permission

## License

MIT
