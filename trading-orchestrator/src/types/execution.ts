/**
 * Execution Result Type Definitions
 */

export type TradeSide = 'buy' | 'sell';

export interface ExecutionResult {
    intentId: string;
    success: boolean;

    txHash?: string;
    orderId?: string;

    executedAmount: number;
    executedPrice: number;
    fees: number;

    side: TradeSide;                // Whether this was a buy or sell
    token: string;                  // The token being traded

    slippage?: number;              // Actual slippage in BPS
    executionTime?: number;         // Milliseconds

    error?: string;
    timestamp: number;
}

export interface ExecutionRoute {
    executor: string;               // 'agent-dex' | 'cloddsbot'
    path: string[];                 // Routing path (e.g., ['SOL', 'USDC', 'TOKEN'])
    estimatedSlippage: number;      // BPS
    estimatedTime: number;          // Seconds
    estimatedFees: number;          // USD
}

export type Exchange = 'solana' | 'jupiter' | 'binance' | 'bybit' | 'hyperliquid';

export interface Position {
    id: string;
    agentId: string;
    token: string;
    symbol: string;                 // Trading pair symbol (e.g., 'SOL/USDC')
    amount: number;
    entryPrice: number;
    currentPrice: number;
    unrealizedPnL: number;
    stopLoss?: number;
    takeProfit?: number;
    openedAt: number;
    exchange: Exchange;             // Which exchange this position is on
    tokenMint?: string;             // Solana token mint address (for DEX positions)
}
