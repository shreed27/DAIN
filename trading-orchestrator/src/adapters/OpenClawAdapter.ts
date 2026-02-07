/**
 * OpenClawAdapter - Integrates OpenClaw Sidex Kit for multi-exchange pipelines
 *
 * Features from OpenClaw:
 * - Universal trade command across exchanges
 * - SurvivalManager for adaptive behavior
 * - X402 wallet management
 * - Trading protocols (Alpha Momentum, Bitcoin Fortress, Winter Protocol)
 * - Pipelines: Hyperliquid, Binance, Bybit, Jupiter, Uniswap
 */

import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import type {
  AdapterConfig,
  AdapterHealth,
  OpenClawTradeParams,
  OpenClawTradeResult,
  SurvivalMode,
  SurvivalStatus,
} from './types.js';

export interface OpenClawAdapterConfig extends AdapterConfig {
  startBalance?: number;
  survivalEnabled?: boolean;
}

export class OpenClawAdapter extends EventEmitter {
  private client: AxiosInstance;
  private config: OpenClawAdapterConfig;
  private health: AdapterHealth = { healthy: false, lastChecked: 0 };
  private survivalStatus: SurvivalStatus | null = null;

  constructor(config: OpenClawAdapterConfig) {
    super();
    this.config = {
      timeout: 30000,
      survivalEnabled: true,
      startBalance: 1000,
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

    if (this.config.survivalEnabled) {
      this.initSurvivalStatus();
    }
  }

  // ==================== Survival Manager ====================

  private initSurvivalStatus(): void {
    this.survivalStatus = {
      mode: 'survival',
      pnlPercent: 0,
      startBalance: this.config.startBalance || 1000,
      currentBalance: this.config.startBalance || 1000,
      x402BudgetUnlocked: false,
    };
  }

  /**
   * Update survival status based on current balance
   */
  updateSurvivalStatus(currentBalance: number): SurvivalStatus {
    if (!this.survivalStatus) {
      this.initSurvivalStatus();
    }

    const pnlPercent =
      ((currentBalance - this.survivalStatus!.startBalance) / this.survivalStatus!.startBalance) * 100;

    let mode: SurvivalMode;
    let x402BudgetUnlocked = false;

    if (pnlPercent >= 20) {
      mode = 'growth';
      x402BudgetUnlocked = true;
    } else if (pnlPercent <= -50) {
      mode = 'critical';
      this.emit('survival_critical', { pnlPercent, currentBalance });
    } else if (pnlPercent <= -15) {
      mode = 'defensive';
    } else {
      mode = 'survival';
    }

    const previousMode = this.survivalStatus!.mode;
    this.survivalStatus = {
      mode,
      pnlPercent,
      startBalance: this.survivalStatus!.startBalance,
      currentBalance,
      x402BudgetUnlocked,
    };

    if (previousMode !== mode) {
      this.emit('survival_mode_changed', { previousMode, newMode: mode, pnlPercent });
    }

    return this.survivalStatus;
  }

  /**
   * Get current survival status
   */
  getSurvivalStatus(): SurvivalStatus | null {
    return this.survivalStatus;
  }

  /**
   * Check if X402 budget is unlocked
   */
  isX402BudgetUnlocked(): boolean {
    return this.survivalStatus?.x402BudgetUnlocked ?? false;
  }

  // ==================== Trade Execution ====================

  /**
   * Execute trade via OpenClaw pipeline
   */
  async executeTrade(params: OpenClawTradeParams): Promise<OpenClawTradeResult> {
    // Check survival mode restrictions
    if (this.survivalStatus?.mode === 'critical') {
      return {
        success: false,
        error: 'Trading disabled - survival mode is CRITICAL (hibernation)',
      };
    }

    if (this.survivalStatus?.mode === 'defensive') {
      // Reduce position size in defensive mode
      params.amount = String(Number(params.amount) * 0.5);
    }

    try {
      const response = await this.client.post(`/pipelines/${params.exchange}/trade`, params);
      const result = response.data;

      this.emit('trade_executed', {
        ...params,
        result,
        survivalMode: this.survivalStatus?.mode,
      });

      return result;
    } catch (error) {
      console.error('[OpenClawAdapter] Trade execution failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Trade execution failed',
      };
    }
  }

  /**
   * Close position
   */
  async closePosition(params: {
    exchange: string;
    symbol: string;
    side: 'long' | 'short';
  }): Promise<OpenClawTradeResult> {
    try {
      const response = await this.client.post(`/pipelines/${params.exchange}/close`, params);
      return response.data;
    } catch (error) {
      console.error('[OpenClawAdapter] Close position failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Close position failed',
      };
    }
  }

  // ==================== Exchange-Specific Methods ====================

  /**
   * Execute on Hyperliquid
   */
  async executeHyperliquid(params: {
    symbol: string;
    side: 'buy' | 'sell';
    amount: string;
    leverage?: number;
  }): Promise<OpenClawTradeResult> {
    return this.executeTrade({
      ...params,
      exchange: 'hyperliquid',
    });
  }

  /**
   * Execute on Binance
   */
  async executeBinance(params: {
    symbol: string;
    side: 'buy' | 'sell';
    amount: string;
    leverage?: number;
  }): Promise<OpenClawTradeResult> {
    return this.executeTrade({
      ...params,
      exchange: 'binance',
    });
  }

  /**
   * Execute on Bybit
   */
  async executeBybit(params: {
    symbol: string;
    side: 'buy' | 'sell';
    amount: string;
    leverage?: number;
  }): Promise<OpenClawTradeResult> {
    return this.executeTrade({
      ...params,
      exchange: 'bybit',
    });
  }

  /**
   * Execute on Jupiter (Solana)
   */
  async executeJupiter(params: {
    symbol: string;
    side: 'buy' | 'sell';
    amount: string;
  }): Promise<OpenClawTradeResult> {
    return this.executeTrade({
      ...params,
      exchange: 'jupiter',
    });
  }

  /**
   * Execute on Uniswap (EVM)
   */
  async executeUniswap(params: {
    symbol: string;
    side: 'buy' | 'sell';
    amount: string;
    chainId?: number;
  }): Promise<OpenClawTradeResult> {
    return this.executeTrade({
      ...params,
      exchange: 'uniswap',
    });
  }

  // ==================== Trading Protocols ====================

  /**
   * Execute Alpha Momentum protocol (aggressive bull market)
   */
  async executeAlphaMomentum(params: {
    symbol: string;
    amount: string;
    leverage?: number;
  }): Promise<OpenClawTradeResult> {
    if (this.survivalStatus?.mode !== 'growth') {
      return {
        success: false,
        error: 'Alpha Momentum requires GROWTH survival mode',
      };
    }

    return this.executeHyperliquid({
      symbol: params.symbol,
      side: 'buy',
      amount: params.amount,
      leverage: params.leverage || 10,
    });
  }

  /**
   * Execute Bitcoin Fortress protocol (defensive hedge)
   */
  async executeBitcoinFortress(params: {
    amount: string;
  }): Promise<OpenClawTradeResult> {
    // Open BTC hedge position
    return this.executeHyperliquid({
      symbol: 'BTC',
      side: 'buy',
      amount: params.amount,
      leverage: 2,
    });
  }

  /**
   * Execute Winter Protocol (bear market liquidations)
   */
  async executeWinterProtocol(params: {
    symbol: string;
    amount: string;
    leverage?: number;
  }): Promise<OpenClawTradeResult> {
    return this.executeHyperliquid({
      symbol: params.symbol,
      side: 'sell',
      amount: params.amount,
      leverage: params.leverage || 5,
    });
  }

  // ==================== X402 Payments ====================

  /**
   * Check X402 wallet balance
   */
  async getX402Balance(): Promise<{
    address: string;
    balance: number;
    chain: string;
  }> {
    try {
      const response = await this.client.get('/x402/balance');
      return response.data;
    } catch (error) {
      return {
        address: '0x...',
        balance: 0,
        chain: 'base',
      };
    }
  }

  /**
   * Send X402 payment
   */
  async sendX402Payment(params: {
    to: string;
    amount: string;
    data?: string;
  }): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
  }> {
    if (!this.isX402BudgetUnlocked()) {
      return {
        success: false,
        error: 'X402 budget locked - requires GROWTH survival mode',
      };
    }

    try {
      const response = await this.client.post('/x402/send', params);
      return response.data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
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
