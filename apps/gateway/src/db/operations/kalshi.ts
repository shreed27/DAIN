/**
 * Database Operations for Kalshi Integration
 */

import { getDatabase } from '../index.js';
import { v4 as uuidv4 } from 'uuid';

// Types
export interface KalshiMarket {
  id: string;
  ticker: string;
  eventTicker: string;
  seriesTicker: string;
  title: string;
  subtitle?: string;
  yesAsk: number;
  yesBid: number;
  noAsk: number;
  noBid: number;
  lastPrice: number;
  volume: number;
  volume24h: number;
  openInterest: number;
  status: 'open' | 'closed' | 'settled';
  expirationTime?: number;
  result?: 'yes' | 'no';
  category?: string;
  createdAt: number;
  updatedAt: number;
}

export interface KalshiOrder {
  id: string;
  userWallet: string;
  marketTicker: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  orderType: 'limit' | 'market';
  price: number;
  count: number;
  filledCount: number;
  avgFillPrice?: number;
  status: 'resting' | 'filled' | 'cancelled' | 'pending';
  expiresAt?: number;
  exchangeOrderId?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface KalshiPosition {
  id: string;
  userWallet: string;
  marketTicker: string;
  side: 'yes' | 'no';
  contracts: number;
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
  ticker: string;
  event_ticker: string;
  series_ticker: string;
  title: string;
  subtitle: string | null;
  yes_ask: number;
  yes_bid: number;
  no_ask: number;
  no_bid: number;
  last_price: number;
  volume: number;
  volume_24h: number;
  open_interest: number;
  status: string;
  expiration_time: number | null;
  result: string | null;
  category: string | null;
  created_at: number;
  updated_at: number;
}

interface OrderRow {
  id: string;
  user_wallet: string;
  market_ticker: string;
  side: string;
  action: string;
  order_type: string;
  price: number;
  count: number;
  filled_count: number;
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
  market_ticker: string;
  side: string;
  contracts: number;
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

function rowToMarket(row: MarketRow): KalshiMarket {
  return {
    id: row.id,
    ticker: row.ticker,
    eventTicker: row.event_ticker,
    seriesTicker: row.series_ticker,
    title: row.title,
    subtitle: row.subtitle || undefined,
    yesAsk: row.yes_ask,
    yesBid: row.yes_bid,
    noAsk: row.no_ask,
    noBid: row.no_bid,
    lastPrice: row.last_price,
    volume: row.volume,
    volume24h: row.volume_24h,
    openInterest: row.open_interest,
    status: row.status as KalshiMarket['status'],
    expirationTime: row.expiration_time || undefined,
    result: row.result as 'yes' | 'no' | undefined,
    category: row.category || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToOrder(row: OrderRow): KalshiOrder {
  return {
    id: row.id,
    userWallet: row.user_wallet,
    marketTicker: row.market_ticker,
    side: row.side as 'yes' | 'no',
    action: row.action as 'buy' | 'sell',
    orderType: row.order_type as 'limit' | 'market',
    price: row.price,
    count: row.count,
    filledCount: row.filled_count,
    avgFillPrice: row.avg_fill_price || undefined,
    status: row.status as KalshiOrder['status'],
    expiresAt: row.expires_at || undefined,
    exchangeOrderId: row.exchange_order_id || undefined,
    error: row.error || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToPosition(row: PositionRow): KalshiPosition {
  return {
    id: row.id,
    userWallet: row.user_wallet,
    marketTicker: row.market_ticker,
    side: row.side as 'yes' | 'no',
    contracts: row.contracts,
    avgEntryPrice: row.avg_entry_price,
    currentPrice: row.current_price || undefined,
    unrealizedPnl: row.unrealized_pnl,
    realizedPnl: row.realized_pnl,
    status: row.status as KalshiPosition['status'],
    openedAt: row.opened_at,
    closedAt: row.closed_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Market Operations
export function upsertMarket(data: Omit<KalshiMarket, 'createdAt' | 'updatedAt'>): KalshiMarket {
  const db = getDatabase();
  const now = Date.now();

  const existing = db.prepare('SELECT * FROM kalshi_markets WHERE id = ?').get(data.id) as MarketRow | undefined;

  if (existing) {
    const stmt = db.prepare(`
      UPDATE kalshi_markets SET
        title = ?, subtitle = ?, yes_ask = ?, yes_bid = ?, no_ask = ?, no_bid = ?,
        last_price = ?, volume = ?, volume_24h = ?, open_interest = ?, status = ?,
        expiration_time = ?, result = ?, category = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(
      data.title, data.subtitle || null, data.yesAsk, data.yesBid, data.noAsk, data.noBid,
      data.lastPrice, data.volume, data.volume24h, data.openInterest, data.status,
      data.expirationTime || null, data.result || null, data.category || null, now, data.id
    );
    return { ...data, createdAt: existing.created_at, updatedAt: now };
  }

  const stmt = db.prepare(`
    INSERT INTO kalshi_markets (
      id, ticker, event_ticker, series_ticker, title, subtitle, yes_ask, yes_bid,
      no_ask, no_bid, last_price, volume, volume_24h, open_interest, status,
      expiration_time, result, category, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    data.id, data.ticker, data.eventTicker, data.seriesTicker, data.title, data.subtitle || null,
    data.yesAsk, data.yesBid, data.noAsk, data.noBid, data.lastPrice, data.volume, data.volume24h,
    data.openInterest, data.status, data.expirationTime || null, data.result || null,
    data.category || null, now, now
  );

  return { ...data, createdAt: now, updatedAt: now };
}

export function getMarkets(filters?: { category?: string; status?: string; limit?: number }): KalshiMarket[] {
  const db = getDatabase();
  let query = 'SELECT * FROM kalshi_markets WHERE 1=1';
  const params: unknown[] = [];

  if (filters?.category) {
    query += ' AND category = ?';
    params.push(filters.category);
  }
  if (filters?.status) {
    query += ' AND status = ?';
    params.push(filters.status);
  }

  query += ' ORDER BY volume_24h DESC';
  if (filters?.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as MarketRow[];
  return rows.map(rowToMarket);
}

export function getMarketById(id: string): KalshiMarket | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM kalshi_markets WHERE id = ?');
  const row = stmt.get(id) as MarketRow | undefined;
  return row ? rowToMarket(row) : null;
}

export function getMarketByTicker(ticker: string): KalshiMarket | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM kalshi_markets WHERE ticker = ?');
  const row = stmt.get(ticker) as MarketRow | undefined;
  return row ? rowToMarket(row) : null;
}

// Order Operations
export function createOrder(data: Omit<KalshiOrder, 'id' | 'createdAt' | 'updatedAt'>): KalshiOrder {
  const db = getDatabase();
  const now = Date.now();
  const id = uuidv4();

  const stmt = db.prepare(`
    INSERT INTO kalshi_orders (
      id, user_wallet, market_ticker, side, action, order_type, price, count,
      filled_count, avg_fill_price, status, expires_at, exchange_order_id, error,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, data.userWallet, data.marketTicker, data.side, data.action, data.orderType,
    data.price, data.count, data.filledCount || 0, data.avgFillPrice || null,
    data.status, data.expiresAt || null, data.exchangeOrderId || null,
    data.error || null, now, now
  );

  return { id, ...data, createdAt: now, updatedAt: now };
}

export function getOrdersByWallet(userWallet: string, filters?: { status?: string; marketTicker?: string }): KalshiOrder[] {
  const db = getDatabase();
  let query = 'SELECT * FROM kalshi_orders WHERE user_wallet = ?';
  const params: unknown[] = [userWallet];

  if (filters?.status) {
    query += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters?.marketTicker) {
    query += ' AND market_ticker = ?';
    params.push(filters.marketTicker);
  }

  query += ' ORDER BY created_at DESC';
  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as OrderRow[];
  return rows.map(rowToOrder);
}

export function getOrderById(id: string): KalshiOrder | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM kalshi_orders WHERE id = ?');
  const row = stmt.get(id) as OrderRow | undefined;
  return row ? rowToOrder(row) : null;
}

export function updateOrder(id: string, updates: Partial<KalshiOrder>): KalshiOrder | null {
  const db = getDatabase();
  const now = Date.now();
  const fields: string[] = [];
  const params: unknown[] = [];

  if (updates.status) { fields.push('status = ?'); params.push(updates.status); }
  if (updates.filledCount !== undefined) { fields.push('filled_count = ?'); params.push(updates.filledCount); }
  if (updates.avgFillPrice !== undefined) { fields.push('avg_fill_price = ?'); params.push(updates.avgFillPrice); }
  if (updates.exchangeOrderId !== undefined) { fields.push('exchange_order_id = ?'); params.push(updates.exchangeOrderId); }
  if (updates.error !== undefined) { fields.push('error = ?'); params.push(updates.error); }

  if (fields.length === 0) return getOrderById(id);

  fields.push('updated_at = ?');
  params.push(now);
  params.push(id);

  const stmt = db.prepare(`UPDATE kalshi_orders SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...params);
  return getOrderById(id);
}

export function cancelOrder(id: string): KalshiOrder | null {
  return updateOrder(id, { status: 'cancelled' });
}

// Position Operations
export function createPosition(data: Omit<KalshiPosition, 'id' | 'createdAt' | 'updatedAt'>): KalshiPosition {
  const db = getDatabase();
  const now = Date.now();
  const id = uuidv4();

  const stmt = db.prepare(`
    INSERT INTO kalshi_positions (
      id, user_wallet, market_ticker, side, contracts, avg_entry_price,
      current_price, unrealized_pnl, realized_pnl, status, opened_at, closed_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, data.userWallet, data.marketTicker, data.side, data.contracts,
    data.avgEntryPrice, data.currentPrice || null, data.unrealizedPnl || 0,
    data.realizedPnl || 0, data.status, data.openedAt, data.closedAt || null, now, now
  );

  return { id, ...data, createdAt: now, updatedAt: now };
}

export function getPositionsByWallet(userWallet: string, filters?: { status?: string; marketTicker?: string }): KalshiPosition[] {
  const db = getDatabase();
  let query = 'SELECT * FROM kalshi_positions WHERE user_wallet = ?';
  const params: unknown[] = [userWallet];

  if (filters?.status) {
    query += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters?.marketTicker) {
    query += ' AND market_ticker = ?';
    params.push(filters.marketTicker);
  }

  query += ' ORDER BY created_at DESC';
  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as PositionRow[];
  return rows.map(rowToPosition);
}

export function getPositionById(id: string): KalshiPosition | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM kalshi_positions WHERE id = ?');
  const row = stmt.get(id) as PositionRow | undefined;
  return row ? rowToPosition(row) : null;
}

export function updatePosition(id: string, updates: Partial<KalshiPosition>): KalshiPosition | null {
  const db = getDatabase();
  const now = Date.now();
  const fields: string[] = [];
  const params: unknown[] = [];

  if (updates.contracts !== undefined) { fields.push('contracts = ?'); params.push(updates.contracts); }
  if (updates.currentPrice !== undefined) { fields.push('current_price = ?'); params.push(updates.currentPrice); }
  if (updates.unrealizedPnl !== undefined) { fields.push('unrealized_pnl = ?'); params.push(updates.unrealizedPnl); }
  if (updates.realizedPnl !== undefined) { fields.push('realized_pnl = ?'); params.push(updates.realizedPnl); }
  if (updates.status) { fields.push('status = ?'); params.push(updates.status); }
  if (updates.closedAt !== undefined) { fields.push('closed_at = ?'); params.push(updates.closedAt); }

  if (fields.length === 0) return getPositionById(id);

  fields.push('updated_at = ?');
  params.push(now);
  params.push(id);

  const stmt = db.prepare(`UPDATE kalshi_positions SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...params);
  return getPositionById(id);
}

export function closePosition(id: string): KalshiPosition | null {
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
    FROM kalshi_positions WHERE user_wallet = ? AND status = 'open'
  `);
  const posRow = posStmt.get(userWallet) as { count: number; upnl: number | null; rpnl: number | null };

  const ordStmt = db.prepare(`
    SELECT COUNT(*) as count FROM kalshi_orders
    WHERE user_wallet = ? AND status IN ('resting', 'pending')
  `);
  const ordRow = ordStmt.get(userWallet) as { count: number };

  const volStmt = db.prepare(`
    SELECT SUM(filled_count * avg_fill_price) as volume FROM kalshi_orders
    WHERE user_wallet = ? AND status = 'filled'
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

// Portfolio Summary
export function getPortfolioSummary(userWallet: string): {
  balance: number;
  availableBalance: number;
  portfolioValue: number;
  totalPnl: number;
  positions: KalshiPosition[];
} {
  const positions = getPositionsByWallet(userWallet, { status: 'open' });
  const stats = getAccountStats(userWallet);

  // Mock balance for now - would integrate with Kalshi API
  const balance = 10000;
  const portfolioValue = positions.reduce((sum, p) => sum + (p.contracts * (p.currentPrice || p.avgEntryPrice)), 0);

  return {
    balance,
    availableBalance: balance - portfolioValue,
    portfolioValue,
    totalPnl: stats.totalUnrealizedPnl + stats.totalRealizedPnl,
    positions,
  };
}
