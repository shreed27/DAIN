/**
 * Central type exports
 */

// Strategy types
export * from './strategy';

// Signal types
export * from './signal';

// Trade intent types
export * from './trade-intent';

// Permission types
export * from './permissions';

// Execution types
export * from './execution';

// Agent types
export interface AgentConfig {
    id: string;
    userId: string;
    strategyId: string;
    walletAddress: string;
    permissions: import('./permissions').WalletPermission;
    status: AgentStatus;
    createdAt: number;
    updatedAt: number;
}

export enum AgentStatus {
    Active = 'active',
    Paused = 'paused',
    Stopped = 'stopped',
    Error = 'error'
}

export interface AgentPerformance {
    totalTrades: number;
    winRate: number;
    totalPnL: number;
    currentPositions: number;
    dailyPnL: number;
    weeklyPnL: number;
}

// Event types
export interface AgentEvent {
    type: EventType;
    agentId: string;
    timestamp: number;
    data: any;
}

export enum EventType {
    SignalReceived = 'signal_received',
    IntentGenerated = 'intent_generated',
    ExecutionStarted = 'execution_started',
    ExecutionCompleted = 'execution_completed',
    ExecutionFailed = 'execution_failed',
    PositionOpened = 'position_opened',
    PositionClosed = 'position_closed',
    RiskLimitTriggered = 'risk_limit_triggered',
    AgentPaused = 'agent_paused',
    AgentResumed = 'agent_resumed'
}
