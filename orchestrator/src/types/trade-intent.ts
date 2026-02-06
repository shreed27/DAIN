/**
 * Trade Intent Type Definitions
 */

import { MarketType } from './strategy';

export interface TradeIntent {
    id: string;
    agentId: string;
    strategyId: string;

    action: TradeAction;
    market: MarketType;
    asset: string;
    amount: number;

    constraints: TradeConstraints;
    reasoning: string;

    status: IntentStatus;
    createdAt: number;
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
