/**
 * AgentOrchestrator - Manages agent lifecycle and coordinates execution
 */

import { EventEmitter } from 'events';
import {
    AgentConfig,
    AgentStatus,
    AgentPerformance,
    Signal,
    TradeIntent,
    ExecutionResult,
    Position,
    AgentEvent,
    EventType,
    TradeSide
} from '../types';
import { PermissionManager } from './PermissionManager';
import { StrategyRegistry } from './StrategyRegistry';
import { AgentDexAdapter, OpenClawAdapter } from '../adapters';

// SOL mint address (native SOL wrapped)
const SOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 * Calculate realized P&L from an execution result
 */
function calculatePnL(
    result: ExecutionResult,
    positions: Position[]
): { pnl: number; isWin: boolean } {
    if (!result.success) {
        return { pnl: 0, isWin: false };
    }

    // For sell orders, we're closing a position - calculate realized P&L
    if (result.side === 'sell') {
        // Find matching position by token
        const position = positions.find(p => p.token === result.token);
        if (position) {
            const entryValue = position.entryPrice * result.executedAmount;
            const exitValue = result.executedPrice * result.executedAmount;
            const fees = result.fees || 0;
            const pnl = exitValue - entryValue - fees;
            return { pnl, isWin: pnl > 0 };
        }
    }

    // For buy orders, P&L is realized on close
    // Track entry for future calculation (no realized P&L yet)
    return { pnl: 0, isWin: false };
}

interface ClosePositionResult {
    success: boolean;
    amountReceived?: number;
    error?: string;
}

export interface OrchestratorAdapters {
    agentDex?: AgentDexAdapter;
    openClaw?: OpenClawAdapter;
}

export class AgentOrchestrator extends EventEmitter {
    private agents: Map<string, AgentConfig> = new Map();
    private positions: Map<string, Position[]> = new Map();
    private performance: Map<string, AgentPerformance> = new Map();
    private adapters: OrchestratorAdapters;

    constructor(
        private permissionManager: PermissionManager,
        private strategyRegistry: StrategyRegistry,
        adapters?: OrchestratorAdapters
    ) {
        super();
        this.adapters = adapters || {};
    }

    /**
     * Set adapters after construction
     */
    setAdapters(adapters: OrchestratorAdapters): void {
        this.adapters = { ...this.adapters, ...adapters };
    }

    /**
     * Create and start a new agent
     */
    async createAgent(config: Omit<AgentConfig, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<AgentConfig> {
        // Validate strategy exists
        const strategy = this.strategyRegistry.get(config.strategyId);
        if (!strategy) {
            throw new Error(`Strategy ${config.strategyId} not found`);
        }

        // Create agent config
        const agent: AgentConfig = {
            ...config,
            id: this.generateAgentId(),
            status: AgentStatus.Active,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        // Register permission
        this.permissionManager.registerPermission(config.permissions);

        // Initialize agent state
        this.agents.set(agent.id, agent);
        this.positions.set(agent.id, []);
        this.performance.set(agent.id, {
            totalTrades: 0,
            winRate: 0,
            totalPnL: 0,
            currentPositions: 0,
            dailyPnL: 0,
            weeklyPnL: 0
        });

        // Emit event
        this.emitEvent({
            type: EventType.AgentResumed,
            agentId: agent.id,
            timestamp: Date.now(),
            data: agent
        });

        return agent;
    }

    /**
     * Get agent by ID
     */
    getAgent(agentId: string): AgentConfig | undefined {
        return this.agents.get(agentId);
    }

    /**
     * Get all agents for a user
     */
    getAgentsByUser(userId: string): AgentConfig[] {
        return Array.from(this.agents.values()).filter(
            a => a.userId === userId
        );
    }

    /**
     * Process signals for an agent
     */
    async processSignals(agentId: string, signals: Signal[]): Promise<TradeIntent | null> {
        const agent = this.agents.get(agentId);
        if (!agent || agent.status !== AgentStatus.Active) {
            return null;
        }

        // Get strategy
        const strategy = this.strategyRegistry.get(agent.strategyId);
        if (!strategy) {
            throw new Error(`Strategy ${agent.strategyId} not found`);
        }

        // Emit signal received events
        signals.forEach(signal => {
            this.emitEvent({
                type: EventType.SignalReceived,
                agentId,
                timestamp: Date.now(),
                data: signal
            });
        });

        // Evaluate strategy
        const intent = strategy.evaluate(signals);

        if (intent) {
            // Add agent context to intent
            intent.agentId = agentId;
            intent.strategyId = agent.strategyId;
            intent.id = this.generateIntentId();
            intent.createdAt = Date.now();

            // Emit intent generated event
            this.emitEvent({
                type: EventType.IntentGenerated,
                agentId,
                timestamp: Date.now(),
                data: intent
            });
        }

        return intent;
    }

    /**
     * Record execution result and update P&L
     */
    recordExecution(agentId: string, result: ExecutionResult): void {
        const performance = this.performance.get(agentId);
        if (!performance) {
            return;
        }

        // Update performance metrics
        performance.totalTrades++;

        if (result.success) {
            // Calculate actual P&L from execution
            const positions = this.positions.get(agentId) || [];
            const { pnl, isWin } = calculatePnL(result, positions);

            performance.totalPnL += pnl;
            performance.dailyPnL += pnl;
            performance.weeklyPnL += pnl;

            // Update win rate
            if (result.side === 'sell' && pnl !== 0) {
                const totalClosedTrades = performance.totalTrades;
                const previousWins = Math.round(performance.winRate * (totalClosedTrades - 1) / 100);
                const newWins = previousWins + (isWin ? 1 : 0);
                performance.winRate = totalClosedTrades > 0 ? (newWins / totalClosedTrades) * 100 : 0;
            }
        }

        // Emit event
        const eventType = result.success ? EventType.ExecutionCompleted : EventType.ExecutionFailed;
        this.emitEvent({
            type: eventType,
            agentId,
            timestamp: Date.now(),
            data: { ...result, calculatedPnL: result.success ? calculatePnL(result, this.positions.get(agentId) || []).pnl : 0 }
        });
    }

    /**
     * Add position for an agent
     */
    addPosition(agentId: string, position: Position): void {
        const positions = this.positions.get(agentId) || [];
        positions.push(position);
        this.positions.set(agentId, positions);

        const performance = this.performance.get(agentId);
        if (performance) {
            performance.currentPositions = positions.length;
        }

        this.emitEvent({
            type: EventType.PositionOpened,
            agentId,
            timestamp: Date.now(),
            data: position
        });
    }

    /**
     * Close position for an agent
     */
    closePosition(agentId: string, positionId: string): void {
        const positions = this.positions.get(agentId) || [];
        const index = positions.findIndex(p => p.id === positionId);

        if (index !== -1) {
            const position = positions[index];
            positions.splice(index, 1);
            this.positions.set(agentId, positions);

            const performance = this.performance.get(agentId);
            if (performance) {
                performance.currentPositions = positions.length;
            }

            this.emitEvent({
                type: EventType.PositionClosed,
                agentId,
                timestamp: Date.now(),
                data: position
            });
        }
    }

    /**
     * Get positions for an agent
     */
    getPositions(agentId: string): Position[] {
        return this.positions.get(agentId) || [];
    }

    /**
     * Get performance for an agent
     */
    getPerformance(agentId: string): AgentPerformance | undefined {
        return this.performance.get(agentId);
    }

    /**
     * Pause an agent
     */
    pauseAgent(agentId: string): boolean {
        const agent = this.agents.get(agentId);
        if (!agent) {
            return false;
        }

        agent.status = AgentStatus.Paused;
        agent.updatedAt = Date.now();

        this.emitEvent({
            type: EventType.AgentPaused,
            agentId,
            timestamp: Date.now(),
            data: { reason: 'Manual pause' }
        });

        return true;
    }

    /**
     * Resume an agent
     */
    resumeAgent(agentId: string): boolean {
        const agent = this.agents.get(agentId);
        if (!agent) {
            return false;
        }

        agent.status = AgentStatus.Active;
        agent.updatedAt = Date.now();

        this.emitEvent({
            type: EventType.AgentResumed,
            agentId,
            timestamp: Date.now(),
            data: { reason: 'Manual resume' }
        });

        return true;
    }

    /**
     * Kill switch - immediately stop agent and close all positions
     */
    async killAgent(agentId: string): Promise<{
        success: boolean;
        positionsClosed: number;
        fundsReturned: number;
        errors: string[];
    }> {
        const agent = this.agents.get(agentId);
        if (!agent) {
            return { success: false, positionsClosed: 0, fundsReturned: 0, errors: ['Agent not found'] };
        }

        // Stop agent immediately to prevent new trades
        agent.status = AgentStatus.Stopped;
        agent.updatedAt = Date.now();

        // Get all positions
        const positions = this.positions.get(agentId) || [];
        let fundsReturned = 0;
        let positionsClosed = 0;
        const errors: string[] = [];

        // Actually close each position via execution engines
        for (const position of positions) {
            try {
                const closeResult = await this.closePositionOnExchange(position);
                if (closeResult.success) {
                    fundsReturned += closeResult.amountReceived || 0;
                    positionsClosed++;

                    this.emitEvent({
                        type: EventType.PositionClosed,
                        agentId,
                        timestamp: Date.now(),
                        data: { ...position, closeResult }
                    });
                } else {
                    errors.push(`Failed to close ${position.symbol}: ${closeResult.error}`);
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                errors.push(`Error closing ${position.symbol}: ${errorMsg}`);
            }
        }

        // Clear local state only after attempting closes
        this.positions.set(agentId, []);

        // Revoke permissions
        const permission = this.permissionManager.getPermissionByAgent(agentId);
        if (permission) {
            this.permissionManager.revokePermission(permission.id);
        }

        return {
            success: errors.length === 0,
            positionsClosed,
            fundsReturned,
            errors
        };
    }

    /**
     * Close a position on the appropriate exchange
     */
    private async closePositionOnExchange(position: Position): Promise<ClosePositionResult> {
        // Route to appropriate adapter based on exchange
        if (position.exchange === 'solana' || position.exchange === 'jupiter') {
            if (!this.adapters.agentDex) {
                return { success: false, error: 'AgentDex adapter not configured' };
            }

            try {
                // Sell token back to SOL
                const result = await this.adapters.agentDex.executeSwap({
                    inputMint: position.tokenMint || position.token,
                    outputMint: SOL_MINT,
                    amount: String(position.amount),
                    slippageBps: 100, // 1% emergency slippage
                });

                return {
                    success: true,
                    amountReceived: Number(result.outAmount) / 1e9, // Convert lamports to SOL
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Swap execution failed',
                };
            }
        }

        if (position.exchange === 'binance' || position.exchange === 'bybit' || position.exchange === 'hyperliquid') {
            if (!this.adapters.openClaw) {
                return { success: false, error: 'OpenClaw adapter not configured' };
            }

            try {
                const result = await this.adapters.openClaw.closePosition({
                    exchange: position.exchange,
                    symbol: position.symbol,
                    side: position.amount > 0 ? 'long' : 'short',
                });

                return {
                    success: result.success,
                    amountReceived: result.executedAmount ? result.executedAmount * (result.executedPrice || position.currentPrice) : undefined,
                    error: result.error,
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Close position failed',
                };
            }
        }

        return { success: false, error: `Unknown exchange: ${position.exchange}` };
    }

    // Private helper methods

    private generateAgentId(): string {
        return `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private generateIntentId(): string {
        return `intent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private emitEvent(event: AgentEvent): void {
        this.emit(event.type, event);
        this.emit('event', event);
    }
}
