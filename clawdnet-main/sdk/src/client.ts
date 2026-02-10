/**
 * ClawdNet - Main SDK Client
 * Unified interface for A2A protocol, X402 payments, and agent registry
 */

import type { Address, Hex, Hash } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { RegistryClient } from './registry/client';
import { A2AProtocol } from './a2a/protocol';
import { X402Client } from './x402/client';
import type {
  ClawdNetConfig,
  Agent,
  AgentFilter,
  InvokeParams,
  InvokeResult,
  RegisterParams,
  RegisterResult,
  NETWORKS,
  NetworkConfig,
} from './types';
import type { AgentId, A2ARequest, SignedA2AMessage } from './a2a/types';
import { base } from 'viem/chains';

// Default network configurations
const NETWORK_CONFIGS: Record<string, NetworkConfig> = {
  base: {
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',
    registryAddress: '0x0000000000000000000000000000000000000000' as Address, // TODO: Deploy
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  },
  baseSepolia: {
    chainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
    registryAddress: '0x0000000000000000000000000000000000000000' as Address,
    usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address,
  },
};

/**
 * ClawdNet SDK Client
 * The main entry point for interacting with the ClawdNet network
 */
export class ClawdNet {
  private privateKey: Hex;
  private address: Address;
  private network: NetworkConfig;
  private debug: boolean;

  /** Registry client for on-chain operations */
  public readonly registry: RegistryClient;

  /** X402 client for auto-payments */
  public readonly x402: X402Client;

  /** Agent identity (set after registration or lookup) */
  private agentId: AgentId | null = null;

  constructor(config: ClawdNetConfig) {
    this.privateKey = config.privateKey;
    this.debug = config.debug || false;

    // Get account address from private key
    const account = privateKeyToAccount(config.privateKey);
    this.address = account.address;

    // Resolve network configuration
    if (typeof config.network === 'string') {
      this.network = NETWORK_CONFIGS[config.network] || NETWORK_CONFIGS.base;
    } else if (config.network) {
      this.network = config.network;
    } else {
      this.network = NETWORK_CONFIGS.base;
    }

    // Override with custom values
    if (config.rpcUrl) this.network.rpcUrl = config.rpcUrl;
    if (config.registryAddress) this.network.registryAddress = config.registryAddress;

    // Initialize registry client
    this.registry = new RegistryClient({
      privateKey: config.privateKey,
      registryAddress: this.network.registryAddress,
      rpcUrl: this.network.rpcUrl,
      chain: base,
    });

    // Initialize X402 client
    this.x402 = new X402Client({
      privateKey: config.privateKey,
      rpcUrl: this.network.rpcUrl,
      chainId: this.network.chainId,
      usdcAddress: this.network.usdcAddress,
      maxAutoPayment: config.maxAutoPayment,
    });

    this._log('ClawdNet initialized', { address: this.address, network: this.network.chainId });
  }

  private _log(message: string, data?: unknown): void {
    if (this.debug) {
      console.log(`[ClawdNet] ${message}`, data || '');
    }
  }

  // ============================================================================
  // Agent Discovery
  // ============================================================================

  /**
   * List agents from the registry
   * Note: This is a simplified implementation - full listing would require
   * indexing events or a separate API
   */
  async listAgents(filter?: AgentFilter): Promise<Agent[]> {
    // For now, return empty array - full implementation would need indexer
    this._log('listAgents called', filter);
    return [];
  }

  /**
   * Get agent by handle/domain or ID
   */
  async getAgent(handleOrId: string): Promise<Agent | null> {
    this._log('getAgent', handleOrId);

    // Try by domain first
    const byDomain = await this.registry.getAgentByDomain(handleOrId);
    if (byDomain) {
      return {
        id: byDomain.agentId.toString(),
        domain: byDomain.domain,
        address: byDomain.address,
      };
    }

    // Try as numeric ID
    const numId = parseInt(handleOrId);
    if (!isNaN(numId)) {
      const byId = await this.registry.getAgent(BigInt(numId));
      if (byId) {
        return {
          id: byId.agentId.toString(),
          domain: byId.domain,
          address: byId.address,
        };
      }
    }

    return null;
  }

  // ============================================================================
  // A2A Invocation
  // ============================================================================

  /**
   * Invoke a skill on another agent
   */
  async invoke<T = unknown>(params: InvokeParams): Promise<InvokeResult<T>> {
    const startTime = Date.now();
    this._log('invoke', params);

    try {
      // Resolve agent
      const agent = await this.getAgent(params.agent);
      if (!agent) {
        return {
          success: false,
          error: `Agent not found: ${params.agent}`,
          executionTime: Date.now() - startTime,
        };
      }

      // We need the agent's endpoint - for now, we'll construct it
      // In production, this would come from a metadata service
      const endpoint = agent.endpoint || `https://${agent.domain.replace('@', '')}.clawdnet.io/a2a`;

      // Create agent identity
      if (!this.agentId) {
        // Try to get our own agent ID from registry
        const selfAgent = await this.registry.getAgentByAddress(this.address);
        if (selfAgent) {
          this.agentId = {
            id: selfAgent.agentId.toString(),
            handle: selfAgent.domain,
            address: this.address,
          };
        } else {
          // Use address as temporary ID
          this.agentId = {
            id: this.address,
            handle: `@${this.address.slice(0, 8)}`,
            address: this.address,
          };
        }
      }

      // Create A2A request
      const request = A2AProtocol.createRequest({
        from: this.agentId,
        to: { handle: agent.domain },
        skill: params.skill,
        payload: params.input,
        payment: params.maxPayment
          ? { maxAmount: params.maxPayment.toString(), currency: 'USDC' }
          : undefined,
      });

      // Sign the request
      const signedRequest = await A2AProtocol.sign(request, this.privateKey);

      // Send request (using x402 fetch for auto-payment handling)
      const response = await this.x402.fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(signedRequest),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error || `Request failed with status ${response.status}`,
          executionTime: Date.now() - startTime,
        };
      }

      const responseData = (await response.json()) as SignedA2AMessage;

      // Verify response signature
      const verified = await A2AProtocol.verify(responseData);
      if (!verified.valid) {
        return {
          success: false,
          error: 'Invalid response signature',
          executionTime: Date.now() - startTime,
        };
      }

      // Extract result
      const payload = responseData.payload as {
        success: boolean;
        data?: T;
        error?: string;
      };

      return {
        success: payload.success,
        data: payload.data,
        error: payload.error,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - startTime,
      };
    }
  }

  // ============================================================================
  // Agent Registration
  // ============================================================================

  /**
   * Register a new agent on the ClawdNet network
   */
  async register(params: RegisterParams): Promise<RegisterResult> {
    this._log('register', params);

    // Check if domain is available
    const existing = await this.registry.getAgentByDomain(params.handle);
    if (existing) {
      throw new Error(`Domain already registered: ${params.handle}`);
    }

    // Register on-chain
    const { agentId, txHash } = await this.registry.registerAgent(params.handle);

    // Update local agent identity
    this.agentId = {
      id: agentId.toString(),
      handle: params.handle,
      address: this.address,
    };

    // Note: In production, you would also register endpoint and skills
    // with a metadata service or emit events with this info

    return {
      agentId: agentId.toString(),
      domain: params.handle,
      address: this.address,
      txHash,
    };
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get the connected wallet address
   */
  getAddress(): Address {
    return this.address;
  }

  /**
   * Get current agent identity (if registered)
   */
  getAgentId(): AgentId | null {
    return this.agentId;
  }

  /**
   * Get USDC balance
   */
  async getBalance(): Promise<number> {
    return this.x402.getBalance();
  }

  /**
   * Get network configuration
   */
  getNetwork(): NetworkConfig {
    return this.network;
  }
}

export default ClawdNet;
