/**
 * Database Operations for Positions
 */

import { getDatabase, parseJSON, stringifyJSON } from '../index.js';
import type { Position, TakeProfitLevel, Chain } from '../../types.js';

interface PositionRow {
  id: string;
  agent_id: string;
  token: string;
  token_symbol: string;
  chain: string;
  side: string;
  amount: number;
  entry_price: number;
  current_price: number;
  unrealized_pnl: number;
  unrealized_pnl_percent: number;
  stop_loss: number | null;
  take_profit: number | null;
  take_profit_levels: string | null;
  opened_at: number;
  updated_at: number;
}

function rowToPosition(row: PositionRow): Position {
  return {
    id: row.id,
    agentId: row.agent_id,
    token: row.token,
    tokenSymbol: row.token_symbol,
    chain: row.chain as Chain,
    side: row.side as 'long' | 'short',
    amount: row.amount,
    entryPrice: row.entry_price,
    currentPrice: row.current_price,
    unrealizedPnL: row.unrealized_pnl,
    unrealizedPnLPercent: row.unrealized_pnl_percent,
    stopLoss: row.stop_loss || undefined,
    takeProfit: row.take_profit || undefined,
    takeProfitLevels: row.take_profit_levels
      ? parseJSON<TakeProfitLevel[]>(row.take_profit_levels, [])
      : undefined,
    openedAt: row.opened_at,
    updatedAt: row.updated_at,
  };
}

export function getAllPositions(filters?: { agentId?: string }): Position[] {
  const db = getDatabase();

  let query = 'SELECT * FROM positions WHERE 1=1';
  const params: unknown[] = [];

  if (filters?.agentId) {
    query += ' AND agent_id = ?';
    params.push(filters.agentId);
  }

  query += ' ORDER BY opened_at DESC';

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as PositionRow[];

  return rows.map(rowToPosition);
}

export function getPositionById(id: string): Position | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM positions WHERE id = ?');
  const row = stmt.get(id) as PositionRow | undefined;
  return row ? rowToPosition(row) : null;
}

export function createPosition(position: Position): Position {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO positions (
      id, agent_id, token, token_symbol, chain, side, amount, entry_price,
      current_price, unrealized_pnl, unrealized_pnl_percent, stop_loss,
      take_profit, take_profit_levels, opened_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    position.id,
    position.agentId,
    position.token,
    position.tokenSymbol,
    position.chain,
    position.side,
    position.amount,
    position.entryPrice,
    position.currentPrice,
    position.unrealizedPnL,
    position.unrealizedPnLPercent,
    position.stopLoss || null,
    position.takeProfit || null,
    position.takeProfitLevels ? stringifyJSON(position.takeProfitLevels) : null,
    position.openedAt,
    position.updatedAt
  );

  return position;
}

export function updatePosition(position: Position): Position {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE positions SET
      current_price = ?, unrealized_pnl = ?, unrealized_pnl_percent = ?,
      stop_loss = ?, take_profit = ?, take_profit_levels = ?, updated_at = ?
    WHERE id = ?
  `);

  stmt.run(
    position.currentPrice,
    position.unrealizedPnL,
    position.unrealizedPnLPercent,
    position.stopLoss || null,
    position.takeProfit || null,
    position.takeProfitLevels ? stringifyJSON(position.takeProfitLevels) : null,
    position.updatedAt,
    position.id
  );

  return position;
}

export function updatePositionPrice(
  id: string,
  currentPrice: number,
  unrealizedPnL: number,
  unrealizedPnLPercent: number
): Position | null {
  const db = getDatabase();
  const now = Date.now();

  const stmt = db.prepare(`
    UPDATE positions SET current_price = ?, unrealized_pnl = ?, unrealized_pnl_percent = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(currentPrice, unrealizedPnL, unrealizedPnLPercent, now, id);

  return getPositionById(id);
}

export function deletePosition(id: string): Position | null {
  const db = getDatabase();

  // Get position first before deleting
  const position = getPositionById(id);
  if (!position) return null;

  const stmt = db.prepare('DELETE FROM positions WHERE id = ?');
  stmt.run(id);

  return position;
}

export function getPositionsSummary(agentId?: string): {
  totalPositions: number;
  totalUnrealizedPnL: number;
  totalValue: number;
} {
  const db = getDatabase();

  let query = `
    SELECT
      COUNT(*) as total_positions,
      COALESCE(SUM(unrealized_pnl), 0) as total_unrealized_pnl,
      COALESCE(SUM(amount * current_price), 0) as total_value
    FROM positions
  `;
  const params: unknown[] = [];

  if (agentId) {
    query += ' WHERE agent_id = ?';
    params.push(agentId);
  }

  const stmt = db.prepare(query);
  const row = stmt.get(...params) as {
    total_positions: number;
    total_unrealized_pnl: number;
    total_value: number;
  };

  return {
    totalPositions: row.total_positions,
    totalUnrealizedPnL: row.total_unrealized_pnl,
    totalValue: row.total_value,
  };
}

export function getHoldings(): Array<{
  token: string;
  symbol: string;
  amount: number;
  value: number;
  pnl: number;
}> {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT
      token,
      token_symbol as symbol,
      SUM(amount) as amount,
      SUM(amount * current_price) as value,
      SUM(unrealized_pnl) as pnl
    FROM positions
    GROUP BY token
    ORDER BY value DESC
  `);

  const rows = stmt.all() as Array<{
    token: string;
    symbol: string;
    amount: number;
    value: number;
    pnl: number;
  }>;

  return rows;
}

export function getPositionsByAgent(agentId: string): Position[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM positions WHERE agent_id = ? ORDER BY opened_at DESC');
  const rows = stmt.all(agentId) as PositionRow[];
  return rows.map(rowToPosition);
}
