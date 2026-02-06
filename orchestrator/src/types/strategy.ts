/**
 * Trading Strategy Type Definitions
 */

import type { Signal } from './signal';
import type { TradeIntent } from './trade-intent';

export interface TradingStrategy {
    id: string;
    name: string;
    description: string;
    userId: string;
    createdAt: number;
    updatedAt: number;

    riskLimits: RiskLimits;
    capitalAllocation: CapitalAllocation;

    evaluate(signals: Signal[]): TradeIntent | null;
}

export interface RiskLimits {
    maxPositionSize: number;        // Max USD per position
    maxDailyLoss: number;           // Circuit breaker
    maxOpenPositions: number;       // Concurrent positions
    allowedMarkets: MarketType[];   // DEX, PredictionMarket, Futures
    allowedChains: Chain[];         // Solana, Base, etc.
    stopLossPercent?: number;       // Optional default SL
    takeProfitPercent?: number;     // Optional default TP
}

export interface CapitalAllocation {
    totalCapital: number;           // Total USD allocated
    perTradePercent: number;        // % of capital per trade
    reservePercent: number;         // % kept in reserve
    currentlyAllocated: number;     // USD in open positions
}

export enum MarketType {
    DEX = 'dex',
    PredictionMarket = 'prediction',
    Futures = 'futures'
}

export enum Chain {
    Solana = 'solana',
    Base = 'base',
    Ethereum = 'ethereum',
    Arbitrum = 'arbitrum',
    Polygon = 'polygon'
}
