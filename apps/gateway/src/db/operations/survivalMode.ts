import { getDb } from '../index';
import { randomUUID } from 'crypto';

// Types
export type SurvivalState = 'growth' | 'normal' | 'defensive' | 'critical' | 'hibernation';

export interface SurvivalModeConfig {
  id: string;
  userWallet: string;
  enabled: boolean;
  currentState: SurvivalState;

  // Thresholds for state transitions (portfolio value change %)
  growthThreshold: number;    // Above this = Growth mode
  normalThreshold: number;    // Above this = Normal mode
  defensiveThreshold: number; // Above this = Defensive mode
  criticalThreshold: number;  // Above this = Critical mode
  // Below critical = Hibernation

  // State-specific behaviors
  growthMaxAllocation: number;    // Max % of portfolio per trade in growth
  normalMaxAllocation: number;
  defensiveMaxAllocation: number;
  criticalMaxAllocation: number;

  // Risk multipliers
  growthRiskMultiplier: number;
  normalRiskMultiplier: number;
  defensiveRiskMultiplier: number;
  criticalRiskMultiplier: number;

  // Auto-actions
  autoRebalance: boolean;
  autoHedge: boolean;
  autoStopLoss: boolean;
  emergencyLiquidation: boolean;

  // Monitoring
  lastCalculatedAt: number;
  lastStateChange: number;
  previousState?: SurvivalState;

  createdAt: number;
  updatedAt: number;
}

export interface SurvivalModeHistory {
  id: string;
  userWallet: string;
  fromState: SurvivalState;
  toState: SurvivalState;
  portfolioValue: number;
  portfolioChange: number;
  triggerReason: string;
  actionsExecuted: string; // JSON array of actions taken
  createdAt: number;
}

export interface SurvivalModeMetrics {
  id: string;
  userWallet: string;
  timestamp: number;
  portfolioValue: number;
  portfolioChange24h: number;
  portfolioChange7d: number;
  riskScore: number;
  liquidityScore: number;
  diversificationScore: number;
  currentState: SurvivalState;
  recommendedState: SurvivalState;
  alerts: string; // JSON array
  createdAt: number;
}

// Row mappers
function rowToConfig(row: Record<string, unknown>): SurvivalModeConfig {
  return {
    id: row.id as string,
    userWallet: row.user_wallet as string,
    enabled: Boolean(row.enabled),
    currentState: row.current_state as SurvivalState,
    growthThreshold: row.growth_threshold as number,
    normalThreshold: row.normal_threshold as number,
    defensiveThreshold: row.defensive_threshold as number,
    criticalThreshold: row.critical_threshold as number,
    growthMaxAllocation: row.growth_max_allocation as number,
    normalMaxAllocation: row.normal_max_allocation as number,
    defensiveMaxAllocation: row.defensive_max_allocation as number,
    criticalMaxAllocation: row.critical_max_allocation as number,
    growthRiskMultiplier: row.growth_risk_multiplier as number,
    normalRiskMultiplier: row.normal_risk_multiplier as number,
    defensiveRiskMultiplier: row.defensive_risk_multiplier as number,
    criticalRiskMultiplier: row.critical_risk_multiplier as number,
    autoRebalance: Boolean(row.auto_rebalance),
    autoHedge: Boolean(row.auto_hedge),
    autoStopLoss: Boolean(row.auto_stop_loss),
    emergencyLiquidation: Boolean(row.emergency_liquidation),
    lastCalculatedAt: row.last_calculated_at as number,
    lastStateChange: row.last_state_change as number,
    previousState: row.previous_state as SurvivalState | undefined,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

// Default configuration values
export const DEFAULT_SURVIVAL_CONFIG = {
  growthThreshold: 20,      // +20% = Growth mode
  normalThreshold: 0,       // 0% = Normal mode
  defensiveThreshold: -10,  // -10% = Defensive mode
  criticalThreshold: -25,   // -25% = Critical mode
  // Below -25% = Hibernation

  growthMaxAllocation: 25,    // 25% max per trade
  normalMaxAllocation: 15,    // 15% max per trade
  defensiveMaxAllocation: 5,  // 5% max per trade
  criticalMaxAllocation: 2,   // 2% max per trade

  growthRiskMultiplier: 1.5,
  normalRiskMultiplier: 1.0,
  defensiveRiskMultiplier: 0.5,
  criticalRiskMultiplier: 0.2,
};

// Config operations
export function getSurvivalConfig(userWallet: string): SurvivalModeConfig | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM survival_mode WHERE user_wallet = ?').get(userWallet) as Record<string, unknown> | undefined;
  return row ? rowToConfig(row) : null;
}

export function createSurvivalConfig(
  userWallet: string,
  enabled: boolean = true
): SurvivalModeConfig {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO survival_mode (
      id, user_wallet, enabled, current_state,
      growth_threshold, normal_threshold, defensive_threshold, critical_threshold,
      growth_max_allocation, normal_max_allocation, defensive_max_allocation, critical_max_allocation,
      growth_risk_multiplier, normal_risk_multiplier, defensive_risk_multiplier, critical_risk_multiplier,
      auto_rebalance, auto_hedge, auto_stop_loss, emergency_liquidation,
      last_calculated_at, last_state_change, previous_state, created_at, updated_at
    ) VALUES (?, ?, ?, 'normal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 1, 1, ?, ?, NULL, ?, ?)
  `);

  stmt.run(
    id, userWallet, enabled ? 1 : 0,
    DEFAULT_SURVIVAL_CONFIG.growthThreshold,
    DEFAULT_SURVIVAL_CONFIG.normalThreshold,
    DEFAULT_SURVIVAL_CONFIG.defensiveThreshold,
    DEFAULT_SURVIVAL_CONFIG.criticalThreshold,
    DEFAULT_SURVIVAL_CONFIG.growthMaxAllocation,
    DEFAULT_SURVIVAL_CONFIG.normalMaxAllocation,
    DEFAULT_SURVIVAL_CONFIG.defensiveMaxAllocation,
    DEFAULT_SURVIVAL_CONFIG.criticalMaxAllocation,
    DEFAULT_SURVIVAL_CONFIG.growthRiskMultiplier,
    DEFAULT_SURVIVAL_CONFIG.normalRiskMultiplier,
    DEFAULT_SURVIVAL_CONFIG.defensiveRiskMultiplier,
    DEFAULT_SURVIVAL_CONFIG.criticalRiskMultiplier,
    now, now, now, now
  );

  return getSurvivalConfig(userWallet)!;
}

export function updateSurvivalConfig(
  userWallet: string,
  updates: Partial<Omit<SurvivalModeConfig, 'id' | 'userWallet' | 'createdAt' | 'updatedAt'>>
): SurvivalModeConfig | null {
  const db = getDb();
  const now = Date.now();
  const setClauses: string[] = ['updated_at = ?'];
  const params: (string | number | null)[] = [now];

  const fieldMappings: Record<string, string> = {
    enabled: 'enabled',
    currentState: 'current_state',
    growthThreshold: 'growth_threshold',
    normalThreshold: 'normal_threshold',
    defensiveThreshold: 'defensive_threshold',
    criticalThreshold: 'critical_threshold',
    growthMaxAllocation: 'growth_max_allocation',
    normalMaxAllocation: 'normal_max_allocation',
    defensiveMaxAllocation: 'defensive_max_allocation',
    criticalMaxAllocation: 'critical_max_allocation',
    growthRiskMultiplier: 'growth_risk_multiplier',
    normalRiskMultiplier: 'normal_risk_multiplier',
    defensiveRiskMultiplier: 'defensive_risk_multiplier',
    criticalRiskMultiplier: 'critical_risk_multiplier',
    autoRebalance: 'auto_rebalance',
    autoHedge: 'auto_hedge',
    autoStopLoss: 'auto_stop_loss',
    emergencyLiquidation: 'emergency_liquidation',
    lastCalculatedAt: 'last_calculated_at',
    lastStateChange: 'last_state_change',
    previousState: 'previous_state',
  };

  Object.entries(updates).forEach(([key, value]) => {
    const dbField = fieldMappings[key];
    if (dbField && value !== undefined) {
      setClauses.push(`${dbField} = ?`);
      if (typeof value === 'boolean') {
        params.push(value ? 1 : 0);
      } else {
        params.push(value as string | number | null);
      }
    }
  });

  params.push(userWallet);
  db.prepare(`UPDATE survival_mode SET ${setClauses.join(', ')} WHERE user_wallet = ?`).run(...params);

  return getSurvivalConfig(userWallet);
}

export function calculateRecommendedState(portfolioChange: number, config: SurvivalModeConfig): SurvivalState {
  if (portfolioChange >= config.growthThreshold) return 'growth';
  if (portfolioChange >= config.normalThreshold) return 'normal';
  if (portfolioChange >= config.defensiveThreshold) return 'defensive';
  if (portfolioChange >= config.criticalThreshold) return 'critical';
  return 'hibernation';
}

export function transitionState(
  userWallet: string,
  newState: SurvivalState,
  portfolioValue: number,
  portfolioChange: number,
  reason: string,
  actions: string[]
): SurvivalModeConfig | null {
  const db = getDb();
  const config = getSurvivalConfig(userWallet);
  if (!config) return null;

  const now = Date.now();

  // Record history
  const historyId = randomUUID();
  db.prepare(`
    INSERT INTO survival_mode_history (
      id, user_wallet, from_state, to_state, portfolio_value, portfolio_change,
      trigger_reason, actions_executed, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    historyId, userWallet, config.currentState, newState, portfolioValue,
    portfolioChange, reason, JSON.stringify(actions), now
  );

  // Update config
  return updateSurvivalConfig(userWallet, {
    currentState: newState,
    previousState: config.currentState,
    lastStateChange: now,
    lastCalculatedAt: now,
  });
}

// History operations
export function getStateHistory(
  userWallet: string,
  options?: { limit?: number; fromDate?: number }
): SurvivalModeHistory[] {
  const db = getDb();
  let query = 'SELECT * FROM survival_mode_history WHERE user_wallet = ?';
  const params: (string | number)[] = [userWallet];

  if (options?.fromDate) {
    query += ' AND created_at >= ?';
    params.push(options.fromDate);
  }

  query += ' ORDER BY created_at DESC';

  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
  return rows.map(row => ({
    id: row.id as string,
    userWallet: row.user_wallet as string,
    fromState: row.from_state as SurvivalState,
    toState: row.to_state as SurvivalState,
    portfolioValue: row.portfolio_value as number,
    portfolioChange: row.portfolio_change as number,
    triggerReason: row.trigger_reason as string,
    actionsExecuted: row.actions_executed as string,
    createdAt: row.created_at as number,
  }));
}

// Metrics operations
export function saveMetrics(
  metrics: Omit<SurvivalModeMetrics, 'id' | 'createdAt'>
): SurvivalModeMetrics {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO survival_mode_metrics (
      id, user_wallet, timestamp, portfolio_value, portfolio_change_24h,
      portfolio_change_7d, risk_score, liquidity_score, diversification_score,
      current_state, recommended_state, alerts, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, metrics.userWallet, metrics.timestamp, metrics.portfolioValue,
    metrics.portfolioChange24h, metrics.portfolioChange7d, metrics.riskScore,
    metrics.liquidityScore, metrics.diversificationScore, metrics.currentState,
    metrics.recommendedState, metrics.alerts, now
  );

  return { ...metrics, id, createdAt: now };
}

export function getLatestMetrics(userWallet: string): SurvivalModeMetrics | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM survival_mode_metrics
    WHERE user_wallet = ?
    ORDER BY timestamp DESC
    LIMIT 1
  `).get(userWallet) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    id: row.id as string,
    userWallet: row.user_wallet as string,
    timestamp: row.timestamp as number,
    portfolioValue: row.portfolio_value as number,
    portfolioChange24h: row.portfolio_change_24h as number,
    portfolioChange7d: row.portfolio_change_7d as number,
    riskScore: row.risk_score as number,
    liquidityScore: row.liquidity_score as number,
    diversificationScore: row.diversification_score as number,
    currentState: row.current_state as SurvivalState,
    recommendedState: row.recommended_state as SurvivalState,
    alerts: row.alerts as string,
    createdAt: row.created_at as number,
  };
}

export function getMetricsHistory(
  userWallet: string,
  options?: { limit?: number; startDate?: number; endDate?: number }
): SurvivalModeMetrics[] {
  const db = getDb();
  let query = 'SELECT * FROM survival_mode_metrics WHERE user_wallet = ?';
  const params: (string | number)[] = [userWallet];

  if (options?.startDate) {
    query += ' AND timestamp >= ?';
    params.push(options.startDate);
  }
  if (options?.endDate) {
    query += ' AND timestamp <= ?';
    params.push(options.endDate);
  }

  query += ' ORDER BY timestamp DESC';

  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
  return rows.map(row => ({
    id: row.id as string,
    userWallet: row.user_wallet as string,
    timestamp: row.timestamp as number,
    portfolioValue: row.portfolio_value as number,
    portfolioChange24h: row.portfolio_change_24h as number,
    portfolioChange7d: row.portfolio_change_7d as number,
    riskScore: row.risk_score as number,
    liquidityScore: row.liquidity_score as number,
    diversificationScore: row.diversification_score as number,
    currentState: row.current_state as SurvivalState,
    recommendedState: row.recommended_state as SurvivalState,
    alerts: row.alerts as string,
    createdAt: row.created_at as number,
  }));
}

// State behaviors
export function getStateConfig(state: SurvivalState, config: SurvivalModeConfig): {
  maxAllocation: number;
  riskMultiplier: number;
  description: string;
  color: string;
  allowedActions: string[];
} {
  const behaviors: Record<SurvivalState, {
    maxAllocation: number;
    riskMultiplier: number;
    description: string;
    color: string;
    allowedActions: string[];
  }> = {
    growth: {
      maxAllocation: config.growthMaxAllocation,
      riskMultiplier: config.growthRiskMultiplier,
      description: 'Aggressive growth mode - maximize opportunities',
      color: '#22c55e',
      allowedActions: ['trade', 'leverage', 'defi', 'arbitrage', 'swarm'],
    },
    normal: {
      maxAllocation: config.normalMaxAllocation,
      riskMultiplier: config.normalRiskMultiplier,
      description: 'Balanced mode - normal operations',
      color: '#3b82f6',
      allowedActions: ['trade', 'defi', 'automation'],
    },
    defensive: {
      maxAllocation: config.defensiveMaxAllocation,
      riskMultiplier: config.defensiveRiskMultiplier,
      description: 'Defensive mode - reduce exposure',
      color: '#f59e0b',
      allowedActions: ['trade', 'rebalance', 'hedge'],
    },
    critical: {
      maxAllocation: config.criticalMaxAllocation,
      riskMultiplier: config.criticalRiskMultiplier,
      description: 'Critical mode - capital preservation',
      color: '#ef4444',
      allowedActions: ['exit_positions', 'stop_loss', 'emergency_hedge'],
    },
    hibernation: {
      maxAllocation: 0,
      riskMultiplier: 0,
      description: 'Hibernation mode - no new trades, wait for recovery',
      color: '#6b7280',
      allowedActions: ['monitor_only'],
    },
  };

  return behaviors[state];
}

// Dashboard data
export function getSurvivalDashboard(userWallet: string): {
  config: SurvivalModeConfig | null;
  latestMetrics: SurvivalModeMetrics | null;
  recentHistory: SurvivalModeHistory[];
  stateConfig: ReturnType<typeof getStateConfig> | null;
} {
  const config = getSurvivalConfig(userWallet);
  const latestMetrics = getLatestMetrics(userWallet);
  const recentHistory = getStateHistory(userWallet, { limit: 10 });

  return {
    config,
    latestMetrics,
    recentHistory,
    stateConfig: config ? getStateConfig(config.currentState, config) : null,
  };
}
