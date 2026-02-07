/**
 * Database Operations for Polymarket Integration
 */

import { getDatabase } from '../index.js';
import { v4 as uuidv4 } from 'uuid';

// Types
export interface PolymarketMarket {
  id: string;
  conditionId: string;
  questionId: string;
  question: string;
  description?: string;
  outcomes: string[];
  outcomePrices: number[];
  volume: number;
  liquidity: number;
  endDate?: number;
  resolved: boolean;
  resolutionOutcome?: string;
  category?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PolymarketOrder {
  id: string;
  userWallet: string;
  marketId: string;
  conditionId: string;
  outcome: string;
  side: 'buy' | 'sell';
  orderType: 'limit' | 'market';
  price: number;
  size: number;
  filledSize: number;
  avgFillPrice?: number;
  status: 'open' | 'filled' | 'partially_filled' | 'cancelled' | 'expired';
  expiresAt?: number;
  exchangeOrderId?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PolymarketPosition {
  id: string;
  userWallet: string;
  marketId: string;
  conditionId: string;
  outcome: string;
  size: number;
  avgEntryPrice: number;
  currentPrice?: number;
  unrealizedPnl: number;
  realizedPnl: number;
  status: 'open' | 'closed' | 'settled';
  openedAt: number;
  closedAt?: number;
  createdAt: number;
  updatedAt: number;
}

interface MarketRow {
  id: string;
  condition_id: string;
  question_id: string;
  question: string;
  description: string | null;
  outcomes: string;
  outcome_prices: string;
  volume: number;
  liquidity: number;
  end_date: number | null;
  resolved: number;
  resolution_outcome: string | null;
  category: string | null;
  created_at: number;
  updated_at: number;
}

interface OrderRow {
  id: string;
  user_wallet: string;
  market_id: string;
  condition_id: string;
  outcome: string;
  side: string;
  order_type: string;
  price: number;
  size: number;
  filled_size: number;
  avg_fill_price: number | null;
  status: string;
  expires_at: number | null;
  exchange_order_id: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

interface PositionRow {
  id: string;
  user_wallet: string;
  market_id: string;
  condition_id: string;
  outcome: string;
  size: number;
  avg_entry_price: number;
  current_price: number | null;
  unrealized_pnl: number;
  realized_pnl: number;
  status: string;
  opened_at: number;
  closed_at: number | null;
  created_at: number;
  updated_at: number;
}

function rowToMarket(row: MarketRow): PolymarketMarket {
  return {
    id: row.id,
    conditionId: row.condition_id,
    questionId: row.question_id,
    question: row.question,
    description: row.description || undefined,
    outcomes: JSON.parse(row.outcomes),
    outcomePrices: JSON.parse(row.outcome_prices),
    volume: row.volume,
    liquidity: row.liquidity,
    endDate: row.end_date || undefined,
    resolved: row.resolved === 1,
    resolutionOutcome: row.resolution_outcome || undefined,
    category: row.category || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToOrder(row: OrderRow): PolymarketOrder {
  return {
    id: row.id,
    userWallet: row.user_wallet,
    marketId: row.market_id,
    conditionId: row.condition_id,
    outcome: row.outcome,
    side: row.side as 'buy' | 'sell',
    orderType: row.order_type as 'limit' | 'market',
    price: row.price,
    size: row.size,
    filledSize: row.filled_size,
    avgFillPrice: row.avg_fill_price || undefined,
    status: row.status as PolymarketOrder['status'],
    expiresAt: row.expires_at || undefined,
    exchangeOrderId: row.exchange_order_id || undefined,
    error: row.error || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToPosition(row: PositionRow): PolymarketPosition {
  return {
    id: row.id,
    userWallet: row.user_wallet,
    marketId: row.market_id,
    conditionId: row.condition_id,
    outcome: row.outcome,
    size: row.size,
    avgEntryPrice: row.avg_entry_price,
    currentPrice: row.current_price || undefined,
    unrealizedPnl: row.unrealized_pnl,
    realizedPnl: row.realized_pnl,
    status: row.status as PolymarketPosition['status'],
    openedAt: row.opened_at,
    closedAt: row.closed_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Market Operations
export function upsertMarket(data: Omit<PolymarketMarket, 'createdAt' | 'updatedAt'>): PolymarketMarket {
  const db = getDatabase();
  const now = Date.now();

  const existing = db.prepare('SELECT * FROM polymarket_markets WHERE id = ?').get(data.id) as MarketRow | undefined;

  if (existing) {
    const stmt = db.prepare(`
      UPDATE polymarket_markets SET
        question = ?, description = ?, outcomes = ?, outcome_prices = ?,
        volume = ?, liquidity = ?, end_date = ?, resolved = ?, resolution_outcome = ?,
        category = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(
      data.question, data.description || null, JSON.stringify(data.outcomes),
      JSON.stringify(data.outcomePrices), data.volume, data.liquidity,
      data.endDate || null, data.resolved ? 1 : 0, data.resolutionOutcome || null,
      data.category || null, now, data.id
    );
    return { ...data, createdAt: existing.created_at, updatedAt: now };
  }

  const stmt = db.prepare(`
    INSERT INTO polymarket_markets (
      id, condition_id, question_id, question, description, outcomes, outcome_prices,
      volume, liquidity, end_date, resolved, resolution_outcome, category, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    data.id, data.conditionId, data.questionId, data.question, data.description || null,
    JSON.stringify(data.outcomes), JSON.stringify(data.outcomePrices), data.volume,
    data.liquidity, data.endDate || null, data.resolved ? 1 : 0, data.resolutionOutcome || null,
    data.category || null, now, now
  );

  return { ...data, createdAt: now, updatedAt: now };
}

export function getMarkets(filters?: { category?: string; resolved?: boolean; limit?: number }): PolymarketMarket[] {
  const db = getDatabase();
  let query = 'SELECT * FROM polymarket_markets WHERE 1=1';
  const params: unknown[] = [];

  if (filters?.category) {
    query += ' AND category = ?';
    params.push(filters.category);
  }
  if (filters?.resolved !== undefined) {
    query += ' AND resolved = ?';
    params.push(filters.resolved ? 1 : 0);
  }

  query += ' ORDER BY volume DESC';
  if (filters?.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as MarketRow[];
  return rows.map(rowToMarket);
}

export function getMarketById(id: string): PolymarketMarket | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM polymarket_markets WHERE id = ?');
  const row = stmt.get(id) as MarketRow | undefined;
  return row ? rowToMarket(row) : null;
}

// Order Operations
export function createOrder(data: Omit<PolymarketOrder, 'id' | 'createdAt' | 'updatedAt'>): PolymarketOrder {
  const db = getDatabase();
  const now = Date.now();
  const id = uuidv4();

  const stmt = db.prepare(`
    INSERT INTO polymarket_orders (
      id, user_wallet, market_id, condition_id, outcome, side, order_type,
      price, size, filled_size, avg_fill_price, status, expires_at, exchange_order_id, error,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, data.userWallet, data.marketId, data.conditionId, data.outcome, data.side,
    data.orderType, data.price, data.size, data.filledSize || 0, data.avgFillPrice || null,
    data.status, data.expiresAt || null, data.exchangeOrderId || null, data.error || null,
    now, now
  );

  return { id, ...data, createdAt: now, updatedAt: now };
}

export function getOrdersByWallet(userWallet: string, filters?: { status?: string; marketId?: string }): PolymarketOrder[] {
  const db = getDatabase();
  let query = 'SELECT * FROM polymarket_orders WHERE user_wallet = ?';
  const params: unknown[] = [userWallet];

  if (filters?.status) {
    query += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters?.marketId) {
    query += ' AND market_id = ?';
    params.push(filters.marketId);
  }

  query += ' ORDER BY created_at DESC';
  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as OrderRow[];
  return rows.map(rowToOrder);
}

export function getOrderById(id: string): PolymarketOrder | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM polymarket_orders WHERE id = ?');
  const row = stmt.get(id) as OrderRow | undefined;
  return row ? rowToOrder(row) : null;
}

export function updateOrder(id: string, updates: Partial<PolymarketOrder>): PolymarketOrder | null {
  const db = getDatabase();
  const now = Date.now();
  const fields: string[] = [];
  const params: unknown[] = [];

  if (updates.status) { fields.push('status = ?'); params.push(updates.status); }
  if (updates.filledSize !== undefined) { fields.push('filled_size = ?'); params.push(updates.filledSize); }
  if (updates.avgFillPrice !== undefined) { fields.push('avg_fill_price = ?'); params.push(updates.avgFillPrice); }
  if (updates.exchangeOrderId !== undefined) { fields.push('exchange_order_id = ?'); params.push(updates.exchangeOrderId); }
  if (updates.error !== undefined) { fields.push('error = ?'); params.push(updates.error); }

  if (fields.length === 0) return getOrderById(id);

  fields.push('updated_at = ?');
  params.push(now);
  params.push(id);

  const stmt = db.prepare(`UPDATE polymarket_orders SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...params);
  return getOrderById(id);
}

export function cancelOrder(id: string): PolymarketOrder | null {
  return updateOrder(id, { status: 'cancelled' });
}

// Position Operations
export function createPosition(data: Omit<PolymarketPosition, 'id' | 'createdAt' | 'updatedAt'>): PolymarketPosition {
  const db = getDatabase();
  const now = Date.now();
  const id = uuidv4();

  const stmt = db.prepare(`
    INSERT INTO polymarket_positions (
      id, user_wallet, market_id, condition_id, outcome, size, avg_entry_price,
      current_price, unrealized_pnl, realized_pnl, status, opened_at, closed_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, data.userWallet, data.marketId, data.conditionId, data.outcome, data.size,
    data.avgEntryPrice, data.currentPrice || null, data.unrealizedPnl || 0,
    data.realizedPnl || 0, data.status, data.openedAt, data.closedAt || null, now, now
  );

  return { id, ...data, createdAt: now, updatedAt: now };
}

export function getPositionsByWallet(userWallet: string, filters?: { status?: string; marketId?: string }): PolymarketPosition[] {
  const db = getDatabase();
  let query = 'SELECT * FROM polymarket_positions WHERE user_wallet = ?';
  const params: unknown[] = [userWallet];

  if (filters?.status) {
    query += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters?.marketId) {
    query += ' AND market_id = ?';
    params.push(filters.marketId);
  }

  query += ' ORDER BY created_at DESC';
  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as PositionRow[];
  return rows.map(rowToPosition);
}

export function getPositionById(id: string): PolymarketPosition | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM polymarket_positions WHERE id = ?');
  const row = stmt.get(id) as PositionRow | undefined;
  return row ? rowToPosition(row) : null;
}

export function updatePosition(id: string, updates: Partial<PolymarketPosition>): PolymarketPosition | null {
  const db = getDatabase();
  const now = Date.now();
  const fields: string[] = [];
  const params: unknown[] = [];

  if (updates.size !== undefined) { fields.push('size = ?'); params.push(updates.size); }
  if (updates.currentPrice !== undefined) { fields.push('current_price = ?'); params.push(updates.currentPrice); }
  if (updates.unrealizedPnl !== undefined) { fields.push('unrealized_pnl = ?'); params.push(updates.unrealizedPnl); }
  if (updates.realizedPnl !== undefined) { fields.push('realized_pnl = ?'); params.push(updates.realizedPnl); }
  if (updates.status) { fields.push('status = ?'); params.push(updates.status); }
  if (updates.closedAt !== undefined) { fields.push('closed_at = ?'); params.push(updates.closedAt); }

  if (fields.length === 0) return getPositionById(id);

  fields.push('updated_at = ?');
  params.push(now);
  params.push(id);

  const stmt = db.prepare(`UPDATE polymarket_positions SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...params);
  return getPositionById(id);
}

export function closePosition(id: string): PolymarketPosition | null {
  return updatePosition(id, { status: 'closed', closedAt: Date.now() });
}

// Stats
export function getAccountStats(userWallet: string): {
  openPositions: number;
  totalUnrealizedPnl: number;
  totalRealizedPnl: number;
  openOrders: number;
  totalVolume: number;
} {
  const db = getDatabase();

  const posStmt = db.prepare(`
    SELECT COUNT(*) as count, SUM(unrealized_pnl) as upnl, SUM(realized_pnl) as rpnl
    FROM polymarket_positions WHERE user_wallet = ? AND status = 'open'
  `);
  const posRow = posStmt.get(userWallet) as { count: number; upnl: number | null; rpnl: number | null };

  const ordStmt = db.prepare(`
    SELECT COUNT(*) as count FROM polymarket_orders
    WHERE user_wallet = ? AND status IN ('open', 'partially_filled')
  `);
  const ordRow = ordStmt.get(userWallet) as { count: number };

  const volStmt = db.prepare(`
    SELECT SUM(filled_size * avg_fill_price) as volume FROM polymarket_orders
    WHERE user_wallet = ? AND status IN ('filled', 'partially_filled')
  `);
  const volRow = volStmt.get(userWallet) as { volume: number | null };

  return {
    openPositions: posRow.count,
    totalUnrealizedPnl: posRow.upnl || 0,
    totalRealizedPnl: posRow.rpnl || 0,
    openOrders: ordRow.count,
    totalVolume: volRow.volume || 0,
  };
}
