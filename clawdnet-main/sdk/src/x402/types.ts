/**
 * X402 Protocol Types
 * HTTP 402 Payment Required handling
 */

import { z } from 'zod';
import type { Address, Hash } from 'viem';

// ============================================================================
// Payment Details
// ============================================================================

export interface PaymentDetails {
  /** Recipient address */
  address: Address;
  /** Amount in smallest unit (e.g., USDC with 6 decimals) */
  amount: string;
  /** Chain ID */
  chainId?: number;
  /** Currency (default: USDC) */
  currency?: string;
  /** Optional memo/reference */
  memo?: string;
}

export interface PaymentProof {
  /** Transaction hash */
  txHash: Hash;
  /** Payer address */
  payer: Address;
  /** Amount paid */
  amount: string;
  /** Chain ID */
  chainId: number;
}

// ============================================================================
// Budget Modes
// ============================================================================

export type BudgetMode = 'unlimited' | 'conservative' | 'frozen';

export interface BudgetConfig {
  /** Budget mode */
  mode: BudgetMode;
  /** Maximum payment per request in USDC */
  maxPerRequest: number;
  /** Total budget in USDC */
  totalBudget: number;
  /** Daily limit in USDC */
  dailyLimit: number;
}

export interface BudgetState {
  /** Current mode */
  mode: BudgetMode;
  /** Amount spent */
  spent: number;
  /** Daily amount spent */
  dailySpent: number;
  /** Remaining budget */
  remaining: number;
  /** Daily remaining */
  dailyRemaining: number;
  /** Number of payments made */
  paymentCount: number;
}

// ============================================================================
// Payment History
// ============================================================================

export interface PaymentRecord {
  /** Transaction hash */
  txHash: Hash;
  /** Recipient */
  recipient: Address;
  /** Amount in USDC */
  amount: number;
  /** URL that required payment */
  url: string;
  /** Timestamp */
  timestamp: number;
  /** Budget mode at time of payment */
  budgetMode: BudgetMode;
}

// ============================================================================
// Client Options
// ============================================================================

export interface X402ClientOptions {
  /** Private key for signing transactions */
  privateKey: `0x${string}`;
  /** RPC URL (default: Base mainnet) */
  rpcUrl?: string;
  /** Chain ID (default: 8453 for Base) */
  chainId?: number;
  /** USDC contract address */
  usdcAddress?: Address;
  /** Initial budget mode */
  budgetMode?: BudgetMode;
  /** Maximum auto-payment per request in USDC */
  maxAutoPayment?: number;
  /** Total budget in USDC */
  totalBudget?: number;
  /** Daily limit in USDC */
  dailyLimit?: number;
}

// ============================================================================
// Validation Schemas
// ============================================================================

export const PaymentDetailsSchema = z.object({
  address: z.string().startsWith('0x'),
  amount: z.string(),
  chainId: z.number().optional(),
  currency: z.string().optional(),
  memo: z.string().optional(),
});

export const PaymentProofSchema = z.object({
  txHash: z.string().startsWith('0x'),
  payer: z.string().startsWith('0x'),
  amount: z.string(),
  chainId: z.number(),
});
