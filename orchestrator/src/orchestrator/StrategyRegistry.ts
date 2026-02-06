/**
 * StrategyRegistry - Manages trading strategies
 */

import { TradingStrategy } from '../types';

export class StrategyRegistry {
    private strategies: Map<string, TradingStrategy> = new Map();

    /**
     * Register a new strategy
     */
    register(strategy: TradingStrategy): void {
        this.strategies.set(strategy.id, strategy);
    }

    /**
     * Get strategy by ID
     */
    get(strategyId: string): TradingStrategy | undefined {
        return this.strategies.get(strategyId);
    }

    /**
     * Get all strategies for a user
     */
    getByUser(userId: string): TradingStrategy[] {
        return Array.from(this.strategies.values()).filter(
            s => s.userId === userId
        );
    }

    /**
     * Update strategy
     */
    update(strategyId: string, updates: Partial<TradingStrategy>): boolean {
        const strategy = this.strategies.get(strategyId);
        if (!strategy) {
            return false;
        }

        Object.assign(strategy, {
            ...updates,
            updatedAt: Date.now()
        });

        return true;
    }

    /**
     * Delete strategy
     */
    delete(strategyId: string): boolean {
        return this.strategies.delete(strategyId);
    }

    /**
     * Get all strategies
     */
    getAll(): TradingStrategy[] {
        return Array.from(this.strategies.values());
    }

    /**
     * Check if strategy exists
     */
    exists(strategyId: string): boolean {
        return this.strategies.has(strategyId);
    }
}
