/**
 * RegistryClient - On-chain Identity Registry Client
 * Interacts with the ERC-8004 IdentityRegistry contract
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Address,
  type Hash,
  type Chain,
  type Transport,
  getContract,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';
import { IDENTITY_REGISTRY_ABI } from './abi';
import type { OnChainAgent, NetworkConfig, NETWORKS } from '../types';

export interface RegistryClientConfig {
  /** Public client for read operations */
  publicClient?: PublicClient;
  /** Wallet client for write operations (optional) */
  walletClient?: WalletClient;
  /** Private key for creating wallet client (alternative to walletClient) */
  privateKey?: `0x${string}`;
  /** Network configuration */
  network?: NetworkConfig;
  /** Chain to use (default: base) */
  chain?: Chain;
  /** RPC URL */
  rpcUrl?: string;
  /** Registry contract address */
  registryAddress: Address;
}

export class RegistryClient {
  private publicClient: PublicClient;
  private walletClient: WalletClient | null;
  private registryAddress: Address;
  private chain: Chain;

  constructor(config: RegistryClientConfig) {
    this.chain = config.chain || base;
    this.registryAddress = config.registryAddress;

    // Create public client
    if (config.publicClient) {
      this.publicClient = config.publicClient;
    } else {
      this.publicClient = createPublicClient({
        chain: this.chain,
        transport: http(config.rpcUrl || config.network?.rpcUrl),
      });
    }

    // Create wallet client if private key provided
    if (config.walletClient) {
      this.walletClient = config.walletClient;
    } else if (config.privateKey) {
      const account = privateKeyToAccount(config.privateKey);
      this.walletClient = createWalletClient({
        account,
        chain: this.chain,
        transport: http(config.rpcUrl || config.network?.rpcUrl),
      });
    } else {
      this.walletClient = null;
    }
  }

  /**
   * Get the contract instance for direct interaction
   */
  private getContract() {
    return getContract({
      address: this.registryAddress,
      abi: IDENTITY_REGISTRY_ABI,
      client: {
        public: this.publicClient,
        wallet: this.walletClient || undefined,
      },
    });
  }

  // ============================================================================
  // Read Operations
  // ============================================================================

  /**
   * Get agent by ID
   */
  async getAgent(agentId: bigint): Promise<OnChainAgent | null> {
    const result = await this.publicClient.readContract({
      address: this.registryAddress,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'getAgent',
      args: [agentId],
    });

    const [id, domain, address] = result;

    // Check if agent exists (address will be zero if not found)
    if (address === '0x0000000000000000000000000000000000000000') {
      return null;
    }

    return {
      agentId: id,
      domain,
      address,
    };
  }

  /**
   * Get agent by domain/handle
   */
  async getAgentByDomain(domain: string): Promise<OnChainAgent | null> {
    const result = await this.publicClient.readContract({
      address: this.registryAddress,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'resolveAgentByDomain',
      args: [domain],
    });

    const [id, agentDomain, address] = result;

    if (address === '0x0000000000000000000000000000000000000000') {
      return null;
    }

    return {
      agentId: id,
      domain: agentDomain,
      address,
    };
  }

  /**
   * Get agent by wallet address
   */
  async getAgentByAddress(address: Address): Promise<OnChainAgent | null> {
    const result = await this.publicClient.readContract({
      address: this.registryAddress,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'resolveAgentByAddress',
      args: [address],
    });

    const [id, domain, agentAddress] = result;

    if (agentAddress === '0x0000000000000000000000000000000000000000') {
      return null;
    }

    return {
      agentId: id,
      domain,
      address: agentAddress,
    };
  }

  /**
   * Get total number of registered agents
   */
  async getTotalAgents(): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.registryAddress,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'totalAgents',
    });
  }

  // ============================================================================
  // Write Operations (require wallet)
  // ============================================================================

  /**
   * Register a new agent on-chain
   * The caller's address becomes the agent's address
   */
  async registerAgent(domain: string): Promise<{ agentId: bigint; txHash: Hash }> {
    if (!this.walletClient?.account) {
      throw new Error('Wallet client required for write operations');
    }

    const address = this.walletClient.account.address;

    // Simulate first to check for errors
    const { request } = await this.publicClient.simulateContract({
      address: this.registryAddress,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'newAgent',
      args: [domain, address],
      account: this.walletClient.account,
    });

    // Execute transaction
    const txHash = await this.walletClient.writeContract(request);

    // Wait for confirmation and get the agent ID from events
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    // Parse the AgentRegistered event to get the agent ID
    let agentId: bigint = 0n;
    for (const log of receipt.logs) {
      // Check if this is our event (by topic)
      // Topic 0 is the event signature hash
      if (log.address.toLowerCase() === this.registryAddress.toLowerCase()) {
        // The agentId is in the first indexed topic
        if (log.topics[1]) {
          agentId = BigInt(log.topics[1]);
        }
      }
    }

    return { agentId, txHash };
  }

  /**
   * Update an existing agent's domain and/or address
   * Only the current agent address can update
   */
  async updateAgent(
    agentId: bigint,
    updates: { domain?: string; address?: Address }
  ): Promise<{ success: boolean; txHash: Hash }> {
    if (!this.walletClient?.account) {
      throw new Error('Wallet client required for write operations');
    }

    const newDomain = updates.domain || '';
    const newAddress = updates.address || '0x0000000000000000000000000000000000000000';

    const { request } = await this.publicClient.simulateContract({
      address: this.registryAddress,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'updateAgent',
      args: [agentId, newDomain, newAddress as Address],
      account: this.walletClient.account,
    });

    const txHash = await this.walletClient.writeContract(request);

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    return { success: true, txHash };
  }

  /**
   * Check if a domain is available for registration
   */
  async isDomainAvailable(domain: string): Promise<boolean> {
    const agent = await this.getAgentByDomain(domain);
    return agent === null;
  }

  /**
   * Get the connected wallet address
   */
  getAddress(): Address | null {
    return this.walletClient?.account?.address || null;
  }
}

export { IDENTITY_REGISTRY_ABI } from './abi';
