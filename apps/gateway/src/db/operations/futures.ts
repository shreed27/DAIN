import { getDb } from '../index';
import { randomUUID } from 'crypto';

// Types
export interface FuturesPosition {
  id: string;
  userWallet: string;
  exchange: 'binance' | 'bybit' | 'hyperliquid' | 'mexc';
  symbol: string;
  side: 'long' | 'short';
  leverage: number;
  size: number;
  entryPrice: number;
  markPrice?: number;
  liquidationPrice?: number;
  unrealizedPnl: number;
  realizedPnl: number;
  margin: number;
  marginType: 'isolated' | 'cross';
  stopLoss?: number;
  takeProfit?: number;
  status: 'open' | 'closed' | 'liquidated';
  openedAt: number;
  closedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface FuturesOrder {
  id: string;
  userWallet: string;
  exchange: string;
  symbol: string;
  side: 'buy' | 'sell';
  orderType: 'market' | 'limit' | 'stop_market' | 'stop_limit' | 'take_profit' | 'take_profit_limit';
  quantity: number;
  price?: number;
  stopPrice?: number;
  leverage: number;
  reduceOnly: boolean;
  timeInForce: 'GTC' | 'IOC' | 'FOK' | 'GTX';
  status: 'pending' | 'open' | 'filled' | 'partially_filled' | 'cancelled' | 'rejected' | 'expired';
  filledQuantity: number;
  avgFillPrice?: number;
  exchangeOrderId?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ExchangeCredentials {
  id: string;
  userWallet: string;
  exchange: string;
  apiKeyEncrypted: string;
  apiSecretEncrypted: string;
  passphraseEncrypted?: string;
  isTestnet: boolean;
  permissions: string[];
  lastUsedAt?: number;
  createdAt: number;
  updatedAt: number;
}

// Row mappers
function rowToPosition(row: Record<string, unknown>): FuturesPosition {
  return {
    id: row.id as string,
    userWallet: row.user_wallet as string,
    exchange: row.exchange as FuturesPosition['exchange'],
    symbol: row.symbol as string,
    side: row.side as 'long' | 'short',
    leverage: row.leverage as number,
    size: row.size as number,
    entryPrice: row.entry_price as number,
    markPrice: row.mark_price as number | undefined,
    liquidationPrice: row.liquidation_price as number | undefined,
    unrealizedPnl: row.unrealized_pnl as number,
    realizedPnl: row.realized_pnl as number,
    margin: row.margin as number,
    marginType: row.margin_type as 'isolated' | 'cross',
    stopLoss: row.stop_loss as number | undefined,
    takeProfit: row.take_profit as number | undefined,
    status: row.status as 'open' | 'closed' | 'liquidated',
    openedAt: row.opened_at as number,
    closedAt: row.closed_at as number | undefined,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function rowToOrder(row: Record<string, unknown>): FuturesOrder {
  return {
    id: row.id as string,
    userWallet: row.user_wallet as string,
    exchange: row.exchange as string,
    symbol: row.symbol as string,
    side: row.side as 'buy' | 'sell',
    orderType: row.order_type as FuturesOrder['orderType'],
    quantity: row.quantity as number,
    price: row.price as number | undefined,
    stopPrice: row.stop_price as number | undefined,
    leverage: row.leverage as number,
    reduceOnly: Boolean(row.reduce_only),
    timeInForce: row.time_in_force as FuturesOrder['timeInForce'],
    status: row.status as FuturesOrder['status'],
    filledQuantity: row.filled_quantity as number,
    avgFillPrice: row.avg_fill_price as number | undefined,
    exchangeOrderId: row.exchange_order_id as string | undefined,
    error: row.error as string | undefined,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

// Position operations
export function createFuturesPosition(position: Omit<FuturesPosition, 'id' | 'createdAt' | 'updatedAt'>): FuturesPosition {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO futures_positions (
      id, user_wallet, exchange, symbol, side, leverage, size, entry_price,
      mark_price, liquidation_price, unrealized_pnl, realized_pnl, margin,
      margin_type, stop_loss, take_profit, status, opened_at, closed_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, position.userWallet, position.exchange, position.symbol, position.side,
    position.leverage, position.size, position.entryPrice, position.markPrice,
    position.liquidationPrice, position.unrealizedPnl, position.realizedPnl,
    position.margin, position.marginType, position.stopLoss, position.takeProfit,
    position.status, position.openedAt, position.closedAt, now, now
  );

  return { ...position, id, createdAt: now, updatedAt: now };
}

export function getFuturesPositionById(id: string): FuturesPosition | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM futures_positions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToPosition(row) : null;
}

export function getFuturesPositionsByWallet(
  userWallet: string,
  options?: { exchange?: string; status?: string; symbol?: string }
): FuturesPosition[] {
  const db = getDb();
  let query = 'SELECT * FROM futures_positions WHERE user_wallet = ?';
  const params: (string | number)[] = [userWallet];

  if (options?.exchange) {
    query += ' AND exchange = ?';
    params.push(options.exchange);
  }
  if (options?.status) {
    query += ' AND status = ?';
    params.push(options.status);
  }
  if (options?.symbol) {
    query += ' AND symbol = ?';
    params.push(options.symbol);
  }

  query += ' ORDER BY opened_at DESC';

  const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
  return rows.map(rowToPosition);
}

export function getOpenFuturesPositions(userWallet: string): FuturesPosition[] {
  return getFuturesPositionsByWallet(userWallet, { status: 'open' });
}

export function updateFuturesPosition(
  id: string,
  updates: Partial<Pick<FuturesPosition, 'markPrice' | 'liquidationPrice' | 'unrealizedPnl' | 'realizedPnl' | 'stopLoss' | 'takeProfit' | 'status' | 'closedAt'>>
): FuturesPosition | null {
  const db = getDb();
  const now = Date.now();
  const setClauses: string[] = ['updated_at = ?'];
  const params: (string | number | null)[] = [now];

  if (updates.markPrice !== undefined) {
    setClauses.push('mark_price = ?');
    params.push(updates.markPrice);
  }
  if (updates.liquidationPrice !== undefined) {
    setClauses.push('liquidation_price = ?');
    params.push(updates.liquidationPrice);
  }
  if (updates.unrealizedPnl !== undefined) {
    setClauses.push('unrealized_pnl = ?');
    params.push(updates.unrealizedPnl);
  }
  if (updates.realizedPnl !== undefined) {
    setClauses.push('realized_pnl = ?');
    params.push(updates.realizedPnl);
  }
  if (updates.stopLoss !== undefined) {
    setClauses.push('stop_loss = ?');
    params.push(updates.stopLoss);
  }
  if (updates.takeProfit !== undefined) {
    setClauses.push('take_profit = ?');
    params.push(updates.takeProfit);
  }
  if (updates.status !== undefined) {
    setClauses.push('status = ?');
    params.push(updates.status);
  }
  if (updates.closedAt !== undefined) {
    setClauses.push('closed_at = ?');
    params.push(updates.closedAt);
  }

  params.push(id);
  db.prepare(`UPDATE futures_positions SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

  return getFuturesPositionById(id);
}

export function closeFuturesPosition(id: string, realizedPnl: number): FuturesPosition | null {
  return updateFuturesPosition(id, {
    status: 'closed',
    closedAt: Date.now(),
    realizedPnl,
    unrealizedPnl: 0,
  });
}

// Order operations
export function createFuturesOrder(order: Omit<FuturesOrder, 'id' | 'createdAt' | 'updatedAt'>): FuturesOrder {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO futures_orders (
      id, user_wallet, exchange, symbol, side, order_type, quantity, price,
      stop_price, leverage, reduce_only, time_in_force, status, filled_quantity,
      avg_fill_price, exchange_order_id, error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, order.userWallet, order.exchange, order.symbol, order.side, order.orderType,
    order.quantity, order.price, order.stopPrice, order.leverage, order.reduceOnly ? 1 : 0,
    order.timeInForce, order.status, order.filledQuantity, order.avgFillPrice,
    order.exchangeOrderId, order.error, now, now
  );

  return { ...order, id, createdAt: now, updatedAt: now };
}

export function getFuturesOrderById(id: string): FuturesOrder | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM futures_orders WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToOrder(row) : null;
}

export function getFuturesOrdersByWallet(
  userWallet: string,
  options?: { exchange?: string; status?: string; limit?: number }
): FuturesOrder[] {
  const db = getDb();
  let query = 'SELECT * FROM futures_orders WHERE user_wallet = ?';
  const params: (string | number)[] = [userWallet];

  if (options?.exchange) {
    query += ' AND exchange = ?';
    params.push(options.exchange);
  }
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
  return rows.map(rowToOrder);
}

export function updateFuturesOrder(
  id: string,
  updates: Partial<Pick<FuturesOrder, 'status' | 'filledQuantity' | 'avgFillPrice' | 'exchangeOrderId' | 'error'>>
): FuturesOrder | null {
  const db = getDb();
  const now = Date.now();
  const setClauses: string[] = ['updated_at = ?'];
  const params: (string | number | null)[] = [now];

  if (updates.status !== undefined) {
    setClauses.push('status = ?');
    params.push(updates.status);
  }
  if (updates.filledQuantity !== undefined) {
    setClauses.push('filled_quantity = ?');
    params.push(updates.filledQuantity);
  }
  if (updates.avgFillPrice !== undefined) {
    setClauses.push('avg_fill_price = ?');
    params.push(updates.avgFillPrice);
  }
  if (updates.exchangeOrderId !== undefined) {
    setClauses.push('exchange_order_id = ?');
    params.push(updates.exchangeOrderId);
  }
  if (updates.error !== undefined) {
    setClauses.push('error = ?');
    params.push(updates.error);
  }

  params.push(id);
  db.prepare(`UPDATE futures_orders SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

  return getFuturesOrderById(id);
}

export function cancelFuturesOrder(id: string): FuturesOrder | null {
  return updateFuturesOrder(id, { status: 'cancelled' });
}

// Credentials operations
export function saveExchangeCredentials(creds: Omit<ExchangeCredentials, 'id' | 'createdAt' | 'updatedAt'>): ExchangeCredentials {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO exchange_credentials (
      id, user_wallet, exchange, api_key_encrypted, api_secret_encrypted,
      passphrase_encrypted, is_testnet, permissions, last_used_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, creds.userWallet, creds.exchange, creds.apiKeyEncrypted,
    creds.apiSecretEncrypted, creds.passphraseEncrypted, creds.isTestnet ? 1 : 0,
    JSON.stringify(creds.permissions), creds.lastUsedAt, now, now
  );

  return { ...creds, id, createdAt: now, updatedAt: now };
}

export function getExchangeCredentials(userWallet: string, exchange: string): ExchangeCredentials | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM exchange_credentials WHERE user_wallet = ? AND exchange = ?'
  ).get(userWallet, exchange) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    id: row.id as string,
    userWallet: row.user_wallet as string,
    exchange: row.exchange as string,
    apiKeyEncrypted: row.api_key_encrypted as string,
    apiSecretEncrypted: row.api_secret_encrypted as string,
    passphraseEncrypted: row.passphrase_encrypted as string | undefined,
    isTestnet: Boolean(row.is_testnet),
    permissions: JSON.parse(row.permissions as string || '[]'),
    lastUsedAt: row.last_used_at as number | undefined,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

export function getConnectedExchanges(userWallet: string): string[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT exchange FROM exchange_credentials WHERE user_wallet = ?'
  ).all(userWallet) as Array<{ exchange: string }>;
  return rows.map(r => r.exchange);
}

export function deleteExchangeCredentials(userWallet: string, exchange: string): boolean {
  const db = getDb();
  const result = db.prepare(
    'DELETE FROM exchange_credentials WHERE user_wallet = ? AND exchange = ?'
  ).run(userWallet, exchange);
  return result.changes > 0;
}

// Stats
export function getFuturesStats(userWallet: string): {
  totalPositions: number;
  openPositions: number;
  totalPnl: number;
  winRate: number;
  avgLeverage: number;
} {
  const db = getDb();

  const totals = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_count,
      SUM(realized_pnl) as total_pnl,
      AVG(leverage) as avg_leverage,
      SUM(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN realized_pnl < 0 THEN 1 ELSE 0 END) as losses
    FROM futures_positions
    WHERE user_wallet = ?
  `).get(userWallet) as {
    total: number;
    open_count: number;
    total_pnl: number;
    avg_leverage: number;
    wins: number;
    losses: number;
  };

  const totalClosed = (totals.wins || 0) + (totals.losses || 0);

  return {
    totalPositions: totals.total || 0,
    openPositions: totals.open_count || 0,
    totalPnl: totals.total_pnl || 0,
    winRate: totalClosed > 0 ? ((totals.wins || 0) / totalClosed) * 100 : 0,
    avgLeverage: totals.avg_leverage || 0,
  };
}
