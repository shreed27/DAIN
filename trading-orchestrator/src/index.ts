/**
 * Main entry point for trading orchestrator
 *
 * Super Trading Platform - Orchestration Layer
 * Integrates: CloddsBot, AgentDEX, Opus-X, OpenClaw, OSINT Market, ClawdNet
 */

import { AgentOrchestrator, PermissionManager, StrategyRegistry } from './orchestrator';

// Initialize core components
const permissionManager = new PermissionManager();
const strategyRegistry = new StrategyRegistry();
const orchestrator = new AgentOrchestrator(permissionManager, strategyRegistry);

// Export instances
export {
    orchestrator,
    permissionManager,
    strategyRegistry
};

// Export types
export * from './types';

// Export modules
export * from './orchestrator';

// Export adapters for external service integration
export * from './adapters';

// Export utilities (retry, circuit breaker, etc.)
export * from './utils';

// Export server creation function
export { createOrchestratorServer } from './server';
