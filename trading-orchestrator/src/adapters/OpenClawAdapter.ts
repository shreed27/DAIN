/**
 * OpenClawAdapter - Integrates OpenClaw Sidex Kit for multi-exchange pipelines
 *
 * Features from OpenClaw:
 * - Universal trade command across exchanges
 * - SurvivalManager for adaptive behavior (now with server integration)
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
import { withRetry, CircuitBreaker, type RetryOptions } from '../utils/retry.js';

export interface OpenClawAdapterConfig extends AdapterConfig {
  startBalance?: number;
  survivalEnabled?: boolean;
  /** Retry configuration */
  retryOptions?: RetryOptions;
}

export class OpenClawAdapter extends EventEmitter {
  private client: AxiosInstance;
  private config: OpenClawAdapterConfig;
  private health: AdapterHealth = { healthy: false, lastChecked: 0 };
  private survivalStatus: SurvivalStatus | null = null;
  private circuitBreaker: CircuitBreaker;
  private retryOptions: RetryOptions;

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

    // Initialize circuit breaker for resilience
    this.circuitBreaker = new CircuitBreaker('OpenClaw', {
      failureThreshold: 5,
      resetTimeoutMs: 30000,
      successThreshold: 3,
    });

    // Default retry options
    this.retryOptions = config.retryOptions || {
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
      jitter: true,
      onRetry: (attempt, error, nextDelay) => {
        console.log(`[OpenClawAdapter] Retry attempt ${attempt} after error: ${error.message}. Next delay: ${nextDelay}ms`);
      },
    };

    if (this.config.survivalEnabled) {
      this.initSurvivalFromServer();
    }
  }

  // ==================== Survival Manager ====================

  /**
   * Initialize survival status from server
   */
  private async initSurvivalFromServer(): Promise<void> {
    try {
      const status = await this.fetchSurvivalStatus();
      if (status) {
        this.survivalStatus = status;
        console.log(`[OpenClawAdapter] Survival mode initialized: ${status.mode}`);
      }
    } catch (error) {
      // Fallback to local initialization
      console.warn('[OpenClawAdapter] Could not fetch survival status from server, using local');
      this.survivalStatus = {
        mode: 'survival',
        pnlPercent: 0,
        startBalance: this.config.startBalance || 1000,
        currentBalance: this.config.startBalance || 1000,
        x402BudgetUnlocked: false,
      };
    }
  }

  /**
   * Fetch survival status from OpenClaw server
   */
  async fetchSurvivalStatus(): Promise<SurvivalStatus | null> {
    try {
      const response = await this.client.get('/api/survival/status');
      if (response.data?.success && response.data?.data) {
        const serverData = response.data.data;
        return {
          mode: serverData.state?.toLowerCase() as SurvivalMode,
          pnlPercent: serverData.pnlPercent || 0,
          startBalance: serverData.initialBalance || this.config.startBalance || 1000,
          currentBalance: serverData.currentBalance || this.config.startBalance || 1000,
          x402BudgetUnlocked: serverData.state === 'GROWTH',
          riskParams: serverData.riskParams,
          canOpenPosition: serverData.canOpenPosition,
          maxPositionSize: serverData.maxPositionSize,
          maxLeverage: serverData.maxLeverage,
        };
      }
      return null;
    } catch (error) {
      console.error('[OpenClawAdapter] Failed to fetch survival status:', error);
      return null;
    }
  }

  /**
   * Update survival status by sending new balance to server
   */
  async updateSurvivalStatus(currentBalance: number): Promise<SurvivalStatus> {
    try {
      const response = await this.client.post('/api/survival/update', { balance: currentBalance });
      if (response.data?.success && response.data?.data) {
        const serverStatus = response.data.data.status;
        const previousMode = this.survivalStatus?.mode;

        this.survivalStatus = {
          mode: serverStatus.state?.toLowerCase() as SurvivalMode,
          pnlPercent: serverStatus.pnlPercent || 0,
          startBalance: serverStatus.initialBalance,
          currentBalance: serverStatus.currentBalance,
          x402BudgetUnlocked: serverStatus.state === 'GROWTH',
          riskParams: serverStatus.riskParams,
          canOpenPosition: serverStatus.canOpenPosition,
          maxPositionSize: serverStatus.maxPositionSize,
          maxLeverage: serverStatus.maxLeverage,
        };

        // Emit mode change event
        if (this.survivalStatus && previousMode !== this.survivalStatus.mode) {
          this.emit('survival_mode_changed', {
            previousMode,
            newMode: this.survivalStatus.mode,
            pnlPercent: this.survivalStatus.pnlPercent,
          });

          if (this.survivalStatus.mode === 'critical') {
            this.emit('survival_critical', {
              pnlPercent: this.survivalStatus.pnlPercent,
              currentBalance,
            });
          }
        }

        return this.survivalStatus!;
      }
    } catch (error) {
      console.error('[OpenClawAdapter] Failed to update survival status on server:', error);
    }

    // Fallback to local calculation if server fails
    return this.updateSurvivalStatusLocal(currentBalance);
  }

  /**
   * Local fallback for survival status update
   */
  private updateSurvivalStatusLocal(currentBalance: number): SurvivalStatus {
    if (!this.survivalStatus) {
      this.survivalStatus = {
        mode: 'survival',
        pnlPercent: 0,
        startBalance: this.config.startBalance || 1000,
        currentBalance: this.config.startBalance || 1000,
        x402BudgetUnlocked: false,
      };
    }

    const pnlPercent =
      ((currentBalance - this.survivalStatus.startBalance) / this.survivalStatus.startBalance) * 100;

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

    const previousMode = this.survivalStatus.mode;
    this.survivalStatus = {
      mode,
      pnlPercent,
      startBalance: this.survivalStatus.startBalance,
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
   * Get risk parameters from server
   */
  async getRiskParams(): Promise<{
    maxPositionSize: number;
    maxLeverage: number;
    canOpenPosition: boolean;
  } | null> {
    try {
      const response = await this.client.get('/api/survival/risk');
      if (response.data?.success) {
        return response.data.data;
      }
      return null;
    } catch (error) {
      console.error('[OpenClawAdapter] Failed to get risk params:', error);
      return null;
    }
  }

  /**
   * Check if X402 budget is unlocked
   */
  isX402BudgetUnlocked(): boolean {
    return this.survivalStatus?.x402BudgetUnlocked ?? false;
  }

  // ==================== Trade Execution ====================

  /**
   * Execute trade via OpenClaw pipeline with retry and circuit breaker
   */
  async executeTrade(params: OpenClawTradeParams): Promise<OpenClawTradeResult> {
    // Check survival mode restrictions
    if (this.survivalStatus?.mode === 'critical') {
      return {
        success: false,
        error: 'Trading disabled - survival mode is CRITICAL (hibernation)',
      };
    }

    // Check if we can open positions
    if (this.survivalStatus?.canOpenPosition === false) {
      return {
        success: false,
        error: 'New positions blocked in current survival mode',
      };
    }

    if (this.survivalStatus?.mode === 'defensive') {
      // Reduce position size in defensive mode
      params.amount = String(Number(params.amount) * 0.5);
    }

    // Apply max leverage from risk params
    if (this.survivalStatus?.maxLeverage && params.leverage) {
      params.leverage = Math.min(params.leverage, this.survivalStatus.maxLeverage);
    }

    // Execute with circuit breaker and retry
    return this.circuitBreaker.execute(() =>
      withRetry(
        async () => {
          const response = await this.client.post(`/pipelines/${params.exchange}/trade`, params);
          const result = response.data;

          this.emit('trade_executed', {
            ...params,
            result,
            survivalMode: this.survivalStatus?.mode,
          });

          return result;
        },
        this.retryOptions
      )
    ).catch((error) => {
      console.error('[OpenClawAdapter] Trade execution failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Trade execution failed',
      };
    });
  }

  /**
   * Close position with retry
   */
  async closePosition(params: {
    exchange: string;
    symbol: string;
    side: 'long' | 'short';
  }): Promise<OpenClawTradeResult> {
    return this.circuitBreaker.execute(() =>
      withRetry(
        async () => {
          const response = await this.client.post(`/pipelines/${params.exchange}/close`, params);
          return response.data;
        },
        this.retryOptions
      )
    ).catch((error) => {
      console.error('[OpenClawAdapter] Close position failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Close position failed',
      };
    });
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
   * Get X402 status from server
   */
  async getX402Status(): Promise<{
    budgetMode: string;
    maxPaymentPerRequest: number;
    totalBudget: number;
    spentAmount: number;
    remainingBudget: number;
    dailyLimit: number;
    dailySpent: number;
    walletAddress?: string;
  } | null> {
    try {
      const response = await this.client.get('/api/x402/status');
      if (response.data?.success) {
        return response.data.data;
      }
      return null;
    } catch (error) {
      console.error('[OpenClawAdapter] Failed to get X402 status:', error);
      return null;
    }
  }

  /**
   * Check X402 wallet balance
   */
  async getX402Balance(): Promise<{
    address: string;
    balance: number;
    chain: string;
  }> {
    const status = await this.getX402Status();
    return {
      address: status?.walletAddress || '0x...',
      balance: status?.remainingBudget || 0,
      chain: 'base',
    };
  }

  /**
   * Set X402 budget mode on server
   */
  async setX402BudgetMode(mode: 'unlimited' | 'conservative' | 'frozen'): Promise<{
    success: boolean;
    oldMode?: string;
    newMode?: string;
    error?: string;
  }> {
    try {
      const response = await this.client.post('/api/x402/budget-mode', { mode });
      if (response.data?.success) {
        return {
          success: true,
          oldMode: response.data.data.oldMode,
          newMode: response.data.data.newMode,
        };
      }
      return { success: false, error: 'Unknown error' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send X402 payment through server's auto-payment fetch
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
      const response = await this.client.post('/api/x402/fetch', {
        url: params.to,
        options: { data: params.data },
      });
      return {
        success: response.data?.success || false,
        error: response.data?.error,
      };
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
      const response = await this.client.get('/health');
      this.health = {
        healthy: true,
        latencyMs: Date.now() - startTime,
        lastChecked: Date.now(),
        metadata: {
          survivalState: response.data?.survivalState,
          version: response.data?.version,
        },
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

  /**
   * Get circuit breaker state
   */
  getCircuitState(): string {
    return this.circuitBreaker.getState();
  }

  /**
   * Reset circuit breaker
   */
  resetCircuit(): void {
    this.circuitBreaker.reset();
  }
}
