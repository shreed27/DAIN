/**
 * Trade Intent Type Definitions
 */

import { MarketType } from './strategy';

export interface TradeIntent {
    id?: string;
    agentId?: string;
    strategyId?: string;

    // Core trade parameters
    action?: TradeAction;
    side: 'buy' | 'sell';           // Simplified side
    market?: MarketType;

    // Asset identification
    asset?: string;                  // Legacy field
    token: string;                   // Token symbol or identifier
    symbol?: string;                 // Trading pair symbol (e.g., 'SOL/USDC')
    tokenMint?: string;              // Solana token mint address

    // Size and price
    amount?: number;                 // Legacy field
    size: number;                    // Trade size
    price: number;                   // Target price

    // Exchange routing
    exchange?: string;               // Target exchange (solana, binance, polymarket, etc.)
    leverage?: number;               // For futures trading

    // Prediction market specific
    marketId?: string;               // Prediction market ID
    tokenId?: string;                // Outcome token ID
    outcome?: string;                // Outcome name (Yes/No)

    // Constraints
    constraints?: TradeConstraints;
    slippageBps?: number;            // Max slippage in basis points

    // Metadata
    reasoning?: string;
    status?: IntentStatus;
    createdAt?: number;
    executedAt?: number;
}

export enum TradeAction {
    Buy = 'buy',
    Sell = 'sell',
    Close = 'close',
    PlaceOrder = 'place_order',
    CancelOrder = 'cancel_order'
}

export interface TradeConstraints {
    maxSlippage: number;            // BPS
    timeLimit: number;              // Seconds
    minLiquidity: number;           // USD
    preferredRoute?: string;        // Optional routing hint
    stopLoss?: number;              // Price
    takeProfit?: number;            // Price
}

export enum IntentStatus {
    Pending = 'pending',
    Routing = 'routing',
    Executing = 'executing',
    Completed = 'completed',
    Failed = 'failed',
    Cancelled = 'cancelled'
}
