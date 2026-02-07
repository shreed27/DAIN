/**
 * ClawdnetAdapter - Integrates ClawdNet A2A protocol
 *
 * Features from ClawdNet:
 * - Agent discovery registry
 * - A2A protocol communication
 * - X402 USDC payments
 * - Reputation system
 * - Multi-agent workflows
 */

import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import type {
  AdapterConfig,
  AdapterHealth,
  ClawdnetAgent,
  A2AMessage,
  X402PaymentRequest,
} from './types.js';

export interface ClawdnetAdapterConfig extends AdapterConfig {
  agentId?: string;
  agentHandle?: string;
  agentEndpoint?: string;
  privateKey?: string;
}

export class ClawdnetAdapter extends EventEmitter {
  private client: AxiosInstance;
  private config: ClawdnetAdapterConfig;
  private health: AdapterHealth = { healthy: false, lastChecked: 0 };

  constructor(config: ClawdnetAdapterConfig) {
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
        ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
      },
    });
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
   * Send A2A message to another agent
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
      // Get target agent to find endpoint
      const targetAgent = await this.getAgent(params.toHandle);
      if (!targetAgent) {
        return { success: false, error: 'Target agent not found' };
      }

      // Send directly to agent endpoint
      const response = await axios.post(targetAgent.endpoint, message, {
        timeout: this.config.timeout,
        headers: { 'Content-Type': 'application/json' },
      });

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
   * Execute X402 payment
   */
  async executeX402Payment(payment: X402PaymentRequest): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
  }> {
    // X402 payment requires external payment execution
    // The actual implementation should use a wallet adapter to execute the payment
    console.error('[ClawdnetAdapter] X402 payment execution not implemented - requires wallet integration');
    return {
      success: false,
      error: 'X402 payment execution not implemented. Configure wallet integration to enable payments.',
    };
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
