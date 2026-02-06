/**
 * Signal Type Definitions
 */

export interface Signal {
    id: string;
    source: SignalSource;
    type: string;
    data: any;
    confidence: number;             // 0-100
    timestamp: number;
    expiresAt?: number;             // Optional expiration
    metadata?: Record<string, any>;
}

export enum SignalSource {
    OSINT = 'osint',
    Whale = 'whale',
    AI = 'ai',
    Arbitrage = 'arbitrage',
    Social = 'social',
    OnChain = 'onchain'
}

export interface WhaleSignal extends Signal {
    source: SignalSource.Whale;
    data: {
        walletAddress: string;
        token: string;
        action: 'buy' | 'sell';
        amount: number;
        price: number;
        marketCap: number;
    };
}

export interface AISignal extends Signal {
    source: SignalSource.AI;
    data: {
        token: string;
        recommendation: 'strong_buy' | 'buy' | 'watch' | 'avoid';
        reasoning: string;
        metrics: {
            liquidity: number;
            holders: number;
            momentum: number;
            trustScore: number;
        };
    };
}

export interface OsintSignal extends Signal {
    source: SignalSource.OSINT;
    data: {
        question: string;
        answer: string;
        evidence: string[];
        bountyId: string;
    };
}

export interface ArbitrageSignal extends Signal {
    source: SignalSource.Arbitrage;
    data: {
        token: string;
        opportunity: {
            buyPlatform: string;
            buyPrice: number;
            sellPlatform: string;
            sellPrice: number;
            profitPercent: number;
        };
    };
}
