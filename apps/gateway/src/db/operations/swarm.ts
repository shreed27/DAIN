import { getDb } from '../index';
import { randomUUID } from 'crypto';

// Types
export interface SwarmConfig {
  id: string;
  userWallet: string;
  name: string;
  description?: string;
  walletCount: number;
  wallets: string; // JSON array of wallet addresses
  strategy: 'coordinated_buy' | 'coordinated_sell' | 'copy_trade' | 'arbitrage' | 'market_make';
  distributionType: 'equal' | 'weighted' | 'random' | 'tiered';
  distribution: string; // JSON object with distribution config
  maxSlippage: number;
  delayBetweenTxMs: number;
  useJitoBundle: boolean;
  jitoTipLamports?: number;
  status: 'active' | 'paused' | 'dissolved';
  totalExecuted: number;
  totalVolume: number;
  createdAt: number;
  updatedAt: number;
}

export interface SwarmExecution {
  id: string;
  swarmId: string;
  userWallet: string;
  symbol: string;
  side: 'buy' | 'sell';
  totalAmount: number;
  executedAmount: number;
  avgPrice: number;
  walletsUsed: number;
  walletsSucceeded: number;
  walletsFailed: number;
  transactions: string; // JSON array of tx signatures
  bundleId?: string;
  status: 'pending' | 'executing' | 'partial' | 'completed' | 'failed';
  error?: string;
  startedAt: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface SwarmWallet {
  id: string;
  swarmId: string;
  address: string;
  privateKeyEncrypted: string;
  weight: number;
  balance: number;
  lastUsedAt?: number;
  status: 'active' | 'inactive' | 'low_balance';
  createdAt: number;
  updatedAt: number;
}

// Row mappers
function rowToSwarmConfig(row: Record<string, unknown>): SwarmConfig {
  return {
    id: row.id as string,
    userWallet: row.user_wallet as string,
    name: row.name as string,
    description: row.description as string | undefined,
    walletCount: row.wallet_count as number,
    wallets: row.wallets as string,
    strategy: row.strategy as SwarmConfig['strategy'],
    distributionType: row.distribution_type as SwarmConfig['distributionType'],
    distribution: row.distribution as string,
    maxSlippage: row.max_slippage as number,
    delayBetweenTxMs: row.delay_between_tx_ms as number,
    useJitoBundle: Boolean(row.use_jito_bundle),
    jitoTipLamports: row.jito_tip_lamports as number | undefined,
    status: row.status as SwarmConfig['status'],
    totalExecuted: row.total_executed as number,
    totalVolume: row.total_volume as number,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function rowToSwarmExecution(row: Record<string, unknown>): SwarmExecution {
  return {
    id: row.id as string,
    swarmId: row.swarm_id as string,
    userWallet: row.user_wallet as string,
    symbol: row.symbol as string,
    side: row.side as 'buy' | 'sell',
    totalAmount: row.total_amount as number,
    executedAmount: row.executed_amount as number,
    avgPrice: row.avg_price as number,
    walletsUsed: row.wallets_used as number,
    walletsSucceeded: row.wallets_succeeded as number,
    walletsFailed: row.wallets_failed as number,
    transactions: row.transactions as string,
    bundleId: row.bundle_id as string | undefined,
    status: row.status as SwarmExecution['status'],
    error: row.error as string | undefined,
    startedAt: row.started_at as number,
    completedAt: row.completed_at as number | undefined,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

// Swarm Config operations
export function createSwarmConfig(
  config: Omit<SwarmConfig, 'id' | 'totalExecuted' | 'totalVolume' | 'createdAt' | 'updatedAt'>
): SwarmConfig {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO swarm_configs (
      id, user_wallet, name, description, wallet_count, wallets, strategy,
      distribution_type, distribution, max_slippage, delay_between_tx_ms,
      use_jito_bundle, jito_tip_lamports, status, total_executed, total_volume,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
  `);

  stmt.run(
    id, config.userWallet, config.name, config.description, config.walletCount,
    config.wallets, config.strategy, config.distributionType, config.distribution,
    config.maxSlippage, config.delayBetweenTxMs, config.useJitoBundle ? 1 : 0,
    config.jitoTipLamports, config.status, now, now
  );

  return { ...config, id, totalExecuted: 0, totalVolume: 0, createdAt: now, updatedAt: now };
}

export function getSwarmConfigById(id: string): SwarmConfig | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM swarm_configs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToSwarmConfig(row) : null;
}

export function getSwarmConfigsByWallet(
  userWallet: string,
  options?: { status?: string; strategy?: string }
): SwarmConfig[] {
  const db = getDb();
  let query = 'SELECT * FROM swarm_configs WHERE user_wallet = ?';
  const params: (string | number)[] = [userWallet];

  if (options?.status) {
    query += ' AND status = ?';
    params.push(options.status);
  }
  if (options?.strategy) {
    query += ' AND strategy = ?';
    params.push(options.strategy);
  }

  query += ' ORDER BY created_at DESC';

  const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
  return rows.map(rowToSwarmConfig);
}

export function updateSwarmConfig(
  id: string,
  updates: Partial<Pick<SwarmConfig, 'name' | 'description' | 'strategy' | 'distributionType' | 'distribution' | 'maxSlippage' | 'delayBetweenTxMs' | 'useJitoBundle' | 'jitoTipLamports' | 'status'>>
): SwarmConfig | null {
  const db = getDb();
  const now = Date.now();
  const setClauses: string[] = ['updated_at = ?'];
  const params: (string | number | null)[] = [now];

  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    params.push(updates.name);
  }
  if (updates.description !== undefined) {
    setClauses.push('description = ?');
    params.push(updates.description);
  }
  if (updates.strategy !== undefined) {
    setClauses.push('strategy = ?');
    params.push(updates.strategy);
  }
  if (updates.distributionType !== undefined) {
    setClauses.push('distribution_type = ?');
    params.push(updates.distributionType);
  }
  if (updates.distribution !== undefined) {
    setClauses.push('distribution = ?');
    params.push(updates.distribution);
  }
  if (updates.maxSlippage !== undefined) {
    setClauses.push('max_slippage = ?');
    params.push(updates.maxSlippage);
  }
  if (updates.delayBetweenTxMs !== undefined) {
    setClauses.push('delay_between_tx_ms = ?');
    params.push(updates.delayBetweenTxMs);
  }
  if (updates.useJitoBundle !== undefined) {
    setClauses.push('use_jito_bundle = ?');
    params.push(updates.useJitoBundle ? 1 : 0);
  }
  if (updates.jitoTipLamports !== undefined) {
    setClauses.push('jito_tip_lamports = ?');
    params.push(updates.jitoTipLamports);
  }
  if (updates.status !== undefined) {
    setClauses.push('status = ?');
    params.push(updates.status);
  }

  params.push(id);
  db.prepare(`UPDATE swarm_configs SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

  return getSwarmConfigById(id);
}

export function dissolveSwarm(id: string): boolean {
  const db = getDb();
  const now = Date.now();
  const result = db.prepare(`
    UPDATE swarm_configs SET status = 'dissolved', updated_at = ? WHERE id = ?
  `).run(now, id);
  return result.changes > 0;
}

// Swarm Execution operations
export function createSwarmExecution(
  exec: Omit<SwarmExecution, 'id' | 'createdAt' | 'updatedAt'>
): SwarmExecution {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO swarm_executions (
      id, swarm_id, user_wallet, symbol, side, total_amount, executed_amount,
      avg_price, wallets_used, wallets_succeeded, wallets_failed, transactions,
      bundle_id, status, error, started_at, completed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, exec.swarmId, exec.userWallet, exec.symbol, exec.side, exec.totalAmount,
    exec.executedAmount, exec.avgPrice, exec.walletsUsed, exec.walletsSucceeded,
    exec.walletsFailed, exec.transactions, exec.bundleId, exec.status, exec.error,
    exec.startedAt, exec.completedAt, now, now
  );

  return { ...exec, id, createdAt: now, updatedAt: now };
}

export function getSwarmExecutionById(id: string): SwarmExecution | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM swarm_executions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToSwarmExecution(row) : null;
}

export function getSwarmExecutions(
  swarmId: string,
  options?: { status?: string; limit?: number }
): SwarmExecution[] {
  const db = getDb();
  let query = 'SELECT * FROM swarm_executions WHERE swarm_id = ?';
  const params: (string | number)[] = [swarmId];

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
  return rows.map(rowToSwarmExecution);
}

export function updateSwarmExecution(
  id: string,
  updates: Partial<Pick<SwarmExecution, 'executedAmount' | 'avgPrice' | 'walletsSucceeded' | 'walletsFailed' | 'transactions' | 'bundleId' | 'status' | 'error' | 'completedAt'>>
): SwarmExecution | null {
  const db = getDb();
  const now = Date.now();
  const setClauses: string[] = ['updated_at = ?'];
  const params: (string | number | null)[] = [now];

  if (updates.executedAmount !== undefined) {
    setClauses.push('executed_amount = ?');
    params.push(updates.executedAmount);
  }
  if (updates.avgPrice !== undefined) {
    setClauses.push('avg_price = ?');
    params.push(updates.avgPrice);
  }
  if (updates.walletsSucceeded !== undefined) {
    setClauses.push('wallets_succeeded = ?');
    params.push(updates.walletsSucceeded);
  }
  if (updates.walletsFailed !== undefined) {
    setClauses.push('wallets_failed = ?');
    params.push(updates.walletsFailed);
  }
  if (updates.transactions !== undefined) {
    setClauses.push('transactions = ?');
    params.push(updates.transactions);
  }
  if (updates.bundleId !== undefined) {
    setClauses.push('bundle_id = ?');
    params.push(updates.bundleId);
  }
  if (updates.status !== undefined) {
    setClauses.push('status = ?');
    params.push(updates.status);
  }
  if (updates.error !== undefined) {
    setClauses.push('error = ?');
    params.push(updates.error);
  }
  if (updates.completedAt !== undefined) {
    setClauses.push('completed_at = ?');
    params.push(updates.completedAt);
  }

  params.push(id);
  db.prepare(`UPDATE swarm_executions SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

  // Update swarm stats if completed
  const exec = getSwarmExecutionById(id);
  if (exec && updates.status === 'completed') {
    db.prepare(`
      UPDATE swarm_configs
      SET total_executed = total_executed + 1,
          total_volume = total_volume + ?,
          updated_at = ?
      WHERE id = ?
    `).run(exec.executedAmount, now, exec.swarmId);
  }

  return exec;
}

// Swarm Wallet operations
export function addSwarmWallet(
  wallet: Omit<SwarmWallet, 'id' | 'createdAt' | 'updatedAt'>
): SwarmWallet {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO swarm_wallets (
      id, swarm_id, address, private_key_encrypted, weight, balance,
      last_used_at, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, wallet.swarmId, wallet.address, wallet.privateKeyEncrypted,
    wallet.weight, wallet.balance, wallet.lastUsedAt, wallet.status, now, now
  );

  // Update swarm wallet count
  db.prepare(`
    UPDATE swarm_configs SET wallet_count = wallet_count + 1, updated_at = ? WHERE id = ?
  `).run(now, wallet.swarmId);

  return { ...wallet, id, createdAt: now, updatedAt: now };
}

export function getSwarmWallets(swarmId: string): SwarmWallet[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM swarm_wallets WHERE swarm_id = ? ORDER BY weight DESC').all(swarmId) as Record<string, unknown>[];

  return rows.map(row => ({
    id: row.id as string,
    swarmId: row.swarm_id as string,
    address: row.address as string,
    privateKeyEncrypted: row.private_key_encrypted as string,
    weight: row.weight as number,
    balance: row.balance as number,
    lastUsedAt: row.last_used_at as number | undefined,
    status: row.status as SwarmWallet['status'],
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  }));
}

export function updateSwarmWalletBalance(address: string, balance: number): void {
  const db = getDb();
  const now = Date.now();
  const status = balance < 0.01 ? 'low_balance' : 'active';

  db.prepare(`
    UPDATE swarm_wallets SET balance = ?, status = ?, updated_at = ? WHERE address = ?
  `).run(balance, status, now, address);
}

export function removeSwarmWallet(swarmId: string, address: string): boolean {
  const db = getDb();
  const now = Date.now();

  const result = db.prepare('DELETE FROM swarm_wallets WHERE swarm_id = ? AND address = ?').run(swarmId, address);

  if (result.changes > 0) {
    db.prepare(`
      UPDATE swarm_configs SET wallet_count = wallet_count - 1, updated_at = ? WHERE id = ?
    `).run(now, swarmId);
  }

  return result.changes > 0;
}

// Stats
export function getSwarmStats(userWallet: string): {
  totalSwarms: number;
  activeSwarms: number;
  totalWallets: number;
  totalExecutions: number;
  totalVolume: number;
  successRate: number;
} {
  const db = getDb();

  const swarmStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
      SUM(wallet_count) as wallets,
      SUM(total_executed) as executions,
      SUM(total_volume) as volume
    FROM swarm_configs
    WHERE user_wallet = ?
  `).get(userWallet) as {
    total: number;
    active: number;
    wallets: number;
    executions: number;
    volume: number;
  };

  const execStats = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM swarm_executions
    WHERE user_wallet = ?
  `).get(userWallet) as { completed: number; failed: number };

  const totalExecs = (execStats.completed || 0) + (execStats.failed || 0);

  return {
    totalSwarms: swarmStats.total || 0,
    activeSwarms: swarmStats.active || 0,
    totalWallets: swarmStats.wallets || 0,
    totalExecutions: swarmStats.executions || 0,
    totalVolume: swarmStats.volume || 0,
    successRate: totalExecs > 0 ? ((execStats.completed || 0) / totalExecs) * 100 : 0,
  };
}
