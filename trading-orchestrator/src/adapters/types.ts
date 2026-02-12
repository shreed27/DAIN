// Shared types for adapters

export interface AdapterConfig {
  baseUrl: string;
  timeout?: number;
  apiKey?: string;
}

export interface AdapterHealth {
  healthy: boolean;
  latencyMs?: number;
  latency?: number;  // Alias for latencyMs
  lastChecked: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

// CloddsBot Types
export interface CloddsBotQuote {
  platform: string;
  price: number;
  availableSize: number;
  estimatedFees: number;
  netPrice: number;
  slippage: number;
  isMaker: boolean;
}

export interface CloddsBotRoutingResult {
  bestRoute: CloddsBotQuote;
  allRoutes: CloddsBotQuote[];
  totalSavings: number;
  recommendation: string;
}

export interface CloddsBotRiskDecision {
  approved: boolean;
  adjustedSize?: number;
  maxSize?: number;
  reason?: string;
  warnings: string[];
  regime: 'low' | 'elevated' | 'high' | 'extreme';
}

// AgentDex Types
export interface AgentDexQuote {
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  priceImpact: string;
  slippageBps: number;
  routePlan: Array<{
    protocol: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    percent: number;
  }>;
}

export interface AgentDexSwapResult {
  txSignature: string;
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  outAmount?: string;  // Alias for compatibility
  priceImpact: string;
  explorerUrl: string;
  fees?: number;
}

export interface AgentDexPortfolio {
  solBalance: number;
  solUsdValue: number | null;
  tokens: Array<{
    mint: string;
    symbol: string;
    balance: number;
    usdValue: number | null;
  }>;
  totalUsdValue: number | null;
}

// OpusX Types
export interface GodWallet {
  address: string;
  label: string;
  trustScore: number;
  totalTrades: number;
  winRate: number;
  recentBuys: GodWalletBuy[];
}

export interface GodWalletBuy {
  tokenMint: string;
  tokenSymbol: string;
  entryPrice: number;
  entryMarketCap: number;
  marketCap?: number;
  amount: number;
  timestamp: number;
  txSignature: string;
  walletAddress?: string;
  walletLabel?: string;
  walletConfidence?: number;
}

// Note: WhaleSignal is defined in ../types/signal.ts
// This is the internal adapter version for OpusX data
export interface OpusXWhaleSignal {
  walletAddress: string;
  walletLabel?: string;
  token: string;
  tokenSymbol?: string;
  action: 'buy' | 'sell';
  amount: number;
  price: number;
  marketCap?: number;
  confidence: number;
}

// OpenClaw Types
export interface OpenClawTradeParams {
  symbol: string;
  side: 'buy' | 'sell';
  amount?: string;
  size?: number;
  price?: number;
  leverage?: number;
  exchange: 'hyperliquid' | 'binance' | 'bybit' | 'jupiter' | 'uniswap' | 'drift';
}

export interface OpenClawTradeResult {
  success: boolean;
  orderId?: string;
  txSignature?: string;
  executedPrice?: number;
  executedAmount?: number;
  fees?: number;
  error?: string;
}

export type SurvivalMode = 'growth' | 'survival' | 'defensive' | 'critical';

export interface SurvivalStatus {
  mode: SurvivalMode;
  pnlPercent: number;
  startBalance: number;
  currentBalance: number;
  x402BudgetUnlocked: boolean;
  // Extended survival parameters
  riskParams?: {
    maxPositionSizePercent?: number;
    maxLeverage?: number;
    stopLossPercent?: number;
  };
  canOpenPosition?: boolean;
  maxPositionSize?: number;
  maxLeverage?: number;
}

// OsintMarket Types
export interface OsintBounty {
  id: string;
  question: string;
  description?: string;
  reward: {
    token: 'SOL' | 'USDC';
    amount: number;
  };
  status: 'open' | 'claimed' | 'submitted' | 'resolved' | 'expired' | 'disputed';
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  deadline: number;
  posterWallet: string;
  claimedBy?: string;
  claimedAt?: number;
}

export interface OsintSubmission {
  bountyId: string;
  answer: string;
  evidence: Array<{
    type: 'url' | 'text' | 'image';
    content: string;
    description?: string;
  }>;
  methodology: string;
  confidence: number;
}

export interface OsintResolution {
  bountyId: string;
  status: 'approved' | 'rejected';
  reasoning: string;
  payoutPercent: number;
  paymentTx?: string;
}

// Clawdnet Types
export interface ClawdnetAgent {
  id: string;
  handle: string;
  name: string;
  description: string;
  endpoint: string;
  capabilities: string[];
  skills: Array<{
    id: string;
    price: string;
  }>;
  reputationScore: number;
  reputation?: number;  // Alias
  status: 'online' | 'busy' | 'offline' | 'pending';
  trustLevel: 'open' | 'directory' | 'allowlist' | 'private';
}

export interface A2AMessage {
  version: string;
  id: string;
  timestamp: string;
  from: {
    id: string;
    handle: string;
    endpoint: string;
  };
  to: {
    id: string;
    handle: string;
  };
  type: 'request' | 'response';
  skill: string;
  payload: Record<string, unknown>;
  payment?: {
    maxAmount?: string;
    amount?: string;
    currency: string;
    txHash?: string;
  };
  signature?: string;
}

export interface X402PaymentRequest {
  amount: string;
  currency: string;
  asset?: string;  // Alias for currency
  recipientAddress: string;
  chain: string;
  invoiceId?: string;
}
