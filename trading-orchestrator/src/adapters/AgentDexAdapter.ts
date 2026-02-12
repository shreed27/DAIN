/**
 * AgentDexAdapter - Integrates AgentDEX for Solana DEX execution
 *
 * Features from AgentDEX:
 * - Jupiter V6 aggregated swaps
 * - Agent registration with keypair generation
 * - Limit orders with auto-execution
 * - Portfolio tracking
 * - Price feeds
 */

import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import type {
  AdapterConfig,
  AdapterHealth,
  AgentDexQuote,
  AgentDexSwapResult,
  AgentDexPortfolio,
} from './types.js';

export interface AgentDexAdapterConfig extends AdapterConfig {
  agentApiKey?: string;
}

export class AgentDexAdapter extends EventEmitter {
  private client: AxiosInstance;
  private config: AgentDexAdapterConfig;
  private health: AdapterHealth = { healthy: false, lastChecked: 0 };

  constructor(config: AgentDexAdapterConfig) {
    super();
    this.config = {
      timeout: 30000,
      ...config,
    };

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.agentApiKey && { Authorization: `Bearer ${this.config.agentApiKey}` }),
      },
    });
  }

  // ==================== Agent Registration ====================

  /**
   * Register a new agent with AgentDEX
   */
  async registerAgent(name?: string): Promise<{
    id: string;
    apiKey: string;
    wallet: { publicKey: string };
    name: string;
  }> {
    try {
      const response = await this.client.post('/api/v1/agents/register', { name });
      return response.data.data;
    } catch (error) {
      throw new Error(`Failed to register agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get current agent info
   */
  async getAgentInfo(): Promise<{
    id: string;
    publicKey: string;
    name: string | null;
    tradeCount: number;
    solBalance: number;
    createdAt: string;
  } | null> {
    try {
      const response = await this.client.get('/api/v1/agents/me');
      return response.data.data;
    } catch (error) {
      return null;
    }
  }

  // ==================== Swap Execution ====================

  /**
   * Get swap quote from Jupiter
   */
  async getQuote(params: {
    inputMint: string;
    outputMint: string;
    amount: string;
    slippageBps?: number;
  }): Promise<AgentDexQuote> {
    try {
      const response = await this.client.get('/api/v1/quote', { params });
      return response.data.data;
    } catch (error) {
      throw new Error(`Failed to get quote: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Execute swap
   */
  async executeSwap(params: {
    inputMint: string;
    outputMint: string;
    amount: string;
    slippageBps?: number;
    walletPrivateKey?: string;
  }): Promise<AgentDexSwapResult> {
    try {
      const response = await this.client.post('/api/v1/swap', params);
      const result = response.data.data;
      this.emit('swap_executed', result);
      return result;
    } catch (error) {
      throw new Error(`Failed to execute swap: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get swap transaction for frontend signing
   * Returns a serialized transaction that the user can sign with their wallet
   */
  async getSwapTransaction(params: {
    quote: AgentDexQuote;
    userPublicKey: string;
    slippageBps?: number;
  }): Promise<string | null> {
    try {
      // Call Jupiter API directly to get the swap transaction
      // This returns a base64-encoded transaction that the frontend can deserialize and sign
      const response = await axios.post(
        'https://quote-api.jup.ag/v6/swap',
        {
          quoteResponse: params.quote,
          userPublicKey: params.userPublicKey,
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          dynamicSlippage: { minBps: 50, maxBps: params.slippageBps || 300 },
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: this.config.timeout,
        }
      );

      return response.data.swapTransaction || null;
    } catch (error) {
      console.error('Failed to get swap transaction:', error);
      // Return null instead of throwing - the frontend will handle this gracefully
      return null;
    }
  }

  // ==================== Limit Orders ====================

  /**
   * Create limit order
   */
  async createLimitOrder(params: {
    inputMint: string;
    outputMint: string;
    amount: string;
    targetPrice: number;
    side: 'buy' | 'sell';
    slippageBps?: number;
  }): Promise<{
    id: string;
    status: 'active' | 'filled' | 'cancelled' | 'failed';
    createdAt: string;
  }> {
    try {
      const response = await this.client.post('/api/v1/limit-order', params);
      return response.data.data;
    } catch (error) {
      throw new Error(`Failed to create limit order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get active limit orders
   */
  async getLimitOrders(): Promise<
    Array<{
      id: string;
      inputMint: string;
      outputMint: string;
      amount: string;
      targetPrice: number;
      side: 'buy' | 'sell';
      status: string;
      createdAt: string;
    }>
  > {
    try {
      const response = await this.client.get('/api/v1/limit-order');
      return response.data.data;
    } catch (error) {
      return [];
    }
  }

  /**
   * Cancel limit order
   */
  async cancelLimitOrder(orderId: string): Promise<boolean> {
    try {
      await this.client.delete(`/api/v1/limit-order/${orderId}`);
      return true;
    } catch (error) {
      return false;
    }
  }

  // ==================== Portfolio ====================

  /**
   * Get wallet portfolio
   */
  async getPortfolio(walletAddress: string): Promise<AgentDexPortfolio> {
    try {
      const response = await this.client.get(`/api/v1/portfolio/${walletAddress}`);
      return response.data.data;
    } catch (error) {
      return {
        solBalance: 0,
        solUsdValue: null,
        tokens: [],
        totalUsdValue: null,
      };
    }
  }

  /**
   * Get trade history for wallet
   */
  async getTradeHistory(
    walletAddress: string,
    limit = 50
  ): Promise<
    Array<{
      id: string;
      inputMint: string;
      outputMint: string;
      inputAmount: string;
      outputAmount: string;
      txSignature: string;
      priceImpact: string | null;
      createdAt: string;
    }>
  > {
    try {
      const response = await this.client.get(`/api/v1/portfolio/${walletAddress}/history`, {
        params: { limit },
      });
      return response.data.data;
    } catch (error) {
      return [];
    }
  }

  // ==================== Prices ====================

  /**
   * Get token price
   */
  async getTokenPrice(mint: string): Promise<{
    mint: string;
    price: number;
    symbol?: string;
  } | null> {
    try {
      const response = await this.client.get(`/api/v1/prices/${mint}`);
      return response.data.data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get multiple token prices
   */
  async getTokenPrices(mints: string[]): Promise<Record<string, { price: number; symbol?: string }>> {
    try {
      const response = await this.client.get('/api/v1/prices', {
        params: { mints: mints.join(',') },
      });
      return response.data.data;
    } catch (error) {
      return {};
    }
  }

  // ==================== Market Data ====================

  /**
   * Get trending tokens
   */
  async getTrendingTokens(): Promise<
    Array<{
      mint: string;
      symbol: string;
      name: string;
      price: number;
      change24h: number;
    }>
  > {
    try {
      const response = await this.client.get('/api/v1/tokens/trending');
      return response.data.data;
    } catch (error) {
      return [];
    }
  }

  // ==================== Health ====================

  async checkHealth(): Promise<AdapterHealth> {
    const startTime = Date.now();
    try {
      await this.client.get('/api/v1/health');
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

  /**
   * Set API key for authenticated requests
   */
  setApiKey(apiKey: string): void {
    this.config.agentApiKey = apiKey;
    this.client.defaults.headers.Authorization = `Bearer ${apiKey}`;
  }
}
