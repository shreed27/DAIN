/**
 * A2A Protocol Types
 * Agent-to-Agent communication message formats
 */

import { z } from 'zod';
import type { Address, Hex } from 'viem';

// ============================================================================
// Agent Identity
// ============================================================================

export interface AgentId {
  /** Unique agent identifier (from registry) */
  id: string;
  /** Agent domain/handle (e.g., "@myagent") */
  handle: string;
  /** Agent wallet address */
  address?: Address;
}

export const AgentIdSchema = z.object({
  id: z.string(),
  handle: z.string(),
  address: z.string().startsWith('0x').optional(),
});

// ============================================================================
// A2A Message Types
// ============================================================================

export type A2AMessageType = 'request' | 'response' | 'error' | 'ping' | 'pong';

export interface A2APayment {
  /** Maximum amount willing to pay (in USDC, human-readable) */
  maxAmount: string;
  /** Currency (currently only USDC supported) */
  currency: 'USDC';
  /** Chain ID for payment (default: 8453 for Base) */
  chainId?: number;
}

export interface A2AMessage {
  /** Protocol version */
  version: 'a2a-v1';
  /** Unique message ID */
  id: string;
  /** Timestamp (ISO 8601) */
  timestamp: string;
  /** Sender agent */
  from: AgentId;
  /** Recipient agent (handle or full AgentId) */
  to: AgentId | { handle: string };
  /** Message type */
  type: A2AMessageType;
  /** Skill being invoked (for requests) */
  skill?: string;
  /** Message payload */
  payload: Record<string, unknown>;
  /** Payment offer (for paid skills) */
  payment?: A2APayment;
  /** Request ID this message is responding to */
  replyTo?: string;
}

export interface SignedA2AMessage extends A2AMessage {
  /** Signature of the message */
  signature: Hex;
  /** Signer address */
  signer: Address;
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface A2ARequest extends A2AMessage {
  type: 'request';
  skill: string;
}

export interface A2AResponse extends A2AMessage {
  type: 'response';
  replyTo: string;
  payload: {
    success: boolean;
    data?: unknown;
    error?: string;
    paymentRequired?: {
      amount: string;
      address: Address;
      chainId: number;
    };
  };
}

export interface A2AError extends A2AMessage {
  type: 'error';
  payload: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ============================================================================
// Handler Types
// ============================================================================

export interface A2AHandlerContext {
  /** The incoming message */
  message: A2ARequest;
  /** Sender agent info */
  sender: AgentId;
  /** Payment info if provided */
  payment?: A2APayment;
}

export type A2AHandler = (
  ctx: A2AHandlerContext
) => Promise<{ success: boolean; data?: unknown; error?: string }>;

export interface A2ASkillDefinition {
  /** Skill name */
  name: string;
  /** Description */
  description: string;
  /** Price in USDC (0 for free) */
  price: number;
  /** Handler function */
  handler: A2AHandler;
}

// ============================================================================
// Validation Schemas
// ============================================================================

export const A2APaymentSchema = z.object({
  maxAmount: z.string(),
  currency: z.literal('USDC'),
  chainId: z.number().optional(),
});

export const A2AMessageSchema = z.object({
  version: z.literal('a2a-v1'),
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  from: AgentIdSchema,
  to: z.union([AgentIdSchema, z.object({ handle: z.string() })]),
  type: z.enum(['request', 'response', 'error', 'ping', 'pong']),
  skill: z.string().optional(),
  payload: z.record(z.unknown()),
  payment: A2APaymentSchema.optional(),
  replyTo: z.string().uuid().optional(),
});

export const SignedA2AMessageSchema = A2AMessageSchema.extend({
  signature: z.string().startsWith('0x'),
  signer: z.string().startsWith('0x'),
});
