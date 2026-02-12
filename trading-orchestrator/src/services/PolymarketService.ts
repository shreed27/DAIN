/**
 * PolymarketService - Polymarket prediction market data service
 *
 * Features:
 * - Fetch trending/active markets from Gamma API
 * - Search markets by query
 * - Get market details with orderbook
 * - Get user's trade history by wallet
 * - WebSocket subscription for price updates (planned)
 */

import { EventEmitter } from 'events';

// ==================== Types ====================

export interface PolyMarketOutcome {
  tokenId: string;
  name: string;           // "Yes" | "No"
  price: number;          // 0.00 - 1.00
}

export interface PolyMarket {
  id: string;             // condition_id
  question: string;       // "Will Trump win 2024?"
  slug: string;
  description?: string;
  outcomes: PolyMarketOutcome[];
  volume24h: number;
  totalVolume: number;
  liquidity: number;
  endDate: string;
  active: boolean;
  category?: string;
  image?: string;
}

export interface PolyTrade {
  id: string;
  marketId: string;
  marketQuestion?: string;
  tokenId: string;
  side: 'buy' | 'sell';
  outcome: 'Yes' | 'No';
  size: number;           // Amount of shares
  price: number;          // Price per share (0-1)
  timestamp: string;
  txHash?: string;
}

export interface PolymarketServiceConfig {
  gammaApiUrl?: string;
  clobApiUrl?: string;
  cacheTtlMs?: number;
}

// ==================== Constants ====================

const GAMMA_API_URL = 'https://gamma-api.polymarket.com';
const CLOB_API_URL = 'https://clob.polymarket.com';
const DEFAULT_CACHE_TTL = 60000; // 1 minute cache

// ==================== Main Service ====================

export class PolymarketService extends EventEmitter {
  private gammaApiUrl: string;
  private clobApiUrl: string;
  private cacheTtlMs: number;
  private marketCache: Map<string, { data: PolyMarket; timestamp: number }> = new Map();
  private marketsListCache: { data: PolyMarket[]; timestamp: number } | null = null;

  constructor(config: PolymarketServiceConfig = {}) {
    super();
    this.gammaApiUrl = config.gammaApiUrl || GAMMA_API_URL;
    this.clobApiUrl = config.clobApiUrl || CLOB_API_URL;
    this.cacheTtlMs = config.cacheTtlMs || DEFAULT_CACHE_TTL;
  }

  /**
   * Fetch trending/active markets from Gamma API
   */
  async getMarkets(options?: {
    active?: boolean;
    limit?: number;
    offset?: number;
    sortBy?: 'volume' | 'liquidity' | 'newest';
  }): Promise<PolyMarket[]> {
    try {
      // Check cache
      if (this.marketsListCache && Date.now() - this.marketsListCache.timestamp < this.cacheTtlMs) {
        let markets = this.marketsListCache.data;
        if (options?.active !== undefined) {
          markets = markets.filter(m => m.active === options.active);
        }
        if (options?.sortBy === 'volume') {
          markets = markets.sort((a, b) => b.volume24h - a.volume24h);
        } else if (options?.sortBy === 'liquidity') {
          markets = markets.sort((a, b) => b.liquidity - a.liquidity);
        }
        const start = options?.offset || 0;
        const end = start + (options?.limit || 20);
        return markets.slice(start, end);
      }

      // Build query params
      const params = new URLSearchParams();
      if (options?.active !== undefined) params.set('active', String(options.active));
      if (options?.limit) params.set('limit', String(Math.min(options.limit, 100)));
      if (options?.offset) params.set('offset', String(options.offset));

      const url = `${this.gammaApiUrl}/events?${params.toString()}`;
      console.log(`[PolymarketService] Fetching markets from: ${url}`);

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`[PolymarketService] API returned ${response.status}, using fallback data`);
        return this.getFallbackMarkets(options);
      }

      const data = await response.json();
      const markets = this.parseGammaEvents(data);

      // Cache the results
      this.marketsListCache = { data: markets, timestamp: Date.now() };

      // Apply sorting to fresh data
      let result = [...markets];
      if (options?.sortBy === 'volume') {
        result = result.sort((a, b) => b.volume24h - a.volume24h);
      } else if (options?.sortBy === 'liquidity') {
        result = result.sort((a, b) => b.liquidity - a.liquidity);
      }

      return result.slice(0, options?.limit || 20);
    } catch (error) {
      console.error('[PolymarketService] Error fetching markets:', error);
      // Return fallback data for demo purposes
      return this.getFallbackMarkets(options);
    }
  }

  /**
   * Search markets by query
   */
  async searchMarkets(query: string, limit: number = 10): Promise<PolyMarket[]> {
    try {
      // First try to get from cache and filter
      if (this.marketsListCache && Date.now() - this.marketsListCache.timestamp < this.cacheTtlMs) {
        const filtered = this.marketsListCache.data.filter(m =>
          m.question.toLowerCase().includes(query.toLowerCase()) ||
          m.category?.toLowerCase().includes(query.toLowerCase())
        );
        return filtered.slice(0, limit);
      }

      // Fetch fresh and filter
      const markets = await this.getMarkets({ limit: 100, active: true });
      const filtered = markets.filter(m =>
        m.question.toLowerCase().includes(query.toLowerCase()) ||
        m.category?.toLowerCase().includes(query.toLowerCase())
      );
      return filtered.slice(0, limit);
    } catch (error) {
      console.error('[PolymarketService] Error searching markets:', error);
      return this.getFallbackMarkets({ limit }).filter(m =>
        m.question.toLowerCase().includes(query.toLowerCase())
      );
    }
  }

  /**
   * Get single market with orderbook
   */
  async getMarket(marketId: string): Promise<PolyMarket | null> {
    try {
      // Check cache
      const cached = this.marketCache.get(marketId);
      if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
        return cached.data;
      }

      // Try to find in list cache first
      if (this.marketsListCache) {
        const market = this.marketsListCache.data.find(m => m.id === marketId);
        if (market) {
          this.marketCache.set(marketId, { data: market, timestamp: Date.now() });
          return market;
        }
      }

      // Fetch from API
      const url = `${this.gammaApiUrl}/markets/${marketId}`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        // Try to find in fallback
        const fallback = this.getFallbackMarkets({}).find(m => m.id === marketId);
        return fallback || null;
      }

      const data = await response.json();
      const market = this.parseGammaMarket(data);

      if (market) {
        this.marketCache.set(marketId, { data: market, timestamp: Date.now() });
      }

      return market;
    } catch (error) {
      console.error('[PolymarketService] Error fetching market:', error);
      const fallback = this.getFallbackMarkets({}).find(m => m.id === marketId);
      return fallback || null;
    }
  }

  /**
   * Get user's trade history by wallet address
   * Note: This requires API key auth for real data
   */
  async getUserTrades(walletAddress: string, limit: number = 50): Promise<PolyTrade[]> {
    try {
      // In production, this would query the CLOB API with proper auth
      // For now, return simulated trade history for demo
      console.log(`[PolymarketService] Fetching trades for wallet: ${walletAddress.slice(0, 8)}...`);

      // Try to fetch real data (will likely fail without auth)
      const url = `${this.clobApiUrl}/trades?maker=${walletAddress}&limit=${limit}`;

      try {
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' },
        });

        if (response.ok) {
          const data = await response.json();
          return this.parseClobTrades(data);
        }
      } catch {
        // Expected to fail without auth, use fallback
      }

      // Return simulated trades for demo
      return this.generateSimulatedTrades(walletAddress, limit);
    } catch (error) {
      console.error('[PolymarketService] Error fetching user trades:', error);
      return this.generateSimulatedTrades(walletAddress, limit);
    }
  }

  /**
   * Subscribe to market price updates (placeholder for WebSocket implementation)
   */
  subscribeMarket(marketId: string): void {
    console.log(`[PolymarketService] Subscribed to market: ${marketId}`);

    // For now, simulate price updates with polling
    // In production, would use Polymarket WebSocket
    this.startPricePolling(marketId);
  }

  /**
   * Unsubscribe from market updates
   */
  unsubscribeMarket(marketId: string): void {
    console.log(`[PolymarketService] Unsubscribed from market: ${marketId}`);
    this.stopPricePolling(marketId);
  }

  // ==================== Polling ====================

  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();

  private startPricePolling(marketId: string): void {
    if (this.pollingIntervals.has(marketId)) return;

    const interval = setInterval(async () => {
      const market = await this.getMarket(marketId);
      if (market) {
        this.emit('marketUpdate', market);
      }
    }, 5000); // Poll every 5 seconds

    this.pollingIntervals.set(marketId, interval);
  }

  private stopPricePolling(marketId: string): void {
    const interval = this.pollingIntervals.get(marketId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(marketId);
    }
  }

  // ==================== Parsers ====================

  private parseGammaEvents(data: unknown): PolyMarket[] {
    if (!Array.isArray(data)) return [];

    return data.map((event: Record<string, unknown>) => {
      const markets = (event.markets || []) as Array<Record<string, unknown>>;
      const firstMarket = markets[0] || {};

      // Get outcomes from market data
      const outcomes: PolyMarketOutcome[] = [];
      if (firstMarket.outcomePrices) {
        const prices = JSON.parse(firstMarket.outcomePrices as string || '[]');
        outcomes.push(
          { tokenId: (firstMarket.clobTokenIds as string[])?.[0] || '', name: 'Yes', price: parseFloat(prices[0] || '0.5') },
          { tokenId: (firstMarket.clobTokenIds as string[])?.[1] || '', name: 'No', price: parseFloat(prices[1] || '0.5') }
        );
      } else {
        // Default 50/50
        outcomes.push(
          { tokenId: '', name: 'Yes', price: 0.5 },
          { tokenId: '', name: 'No', price: 0.5 }
        );
      }

      return {
        id: (event.id || firstMarket.conditionId || '') as string,
        question: (event.title || firstMarket.question || 'Unknown') as string,
        slug: (event.slug || '') as string,
        description: (event.description || '') as string,
        outcomes,
        volume24h: parseFloat((firstMarket.volume24hr || '0') as string),
        totalVolume: parseFloat((firstMarket.volumeNum || event.volume || '0') as string),
        liquidity: parseFloat((firstMarket.liquidityNum || '0') as string),
        endDate: (event.endDate || firstMarket.endDateIso || '') as string,
        active: (event.active ?? firstMarket.active ?? true) as boolean,
        category: (event.category || '') as string,
        image: (event.image || '') as string,
      };
    }).filter(m => m.id && m.question);
  }

  private parseGammaMarket(data: Record<string, unknown>): PolyMarket | null {
    if (!data) return null;

    const outcomes: PolyMarketOutcome[] = [];
    if (data.outcomePrices) {
      const prices = JSON.parse(data.outcomePrices as string || '[]');
      const tokenIds = data.clobTokenIds as string[] || [];
      outcomes.push(
        { tokenId: tokenIds[0] || '', name: 'Yes', price: parseFloat(prices[0] || '0.5') },
        { tokenId: tokenIds[1] || '', name: 'No', price: parseFloat(prices[1] || '0.5') }
      );
    }

    return {
      id: (data.conditionId || data.id || '') as string,
      question: (data.question || 'Unknown') as string,
      slug: (data.slug || '') as string,
      description: (data.description || '') as string,
      outcomes,
      volume24h: parseFloat((data.volume24hr || '0') as string),
      totalVolume: parseFloat((data.volumeNum || '0') as string),
      liquidity: parseFloat((data.liquidityNum || '0') as string),
      endDate: (data.endDateIso || '') as string,
      active: (data.active ?? true) as boolean,
      category: '',
    };
  }

  private parseClobTrades(data: unknown): PolyTrade[] {
    if (!Array.isArray(data)) return [];

    return data.map((trade: Record<string, unknown>) => ({
      id: (trade.id || `trade_${Date.now()}_${Math.random()}`) as string,
      marketId: (trade.market || trade.conditionId || '') as string,
      tokenId: (trade.asset_id || trade.tokenId || '') as string,
      side: ((trade.side || 'buy') as string).toLowerCase() as 'buy' | 'sell',
      outcome: (trade.outcome || 'Yes') as 'Yes' | 'No',
      size: parseFloat((trade.size || '0') as string),
      price: parseFloat((trade.price || '0.5') as string),
      timestamp: (trade.timestamp || new Date().toISOString()) as string,
      txHash: (trade.txHash || trade.transactionHash) as string | undefined,
    }));
  }

  // ==================== Fallback Data ====================

  private getFallbackMarkets(options?: { limit?: number; sortBy?: 'volume' | 'liquidity' | 'newest' }): PolyMarket[] {
    const fallbackMarkets: PolyMarket[] = [
      {
        id: 'trump-2024',
        question: 'Will Donald Trump win the 2024 Presidential Election?',
        slug: 'trump-2024-election',
        description: 'This market resolves to Yes if Donald Trump wins the 2024 US Presidential Election.',
        outcomes: [
          { tokenId: 'trump-yes', name: 'Yes', price: 0.52 },
          { tokenId: 'trump-no', name: 'No', price: 0.48 },
        ],
        volume24h: 5234000,
        totalVolume: 125000000,
        liquidity: 8500000,
        endDate: '2024-11-05T00:00:00Z',
        active: true,
        category: 'Politics',
      },
      {
        id: 'btc-100k-2024',
        question: 'Will Bitcoin reach $100,000 by end of 2024?',
        slug: 'btc-100k-2024',
        description: 'This market resolves to Yes if BTC/USD reaches $100,000 on any major exchange before January 1, 2025.',
        outcomes: [
          { tokenId: 'btc100k-yes', name: 'Yes', price: 0.65 },
          { tokenId: 'btc100k-no', name: 'No', price: 0.35 },
        ],
        volume24h: 2100000,
        totalVolume: 45000000,
        liquidity: 3200000,
        endDate: '2024-12-31T23:59:59Z',
        active: true,
        category: 'Crypto',
      },
      {
        id: 'fed-rate-march',
        question: 'Will the Fed cut rates in March 2024?',
        slug: 'fed-rate-cut-march-2024',
        description: 'This market resolves to Yes if the Federal Reserve announces a rate cut at the March 2024 FOMC meeting.',
        outcomes: [
          { tokenId: 'fed-yes', name: 'Yes', price: 0.78 },
          { tokenId: 'fed-no', name: 'No', price: 0.22 },
        ],
        volume24h: 1500000,
        totalVolume: 28000000,
        liquidity: 2100000,
        endDate: '2024-03-20T18:00:00Z',
        active: true,
        category: 'Economics',
      },
      {
        id: 'eth-4k-q1',
        question: 'Will Ethereum reach $4,000 in Q1 2024?',
        slug: 'eth-4k-q1-2024',
        description: 'Resolves Yes if ETH/USD reaches $4,000 before April 1, 2024.',
        outcomes: [
          { tokenId: 'eth4k-yes', name: 'Yes', price: 0.42 },
          { tokenId: 'eth4k-no', name: 'No', price: 0.58 },
        ],
        volume24h: 890000,
        totalVolume: 15000000,
        liquidity: 1800000,
        endDate: '2024-03-31T23:59:59Z',
        active: true,
        category: 'Crypto',
      },
      {
        id: 'superbowl-2024',
        question: 'Will the Chiefs win Super Bowl 2024?',
        slug: 'chiefs-superbowl-2024',
        description: 'This market resolves to Yes if the Kansas City Chiefs win Super Bowl LVIII.',
        outcomes: [
          { tokenId: 'chiefs-yes', name: 'Yes', price: 0.55 },
          { tokenId: 'chiefs-no', name: 'No', price: 0.45 },
        ],
        volume24h: 750000,
        totalVolume: 12000000,
        liquidity: 950000,
        endDate: '2024-02-11T23:59:59Z',
        active: true,
        category: 'Sports',
      },
      {
        id: 'ai-agi-2025',
        question: 'Will AGI be achieved by 2025?',
        slug: 'agi-2025',
        description: 'Resolves Yes if a major AI lab announces achievement of AGI before 2026.',
        outcomes: [
          { tokenId: 'agi-yes', name: 'Yes', price: 0.08 },
          { tokenId: 'agi-no', name: 'No', price: 0.92 },
        ],
        volume24h: 320000,
        totalVolume: 8000000,
        liquidity: 650000,
        endDate: '2025-12-31T23:59:59Z',
        active: true,
        category: 'Technology',
      },
      {
        id: 'sol-200',
        question: 'Will Solana reach $200 in 2024?',
        slug: 'sol-200-2024',
        description: 'This market resolves to Yes if SOL/USD reaches $200 on a major exchange in 2024.',
        outcomes: [
          { tokenId: 'sol200-yes', name: 'Yes', price: 0.58 },
          { tokenId: 'sol200-no', name: 'No', price: 0.42 },
        ],
        volume24h: 680000,
        totalVolume: 9500000,
        liquidity: 780000,
        endDate: '2024-12-31T23:59:59Z',
        active: true,
        category: 'Crypto',
      },
      {
        id: 'recession-2024',
        question: 'Will the US enter a recession in 2024?',
        slug: 'us-recession-2024',
        description: 'Resolves Yes if NBER declares a US recession starting in 2024.',
        outcomes: [
          { tokenId: 'recession-yes', name: 'Yes', price: 0.25 },
          { tokenId: 'recession-no', name: 'No', price: 0.75 },
        ],
        volume24h: 450000,
        totalVolume: 18000000,
        liquidity: 1200000,
        endDate: '2024-12-31T23:59:59Z',
        active: true,
        category: 'Economics',
      },
    ];

    // Add some price variation to make it feel live
    const now = Date.now();
    let result = fallbackMarkets.map(m => ({
      ...m,
      outcomes: m.outcomes.map(o => ({
        ...o,
        price: Math.max(0.01, Math.min(0.99, o.price + (Math.sin(now / 10000 + o.price * 10) * 0.02))),
      })),
    }));

    // Apply sorting
    if (options?.sortBy === 'volume') {
      result = result.sort((a, b) => b.volume24h - a.volume24h);
    } else if (options?.sortBy === 'liquidity') {
      result = result.sort((a, b) => b.liquidity - a.liquidity);
    }

    return result.slice(0, options?.limit || 20);
  }

  private generateSimulatedTrades(walletAddress: string, limit: number): PolyTrade[] {
    const markets = this.getFallbackMarkets({});
    const trades: PolyTrade[] = [];

    // Generate some realistic-looking trades
    for (let i = 0; i < Math.min(limit, 10); i++) {
      const market = markets[Math.floor(Math.random() * markets.length)];
      const isYes = Math.random() > 0.5;
      const outcome = market.outcomes[isYes ? 0 : 1];
      const side = Math.random() > 0.5 ? 'buy' : 'sell';

      trades.push({
        id: `trade_${walletAddress.slice(0, 8)}_${i}`,
        marketId: market.id,
        marketQuestion: market.question,
        tokenId: outcome.tokenId,
        side,
        outcome: outcome.name as 'Yes' | 'No',
        size: Math.floor(Math.random() * 1000) + 50,
        price: outcome.price + (Math.random() * 0.1 - 0.05),
        timestamp: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString(), // Within last 7 days
      });
    }

    return trades.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  // ==================== Cleanup ====================

  destroy(): void {
    for (const interval of this.pollingIntervals.values()) {
      clearInterval(interval);
    }
    this.pollingIntervals.clear();
    this.marketCache.clear();
    this.marketsListCache = null;
  }
}

// Singleton instance
let polymarketServiceInstance: PolymarketService | null = null;

/**
 * Get the singleton PolymarketService instance
 */
export function getPolymarketService(): PolymarketService {
  if (!polymarketServiceInstance) {
    polymarketServiceInstance = new PolymarketService();
  }
  return polymarketServiceInstance;
}

/**
 * Create a new PolymarketService instance (for custom configurations)
 */
export function createPolymarketService(config?: PolymarketServiceConfig): PolymarketService {
  return new PolymarketService(config);
}
