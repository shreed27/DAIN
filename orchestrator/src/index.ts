/**
 * Main entry point for trading orchestrator
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
