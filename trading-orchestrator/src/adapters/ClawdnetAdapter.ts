/**
 * ClawdnetAdapter - Integrates ClawdNet A2A protocol
 *
 * Features from ClawdNet:
 * - Agent discovery registry
 * - A2A protocol communication
 * - X402 USDC payments (Base network)
 * - Reputation system
 * - Multi-agent workflows
 */

import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  encodeFunctionData,
  type WalletClient,
  type PublicClient,
  type Chain,
  type Transport,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import type {
  AdapterConfig,
  AdapterHealth,
  ClawdnetAgent,
  A2AMessage,
  X402PaymentRequest,
} from './types.js';
import { withRetry, CircuitBreaker, type RetryOptions } from '../utils/retry.js';

// USDC contract on Base
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;

// ERC-20 Transfer ABI
const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export interface ClawdnetAdapterConfig extends AdapterConfig {
  agentId?: string;
  agentHandle?: string;
  agentEndpoint?: string;
  privateKey?: string;
  rpcUrl?: string;
}

export class ClawdnetAdapter extends EventEmitter {
  private client: AxiosInstance;
  private config: ClawdnetAdapterConfig;
  private health: AdapterHealth = { healthy: false, lastChecked: 0 };
  private walletClient: WalletClient<Transport, Chain, PrivateKeyAccount> | null = null;
  private publicClient: PublicClient<Transport, Chain> | null = null;
  private walletAddress: string | null = null;
  private account: PrivateKeyAccount | null = null;
  private circuitBreaker: CircuitBreaker;
  private retryOptions: RetryOptions;

  constructor(config: ClawdnetAdapterConfig) {
    super();
    this.config = {
      timeout: 30000,
      rpcUrl: 'https://mainnet.base.org',
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

    // Initialize circuit breaker for A2A operations
    this.circuitBreaker = new CircuitBreaker('clawdnet-a2a', {
      failureThreshold: 5,
      resetTimeoutMs: 30000,
      successThreshold: 2,
    });

    // Initialize retry options for network operations
    this.retryOptions = {
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
      jitter: true,
      nonRetryableErrors: ['insufficient_funds', 'invalid_signature', 'unauthorized'],
      onRetry: (attempt, error, nextDelayMs) => {
        console.log(`[ClawdnetAdapter] Retry attempt ${attempt} after error: ${error.message}. Next delay: ${nextDelayMs}ms`);
      },
    };

    // Initialize wallet if private key is provided
    if (this.config.privateKey) {
      this.initializeWallet(this.config.privateKey);
    }
  }

  /**
   * Initialize viem wallet for X402 payments
   */
  private initializeWallet(privateKey: string): void {
    try {
      const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
      this.account = privateKeyToAccount(formattedKey as `0x${string}`);

      this.walletClient = createWalletClient({
        account: this.account,
        chain: base,
        transport: http(this.config.rpcUrl),
      });

      // Type assertion to handle viem version differences
      this.publicClient = createPublicClient({
        chain: base,
        transport: http(this.config.rpcUrl),
      }) as any;

      this.walletAddress = this.account.address;
      console.log(`[ClawdnetAdapter] Wallet initialized: ${this.walletAddress}`);
    } catch (error) {
      console.error('[ClawdnetAdapter] Failed to initialize wallet:', error);
      this.walletClient = null;
      this.publicClient = null;
      this.account = null;
    }
  }

  /**
   * Set wallet private key for X402 payments
   */
  setWalletPrivateKey(privateKey: string): void {
    this.config.privateKey = privateKey;
    this.initializeWallet(privateKey);
  }

  /**
   * Get wallet address
   */
  getWalletAddress(): string | null {
    return this.walletAddress;
  }

  // ==================== Agent Registration ====================

  /**
   * Register as an agent on ClawdNet
   */
  async registerAgent(params: {
    name: string;
    description: string;
    endpoint: string;
    capabilities: string[];
    skills: Array<{ id: string; price: string }>;
    trustLevel?: 'open' | 'directory' | 'allowlist' | 'private';
  }): Promise<{
    success: boolean;
    agentId?: string;
    apiKey?: string;
    claimUrl?: string;
    error?: string;
  }> {
    try {
      const response = await this.client.post('/api/v1/agents/register', params);
      const { id, api_key, claim_url } = response.data;

      this.config.agentId = id;
      this.config.apiKey = api_key;
      this.client.defaults.headers.Authorization = `Bearer ${api_key}`;

      return {
        success: true,
        agentId: id,
        apiKey: api_key,
        claimUrl: claim_url,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send heartbeat to maintain online status
   */
  async sendHeartbeat(status: 'online' | 'busy' | 'offline' = 'online'): Promise<boolean> {
    if (!this.config.agentId) return false;

    try {
      await this.client.post(`/api/v1/agents/${this.config.agentId}/heartbeat`, {
        status,
        current_load: 0,
        metadata: {
          uptime: process.uptime(),
          last_updated: new Date().toISOString(),
        },
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Update agent status
   */
  async updateStatus(status: 'online' | 'busy' | 'offline'): Promise<boolean> {
    return this.sendHeartbeat(status);
  }

  // ==================== Agent Discovery ====================

  /**
   * Discover agents by capability
   */
  async discoverAgents(params?: {
    capability?: string;
    skill?: string;
    maxPrice?: string;
    minReputation?: number;
    status?: 'online' | 'busy';
    limit?: number;
  }): Promise<ClawdnetAgent[]> {
    try {
      const response = await this.client.get('/api/v1/discovery', { params });
      return response.data.agents || response.data;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get agent by handle
   */
  async getAgent(handle: string): Promise<ClawdnetAgent | null> {
    try {
      const response = await this.client.get(`/api/agents/${handle}`);
      return response.data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get agent by ID
   */
  async getAgentById(agentId: string): Promise<ClawdnetAgent | null> {
    try {
      const response = await this.client.get(`/api/v1/agents/${agentId}`);
      return response.data;
    } catch (error) {
      return null;
    }
  }

  // ==================== A2A Communication ====================

  /**
   * Send A2A message to another agent (with circuit breaker and retry)
   */
  async sendA2AMessage(params: {
    toAgentId: string;
    toHandle: string;
    skill: string;
    payload: Record<string, unknown>;
    maxPayment?: string;
  }): Promise<{
    success: boolean;
    response?: A2AMessage;
    paymentRequired?: X402PaymentRequest;
    error?: string;
  }> {
    const message: Partial<A2AMessage> = {
      version: 'a2a-v1',
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: new Date().toISOString(),
      from: {
        id: this.config.agentId || '',
        handle: this.config.agentHandle || '',
        endpoint: this.config.agentEndpoint || '',
      },
      to: {
        id: params.toAgentId,
        handle: params.toHandle,
      },
      type: 'request',
      skill: params.skill,
      payload: params.payload,
      payment: params.maxPayment
        ? { maxAmount: params.maxPayment, currency: 'USDC' }
        : undefined,
    };

    try {
      // Use circuit breaker for the A2A call
      return await this.circuitBreaker.execute(async () => {
        // Get target agent to find endpoint (with retry)
        const targetAgent = await withRetry(
          () => this.getAgent(params.toHandle).then(agent => {
            if (!agent) throw new Error('Target agent not found');
            return agent;
          }),
          { ...this.retryOptions, maxAttempts: 2 }
        );

        // Send directly to agent endpoint with retry
        const response = await withRetry(
          () => axios.post(targetAgent.endpoint, message, {
            timeout: this.config.timeout,
            headers: { 'Content-Type': 'application/json' },
          }),
          this.retryOptions
        );

        // Check for 402 Payment Required
        if (response.status === 402) {
          return {
            success: false,
            paymentRequired: {
              amount: response.headers['x-payment-amount'],
              currency: response.headers['x-payment-currency'] || 'USDC',
              recipientAddress: response.headers['x-payment-address'],
              chain: response.headers['x-payment-chain'] || 'base',
            },
          };
        }

        this.emit('a2a_message_sent', { message, response: response.data });

        return {
          success: true,
          response: response.data,
        };
      });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 402) {
        return {
          success: false,
          paymentRequired: {
            amount: error.response.headers['x-payment-amount'],
            currency: error.response.headers['x-payment-currency'] || 'USDC',
            recipientAddress: error.response.headers['x-payment-address'],
            chain: error.response.headers['x-payment-chain'] || 'base',
          },
        };
      }

      // Check if circuit breaker is open
      if (error instanceof Error && error.message.includes('Circuit breaker')) {
        console.warn('[ClawdnetAdapter] Circuit breaker OPEN - A2A requests blocked');
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Invoke agent skill (shorthand for A2A)
   */
  async invokeSkill(
    agentHandle: string,
    skillId: string,
    payload: Record<string, unknown>,
    maxPayment?: string
  ): Promise<{
    success: boolean;
    result?: unknown;
    paymentRequired?: X402PaymentRequest;
    error?: string;
  }> {
    const agent = await this.getAgent(agentHandle);
    if (!agent) {
      return { success: false, error: 'Agent not found' };
    }

    const response = await this.sendA2AMessage({
      toAgentId: agent.id,
      toHandle: agent.handle,
      skill: skillId,
      payload,
      maxPayment,
    });

    if (response.success && response.response) {
      return {
        success: true,
        result: response.response.payload,
      };
    }

    return response;
  }

  // ==================== X402 Payments ====================

  /**
   * Execute X402 payment on Base network using USDC
   */
  async executeX402Payment(payment: X402PaymentRequest): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
  }> {
    if (!this.walletClient || !this.publicClient) {
      return {
        success: false,
        error: 'Wallet not initialized. Set private key via setWalletPrivateKey() or constructor config.',
      };
    }

    if (!payment.recipientAddress || !payment.amount) {
      return {
        success: false,
        error: 'Invalid payment request: missing recipientAddress or amount',
      };
    }

    try {
      // Parse the amount (USDC has 6 decimals)
      const decimals = payment.currency === 'USDC' ? 6 : 18;
      const amountInSmallestUnit = parseUnits(payment.amount, decimals);

      // Determine if this is a USDC transfer or native ETH
      const isUSDC = payment.currency === 'USDC' || payment.asset === 'USDC';

      let txHash: `0x${string}`;

      if (isUSDC) {
        // ERC-20 USDC transfer
        const data = encodeFunctionData({
          abi: ERC20_TRANSFER_ABI,
          functionName: 'transfer',
          args: [payment.recipientAddress as `0x${string}`, amountInSmallestUnit],
        });

        txHash = await this.walletClient.sendTransaction({
          account: this.account,
          to: USDC_ADDRESS,
          data,
          chain: base,
        });
      } else {
        // Native ETH transfer
        txHash = await this.walletClient.sendTransaction({
          account: this.account,
          to: payment.recipientAddress as `0x${string}`,
          value: amountInSmallestUnit,
          chain: base,
        });
      }

      console.log(`[ClawdnetAdapter] X402 payment sent: ${txHash}`);

      // Wait for confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
      });

      if (receipt.status === 'success') {
        console.log(`[ClawdnetAdapter] X402 payment confirmed: ${receipt.transactionHash}`);
        this.emit('x402_payment_completed', {
          txHash: receipt.transactionHash,
          amount: payment.amount,
          currency: payment.currency,
          recipient: payment.recipientAddress,
        });

        return {
          success: true,
          txHash: receipt.transactionHash,
        };
      } else {
        return {
          success: false,
          txHash: receipt.transactionHash,
          error: 'Transaction reverted',
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ClawdnetAdapter] X402 payment failed:', errorMsg);
      return {
        success: false,
        error: `Payment failed: ${errorMsg}`,
      };
    }
  }

  /**
   * Check USDC balance for X402 payments
   */
  async getUSDCBalance(): Promise<string | null> {
    if (!this.publicClient || !this.walletAddress) {
      return null;
    }

    try {
      const balance = await this.publicClient.readContract({
        address: USDC_ADDRESS,
        abi: [
          {
            name: 'balanceOf',
            type: 'function',
            inputs: [{ name: 'account', type: 'address' }],
            outputs: [{ name: '', type: 'uint256' }],
          },
        ],
        functionName: 'balanceOf',
        args: [this.walletAddress as `0x${string}`],
      });

      // USDC has 6 decimals
      const formattedBalance = (Number(balance) / 1e6).toFixed(2);
      return formattedBalance;
    } catch (error) {
      console.error('[ClawdnetAdapter] Failed to get USDC balance:', error);
      return null;
    }
  }

  /**
   * Send paid A2A request (handles 402 automatically)
   */
  async sendPaidA2ARequest(params: {
    toAgentId: string;
    toHandle: string;
    skill: string;
    payload: Record<string, unknown>;
    maxPayment: string;
  }): Promise<{
    success: boolean;
    response?: A2AMessage;
    paymentTx?: string;
    error?: string;
  }> {
    // First attempt
    const firstAttempt = await this.sendA2AMessage(params);

    if (firstAttempt.success) {
      return { success: true, response: firstAttempt.response };
    }

    // Handle 402
    if (firstAttempt.paymentRequired) {
      const payment = firstAttempt.paymentRequired;

      // Check if within budget
      if (parseFloat(payment.amount) > parseFloat(params.maxPayment)) {
        return {
          success: false,
          error: `Payment amount ${payment.amount} exceeds max ${params.maxPayment}`,
        };
      }

      // Execute payment
      const paymentResult = await this.executeX402Payment(payment);
      if (!paymentResult.success) {
        return { success: false, error: paymentResult.error };
      }

      // Retry with payment proof
      const retryResult = await this.sendA2AMessage(params);

      return {
        success: retryResult.success,
        response: retryResult.response,
        paymentTx: paymentResult.txHash,
        error: retryResult.error,
      };
    }

    return { success: false, error: firstAttempt.error };
  }

  // ==================== Reputation ====================

  /**
   * Get agent reputation
   */
  async getReputation(agentId?: string): Promise<{
    score: number;
    level: 'New' | 'Building' | 'Established' | 'Trusted' | 'Elite';
    totalTransactions: number;
    successRate: number;
    avgResponseTime: number;
  } | null> {
    const id = agentId || this.config.agentId;
    if (!id) return null;

    try {
      const response = await this.client.get(`/api/v1/agents/${id}/reputation`);
      return response.data;
    } catch (error) {
      return null;
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

  /**
   * Get circuit breaker status for A2A operations
   */
  getCircuitBreakerStatus(): {
    state: string;
    failures: number;
    successes: number;
    isOpen: boolean;
  } {
    const stats = this.circuitBreaker.getStats();
    return {
      state: stats.state,
      failures: stats.failures,
      successes: stats.successes,
      isOpen: stats.state === 'OPEN',
    };
  }

  /**
   * Reset circuit breaker (manual recovery)
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
    console.log('[ClawdnetAdapter] Circuit breaker manually reset');
  }

  /**
   * Get comprehensive adapter status
   */
  getStatus(): {
    healthy: boolean;
    walletInitialized: boolean;
    walletAddress: string | null;
    circuitBreaker: {
      state: string;
      failures: number;
      successes: number;
    };
    agentId: string | undefined;
    agentHandle: string | undefined;
  } {
    return {
      healthy: this.health.healthy,
      walletInitialized: this.walletClient !== null,
      walletAddress: this.walletAddress,
      circuitBreaker: this.circuitBreaker.getStats(),
      agentId: this.config.agentId,
      agentHandle: this.config.agentHandle,
    };
  }

  /**
   * Set agent credentials
   */
  setCredentials(params: {
    agentId?: string;
    apiKey?: string;
    agentHandle?: string;
    agentEndpoint?: string;
  }): void {
    if (params.agentId) this.config.agentId = params.agentId;
    if (params.apiKey) {
      this.config.apiKey = params.apiKey;
      this.client.defaults.headers.Authorization = `Bearer ${params.apiKey}`;
    }
    if (params.agentHandle) this.config.agentHandle = params.agentHandle;
    if (params.agentEndpoint) this.config.agentEndpoint = params.agentEndpoint;
  }
}
