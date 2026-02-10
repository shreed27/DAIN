import fetch from 'node-fetch';
import { WalletManager } from './WalletManager.js';

/**
 * X402Client - HTTP client with automatic 402 Payment Required handling
 * Supports budget modes for Survival Mode integration
 */
export class X402Client {
    constructor(options = {}) {
        this.wallet = new WalletManager();

        // Budget controls
        this.budgetMode = options.budgetMode || 'unlimited'; // 'unlimited' | 'conservative' | 'frozen'
        this.maxPaymentPerRequest = options.maxPaymentPerRequest || 1.0; // Max USDC per request
        this.totalBudget = options.totalBudget || 100.0; // Total budget in USDC
        this.spentAmount = 0;

        // Payment tracking
        this.paymentHistory = [];
        this.dailySpent = 0;
        this.dailyLimit = options.dailyLimit || 50.0;
        this.lastDayReset = Date.now();

        console.log(`💳 X402Client initialized. Budget mode: ${this.budgetMode}, Max per request: $${this.maxPaymentPerRequest}`);
    }

    /**
     * Set budget mode for Survival Mode integration
     * @param {'unlimited' | 'conservative' | 'frozen'} mode
     */
    setBudgetMode(mode) {
        const validModes = ['unlimited', 'conservative', 'frozen'];
        if (!validModes.includes(mode)) {
            throw new Error(`Invalid budget mode: ${mode}. Must be one of: ${validModes.join(', ')}`);
        }

        const oldMode = this.budgetMode;
        this.budgetMode = mode;

        // Adjust max payment based on mode
        switch (mode) {
            case 'unlimited':
                this.maxPaymentPerRequest = 1.0;
                console.log('🟢 [X402] Budget mode: UNLIMITED - Full spending enabled');
                break;
            case 'conservative':
                this.maxPaymentPerRequest = 0.25;
                console.log('🟡 [X402] Budget mode: CONSERVATIVE - Reduced spending ($0.25 max)');
                break;
            case 'frozen':
                this.maxPaymentPerRequest = 0;
                console.log('🔴 [X402] Budget mode: FROZEN - All payments blocked');
                break;
        }

        return { oldMode, newMode: mode };
    }

    /**
     * Set maximum payment per request
     * @param {number} amount - Max USDC per request
     */
    setMaxPaymentPerRequest(amount) {
        if (typeof amount !== 'number' || amount < 0) {
            throw new Error('Max payment must be a non-negative number');
        }
        this.maxPaymentPerRequest = amount;
        console.log(`💰 [X402] Max payment per request set to: $${amount}`);
    }

    /**
     * Get remaining budget
     * @returns {number} Remaining budget in USDC
     */
    getRemainingBudget() {
        return Math.max(0, this.totalBudget - this.spentAmount);
    }

    /**
     * Get daily remaining budget
     * @returns {number} Remaining daily budget in USDC
     */
    getDailyRemaining() {
        this._checkDayReset();
        return Math.max(0, this.dailyLimit - this.dailySpent);
    }

    /**
     * Check and reset daily counter if needed
     */
    _checkDayReset() {
        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;
        if (now - this.lastDayReset > dayMs) {
            this.dailySpent = 0;
            this.lastDayReset = now;
            console.log('📅 [X402] Daily spending counter reset');
        }
    }

    /**
     * Check if payment is allowed under current budget constraints
     * @param {number} amount - Payment amount in USDC
     * @returns {{ allowed: boolean, reason?: string }}
     */
    _canPay(amount) {
        // Check frozen mode
        if (this.budgetMode === 'frozen') {
            return { allowed: false, reason: 'Budget mode is FROZEN - all payments blocked' };
        }

        // Check per-request limit
        if (amount > this.maxPaymentPerRequest) {
            return {
                allowed: false,
                reason: `Payment $${amount} exceeds max per request $${this.maxPaymentPerRequest}`
            };
        }

        // Check total budget
        if (this.spentAmount + amount > this.totalBudget) {
            return {
                allowed: false,
                reason: `Payment would exceed total budget. Remaining: $${this.getRemainingBudget()}`
            };
        }

        // Check daily limit
        this._checkDayReset();
        if (this.dailySpent + amount > this.dailyLimit) {
            return {
                allowed: false,
                reason: `Payment would exceed daily limit. Remaining today: $${this.getDailyRemaining()}`
            };
        }

        return { allowed: true };
    }

    /**
     * Record a payment
     * @param {number} amount - Amount paid in USDC
     * @param {string} recipient - Recipient address
     * @param {string} txHash - Transaction hash
     */
    _recordPayment(amount, recipient, txHash) {
        this.spentAmount += amount;
        this.dailySpent += amount;

        this.paymentHistory.push({
            amount,
            recipient,
            txHash,
            timestamp: Date.now(),
            budgetMode: this.budgetMode
        });

        console.log(`📊 [X402] Payment recorded: $${amount}. Total spent: $${this.spentAmount}/${this.totalBudget}`);
    }

    /**
     * Get payment statistics
     * @returns {object} Payment stats
     */
    getStats() {
        return {
            budgetMode: this.budgetMode,
            maxPaymentPerRequest: this.maxPaymentPerRequest,
            totalBudget: this.totalBudget,
            spentAmount: this.spentAmount,
            remainingBudget: this.getRemainingBudget(),
            dailyLimit: this.dailyLimit,
            dailySpent: this.dailySpent,
            dailyRemaining: this.getDailyRemaining(),
            totalPayments: this.paymentHistory.length,
            walletAddress: this.wallet.getAddress()
        };
    }

    /**
     * Performs a fetch request. If a 402 is encountered, attempts to pay and retry.
     * Respects budget mode and limits.
     * @param {string} url
     * @param {object} options
     */
    async fetch(url, options = {}) {
        console.log(`📡 [X402] Requesting ${url}...`);

        // Initial request
        let response = await fetch(url, options);

        if (response.status === 402) {
            console.log('🔒 [X402] 402 Payment Required. Processing...');

            // Check if wallet is configured
            if (!this.wallet.getAddress()) {
                console.error('❌ [X402] Wallet not configured. Cannot proceed with payment.');
                return response;
            }

            try {
                // Parse payment requirements
                const data = await response.clone().json().catch(() => null);

                let paymentDetails = null;

                if (data && data.payment) {
                    paymentDetails = data.payment;
                } else {
                    // Fallback: Check headers
                    const headerAddress = response.headers.get('x-payment-address');
                    const headerAmount = response.headers.get('x-payment-amount');
                    if (headerAddress && headerAmount) {
                        paymentDetails = { address: headerAddress, amount: headerAmount };
                    }
                }

                if (!paymentDetails) {
                    console.error('❌ [X402] Could not parse payment details from 402 response.');
                    return response;
                }

                // Convert amount to USDC (assuming 6 decimals)
                const amountUsdc = Number(paymentDetails.amount) / 1e6;

                // Check budget constraints
                const canPay = this._canPay(amountUsdc);
                if (!canPay.allowed) {
                    console.error(`❌ [X402] Payment blocked: ${canPay.reason}`);

                    // Return a custom response indicating payment was blocked
                    return {
                        ok: false,
                        status: 402,
                        statusText: 'Payment Blocked by Budget Policy',
                        headers: response.headers,
                        json: async () => ({
                            error: 'Payment blocked',
                            reason: canPay.reason,
                            budgetMode: this.budgetMode,
                            remainingBudget: this.getRemainingBudget()
                        }),
                        text: async () => `Payment blocked: ${canPay.reason}`
                    };
                }

                console.log(`💸 [X402] Paying $${amountUsdc} USDC to ${paymentDetails.address}...`);

                // Execute Payment
                const txHash = await this.wallet.sendPayment(
                    paymentDetails.address,
                    BigInt(paymentDetails.amount)
                );

                // Record the payment
                this._recordPayment(amountUsdc, paymentDetails.address, txHash);

                // Retry request with proof of payment
                const newHeaders = {
                    ...options.headers,
                    'X-Payment-Hash': txHash,
                    'X-Payer-Address': this.wallet.getAddress()
                };

                console.log('🔄 [X402] Retrying request with payment proof...');
                response = await fetch(url, { ...options, headers: newHeaders });

                if (response.ok) {
                    console.log('✅ [X402] Request successful after payment');
                }

            } catch (err) {
                console.error('❌ [X402] Error during payment flow:', err);
            }
        }

        return response;
    }
}
