/**
 * SurvivalManager (Project Heartbeat)
 *
 * Manages the "biological" state of the agent based on its economic health.
 * Applies evolutionary pressure by adjusting behavior dynamically.
 * Integrates with X402Client for automatic budget control.
 */
export class SurvivalManager {
    /**
     * @param {object} config
     * @param {number} config.initialBalance - The starting capital (Equity)
     * @param {object} [config.x402Client] - Optional x402 client for managing expenses
     * @param {function} [config.onPanic] - Callback when entering panic mode
     * @param {function} [config.onGrowth] - Callback when entering growth mode
     * @param {function} [config.onSurvival] - Callback when entering survival mode
     * @param {function} [config.onDefensive] - Callback when entering defensive mode
     * @param {function} [config.onCritical] - Callback when entering critical mode
     * @param {boolean} [config.exitOnCritical=true] - Whether to exit process on critical state
     */
    constructor(config) {
        this.initialBalance = config.initialBalance;
        this.currentBalance = config.initialBalance;
        this.x402Client = config.x402Client || null;
        this.exitOnCritical = config.exitOnCritical !== false;

        this.callbacks = {
            onPanic: config.onPanic || (() => {}),
            onGrowth: config.onGrowth || (() => {}),
            onSurvival: config.onSurvival || (() => {}),
            onDefensive: config.onDefensive || (() => {}),
            onCritical: config.onCritical || (() => {})
        };

        // State tracking
        this.state = 'SURVIVAL'; // Start in neutral state
        this.stateHistory = [];
        this.healthHistory = [];

        // Risk parameters by state
        this.riskParams = {
            GROWTH: { maxPositionSize: 0.25, maxLeverage: 10, allowNewPositions: true },
            SURVIVAL: { maxPositionSize: 0.15, maxLeverage: 5, allowNewPositions: true },
            DEFENSIVE: { maxPositionSize: 0.05, maxLeverage: 2, allowNewPositions: false },
            CRITICAL: { maxPositionSize: 0, maxLeverage: 1, allowNewPositions: false }
        };

        console.log(`💓 Survival Manager Active. Baseline Equity: $${this.initialBalance}`);

        // Initialize X402 if provided
        if (this.x402Client) {
            this._configureX402ForState('SURVIVAL');
        }
    }

    /**
     * Configure X402 client based on current survival state
     * @param {string} state
     */
    _configureX402ForState(state) {
        if (!this.x402Client) return;

        switch (state) {
            case 'GROWTH':
                this.x402Client.setBudgetMode('unlimited');
                this.x402Client.setMaxPaymentPerRequest(1.0);
                console.log('🟢 [Survival→X402] Budget UNLOCKED for premium services');
                break;

            case 'SURVIVAL':
                this.x402Client.setBudgetMode('conservative');
                this.x402Client.setMaxPaymentPerRequest(0.5);
                console.log('🔵 [Survival→X402] Budget CONSERVATIVE mode');
                break;

            case 'DEFENSIVE':
                this.x402Client.setBudgetMode('frozen');
                this.x402Client.setMaxPaymentPerRequest(0);
                console.log('🟠 [Survival→X402] Budget FROZEN - All paid services blocked');
                break;

            case 'CRITICAL':
                this.x402Client.setBudgetMode('frozen');
                this.x402Client.setMaxPaymentPerRequest(0);
                console.log('🔴 [Survival→X402] Budget TERMINATED');
                break;
        }
    }

    /**
     * Updates the health status based on new balance data.
     * @param {number} newBalance - Current total equity (Wallet + Exchange Account)
     * @returns {string} Current state
     */
    updateVitalSigns(newBalance) {
        const previousBalance = this.currentBalance;
        this.currentBalance = newBalance;
        const healthRatio = this.currentBalance / this.initialBalance;

        // Record health history
        this.healthHistory.push({
            timestamp: Date.now(),
            balance: newBalance,
            ratio: healthRatio,
            pnl: this.getPnL(),
            pnlPercent: this.getPnLPercent()
        });

        // Keep only last 1000 entries
        if (this.healthHistory.length > 1000) {
            this.healthHistory = this.healthHistory.slice(-1000);
        }

        // State Machine with hysteresis to prevent rapid switching
        const previousState = this.state;
        let newState = this.state;

        if (healthRatio >= 1.20) {
            newState = 'GROWTH';
        } else if (healthRatio <= 0.50) {
            newState = 'CRITICAL';
        } else if (healthRatio <= 0.85) {
            // Only enter DEFENSIVE if coming from worse state or already in it
            if (previousState === 'CRITICAL' || previousState === 'DEFENSIVE' || healthRatio <= 0.80) {
                newState = 'DEFENSIVE';
            }
        } else {
            // 85-120% range
            if (previousState === 'GROWTH' && healthRatio >= 1.15) {
                newState = 'GROWTH'; // Hysteresis - stay in growth
            } else if (previousState === 'DEFENSIVE' && healthRatio <= 0.90) {
                newState = 'DEFENSIVE'; // Hysteresis - stay in defensive
            } else {
                newState = 'SURVIVAL';
            }
        }

        if (newState !== this.state) {
            this.setMode(newState, healthRatio);
        }

        return this.state;
    }

    /**
     * Set operating mode
     * @param {string} newMode
     * @param {number} ratio
     */
    setMode(newMode, ratio) {
        if (this.state === newMode) return;

        const percentage = ((ratio - 1) * 100).toFixed(2);
        const timestamp = new Date().toISOString();

        console.log(`\n${'='.repeat(60)}`);
        console.log(`🔄 METABOLISM CHANGE: ${this.state} → ${newMode}`);
        console.log(`   P&L: ${percentage}% | Balance: $${this.currentBalance.toFixed(2)}`);
        console.log(`   Time: ${timestamp}`);
        console.log(`${'='.repeat(60)}\n`);

        // Record state change
        this.stateHistory.push({
            from: this.state,
            to: newMode,
            ratio,
            balance: this.currentBalance,
            timestamp: Date.now()
        });

        const previousState = this.state;
        this.state = newMode;

        // Configure X402 for new state
        this._configureX402ForState(newMode);

        // Execute state-specific behavior
        switch (newMode) {
            case 'GROWTH':
                console.log('🟢 [GROWTH MODE ACTIVATED]');
                console.log('   • X402 Budget: UNLIMITED');
                console.log('   • Risk Level: AGGRESSIVE');
                console.log('   • Max Position: 25% of equity');
                console.log('   • Max Leverage: 10x');
                this.callbacks.onGrowth({ previousState, ratio, balance: this.currentBalance });
                break;

            case 'SURVIVAL':
                console.log('🔵 [SURVIVAL MODE]');
                console.log('   • X402 Budget: CONSERVATIVE');
                console.log('   • Risk Level: BALANCED');
                console.log('   • Max Position: 15% of equity');
                console.log('   • Max Leverage: 5x');
                this.callbacks.onSurvival({ previousState, ratio, balance: this.currentBalance });
                break;

            case 'DEFENSIVE':
                console.log('🟠 [DEFENSIVE MODE ACTIVATED]');
                console.log('   • X402 Budget: FROZEN');
                console.log('   • Risk Level: CONSERVATIVE');
                console.log('   • Max Position: 5% of equity');
                console.log('   • Max Leverage: 2x');
                console.log('   • New Positions: BLOCKED');
                this.callbacks.onDefensive({ previousState, ratio, balance: this.currentBalance });
                this.callbacks.onPanic({ previousState, ratio, balance: this.currentBalance });
                break;

            case 'CRITICAL':
                console.log('🔴 !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
                console.log('🔴 [CRITICAL STATE - CAPITAL PRESERVATION MODE]');
                console.log('🔴 !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
                console.log('   • X402 Budget: TERMINATED');
                console.log('   • All Trading: HALTED');
                console.log('   • Recommendation: Close all positions');
                this.callbacks.onCritical({ previousState, ratio, balance: this.currentBalance });

                if (this.exitOnCritical) {
                    console.log('🔴 Exiting process to preserve remaining capital...');
                    process.exit(0);
                }
                break;
        }
    }

    /**
     * Get current P&L in absolute terms
     * @returns {number}
     */
    getPnL() {
        return this.currentBalance - this.initialBalance;
    }

    /**
     * Get current P&L as percentage
     * @returns {number}
     */
    getPnLPercent() {
        return ((this.currentBalance / this.initialBalance) - 1) * 100;
    }

    /**
     * Get risk parameters for current state
     * @returns {object}
     */
    getRiskParams() {
        return this.riskParams[this.state];
    }

    /**
     * Check if new positions are allowed
     * @returns {boolean}
     */
    canOpenPosition() {
        return this.riskParams[this.state].allowNewPositions;
    }

    /**
     * Get max position size for current state
     * @param {number} [equity] - Optional equity override
     * @returns {number} Max position size in dollars
     */
    getMaxPositionSize(equity) {
        const e = equity || this.currentBalance;
        return e * this.riskParams[this.state].maxPositionSize;
    }

    /**
     * Get max leverage for current state
     * @returns {number}
     */
    getMaxLeverage() {
        return this.riskParams[this.state].maxLeverage;
    }

    /**
     * Get full status report
     * @returns {object}
     */
    getStatus() {
        const ratio = this.currentBalance / this.initialBalance;
        return {
            state: this.state,
            initialBalance: this.initialBalance,
            currentBalance: this.currentBalance,
            pnl: this.getPnL(),
            pnlPercent: this.getPnLPercent(),
            healthRatio: ratio,
            riskParams: this.getRiskParams(),
            canOpenPosition: this.canOpenPosition(),
            maxPositionSize: this.getMaxPositionSize(),
            maxLeverage: this.getMaxLeverage(),
            stateChanges: this.stateHistory.length,
            x402Stats: this.x402Client ? this.x402Client.getStats() : null,
            lastUpdated: this.healthHistory.length > 0
                ? this.healthHistory[this.healthHistory.length - 1].timestamp
                : null
        };
    }

    /**
     * Get state history
     * @param {number} [limit=10]
     * @returns {Array}
     */
    getStateHistory(limit = 10) {
        return this.stateHistory.slice(-limit);
    }

    /**
     * Get health history
     * @param {number} [limit=100]
     * @returns {Array}
     */
    getHealthHistory(limit = 100) {
        return this.healthHistory.slice(-limit);
    }

    /**
     * Force a specific state (for testing or manual override)
     * @param {string} state
     */
    forceState(state) {
        const validStates = ['GROWTH', 'SURVIVAL', 'DEFENSIVE', 'CRITICAL'];
        if (!validStates.includes(state)) {
            throw new Error(`Invalid state: ${state}. Must be one of: ${validStates.join(', ')}`);
        }
        console.log(`⚠️ [MANUAL OVERRIDE] Forcing state to: ${state}`);
        this.setMode(state, this.currentBalance / this.initialBalance);
    }
}
