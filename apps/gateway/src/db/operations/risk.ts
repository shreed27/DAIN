import { getDb } from '../index';
import { randomUUID } from 'crypto';

// Types
export interface RiskMetrics {
  id: string;
  userWallet: string;
  portfolioValue: number;
  varDaily: number; // Value at Risk (daily, 95%)
  varWeekly: number; // Value at Risk (weekly, 95%)
  cvarDaily: number; // Conditional VaR (Expected Shortfall)
  cvarWeekly: number;
  volatility: number; // Annualized volatility
  volatilityRegime: 'low' | 'normal' | 'high' | 'extreme';
  beta: number;
  sharpeRatio: number;
  maxDrawdown: number;
  currentDrawdown: number;
  correlationBtc: number;
  correlationEth: number;
  calculatedAt: number;
  createdAt: number;
}

export interface CircuitBreakerConfig {
  id: string;
  userWallet: string;
  enabled: boolean;
  maxDailyLoss: number; // Percentage
  maxDrawdown: number; // Percentage
  maxPositionSize: number; // USD
  maxLeverage: number;
  volatilityThreshold: number; // Pause if vol exceeds this
  cooldownPeriod: number; // Minutes to wait after trigger
  status: 'active' | 'triggered' | 'cooldown';
  triggeredAt?: number;
  triggeredReason?: string;
  createdAt: number;
  updatedAt: number;
}

export interface StressTestResult {
  id: string;
  userWallet: string;
  scenarioName: string;
  scenarioType: 'historical' | 'hypothetical' | 'monte_carlo';
  description: string;
  parameters: string; // JSON
  portfolioImpact: number; // Percentage
  positionImpacts: string; // JSON array of {position, impact}
  probability?: number;
  createdAt: number;
}

export interface KillSwitchEvent {
  id: string;
  userWallet: string;
  triggeredBy: 'user' | 'circuit_breaker' | 'system';
  reason: string;
  positionsClosed: number;
  ordersCancelled: number;
  totalValue: number;
  createdAt: number;
}

// Row mappers
function rowToRiskMetrics(row: Record<string, unknown>): RiskMetrics {
  return {
    id: row.id as string,
    userWallet: row.user_wallet as string,
    portfolioValue: row.portfolio_value as number,
    varDaily: row.var_daily as number,
    varWeekly: row.var_weekly as number,
    cvarDaily: row.cvar_daily as number,
    cvarWeekly: row.cvar_weekly as number,
    volatility: row.volatility as number,
    volatilityRegime: row.volatility_regime as RiskMetrics['volatilityRegime'],
    beta: row.beta as number,
    sharpeRatio: row.sharpe_ratio as number,
    maxDrawdown: row.max_drawdown as number,
    currentDrawdown: row.current_drawdown as number,
    correlationBtc: row.correlation_btc as number,
    correlationEth: row.correlation_eth as number,
    calculatedAt: row.calculated_at as number,
    createdAt: row.created_at as number,
  };
}

function rowToCircuitBreaker(row: Record<string, unknown>): CircuitBreakerConfig {
  return {
    id: row.id as string,
    userWallet: row.user_wallet as string,
    enabled: Boolean(row.enabled),
    maxDailyLoss: row.max_daily_loss as number,
    maxDrawdown: row.max_drawdown as number,
    maxPositionSize: row.max_position_size as number,
    maxLeverage: row.max_leverage as number,
    volatilityThreshold: row.volatility_threshold as number,
    cooldownPeriod: row.cooldown_period as number,
    status: row.status as CircuitBreakerConfig['status'],
    triggeredAt: row.triggered_at as number | undefined,
    triggeredReason: row.triggered_reason as string | undefined,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

// Risk Metrics operations
export function saveRiskMetrics(
  metrics: Omit<RiskMetrics, 'id' | 'createdAt'>
): RiskMetrics {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO risk_metrics (
      id, user_wallet, portfolio_value, var_daily, var_weekly, cvar_daily,
      cvar_weekly, volatility, volatility_regime, beta, sharpe_ratio,
      max_drawdown, current_drawdown, correlation_btc, correlation_eth,
      calculated_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, metrics.userWallet, metrics.portfolioValue, metrics.varDaily,
    metrics.varWeekly, metrics.cvarDaily, metrics.cvarWeekly, metrics.volatility,
    metrics.volatilityRegime, metrics.beta, metrics.sharpeRatio, metrics.maxDrawdown,
    metrics.currentDrawdown, metrics.correlationBtc, metrics.correlationEth,
    metrics.calculatedAt, now
  );

  return { ...metrics, id, createdAt: now };
}

export function getLatestRiskMetrics(userWallet: string): RiskMetrics | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM risk_metrics
    WHERE user_wallet = ?
    ORDER BY calculated_at DESC
    LIMIT 1
  `).get(userWallet) as Record<string, unknown> | undefined;

  return row ? rowToRiskMetrics(row) : null;
}

export function getRiskMetricsHistory(
  userWallet: string,
  options?: { startDate?: number; endDate?: number; limit?: number }
): RiskMetrics[] {
  const db = getDb();
  let query = 'SELECT * FROM risk_metrics WHERE user_wallet = ?';
  const params: (string | number)[] = [userWallet];

  if (options?.startDate) {
    query += ' AND calculated_at >= ?';
    params.push(options.startDate);
  }
  if (options?.endDate) {
    query += ' AND calculated_at <= ?';
    params.push(options.endDate);
  }

  query += ' ORDER BY calculated_at DESC';

  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
  return rows.map(rowToRiskMetrics);
}

// Circuit Breaker operations
export function getCircuitBreakerConfig(userWallet: string): CircuitBreakerConfig | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM circuit_breaker_config WHERE user_wallet = ?').get(userWallet) as Record<string, unknown> | undefined;
  return row ? rowToCircuitBreaker(row) : null;
}

export function saveCircuitBreakerConfig(
  config: Omit<CircuitBreakerConfig, 'id' | 'createdAt' | 'updatedAt'>
): CircuitBreakerConfig {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  // Delete existing config for this wallet
  db.prepare('DELETE FROM circuit_breaker_config WHERE user_wallet = ?').run(config.userWallet);

  const stmt = db.prepare(`
    INSERT INTO circuit_breaker_config (
      id, user_wallet, enabled, max_daily_loss, max_drawdown, max_position_size,
      max_leverage, volatility_threshold, cooldown_period, status, triggered_at,
      triggered_reason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, config.userWallet, config.enabled ? 1 : 0, config.maxDailyLoss,
    config.maxDrawdown, config.maxPositionSize, config.maxLeverage,
    config.volatilityThreshold, config.cooldownPeriod, config.status,
    config.triggeredAt, config.triggeredReason, now, now
  );

  return { ...config, id, createdAt: now, updatedAt: now };
}

export function triggerCircuitBreaker(
  userWallet: string,
  reason: string
): CircuitBreakerConfig | null {
  const db = getDb();
  const now = Date.now();

  db.prepare(`
    UPDATE circuit_breaker_config
    SET status = 'triggered', triggered_at = ?, triggered_reason = ?, updated_at = ?
    WHERE user_wallet = ?
  `).run(now, reason, now, userWallet);

  return getCircuitBreakerConfig(userWallet);
}

export function resetCircuitBreaker(userWallet: string): CircuitBreakerConfig | null {
  const db = getDb();
  const now = Date.now();

  db.prepare(`
    UPDATE circuit_breaker_config
    SET status = 'active', triggered_at = NULL, triggered_reason = NULL, updated_at = ?
    WHERE user_wallet = ?
  `).run(now, userWallet);

  return getCircuitBreakerConfig(userWallet);
}

// Stress Test operations
export function saveStressTestResult(
  result: Omit<StressTestResult, 'id' | 'createdAt'>
): StressTestResult {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO stress_test_results (
      id, user_wallet, scenario_name, scenario_type, description, parameters,
      portfolio_impact, position_impacts, probability, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, result.userWallet, result.scenarioName, result.scenarioType,
    result.description, result.parameters, result.portfolioImpact,
    result.positionImpacts, result.probability, now
  );

  return { ...result, id, createdAt: now };
}

export function getStressTestResults(
  userWallet: string,
  options?: { scenarioType?: string; limit?: number }
): StressTestResult[] {
  const db = getDb();
  let query = 'SELECT * FROM stress_test_results WHERE user_wallet = ?';
  const params: (string | number)[] = [userWallet];

  if (options?.scenarioType) {
    query += ' AND scenario_type = ?';
    params.push(options.scenarioType);
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
    scenarioName: row.scenario_name as string,
    scenarioType: row.scenario_type as StressTestResult['scenarioType'],
    description: row.description as string,
    parameters: row.parameters as string,
    portfolioImpact: row.portfolio_impact as number,
    positionImpacts: row.position_impacts as string,
    probability: row.probability as number | undefined,
    createdAt: row.created_at as number,
  }));
}

// Kill Switch operations
export function recordKillSwitchEvent(
  event: Omit<KillSwitchEvent, 'id' | 'createdAt'>
): KillSwitchEvent {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO kill_switch_events (
      id, user_wallet, triggered_by, reason, positions_closed, orders_cancelled,
      total_value, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, event.userWallet, event.triggeredBy, event.reason,
    event.positionsClosed, event.ordersCancelled, event.totalValue, now
  );

  return { ...event, id, createdAt: now };
}

export function getKillSwitchHistory(userWallet: string, limit?: number): KillSwitchEvent[] {
  const db = getDb();
  let query = 'SELECT * FROM kill_switch_events WHERE user_wallet = ? ORDER BY created_at DESC';
  const params: (string | number)[] = [userWallet];

  if (limit) {
    query += ' LIMIT ?';
    params.push(limit);
  }

  const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
  return rows.map(row => ({
    id: row.id as string,
    userWallet: row.user_wallet as string,
    triggeredBy: row.triggered_by as KillSwitchEvent['triggeredBy'],
    reason: row.reason as string,
    positionsClosed: row.positions_closed as number,
    ordersCancelled: row.orders_cancelled as number,
    totalValue: row.total_value as number,
    createdAt: row.created_at as number,
  }));
}

// Risk Dashboard aggregate
export function getRiskDashboard(userWallet: string): {
  metrics: RiskMetrics | null;
  circuitBreaker: CircuitBreakerConfig | null;
  recentStressTests: StressTestResult[];
  recentKillSwitches: KillSwitchEvent[];
  volatilityTrend: 'increasing' | 'stable' | 'decreasing';
} {
  const metrics = getLatestRiskMetrics(userWallet);
  const circuitBreaker = getCircuitBreakerConfig(userWallet);
  const recentStressTests = getStressTestResults(userWallet, { limit: 5 });
  const recentKillSwitches = getKillSwitchHistory(userWallet, 5);

  // Calculate volatility trend from recent metrics
  const recentMetrics = getRiskMetricsHistory(userWallet, { limit: 10 });
  let volatilityTrend: 'increasing' | 'stable' | 'decreasing' = 'stable';

  if (recentMetrics.length >= 3) {
    const recent = recentMetrics.slice(0, 3).map(m => m.volatility);
    const older = recentMetrics.slice(-3).map(m => m.volatility);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    if (recentAvg > olderAvg * 1.1) volatilityTrend = 'increasing';
    else if (recentAvg < olderAvg * 0.9) volatilityTrend = 'decreasing';
  }

  return {
    metrics,
    circuitBreaker,
    recentStressTests,
    recentKillSwitches,
    volatilityTrend,
  };
}

// Default stress test scenarios
export function getDefaultStressScenarios(): Array<{
  name: string;
  type: 'historical' | 'hypothetical';
  description: string;
  parameters: Record<string, number>;
}> {
  return [
    {
      name: 'March 2020 Crash',
      type: 'historical',
      description: 'COVID-19 market crash simulation',
      parameters: { btcDrop: -50, ethDrop: -60, altDrop: -70 },
    },
    {
      name: 'May 2021 Crash',
      type: 'historical',
      description: 'China mining ban crash simulation',
      parameters: { btcDrop: -40, ethDrop: -45, altDrop: -60 },
    },
    {
      name: 'FTX Collapse',
      type: 'historical',
      description: 'November 2022 FTX contagion',
      parameters: { btcDrop: -25, ethDrop: -30, solDrop: -60, altDrop: -50 },
    },
    {
      name: 'Flash Crash',
      type: 'hypothetical',
      description: 'Sudden 30% market-wide drop',
      parameters: { allAssetsDrop: -30 },
    },
    {
      name: 'Stablecoin Depeg',
      type: 'hypothetical',
      description: 'Major stablecoin loses peg',
      parameters: { stableDrop: -10, marketPanic: -15 },
    },
    {
      name: 'Black Swan',
      type: 'hypothetical',
      description: 'Extreme 70% crash scenario',
      parameters: { allAssetsDrop: -70 },
    },
  ];
}
