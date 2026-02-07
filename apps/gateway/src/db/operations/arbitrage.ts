import { getDb } from '../index';
import { randomUUID } from 'crypto';

// Types
export interface ArbitrageOpportunity {
  id: string;
  type: 'internal' | 'cross_platform' | 'triangular' | 'combinatorial';
  sourcePlatform: string;
  targetPlatform: string;
  symbol: string;
  buyPrice: number;
  sellPrice: number;
  spreadPercent: number;
  estimatedProfit: number;
  requiredCapital: number;
  expiresAt: number;
  status: 'active' | 'expired' | 'executed' | 'missed';
  metadata?: string;
  detectedAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface ArbitrageExecution {
  id: string;
  opportunityId: string;
  userWallet: string;
  buyOrderId?: string;
  sellOrderId?: string;
  buyPrice: number;
  sellPrice: number;
  quantity: number;
  grossProfit: number;
  fees: number;
  netProfit: number;
  slippage: number;
  executionTimeMs: number;
  status: 'pending' | 'partial' | 'completed' | 'failed';
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ArbitrageConfig {
  id: string;
  userWallet: string;
  enabled: boolean;
  minSpreadPercent: number;
  maxCapitalPerTrade: number;
  allowedPlatforms: string[];
  allowedTypes: string[];
  autoExecute: boolean;
  createdAt: number;
  updatedAt: number;
}

// Row mappers
function rowToOpportunity(row: Record<string, unknown>): ArbitrageOpportunity {
  return {
    id: row.id as string,
    type: row.type as ArbitrageOpportunity['type'],
    sourcePlatform: row.source_platform as string,
    targetPlatform: row.target_platform as string,
    symbol: row.symbol as string,
    buyPrice: row.buy_price as number,
    sellPrice: row.sell_price as number,
    spreadPercent: row.spread_percent as number,
    estimatedProfit: row.estimated_profit as number,
    requiredCapital: row.required_capital as number,
    expiresAt: row.expires_at as number,
    status: row.status as ArbitrageOpportunity['status'],
    metadata: row.metadata as string | undefined,
    detectedAt: row.detected_at as number,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function rowToExecution(row: Record<string, unknown>): ArbitrageExecution {
  return {
    id: row.id as string,
    opportunityId: row.opportunity_id as string,
    userWallet: row.user_wallet as string,
    buyOrderId: row.buy_order_id as string | undefined,
    sellOrderId: row.sell_order_id as string | undefined,
    buyPrice: row.buy_price as number,
    sellPrice: row.sell_price as number,
    quantity: row.quantity as number,
    grossProfit: row.gross_profit as number,
    fees: row.fees as number,
    netProfit: row.net_profit as number,
    slippage: row.slippage as number,
    executionTimeMs: row.execution_time_ms as number,
    status: row.status as ArbitrageExecution['status'],
    error: row.error as string | undefined,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

// Opportunity operations
export function createArbitrageOpportunity(
  opp: Omit<ArbitrageOpportunity, 'id' | 'createdAt' | 'updatedAt'>
): ArbitrageOpportunity {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO arbitrage_opportunities (
      id, type, source_platform, target_platform, symbol, buy_price, sell_price,
      spread_percent, estimated_profit, required_capital, expires_at, status,
      metadata, detected_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, opp.type, opp.sourcePlatform, opp.targetPlatform, opp.symbol,
    opp.buyPrice, opp.sellPrice, opp.spreadPercent, opp.estimatedProfit,
    opp.requiredCapital, opp.expiresAt, opp.status, opp.metadata,
    opp.detectedAt, now, now
  );

  return { ...opp, id, createdAt: now, updatedAt: now };
}

export function getActiveOpportunities(options?: {
  type?: string;
  minSpread?: number;
  platform?: string;
  limit?: number;
}): ArbitrageOpportunity[] {
  const db = getDb();
  let query = `SELECT * FROM arbitrage_opportunities WHERE status = 'active' AND expires_at > ?`;
  const params: (string | number)[] = [Date.now()];

  if (options?.type) {
    query += ' AND type = ?';
    params.push(options.type);
  }
  if (options?.minSpread) {
    query += ' AND spread_percent >= ?';
    params.push(options.minSpread);
  }
  if (options?.platform) {
    query += ' AND (source_platform = ? OR target_platform = ?)';
    params.push(options.platform, options.platform);
  }

  query += ' ORDER BY spread_percent DESC';

  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
  return rows.map(rowToOpportunity);
}

export function getOpportunityById(id: string): ArbitrageOpportunity | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM arbitrage_opportunities WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToOpportunity(row) : null;
}

export function updateOpportunityStatus(id: string, status: ArbitrageOpportunity['status']): ArbitrageOpportunity | null {
  const db = getDb();
  const now = Date.now();
  db.prepare('UPDATE arbitrage_opportunities SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
  return getOpportunityById(id);
}

export function expireOldOpportunities(): number {
  const db = getDb();
  const result = db.prepare(`
    UPDATE arbitrage_opportunities
    SET status = 'expired', updated_at = ?
    WHERE status = 'active' AND expires_at < ?
  `).run(Date.now(), Date.now());
  return result.changes;
}

// Execution operations
export function createArbitrageExecution(
  exec: Omit<ArbitrageExecution, 'id' | 'createdAt' | 'updatedAt'>
): ArbitrageExecution {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO arbitrage_executions (
      id, opportunity_id, user_wallet, buy_order_id, sell_order_id, buy_price,
      sell_price, quantity, gross_profit, fees, net_profit, slippage,
      execution_time_ms, status, error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, exec.opportunityId, exec.userWallet, exec.buyOrderId, exec.sellOrderId,
    exec.buyPrice, exec.sellPrice, exec.quantity, exec.grossProfit, exec.fees,
    exec.netProfit, exec.slippage, exec.executionTimeMs, exec.status, exec.error,
    now, now
  );

  return { ...exec, id, createdAt: now, updatedAt: now };
}

export function getExecutionsByWallet(
  userWallet: string,
  options?: { status?: string; limit?: number }
): ArbitrageExecution[] {
  const db = getDb();
  let query = 'SELECT * FROM arbitrage_executions WHERE user_wallet = ?';
  const params: (string | number)[] = [userWallet];

  if (options?.status) {
    query += ' AND status = ?';
    params.push(options.status);
  }

  query += ' ORDER BY created_at DESC';

  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
  return rows.map(rowToExecution);
}

export function updateExecution(
  id: string,
  updates: Partial<Pick<ArbitrageExecution, 'status' | 'netProfit' | 'slippage' | 'error'>>
): ArbitrageExecution | null {
  const db = getDb();
  const now = Date.now();
  const setClauses: string[] = ['updated_at = ?'];
  const params: (string | number | null)[] = [now];

  if (updates.status !== undefined) {
    setClauses.push('status = ?');
    params.push(updates.status);
  }
  if (updates.netProfit !== undefined) {
    setClauses.push('net_profit = ?');
    params.push(updates.netProfit);
  }
  if (updates.slippage !== undefined) {
    setClauses.push('slippage = ?');
    params.push(updates.slippage);
  }
  if (updates.error !== undefined) {
    setClauses.push('error = ?');
    params.push(updates.error);
  }

  params.push(id);
  db.prepare(`UPDATE arbitrage_executions SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

  const row = db.prepare('SELECT * FROM arbitrage_executions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToExecution(row) : null;
}

// Stats
export function getArbitrageStats(userWallet: string): {
  totalOpportunities: number;
  executedCount: number;
  totalProfit: number;
  avgSlippage: number;
  successRate: number;
} {
  const db = getDb();

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(net_profit) as total_profit,
      AVG(slippage) as avg_slippage
    FROM arbitrage_executions
    WHERE user_wallet = ?
  `).get(userWallet) as {
    total: number;
    completed: number;
    failed: number;
    total_profit: number;
    avg_slippage: number;
  };

  const totalExecuted = (stats.completed || 0) + (stats.failed || 0);

  return {
    totalOpportunities: stats.total || 0,
    executedCount: totalExecuted,
    totalProfit: stats.total_profit || 0,
    avgSlippage: stats.avg_slippage || 0,
    successRate: totalExecuted > 0 ? ((stats.completed || 0) / totalExecuted) * 100 : 0,
  };
}

// Config operations
export function getArbitrageConfig(userWallet: string): ArbitrageConfig | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM arbitrage_config WHERE user_wallet = ?').get(userWallet) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    id: row.id as string,
    userWallet: row.user_wallet as string,
    enabled: Boolean(row.enabled),
    minSpreadPercent: row.min_spread_percent as number,
    maxCapitalPerTrade: row.max_capital_per_trade as number,
    allowedPlatforms: JSON.parse(row.allowed_platforms as string || '[]'),
    allowedTypes: JSON.parse(row.allowed_types as string || '[]'),
    autoExecute: Boolean(row.auto_execute),
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

export function saveArbitrageConfig(
  config: Omit<ArbitrageConfig, 'id' | 'createdAt' | 'updatedAt'>
): ArbitrageConfig {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO arbitrage_config (
      id, user_wallet, enabled, min_spread_percent, max_capital_per_trade,
      allowed_platforms, allowed_types, auto_execute, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, config.userWallet, config.enabled ? 1 : 0, config.minSpreadPercent,
    config.maxCapitalPerTrade, JSON.stringify(config.allowedPlatforms),
    JSON.stringify(config.allowedTypes), config.autoExecute ? 1 : 0, now, now
  );

  return { ...config, id, createdAt: now, updatedAt: now };
}
