/**
 * X402Client - HTTP 402 Payment Required Auto-Handler
 * Automatically handles paid API requests with USDC payments on Base
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  type PublicClient,
  type WalletClient,
  type Address,
  type Hash,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import type {
  X402ClientOptions,
  PaymentDetails,
  PaymentRecord,
  BudgetMode,
  BudgetState,
} from './types';
import { PaymentDetailsSchema } from './types';

// USDC on Base
const DEFAULT_USDC_ADDRESS: Address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// ERC20 ABI for transfer
const ERC20_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

export class X402Client {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private usdcAddress: Address;

  // Budget tracking
  private budgetMode: BudgetMode;
  private maxPerRequest: number;
  private totalBudget: number;
  private dailyLimit: number;
  private spent: number = 0;
  private dailySpent: number = 0;
  private lastDayReset: number = Date.now();
  private paymentHistory: PaymentRecord[] = [];

  constructor(options: X402ClientOptions) {
    const account = privateKeyToAccount(options.privateKey);

    this.publicClient = createPublicClient({
      chain: base,
      transport: http(options.rpcUrl || 'https://mainnet.base.org'),
    });

    this.walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(options.rpcUrl || 'https://mainnet.base.org'),
    });

    this.usdcAddress = options.usdcAddress || DEFAULT_USDC_ADDRESS;

    // Budget settings
    this.budgetMode = options.budgetMode || 'conservative';
    this.maxPerRequest = options.maxAutoPayment || 1.0;
    this.totalBudget = options.totalBudget || 100.0;
    this.dailyLimit = options.dailyLimit || 50.0;
  }

  // ============================================================================
  // Budget Management
  // ============================================================================

  /**
   * Set budget mode
   */
  setBudgetMode(mode: BudgetMode): { oldMode: BudgetMode; newMode: BudgetMode } {
    const oldMode = this.budgetMode;
    this.budgetMode = mode;

    // Adjust max per request based on mode
    switch (mode) {
      case 'unlimited':
        this.maxPerRequest = 10.0;
        break;
      case 'conservative':
        this.maxPerRequest = 0.5;
        break;
      case 'frozen':
        this.maxPerRequest = 0;
        break;
    }

    return { oldMode, newMode: mode };
  }

  /**
   * Set maximum payment per request
   */
  setMaxPaymentPerRequest(amount: number): void {
    if (amount < 0) throw new Error('Amount must be non-negative');
    this.maxPerRequest = amount;
  }

  /**
   * Get remaining budget
   */
  getRemainingBudget(): number {
    return Math.max(0, this.totalBudget - this.spent);
  }

  /**
   * Get budget state
   */
  getBudgetState(): BudgetState {
    this._checkDayReset();
    return {
      mode: this.budgetMode,
      spent: this.spent,
      dailySpent: this.dailySpent,
      remaining: this.getRemainingBudget(),
      dailyRemaining: Math.max(0, this.dailyLimit - this.dailySpent),
      paymentCount: this.paymentHistory.length,
    };
  }

  /**
   * Get payment history
   */
  getPaymentHistory(limit?: number): PaymentRecord[] {
    if (limit) {
      return this.paymentHistory.slice(-limit);
    }
    return [...this.paymentHistory];
  }

  private _checkDayReset(): void {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    if (now - this.lastDayReset > dayMs) {
      this.dailySpent = 0;
      this.lastDayReset = now;
    }
  }

  private _canPay(amount: number): { allowed: boolean; reason?: string } {
    if (this.budgetMode === 'frozen') {
      return { allowed: false, reason: 'Budget mode is FROZEN' };
    }

    if (amount > this.maxPerRequest) {
      return {
        allowed: false,
        reason: `Amount $${amount} exceeds max per request $${this.maxPerRequest}`,
      };
    }

    if (this.spent + amount > this.totalBudget) {
      return {
        allowed: false,
        reason: `Would exceed total budget. Remaining: $${this.getRemainingBudget()}`,
      };
    }

    this._checkDayReset();
    if (this.dailySpent + amount > this.dailyLimit) {
      return {
        allowed: false,
        reason: `Would exceed daily limit. Remaining today: $${this.dailyLimit - this.dailySpent}`,
      };
    }

    return { allowed: true };
  }

  // ============================================================================
  // Payment Execution
  // ============================================================================

  /**
   * Send USDC payment
   */
  async sendPayment(recipient: Address, amountUsdc: number): Promise<Hash> {
    // Convert to USDC units (6 decimals)
    const amount = parseUnits(amountUsdc.toString(), 6);

    const { request } = await this.publicClient.simulateContract({
      address: this.usdcAddress,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [recipient, amount],
      account: this.walletClient.account,
    });

    const txHash = await this.walletClient.writeContract(request);

    // Wait for confirmation
    await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    return txHash;
  }

  /**
   * Get USDC balance
   */
  async getBalance(): Promise<number> {
    const balance = await this.publicClient.readContract({
      address: this.usdcAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [this.walletClient.account!.address],
    });

    return parseFloat(formatUnits(balance, 6));
  }

  // ============================================================================
  // Fetch with Auto-Payment
  // ============================================================================

  /**
   * Fetch a URL, automatically handling 402 Payment Required
   */
  async fetch(
    url: string,
    init?: RequestInit
  ): Promise<Response> {
    // Initial request
    let response = await globalThis.fetch(url, init);

    // Handle 402 Payment Required
    if (response.status === 402) {
      const paymentDetails = await this._parsePaymentDetails(response);

      if (!paymentDetails) {
        console.error('[X402] Could not parse payment details from 402 response');
        return response;
      }

      // Convert to USDC amount (assuming 6 decimals)
      const amountUsdc = parseFloat(paymentDetails.amount) / 1e6;

      // Check budget
      const canPay = this._canPay(amountUsdc);
      if (!canPay.allowed) {
        console.error(`[X402] Payment blocked: ${canPay.reason}`);
        // Return a modified response indicating payment was blocked
        return new Response(
          JSON.stringify({
            error: 'Payment blocked by budget policy',
            reason: canPay.reason,
            budgetState: this.getBudgetState(),
          }),
          {
            status: 402,
            statusText: 'Payment Blocked',
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Execute payment
      console.log(`[X402] Paying $${amountUsdc} USDC to ${paymentDetails.address}...`);
      const txHash = await this.sendPayment(paymentDetails.address, amountUsdc);

      // Record payment
      this.spent += amountUsdc;
      this.dailySpent += amountUsdc;
      this.paymentHistory.push({
        txHash,
        recipient: paymentDetails.address,
        amount: amountUsdc,
        url,
        timestamp: Date.now(),
        budgetMode: this.budgetMode,
      });

      console.log(`[X402] Payment confirmed: ${txHash}`);

      // Retry request with payment proof
      const headers = new Headers(init?.headers);
      headers.set('X-Payment-Hash', txHash);
      headers.set('X-Payer-Address', this.walletClient.account!.address);

      response = await globalThis.fetch(url, { ...init, headers });
    }

    return response;
  }

  /**
   * Parse payment details from 402 response
   */
  private async _parsePaymentDetails(
    response: Response
  ): Promise<PaymentDetails | null> {
    try {
      // Try JSON body first
      const clone = response.clone();
      const data = await clone.json().catch(() => null);

      if (data?.payment) {
        const result = PaymentDetailsSchema.safeParse(data.payment);
        if (result.success) {
          return result.data as PaymentDetails;
        }
      }

      // Fallback to headers
      const headerAddress = response.headers.get('x-payment-address');
      const headerAmount = response.headers.get('x-payment-amount');

      if (headerAddress && headerAmount) {
        return {
          address: headerAddress as Address,
          amount: headerAmount,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get wallet address
   */
  getAddress(): Address {
    return this.walletClient.account!.address;
  }
}

export * from './types';
