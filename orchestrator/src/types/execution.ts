/**
 * Execution Result Type Definitions
 */

export interface ExecutionResult {
    intentId: string;
    success: boolean;

    txHash?: string;
    orderId?: string;

    executedAmount: number;
    executedPrice: number;
    fees: number;

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

export interface Position {
    id: string;
    agentId: string;
    token: string;
    amount: number;
    entryPrice: number;
    currentPrice: number;
    unrealizedPnL: number;
    stopLoss?: number;
    takeProfit?: number;
    openedAt: number;
}
