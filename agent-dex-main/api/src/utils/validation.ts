import { PublicKey } from '@solana/web3.js';

/**
 * Validation utilities for AgentDEX API
 */

const SLIPPAGE_BOUNDS = {
  MIN_BPS: 1,      // 0.01%
  MAX_BPS: 500,    // 5%
  DEFAULT_BPS: 50, // 0.5%
};

/**
 * Validate a Solana address (wallet or mint)
 */
export function isValidSolanaAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate slippage in basis points
 */
export function validateSlippageBps(bps: unknown): { valid: boolean; error?: string; value?: number } {
  if (bps === undefined || bps === null) {
    return { valid: true, value: SLIPPAGE_BOUNDS.DEFAULT_BPS };
  }

  const numBps = typeof bps === 'string' ? parseInt(bps, 10) : bps;

  if (typeof numBps !== 'number' || isNaN(numBps)) {
    return { valid: false, error: 'Slippage must be a valid number' };
  }

  if (numBps < SLIPPAGE_BOUNDS.MIN_BPS) {
    return { valid: false, error: `Slippage must be >= ${SLIPPAGE_BOUNDS.MIN_BPS} bps (0.01%)` };
  }
  if (numBps > SLIPPAGE_BOUNDS.MAX_BPS) {
    return { valid: false, error: `Slippage must be <= ${SLIPPAGE_BOUNDS.MAX_BPS} bps (5%)` };
  }

  return { valid: true, value: numBps };
}

/**
 * Validate a numeric amount
 */
export function validateAmount(amount: unknown, min = 0): { valid: boolean; error?: string; value?: number } {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (typeof numAmount !== 'number' || isNaN(numAmount)) {
    return { valid: false, error: 'Amount must be a valid number' };
  }

  if (numAmount <= min) {
    return { valid: false, error: `Amount must be > ${min}` };
  }

  return { valid: true, value: numAmount };
}
