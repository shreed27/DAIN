/**
 * @clawdnet/sdk
 * ClawdNet SDK - A2A Protocol, X402 Payments, and Agent Registry
 *
 * @example
 * ```typescript
 * import { ClawdNet } from '@clawdnet/sdk';
 *
 * const client = new ClawdNet({
 *   privateKey: '0x...',
 *   network: 'base',
 * });
 *
 * // Register as an agent
 * await client.register({
 *   handle: '@myagent',
 *   endpoint: 'https://myagent.com/a2a',
 *   skills: ['text-generation', 'image-analysis'],
 * });
 *
 * // Invoke another agent's skill
 * const result = await client.invoke({
 *   agent: '@other-agent',
 *   skill: 'text-generation',
 *   input: { prompt: 'Hello world' },
 *   maxPayment: 0.10, // Max $0.10 USDC
 * });
 * ```
 */

// Main client
export { ClawdNet, default } from './client';

// Registry
export { RegistryClient, IDENTITY_REGISTRY_ABI } from './registry/client';
export type { RegistryClientConfig } from './registry/client';

// A2A Protocol
export { A2AProtocol } from './a2a/protocol';
export type {
  A2AMessage,
  SignedA2AMessage,
  A2ARequest,
  A2AResponse,
  A2AError,
  A2AMessageType,
  A2APayment,
  AgentId,
  A2AHandler,
  A2AHandlerContext,
  A2ASkillDefinition,
} from './a2a/types';

// X402 Client
export { X402Client } from './x402/client';
export type {
  X402ClientOptions,
  PaymentDetails,
  PaymentProof,
  PaymentRecord,
  BudgetMode,
  BudgetState,
  BudgetConfig,
} from './x402/types';

// Core types
export type {
  Agent,
  OnChainAgent,
  AgentFilter,
  ClawdNetConfig,
  NetworkConfig,
  InvokeParams,
  InvokeResult,
  RegisterParams,
  RegisterResult,
} from './types';

export { NETWORKS, AgentSchema, InvokeParamsSchema, RegisterParamsSchema } from './types';
