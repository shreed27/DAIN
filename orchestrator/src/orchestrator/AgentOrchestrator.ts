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
    EventType
} from '../types';
import { PermissionManager } from './PermissionManager';
import { StrategyRegistry } from './StrategyRegistry';

export class AgentOrchestrator extends EventEmitter {
    private agents: Map<string, AgentConfig> = new Map();
    private positions: Map<string, Position[]> = new Map();
    private performance: Map<string, AgentPerformance> = new Map();

    constructor(
        private permissionManager: PermissionManager,
        private strategyRegistry: StrategyRegistry
    ) {
        super();
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
     * Record execution result
     */
    recordExecution(agentId: string, result: ExecutionResult): void {
        const performance = this.performance.get(agentId);
        if (!performance) {
            return;
        }

        // Update performance metrics
        performance.totalTrades++;

        if (result.success) {
            // Calculate P&L (simplified - would need more context in real implementation)
            const pnl = 0; // TODO: Calculate actual P&L
            performance.totalPnL += pnl;
            performance.dailyPnL += pnl;
            performance.weeklyPnL += pnl;
        }

        // Emit event
        const eventType = result.success ? EventType.ExecutionCompleted : EventType.ExecutionFailed;
        this.emitEvent({
            type: eventType,
            agentId,
            timestamp: Date.now(),
            data: result
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
    }> {
        const agent = this.agents.get(agentId);
        if (!agent) {
            return { success: false, positionsClosed: 0, fundsReturned: 0 };
        }

        // Stop agent
        agent.status = AgentStatus.Stopped;
        agent.updatedAt = Date.now();

        // Get all positions
        const positions = this.positions.get(agentId) || [];
        const positionsClosed = positions.length;

        // TODO: Actually close positions via execution engines
        // For now, just clear them
        let fundsReturned = 0;
        positions.forEach(position => {
            fundsReturned += position.amount * position.currentPrice;
        });

        this.positions.set(agentId, []);

        // Revoke permissions
        const permission = this.permissionManager.getPermissionByAgent(agentId);
        if (permission) {
            this.permissionManager.revokePermission(permission.id);
        }

        return {
            success: true,
            positionsClosed,
            fundsReturned
        };
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
