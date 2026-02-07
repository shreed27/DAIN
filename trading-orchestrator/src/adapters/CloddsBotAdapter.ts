/**
 * CloddsBotAdapter - Integrates CloddsBot execution engine and risk management
 *
 * Features from CloddsBot:
 * - SmartRouter for best execution routing
 * - RiskEngine with VaR/CVaR calculations
 * - Circuit breaker for risk protection
 * - Arbitrage detection
 * - Copy trading infrastructure
 * - 22 messaging channels
 * - 103 skills
 */

import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import type {
  AdapterConfig,
  AdapterHealth,
  CloddsBotQuote,
  CloddsBotRoutingResult,
  CloddsBotRiskDecision,
} from './types.js';

export interface CloddsBotAdapterConfig extends AdapterConfig {
  enableRiskChecks?: boolean;
  enableCircuitBreaker?: boolean;
}

export class CloddsBotAdapter extends EventEmitter {
  private client: AxiosInstance;
  private config: CloddsBotAdapterConfig;
  private health: AdapterHealth = { healthy: false, lastChecked: 0 };

  constructor(config: CloddsBotAdapterConfig) {
    super();
    this.config = {
      timeout: 30000,
      enableRiskChecks: true,
      enableCircuitBreaker: true,
      ...config,
    };

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
      },
    });
  }

  // ==================== Smart Router ====================

  /**
   * Find best execution route across prediction markets
   */
  async findBestRoute(params: {
    marketId: string;
    outcomeId?: string;
    side: 'buy' | 'sell';
    size: number;
    platforms?: string[];
  }): Promise<CloddsBotRoutingResult> {
    try {
      const response = await this.client.post('/api/router/find-route', params);
      return response.data;
    } catch (error) {
      console.error('[CloddsBotAdapter] Failed to find route:', error);
      throw new Error(`Failed to find route: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get quotes from all enabled platforms
   */
  async getQuotes(params: {
    marketId: string;
    outcomeId?: string;
    side: 'buy' | 'sell';
    size: number;
  }): Promise<CloddsBotQuote[]> {
    try {
      const response = await this.client.post('/api/router/quotes', params);
      return response.data;
    } catch (error) {
      return [];
    }
  }

  // ==================== Risk Engine ====================

  /**
   * Check trade against risk parameters
   */
  async checkRisk(params: {
    userId: string;
    platform: string;
    marketId?: string;
    side: 'buy' | 'sell';
    size: number;
    price: number;
    estimatedEdge?: number;
    confidence?: number;
  }): Promise<CloddsBotRiskDecision> {
    if (!this.config.enableRiskChecks) {
      return {
        approved: true,
        warnings: [],
        regime: 'low',
      };
    }

    try {
      const response = await this.client.post('/api/risk/check', params);
      return response.data;
    } catch (error) {
      // Default to approved with warning
      return {
        approved: true,
        warnings: ['Risk engine unavailable, proceeding with caution'],
        regime: 'low',
      };
    }
  }

  /**
   * Get portfolio risk snapshot
   */
  async getPortfolioRisk(userId: string): Promise<{
    totalValue: number;
    positionCount: number;
    var95: number;
    var99: number;
    cvar95: number;
    regime: string;
    drawdownPct: number;
    dailyPnL: number;
  }> {
    try {
      const response = await this.client.get(`/api/risk/portfolio/${userId}`);
      return response.data;
    } catch (error) {
      return {
        totalValue: 0,
        positionCount: 0,
        var95: 0,
        var99: 0,
        cvar95: 0,
        regime: 'low',
        drawdownPct: 0,
        dailyPnL: 0,
      };
    }
  }

  // ==================== Circuit Breaker ====================

  /**
   * Check circuit breaker status
   */
  async checkCircuitBreaker(): Promise<{
    tripped: boolean;
    reason?: string;
    canTrade: boolean;
    cooldownEndTime?: number;
  }> {
    if (!this.config.enableCircuitBreaker) {
      return { tripped: false, canTrade: true };
    }

    try {
      const response = await this.client.get('/api/risk/circuit-breaker');
      return response.data;
    } catch (error) {
      return { tripped: false, canTrade: true };
    }
  }

  /**
   * Trip circuit breaker manually
   */
  async tripCircuitBreaker(reason: string): Promise<void> {
    try {
      await this.client.post('/api/risk/circuit-breaker/trip', { reason });
      this.emit('circuit_breaker_tripped', { reason, timestamp: Date.now() });
    } catch (error) {
      // Log error but don't throw
    }
  }

  /**
   * Reset circuit breaker
   */
  async resetCircuitBreaker(): Promise<void> {
    try {
      await this.client.post('/api/risk/circuit-breaker/reset');
      this.emit('circuit_breaker_reset', { timestamp: Date.now() });
    } catch (error) {
      // Log error but don't throw
    }
  }

  // ==================== Execution ====================

  /**
   * Execute order via CloddsBot
   */
  async executeOrder(params: {
    platform: string;
    marketId: string;
    tokenId?: string;
    outcome?: string;
    side: 'buy' | 'sell';
    price: number;
    size: number;
    orderType?: 'GTC' | 'FOK' | 'GTD' | 'FAK';
  }): Promise<{
    success: boolean;
    orderId?: string;
    filledSize?: number;
    avgPrice?: number;
    fees?: number;
    error?: string;
  }> {
    try {
      const response = await this.client.post('/api/execution/order', params);
      this.emit('order_executed', { ...params, result: response.data });
      return response.data;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      await this.client.delete(`/api/execution/order/${orderId}`);
      return true;
    } catch (error) {
      return false;
    }
  }

  // ==================== Arbitrage ====================

  /**
   * Get current arbitrage opportunities
   */
  async getArbitrageOpportunities(): Promise<
    Array<{
      id: string;
      market: string;
      buyPlatform: string;
      buyPrice: number;
      sellPlatform: string;
      sellPrice: number;
      profitPercent: number;
      liquidity: number;
      confidence: number;
      expiresAt: number;
    }>
  > {
    try {
      const response = await this.client.get('/api/arbitrage/opportunities');
      return response.data;
    } catch (error) {
      return [];
    }
  }

  /**
   * Execute arbitrage trade
   */
  async executeArbitrage(opportunityId: string, size: number): Promise<{
    success: boolean;
    buyOrderId?: string;
    sellOrderId?: string;
    realizedProfit?: number;
    error?: string;
  }> {
    try {
      const response = await this.client.post('/api/arbitrage/execute', {
        opportunityId,
        size,
      });
      return response.data;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMsg };
    }
  }

  // ==================== Copy Trading ====================

  /**
   * Follow a wallet for copy trading
   */
  async followWallet(walletAddress: string, config?: {
    sizingMode?: 'fixed' | 'proportional' | 'percentage';
    fixedSize?: number;
    maxPositionSize?: number;
    stopLoss?: number;
    takeProfit?: number;
  }): Promise<boolean> {
    try {
      await this.client.post('/api/copy-trading/follow', {
        walletAddress,
        ...config,
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Unfollow a wallet
   */
  async unfollowWallet(walletAddress: string): Promise<boolean> {
    try {
      await this.client.delete(`/api/copy-trading/follow/${walletAddress}`);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get copied trades
   */
  async getCopiedTrades(limit = 50): Promise<
    Array<{
      id: string;
      sourceWallet: string;
      market: string;
      side: string;
      size: number;
      entryPrice: number;
      currentPrice: number;
      pnl: number;
      timestamp: number;
    }>
  > {
    try {
      const response = await this.client.get('/api/copy-trading/trades', {
        params: { limit },
      });
      return response.data;
    } catch (error) {
      return [];
    }
  }

  // ==================== Markets ====================

  /**
   * Get prediction markets
   */
  async getMarkets(params?: {
    platform?: string;
    category?: string;
    resolved?: boolean;
    limit?: number;
  }): Promise<
    Array<{
      id: string;
      platform: string;
      question: string;
      outcomes: Array<{ name: string; price: number }>;
      volume24h: number;
      liquidity: number;
      resolved: boolean;
      tags: string[];
    }>
  > {
    try {
      const response = await this.client.get('/api/markets', { params });
      return response.data;
    } catch (error) {
      return [];
    }
  }

  // ==================== Health ====================

  async checkHealth(): Promise<AdapterHealth> {
    const startTime = Date.now();
    try {
      await this.client.get('/health');
      this.health = {
        healthy: true,
        latencyMs: Date.now() - startTime,
        lastChecked: Date.now(),
      };
    } catch (error) {
      this.health = {
        healthy: false,
        lastChecked: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
    return this.health;
  }

  isHealthy(): boolean {
    return this.health.healthy;
  }
}
