/**
 * Database Operations for Copy Trading
 */

import { getDatabase, parseJSON, stringifyJSON } from '../index.js';

export interface CopyTradingConfig {
  id: string;
  userWallet: string;
  targetWallet: string;
  targetLabel?: string;
  enabled: boolean;
  allocationPercent: number;
  maxPositionSize?: number;
  minPositionSize: number;
  followSells: boolean;
  followBuys: boolean;
  delaySeconds: number;
  stopLossPercent?: number;
  takeProfitPercent?: number;
  maxDailyTrades: number;
  tradesToday: number;
  lastTradeAt?: number;
  totalTrades: number;
  totalPnl: number;
  createdAt: number;
  updatedAt: number;
}

export interface CopyTradingHistory {
  id: string;
  configId: string;
  originalTx: string;
  copiedTx?: string;
  targetWallet: string;
  action: 'buy' | 'sell';
  token: string;
  originalAmount: number;
  copiedAmount?: number;
  originalPrice: number;
  copiedPrice?: number;
  slippage?: number;
  status: 'pending' | 'executed' | 'failed' | 'skipped';
  skipReason?: string;
  pnl?: number;
  createdAt: number;
}

interface CopyTradingConfigRow {
  id: string;
  user_wallet: string;
  target_wallet: string;
  target_label: string | null;
  enabled: number;
  allocation_percent: number;
  max_position_size: number | null;
  min_position_size: number;
  follow_sells: number;
  follow_buys: number;
  delay_seconds: number;
  stop_loss_percent: number | null;
  take_profit_percent: number | null;
  max_daily_trades: number;
  trades_today: number;
  last_trade_at: number | null;
  total_trades: number;
  total_pnl: number;
  created_at: number;
  updated_at: number;
}

interface CopyTradingHistoryRow {
  id: string;
  config_id: string;
  original_tx: string;
  copied_tx: string | null;
  target_wallet: string;
  action: string;
  token: string;
  original_amount: number;
  copied_amount: number | null;
  original_price: number;
  copied_price: number | null;
  slippage: number | null;
  status: string;
  skip_reason: string | null;
  pnl: number | null;
  created_at: number;
}

function rowToConfig(row: CopyTradingConfigRow): CopyTradingConfig {
  return {
    id: row.id,
    userWallet: row.user_wallet,
    targetWallet: row.target_wallet,
    targetLabel: row.target_label || undefined,
    enabled: row.enabled === 1,
    allocationPercent: row.allocation_percent,
    maxPositionSize: row.max_position_size || undefined,
    minPositionSize: row.min_position_size,
    followSells: row.follow_sells === 1,
    followBuys: row.follow_buys === 1,
    delaySeconds: row.delay_seconds,
    stopLossPercent: row.stop_loss_percent || undefined,
    takeProfitPercent: row.take_profit_percent || undefined,
    maxDailyTrades: row.max_daily_trades,
    tradesToday: row.trades_today,
    lastTradeAt: row.last_trade_at || undefined,
    totalTrades: row.total_trades,
    totalPnl: row.total_pnl,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToHistory(row: CopyTradingHistoryRow): CopyTradingHistory {
  return {
    id: row.id,
    configId: row.config_id,
    originalTx: row.original_tx,
    copiedTx: row.copied_tx || undefined,
    targetWallet: row.target_wallet,
    action: row.action as 'buy' | 'sell',
    token: row.token,
    originalAmount: row.original_amount,
    copiedAmount: row.copied_amount || undefined,
    originalPrice: row.original_price,
    copiedPrice: row.copied_price || undefined,
    slippage: row.slippage || undefined,
    status: row.status as CopyTradingHistory['status'],
    skipReason: row.skip_reason || undefined,
    pnl: row.pnl || undefined,
    createdAt: row.created_at,
  };
}

// ============== Config Operations ==============

export function createCopyConfig(config: CopyTradingConfig): CopyTradingConfig {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO copy_trading_configs (
      id, user_wallet, target_wallet, target_label, enabled, allocation_percent,
      max_position_size, min_position_size, follow_sells, follow_buys,
      delay_seconds, stop_loss_percent, take_profit_percent, max_daily_trades,
      trades_today, last_trade_at, total_trades, total_pnl, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    config.id,
    config.userWallet,
    config.targetWallet,
    config.targetLabel || null,
    config.enabled ? 1 : 0,
    config.allocationPercent,
    config.maxPositionSize || null,
    config.minPositionSize,
    config.followSells ? 1 : 0,
    config.followBuys ? 1 : 0,
    config.delaySeconds,
    config.stopLossPercent || null,
    config.takeProfitPercent || null,
    config.maxDailyTrades,
    config.tradesToday,
    config.lastTradeAt || null,
    config.totalTrades,
    config.totalPnl,
    config.createdAt,
    config.updatedAt
  );

  return config;
}

export function getCopyConfigById(id: string): CopyTradingConfig | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM copy_trading_configs WHERE id = ?');
  const row = stmt.get(id) as CopyTradingConfigRow | undefined;
  return row ? rowToConfig(row) : null;
}

export function getCopyConfigsByUser(userWallet: string): CopyTradingConfig[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM copy_trading_configs
    WHERE user_wallet = ?
    ORDER BY created_at DESC
  `);
  const rows = stmt.all(userWallet) as CopyTradingConfigRow[];
  return rows.map(rowToConfig);
}

export function getCopyConfigByUserAndTarget(userWallet: string, targetWallet: string): CopyTradingConfig | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM copy_trading_configs
    WHERE user_wallet = ? AND target_wallet = ?
  `);
  const row = stmt.get(userWallet, targetWallet) as CopyTradingConfigRow | undefined;
  return row ? rowToConfig(row) : null;
}

export function getActiveCopyConfigs(): CopyTradingConfig[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM copy_trading_configs
    WHERE enabled = 1
  `);
  const rows = stmt.all() as CopyTradingConfigRow[];
  return rows.map(rowToConfig);
}

export function getConfigsForTarget(targetWallet: string): CopyTradingConfig[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM copy_trading_configs
    WHERE target_wallet = ? AND enabled = 1
  `);
  const rows = stmt.all(targetWallet) as CopyTradingConfigRow[];
  return rows.map(rowToConfig);
}

export function updateCopyConfig(config: CopyTradingConfig): CopyTradingConfig {
  const db = getDatabase();
  config.updatedAt = Date.now();

  const stmt = db.prepare(`
    UPDATE copy_trading_configs SET
      target_label = ?, enabled = ?, allocation_percent = ?,
      max_position_size = ?, min_position_size = ?, follow_sells = ?, follow_buys = ?,
      delay_seconds = ?, stop_loss_percent = ?, take_profit_percent = ?,
      max_daily_trades = ?, trades_today = ?, last_trade_at = ?,
      total_trades = ?, total_pnl = ?, updated_at = ?
    WHERE id = ?
  `);

  stmt.run(
    config.targetLabel || null,
    config.enabled ? 1 : 0,
    config.allocationPercent,
    config.maxPositionSize || null,
    config.minPositionSize,
    config.followSells ? 1 : 0,
    config.followBuys ? 1 : 0,
    config.delaySeconds,
    config.stopLossPercent || null,
    config.takeProfitPercent || null,
    config.maxDailyTrades,
    config.tradesToday,
    config.lastTradeAt || null,
    config.totalTrades,
    config.totalPnl,
    config.updatedAt,
    config.id
  );

  return config;
}

export function toggleCopyConfig(id: string, enabled: boolean): CopyTradingConfig | null {
  const db = getDatabase();
  const now = Date.now();
  const stmt = db.prepare(`
    UPDATE copy_trading_configs SET enabled = ?, updated_at = ? WHERE id = ?
  `);
  stmt.run(enabled ? 1 : 0, now, id);
  return getCopyConfigById(id);
}

export function deleteCopyConfig(id: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM copy_trading_configs WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function resetDailyTradeCounts(): number {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE copy_trading_configs SET trades_today = 0, updated_at = ?
  `);
  const result = stmt.run(Date.now());
  return result.changes;
}

// ============== History Operations ==============

export function createCopyHistory(history: CopyTradingHistory): CopyTradingHistory {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO copy_trading_history (
      id, config_id, original_tx, copied_tx, target_wallet, action, token,
      original_amount, copied_amount, original_price, copied_price,
      slippage, status, skip_reason, pnl, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    history.id,
    history.configId,
    history.originalTx,
    history.copiedTx || null,
    history.targetWallet,
    history.action,
    history.token,
    history.originalAmount,
    history.copiedAmount || null,
    history.originalPrice,
    history.copiedPrice || null,
    history.slippage || null,
    history.status,
    history.skipReason || null,
    history.pnl || null,
    history.createdAt
  );

  return history;
}

export function getCopyHistoryByConfig(configId: string, limit: number = 50): CopyTradingHistory[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM copy_trading_history
    WHERE config_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const rows = stmt.all(configId, limit) as CopyTradingHistoryRow[];
  return rows.map(rowToHistory);
}

export function getCopyHistoryByUser(userWallet: string, limit: number = 100): CopyTradingHistory[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT h.* FROM copy_trading_history h
    JOIN copy_trading_configs c ON h.config_id = c.id
    WHERE c.user_wallet = ?
    ORDER BY h.created_at DESC
    LIMIT ?
  `);
  const rows = stmt.all(userWallet, limit) as CopyTradingHistoryRow[];
  return rows.map(rowToHistory);
}

export function updateCopyHistoryStatus(
  id: string,
  status: CopyTradingHistory['status'],
  extra?: { copiedTx?: string; copiedPrice?: number; slippage?: number; pnl?: number; skipReason?: string }
): void {
  const db = getDatabase();

  let query = 'UPDATE copy_trading_history SET status = ?';
  const params: unknown[] = [status];

  if (extra?.copiedTx) {
    query += ', copied_tx = ?';
    params.push(extra.copiedTx);
  }
  if (extra?.copiedPrice) {
    query += ', copied_price = ?';
    params.push(extra.copiedPrice);
  }
  if (extra?.slippage) {
    query += ', slippage = ?';
    params.push(extra.slippage);
  }
  if (extra?.pnl) {
    query += ', pnl = ?';
    params.push(extra.pnl);
  }
  if (extra?.skipReason) {
    query += ', skip_reason = ?';
    params.push(extra.skipReason);
  }

  query += ' WHERE id = ?';
  params.push(id);

  const stmt = db.prepare(query);
  stmt.run(...params);
}

export function getCopyTradingStats(userWallet: string): {
  totalConfigs: number;
  activeConfigs: number;
  totalCopiedTrades: number;
  successfulTrades: number;
  skippedTrades: number;
  failedTrades: number;
  totalPnl: number;
  successRate: number;
  topPerformingTarget: { wallet: string; pnl: number } | null;
} {
  const db = getDatabase();

  // Config stats
  const configStmt = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) as active,
      SUM(total_pnl) as total_pnl
    FROM copy_trading_configs
    WHERE user_wallet = ?
  `);
  const configRow = configStmt.get(userWallet) as {
    total: number;
    active: number;
    total_pnl: number;
  };

  // History stats
  const historyStmt = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END) as executed,
      SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM copy_trading_history h
    JOIN copy_trading_configs c ON h.config_id = c.id
    WHERE c.user_wallet = ?
  `);
  const historyRow = historyStmt.get(userWallet) as {
    total: number;
    executed: number;
    skipped: number;
    failed: number;
  };

  // Top performing target
  const topStmt = db.prepare(`
    SELECT target_wallet, total_pnl
    FROM copy_trading_configs
    WHERE user_wallet = ?
    ORDER BY total_pnl DESC
    LIMIT 1
  `);
  const topRow = topStmt.get(userWallet) as { target_wallet: string; total_pnl: number } | undefined;

  return {
    totalConfigs: configRow.total || 0,
    activeConfigs: configRow.active || 0,
    totalCopiedTrades: historyRow.total || 0,
    successfulTrades: historyRow.executed || 0,
    skippedTrades: historyRow.skipped || 0,
    failedTrades: historyRow.failed || 0,
    totalPnl: configRow.total_pnl || 0,
    successRate: historyRow.total > 0 ? (historyRow.executed / historyRow.total) * 100 : 0,
    topPerformingTarget: topRow ? { wallet: topRow.target_wallet, pnl: topRow.total_pnl } : null,
  };
}
