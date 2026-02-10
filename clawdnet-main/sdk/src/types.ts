import { z } from 'zod';
import type { Address, Hash, Hex } from 'viem';

// ============================================================================
// Agent Types
// ============================================================================

export interface Agent {
  id: string;
  domain: string;
  address: Address;
  endpoint?: string;
  skills?: string[];
  metadata?: Record<string, unknown>;
}

export interface OnChainAgent {
  agentId: bigint;
  domain: string;
  address: Address;
}

export interface AgentFilter {
  skill?: string;
  maxPrice?: number;
  domain?: string;
}

// ============================================================================
// Network Config
// ============================================================================

export interface NetworkConfig {
  chainId: number;
  rpcUrl: string;
  registryAddress: Address;
  usdcAddress: Address;
}

export const NETWORKS: Record<string, NetworkConfig> = {
  base: {
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',
    registryAddress: '0x0000000000000000000000000000000000000000' as Address, // TODO: Deploy
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  },
  baseSepolia: {
    chainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
    registryAddress: '0x0000000000000000000000000000000000000000' as Address, // TODO: Deploy
    usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address,
  },
};

// ============================================================================
// ClawdNet Client Config
// ============================================================================

export interface ClawdNetConfig {
  /** Private key for signing transactions and messages */
  privateKey: Hex;
  /** Network to connect to (default: 'base') */
  network?: keyof typeof NETWORKS | NetworkConfig;
  /** Custom RPC URL (overrides network default) */
  rpcUrl?: string;
  /** Registry contract address (overrides network default) */
  registryAddress?: Address;
  /** Maximum auto-payment amount per request in USDC (default: 1.0) */
  maxAutoPayment?: number;
  /** Enable debug logging */
  debug?: boolean;
}

// ============================================================================
// Invocation Types
// ============================================================================

export interface InvokeParams {
  /** Agent handle or ID */
  agent: string;
  /** Skill to invoke */
  skill: string;
  /** Input payload */
  input: Record<string, unknown>;
  /** Maximum payment willing to make in USDC */
  maxPayment?: number;
  /** Request timeout in ms */
  timeout?: number;
}

export interface InvokeResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  paymentMade?: {
    amount: string;
    txHash: Hash;
    recipient: Address;
  };
  executionTime: number;
}

// ============================================================================
// Registration Types
// ============================================================================

export interface RegisterParams {
  /** Unique domain/handle for the agent (e.g., "@myagent") */
  handle: string;
  /** HTTP endpoint for receiving A2A requests */
  endpoint: string;
  /** List of skills this agent provides */
  skills: string[];
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

export interface RegisterResult {
  agentId: string;
  domain: string;
  address: Address;
  txHash: Hash;
}

// ============================================================================
// Validation Schemas
// ============================================================================

export const AgentSchema = z.object({
  id: z.string(),
  domain: z.string(),
  address: z.string().startsWith('0x'),
  endpoint: z.string().url().optional(),
  skills: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const InvokeParamsSchema = z.object({
  agent: z.string().min(1),
  skill: z.string().min(1),
  input: z.record(z.unknown()),
  maxPayment: z.number().positive().optional(),
  timeout: z.number().positive().optional(),
});

export const RegisterParamsSchema = z.object({
  handle: z.string().min(1).max(64),
  endpoint: z.string().url(),
  skills: z.array(z.string().min(1)).min(1),
  metadata: z.record(z.unknown()).optional(),
});
