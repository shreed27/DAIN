// Adapter exports for trading-orchestrator
// These adapters connect the orchestrator to external services

export { CloddsBotAdapter } from './CloddsBotAdapter.js';
export { AgentDexAdapter } from './AgentDexAdapter.js';
export { OpusXAdapter } from './OpusXAdapter.js';
export { OpenClawAdapter } from './OpenClawAdapter.js';
export { OsintMarketAdapter } from './OsintMarketAdapter.js';
export { ClawdnetAdapter } from './ClawdnetAdapter.js';
export { SidexAdapter } from './SidexAdapter.js';

// Re-export types
export * from './types.js';
