/**
 * OpusXAdapter - Integrates Opus-X SuperRouter for whale tracking and signals
 *
 * Features from Opus-X:
 * - 24 God Wallet tracking
 * - AI entry analysis with Gemini
 * - Real-time WebSocket signals
 * - Position management (TP/SL)
 * - Migration detection
 * - Token-gated features
 */

import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import WebSocket from 'ws';
import type {
  AdapterConfig,
  AdapterHealth,
  GodWallet,
  GodWalletBuy,
  WhaleSignal,
} from './types.js';

export interface OpusXAdapterConfig extends AdapterConfig {
  wsUrl?: string;
  enableWebSocket?: boolean;
}

export class OpusXAdapter extends EventEmitter {
  private client: AxiosInstance;
  private ws: WebSocket | null = null;
  private config: OpusXAdapterConfig;
  private health: AdapterHealth = { healthy: false, lastChecked: 0 };
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(config: OpusXAdapterConfig) {
    super();
    this.config = {
      timeout: 30000,
      enableWebSocket: true,
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

    if (this.config.enableWebSocket && this.config.wsUrl) {
      this.connectWebSocket();
    }
  }

  // ==================== WebSocket ====================

  private connectWebSocket(): void {
    if (!this.config.wsUrl) return;

    try {
      this.ws = new WebSocket(this.config.wsUrl);

      this.ws.on('open', () => {
        this.reconnectAttempts = 0;
        this.emit('ws_connected');
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(message);
        } catch (error) {
          // Ignore parse errors
        }
      });

      this.ws.on('close', () => {
        this.emit('ws_disconnected');
        this.attemptReconnect();
      });

      this.ws.on('error', (error) => {
        this.emit('ws_error', error);
      });
    } catch (error) {
      this.attemptReconnect();
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    setTimeout(() => {
      this.connectWebSocket();
    }, delay);
  }

  private handleWebSocketMessage(message: {
    type: string;
    data: unknown;
  }): void {
    switch (message.type) {
      case 'god_wallet_buy_detected':
        this.emit('god_wallet_buy', message.data);
        break;
      case 'wallet_signal':
        this.emit('whale_signal', message.data);
        break;
      case 'migration_detected':
        this.emit('migration_detected', message.data);
        break;
      case 'ai_reasoning':
        this.emit('ai_reasoning', message.data);
        break;
      case 'ai_analysis':
        this.emit('ai_analysis', message.data);
        break;
      case 'price_update':
        this.emit('price_update', message.data);
        break;
      case 'position_opened':
        this.emit('position_opened', message.data);
        break;
      case 'position_closed':
        this.emit('position_closed', message.data);
        break;
      case 'take_profit_triggered':
        this.emit('take_profit_triggered', message.data);
        break;
      default:
        this.emit('ws_message', message);
    }
  }

  disconnectWebSocket(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // ==================== God Wallet Tracking ====================

  /**
   * Get list of tracked god wallets
   */
  async getGodWallets(): Promise<GodWallet[]> {
    try {
      const response = await this.client.get('/api/wallets/god');
      return response.data;
    } catch (error) {
      console.error('[OpusXAdapter] Failed to get god wallets:', error);
      return [];
    }
  }

  /**
   * Get recent buys from god wallets
   */
  async getGodWalletRecentBuys(limit = 50): Promise<GodWalletBuy[]> {
    try {
      const response = await this.client.get('/api/wallets/recent-buys', {
        params: { limit },
      });
      return response.data;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get wallet entries for a specific token
   */
  async getWalletEntriesForToken(
    tokenMint: string
  ): Promise<
    Array<{
      walletAddress: string;
      walletLabel: string;
      entryPrice: number;
      entryMarketCap: number;
      amount: number;
      percentHeld: number;
      timestamp: number;
    }>
  > {
    try {
      const response = await this.client.get(`/api/wallets/token/${tokenMint}/entries`);
      return response.data;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get aggregated entry data for a token
   */
  async getAggregatedWalletEntry(
    tokenMint: string
  ): Promise<{
    tokenMint: string;
    walletCount: number;
    weightedAvgEntryPrice: number;
    weightedAvgMarketCap: number;
    totalAmount: number;
  } | null> {
    try {
      const response = await this.client.get(`/api/wallets/token/${tokenMint}/aggregated`);
      return response.data;
    } catch (error) {
      return null;
    }
  }

  // ==================== AI Analysis ====================

  /**
   * Get AI entry analysis for a token
   */
  async getAIEntryAnalysis(tokenMint: string): Promise<{
    reasoning: string;
    risk: string;
    strategy?: string;
    confidence: number;
    recommendation: 'strong_buy' | 'buy' | 'watch' | 'avoid';
  } | null> {
    try {
      const response = await this.client.post('/api/ai/analyze', { tokenMint });
      return response.data;
    } catch (error) {
      console.error('[OpusXAdapter] Failed to get AI analysis:', error);
      return null;
    }
  }

  /**
   * Get buy criteria evaluation
   */
  async evaluateBuyCriteria(tokenMint: string): Promise<{
    passed: boolean;
    confidenceCheck: boolean;
    marketCapCheck: boolean;
    liquidityCheck: boolean;
    volumeCheck: boolean;
    holderCheck: boolean;
    devRiskCheck: boolean;
    bundleCheck: boolean;
    trendCheck: boolean;
    momentumCheck: boolean;
    dynamicConfidence: number;
    rejectionReasons: string[];
  }> {
    try {
      const response = await this.client.post('/api/trading/evaluate', { tokenMint });
      return response.data;
    } catch (error) {
      return {
        passed: false,
        confidenceCheck: false,
        marketCapCheck: false,
        liquidityCheck: false,
        volumeCheck: false,
        holderCheck: false,
        devRiskCheck: false,
        bundleCheck: false,
        trendCheck: false,
        momentumCheck: false,
        dynamicConfidence: 0,
        rejectionReasons: ['Evaluation service unavailable'],
      };
    }
  }

  // ==================== Dashboard Data ====================

  /**
   * Get smart trading dashboard data
   */
  async getDashboardData(): Promise<{
    positions: unknown[];
    signals: unknown[];
    migrations: unknown[];
    stats: {
      totalPnL: number;
      winRate: number;
      activePositions: number;
      totalTrades: number;
    };
  }> {
    try {
      const response = await this.client.get('/smart-trading/dashboard/init');
      return response.data;
    } catch (error) {
      return {
        positions: [],
        signals: [],
        migrations: [],
        stats: {
          totalPnL: 0,
          winRate: 0,
          activePositions: 0,
          totalTrades: 0,
        },
      };
    }
  }

  /**
   * Get ranked migration feed
   */
  async getMigrationFeed(): Promise<
    Array<{
      tokenMint: string;
      symbol: string;
      name: string;
      priorityScore: number;
      walletSignals: number;
      priceChange: number;
      volume: number;
      detectedAt: number;
    }>
  > {
    try {
      const response = await this.client.get('/smart-trading/migration-feed/ranked');
      return response.data;
    } catch (error) {
      return [];
    }
  }

  // ==================== Token Price Tracking ====================

  /**
   * Get token price history
   */
  async getTokenPriceHistory(
    tokenMint: string,
    interval = '1h',
    limit = 100
  ): Promise<
    Array<{
      timestamp: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>
  > {
    try {
      const response = await this.client.get(`/api/prices/${tokenMint}/history`, {
        params: { interval, limit },
      });
      return response.data;
    } catch (error) {
      return [];
    }
  }

  // ==================== Health ====================

  async checkHealth(): Promise<AdapterHealth> {
    const startTime = Date.now();
    try {
      await this.client.get('/api/health');
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

  isWebSocketConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
