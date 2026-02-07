/**
 * Database Operations for Limit Orders
 */

import { getDatabase } from '../index.js';

export interface LimitOrder {
  id: string;
  agentId?: string;
  walletAddress: string;
  inputMint: string;
  outputMint: string;
  inputAmount: number;
  targetPrice: number;
  direction: 'above' | 'below';
  status: 'active' | 'triggered' | 'executed' | 'cancelled' | 'expired';
  expiresAt?: number;
  createdAt: number;
  updatedAt: number;
  triggeredAt?: number;
  executedAt?: number;
  txSignature?: string;
  slippageBps: number;
}

interface LimitOrderRow {
  id: string;
  agent_id: string | null;
  wallet_address: string;
  input_mint: string;
  output_mint: string;
  input_amount: number;
  target_price: number;
  direction: string;
  status: string;
  expires_at: number | null;
  created_at: number;
  updated_at: number;
  triggered_at: number | null;
  executed_at: number | null;
  tx_signature: string | null;
  slippage_bps: number;
}

function rowToLimitOrder(row: LimitOrderRow): LimitOrder {
  return {
    id: row.id,
    agentId: row.agent_id || undefined,
    walletAddress: row.wallet_address,
    inputMint: row.input_mint,
    outputMint: row.output_mint,
    inputAmount: row.input_amount,
    targetPrice: row.target_price,
    direction: row.direction as 'above' | 'below',
    status: row.status as LimitOrder['status'],
    expiresAt: row.expires_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    triggeredAt: row.triggered_at || undefined,
    executedAt: row.executed_at || undefined,
    txSignature: row.tx_signature || undefined,
    slippageBps: row.slippage_bps,
  };
}

export function createLimitOrder(order: LimitOrder): LimitOrder {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO limit_orders (
      id, agent_id, wallet_address, input_mint, output_mint, input_amount,
      target_price, direction, status, expires_at, created_at, updated_at,
      triggered_at, executed_at, tx_signature, slippage_bps
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    order.id,
    order.agentId || null,
    order.walletAddress,
    order.inputMint,
    order.outputMint,
    order.inputAmount,
    order.targetPrice,
    order.direction,
    order.status,
    order.expiresAt || null,
    order.createdAt,
    order.updatedAt,
    order.triggeredAt || null,
    order.executedAt || null,
    order.txSignature || null,
    order.slippageBps
  );

  return order;
}

export function getLimitOrderById(id: string): LimitOrder | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM limit_orders WHERE id = ?');
  const row = stmt.get(id) as LimitOrderRow | undefined;
  return row ? rowToLimitOrder(row) : null;
}

export function getLimitOrdersByWallet(walletAddress: string, status?: string): LimitOrder[] {
  const db = getDatabase();
  let query = 'SELECT * FROM limit_orders WHERE wallet_address = ?';
  const params: unknown[] = [walletAddress];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC';

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as LimitOrderRow[];
  return rows.map(rowToLimitOrder);
}

export function getActiveLimitOrders(): LimitOrder[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM limit_orders
    WHERE status = 'active'
    AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY created_at ASC
  `);
  const rows = stmt.all(Date.now()) as LimitOrderRow[];
  return rows.map(rowToLimitOrder);
}

export function updateLimitOrderStatus(
  id: string,
  status: LimitOrder['status'],
  extra?: { triggeredAt?: number; executedAt?: number; txSignature?: string }
): LimitOrder | null {
  const db = getDatabase();
  const now = Date.now();

  let query = 'UPDATE limit_orders SET status = ?, updated_at = ?';
  const params: unknown[] = [status, now];

  if (extra?.triggeredAt) {
    query += ', triggered_at = ?';
    params.push(extra.triggeredAt);
  }

  if (extra?.executedAt) {
    query += ', executed_at = ?';
    params.push(extra.executedAt);
  }

  if (extra?.txSignature) {
    query += ', tx_signature = ?';
    params.push(extra.txSignature);
  }

  query += ' WHERE id = ?';
  params.push(id);

  const stmt = db.prepare(query);
  stmt.run(...params);

  return getLimitOrderById(id);
}

export function cancelLimitOrder(id: string): LimitOrder | null {
  return updateLimitOrderStatus(id, 'cancelled');
}

export function deleteLimitOrder(id: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM limit_orders WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function expireOldOrders(): number {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE limit_orders
    SET status = 'expired', updated_at = ?
    WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < ?
  `);
  const now = Date.now();
  const result = stmt.run(now, now);
  return result.changes;
}

export function getLimitOrderStats(walletAddress: string): {
  active: number;
  executed: number;
  cancelled: number;
  expired: number;
  totalVolume: number;
} {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT
      status,
      COUNT(*) as count,
      SUM(input_amount) as volume
    FROM limit_orders
    WHERE wallet_address = ?
    GROUP BY status
  `);
  const rows = stmt.all(walletAddress) as { status: string; count: number; volume: number }[];

  const stats = {
    active: 0,
    executed: 0,
    cancelled: 0,
    expired: 0,
    totalVolume: 0,
  };

  for (const row of rows) {
    if (row.status === 'active') stats.active = row.count;
    if (row.status === 'executed') {
      stats.executed = row.count;
      stats.totalVolume += row.volume || 0;
    }
    if (row.status === 'cancelled') stats.cancelled = row.count;
    if (row.status === 'expired') stats.expired = row.count;
  }

  return stats;
}
