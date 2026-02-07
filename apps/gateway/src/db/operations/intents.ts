/**
 * Database Operations for Trade Intents and Execution Results
 */

import { getDatabase, parseJSON, stringifyJSON } from '../index.js';
import type { TradeIntent, ExecutionResult, ExecutionRoute, TradeConstraints, TradeAction, MarketType, Chain } from '../../types.js';

interface IntentRow {
  id: string;
  agent_id: string;
  strategy_id: string | null;
  action: string;
  market_type: string;
  chain: string;
  asset: string;
  amount: number;
  constraints: string | null;
  signal_ids: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

interface ExecutionResultRow {
  id: string;
  intent_id: string;
  success: number;
  tx_hash: string | null;
  order_id: string | null;
  executed_amount: number;
  executed_price: number;
  fees: number;
  slippage: number;
  execution_time_ms: number;
  error: string | null;
  route: string;
  created_at: number;
}

function rowToIntent(row: IntentRow): TradeIntent {
  return {
    id: row.id,
    agentId: row.agent_id,
    strategyId: row.strategy_id || undefined,
    action: row.action as TradeAction,
    marketType: row.market_type as MarketType,
    chain: row.chain as Chain,
    asset: row.asset,
    amount: row.amount,
    constraints: row.constraints ? parseJSON<TradeConstraints>(row.constraints, {}) : undefined,
    signalIds: row.signal_ids ? parseJSON<string[]>(row.signal_ids, []) : undefined,
    status: row.status as TradeIntent['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToExecutionResult(row: ExecutionResultRow): ExecutionResult {
  return {
    intentId: row.intent_id,
    success: row.success === 1,
    txHash: row.tx_hash || undefined,
    orderId: row.order_id || undefined,
    executedAmount: row.executed_amount,
    executedPrice: row.executed_price,
    fees: row.fees,
    slippage: row.slippage,
    executionTimeMs: row.execution_time_ms,
    error: row.error || undefined,
    route: parseJSON<ExecutionRoute>(row.route, {
      executor: 'agent-dex',
      platform: 'unknown',
      path: [],
      estimatedPrice: 0,
      estimatedSlippage: 0,
      estimatedFees: 0,
      estimatedTimeMs: 0,
      score: 0,
    }),
  };
}

// ============== Intent Operations ==============

export function getAllIntents(filters?: {
  status?: TradeIntent['status'];
  agentId?: string;
  limit?: number;
}): TradeIntent[] {
  const db = getDatabase();

  let query = 'SELECT * FROM trade_intents WHERE 1=1';
  const params: unknown[] = [];

  if (filters?.status) {
    query += ' AND status = ?';
    params.push(filters.status);
  }

  if (filters?.agentId) {
    query += ' AND agent_id = ?';
    params.push(filters.agentId);
  }

  query += ' ORDER BY created_at DESC';

  if (filters?.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as IntentRow[];

  return rows.map(rowToIntent);
}

export function getIntentById(id: string): TradeIntent | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM trade_intents WHERE id = ?');
  const row = stmt.get(id) as IntentRow | undefined;
  return row ? rowToIntent(row) : null;
}

export function createIntent(intent: TradeIntent): TradeIntent {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO trade_intents (
      id, agent_id, strategy_id, action, market_type, chain, asset, amount,
      constraints, signal_ids, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    intent.id,
    intent.agentId,
    intent.strategyId || null,
    intent.action,
    intent.marketType,
    intent.chain,
    intent.asset,
    intent.amount,
    intent.constraints ? stringifyJSON(intent.constraints) : null,
    intent.signalIds ? stringifyJSON(intent.signalIds) : null,
    intent.status,
    intent.createdAt,
    intent.updatedAt
  );

  return intent;
}

export function updateIntentStatus(id: string, status: TradeIntent['status']): TradeIntent | null {
  const db = getDatabase();
  const now = Date.now();

  const stmt = db.prepare('UPDATE trade_intents SET status = ?, updated_at = ? WHERE id = ?');
  stmt.run(status, now, id);

  return getIntentById(id);
}

export function deleteIntent(id: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM trade_intents WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// ============== Execution Result Operations ==============

export function getAllExecutionResults(filters?: {
  intentId?: string;
  success?: boolean;
  limit?: number;
}): ExecutionResult[] {
  const db = getDatabase();

  let query = 'SELECT * FROM execution_results WHERE 1=1';
  const params: unknown[] = [];

  if (filters?.intentId) {
    query += ' AND intent_id = ?';
    params.push(filters.intentId);
  }

  if (filters?.success !== undefined) {
    query += ' AND success = ?';
    params.push(filters.success ? 1 : 0);
  }

  query += ' ORDER BY created_at DESC';

  if (filters?.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as ExecutionResultRow[];

  return rows.map(rowToExecutionResult);
}

export function getExecutionResultById(id: string): ExecutionResult | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM execution_results WHERE id = ?');
  const row = stmt.get(id) as ExecutionResultRow | undefined;
  return row ? rowToExecutionResult(row) : null;
}

export function getExecutionResultByIntentId(intentId: string): ExecutionResult | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM execution_results WHERE intent_id = ? ORDER BY created_at DESC LIMIT 1');
  const row = stmt.get(intentId) as ExecutionResultRow | undefined;
  return row ? rowToExecutionResult(row) : null;
}

export function createExecutionResult(result: ExecutionResult & { id: string }): ExecutionResult {
  const db = getDatabase();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO execution_results (
      id, intent_id, success, tx_hash, order_id, executed_amount, executed_price,
      fees, slippage, execution_time_ms, error, route, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    result.id,
    result.intentId,
    result.success ? 1 : 0,
    result.txHash || null,
    result.orderId || null,
    result.executedAmount,
    result.executedPrice,
    result.fees,
    result.slippage,
    result.executionTimeMs,
    result.error || null,
    stringifyJSON(result.route),
    now
  );

  return result;
}

export function getIntentCount(): number {
  const db = getDatabase();
  const stmt = db.prepare('SELECT COUNT(*) as count FROM trade_intents');
  const row = stmt.get() as { count: number };
  return row.count;
}

export function getExecutionStats(): {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  avgExecutionTimeMs: number;
  totalFees: number;
} {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed,
      AVG(execution_time_ms) as avg_time,
      SUM(fees) as total_fees
    FROM execution_results
  `);

  const row = stmt.get() as {
    total: number;
    successful: number;
    failed: number;
    avg_time: number | null;
    total_fees: number | null;
  };

  return {
    totalExecutions: row.total,
    successfulExecutions: row.successful,
    failedExecutions: row.failed,
    avgExecutionTimeMs: row.avg_time || 0,
    totalFees: row.total_fees || 0,
  };
}
