import { getDb } from '../index';
import { randomUUID } from 'crypto';

// Types
export type EVMChain = 'ethereum' | 'base' | 'arbitrum' | 'polygon' | 'optimism' | 'bsc' | 'avalanche';
export type EVMProtocol = 'uniswap' | '1inch' | 'odos' | 'virtuals' | 'wormhole' | 'native';

export interface EVMWallet {
  id: string;
  userWallet: string; // Solana wallet (primary)
  evmAddress: string;
  chain: EVMChain;
  label?: string;
  isPrimary: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface EVMTransaction {
  id: string;
  userWallet: string;
  evmAddress: string;
  chain: EVMChain;
  protocol: EVMProtocol;
  txHash: string;
  type: 'swap' | 'bridge' | 'approve' | 'transfer' | 'lp_add' | 'lp_remove';
  tokenIn: string;
  tokenOut?: string;
  amountIn: number;
  amountOut?: number;
  valueUsd: number;
  gasUsed?: number;
  gasPriceGwei?: number;
  gasCostUsd?: number;
  status: 'pending' | 'confirmed' | 'failed';
  blockNumber?: number;
  error?: string;
  metadata?: string; // JSON
  createdAt: number;
  updatedAt: number;
}

export interface EVMBalance {
  id: string;
  userWallet: string;
  evmAddress: string;
  chain: EVMChain;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  balance: string; // BigInt as string
  balanceUsd: number;
  lastUpdated: number;
}

export interface BridgeTransaction {
  id: string;
  userWallet: string;
  sourceChain: string;
  targetChain: string;
  sourceAddress: string;
  targetAddress: string;
  tokenSymbol: string;
  amount: number;
  amountUsd: number;
  bridgeProtocol: string;
  sourceTxHash?: string;
  targetTxHash?: string;
  status: 'initiated' | 'source_confirmed' | 'bridging' | 'completed' | 'failed';
  estimatedArrival?: number;
  actualArrival?: number;
  fee: number;
  feeUsd: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

// Chain configurations
export const CHAIN_CONFIG: Record<EVMChain, {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeToken: string;
  nativeDecimals: number;
}> = {
  ethereum: {
    chainId: 1,
    name: 'Ethereum',
    rpcUrl: 'https://eth.llamarpc.com',
    explorerUrl: 'https://etherscan.io',
    nativeToken: 'ETH',
    nativeDecimals: 18,
  },
  base: {
    chainId: 8453,
    name: 'Base',
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    nativeToken: 'ETH',
    nativeDecimals: 18,
  },
  arbitrum: {
    chainId: 42161,
    name: 'Arbitrum',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
    nativeToken: 'ETH',
    nativeDecimals: 18,
  },
  polygon: {
    chainId: 137,
    name: 'Polygon',
    rpcUrl: 'https://polygon.llamarpc.com',
    explorerUrl: 'https://polygonscan.com',
    nativeToken: 'MATIC',
    nativeDecimals: 18,
  },
  optimism: {
    chainId: 10,
    name: 'Optimism',
    rpcUrl: 'https://mainnet.optimism.io',
    explorerUrl: 'https://optimistic.etherscan.io',
    nativeToken: 'ETH',
    nativeDecimals: 18,
  },
  bsc: {
    chainId: 56,
    name: 'BNB Chain',
    rpcUrl: 'https://bsc-dataseed.binance.org',
    explorerUrl: 'https://bscscan.com',
    nativeToken: 'BNB',
    nativeDecimals: 18,
  },
  avalanche: {
    chainId: 43114,
    name: 'Avalanche',
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    explorerUrl: 'https://snowtrace.io',
    nativeToken: 'AVAX',
    nativeDecimals: 18,
  },
};

// Row mappers
function rowToTransaction(row: Record<string, unknown>): EVMTransaction {
  return {
    id: row.id as string,
    userWallet: row.user_wallet as string,
    evmAddress: row.evm_address as string,
    chain: row.chain as EVMChain,
    protocol: row.protocol as EVMProtocol,
    txHash: row.tx_hash as string,
    type: row.type as EVMTransaction['type'],
    tokenIn: row.token_in as string,
    tokenOut: row.token_out as string | undefined,
    amountIn: row.amount_in as number,
    amountOut: row.amount_out as number | undefined,
    valueUsd: row.value_usd as number,
    gasUsed: row.gas_used as number | undefined,
    gasPriceGwei: row.gas_price_gwei as number | undefined,
    gasCostUsd: row.gas_cost_usd as number | undefined,
    status: row.status as EVMTransaction['status'],
    blockNumber: row.block_number as number | undefined,
    error: row.error as string | undefined,
    metadata: row.metadata as string | undefined,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function rowToBridge(row: Record<string, unknown>): BridgeTransaction {
  return {
    id: row.id as string,
    userWallet: row.user_wallet as string,
    sourceChain: row.source_chain as string,
    targetChain: row.target_chain as string,
    sourceAddress: row.source_address as string,
    targetAddress: row.target_address as string,
    tokenSymbol: row.token_symbol as string,
    amount: row.amount as number,
    amountUsd: row.amount_usd as number,
    bridgeProtocol: row.bridge_protocol as string,
    sourceTxHash: row.source_tx_hash as string | undefined,
    targetTxHash: row.target_tx_hash as string | undefined,
    status: row.status as BridgeTransaction['status'],
    estimatedArrival: row.estimated_arrival as number | undefined,
    actualArrival: row.actual_arrival as number | undefined,
    fee: row.fee as number,
    feeUsd: row.fee_usd as number,
    error: row.error as string | undefined,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

// Wallet operations
export function addEVMWallet(
  wallet: Omit<EVMWallet, 'id' | 'createdAt' | 'updatedAt'>
): EVMWallet {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  // If this is primary, unset other primaries for this chain
  if (wallet.isPrimary) {
    db.prepare(`
      UPDATE evm_wallets SET is_primary = 0, updated_at = ?
      WHERE user_wallet = ? AND chain = ?
    `).run(now, wallet.userWallet, wallet.chain);
  }

  const stmt = db.prepare(`
    INSERT INTO evm_wallets (
      id, user_wallet, evm_address, chain, label, is_primary, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, wallet.userWallet, wallet.evmAddress, wallet.chain,
    wallet.label, wallet.isPrimary ? 1 : 0, now, now
  );

  return { ...wallet, id, createdAt: now, updatedAt: now };
}

export function getEVMWallets(userWallet: string, chain?: EVMChain): EVMWallet[] {
  const db = getDb();
  let query = 'SELECT * FROM evm_wallets WHERE user_wallet = ?';
  const params: (string | number)[] = [userWallet];

  if (chain) {
    query += ' AND chain = ?';
    params.push(chain);
  }

  query += ' ORDER BY is_primary DESC, created_at ASC';

  const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
  return rows.map(row => ({
    id: row.id as string,
    userWallet: row.user_wallet as string,
    evmAddress: row.evm_address as string,
    chain: row.chain as EVMChain,
    label: row.label as string | undefined,
    isPrimary: Boolean(row.is_primary),
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  }));
}

export function removeEVMWallet(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM evm_wallets WHERE id = ?').run(id);
  return result.changes > 0;
}

// Transaction operations
export function createEVMTransaction(
  tx: Omit<EVMTransaction, 'id' | 'createdAt' | 'updatedAt'>
): EVMTransaction {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO evm_transactions (
      id, user_wallet, evm_address, chain, protocol, tx_hash, type,
      token_in, token_out, amount_in, amount_out, value_usd, gas_used,
      gas_price_gwei, gas_cost_usd, status, block_number, error, metadata,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, tx.userWallet, tx.evmAddress, tx.chain, tx.protocol, tx.txHash,
    tx.type, tx.tokenIn, tx.tokenOut, tx.amountIn, tx.amountOut, tx.valueUsd,
    tx.gasUsed, tx.gasPriceGwei, tx.gasCostUsd, tx.status, tx.blockNumber,
    tx.error, tx.metadata, now, now
  );

  return { ...tx, id, createdAt: now, updatedAt: now };
}

export function getEVMTransactionById(id: string): EVMTransaction | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM evm_transactions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToTransaction(row) : null;
}

export function getEVMTransactionByHash(txHash: string): EVMTransaction | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM evm_transactions WHERE tx_hash = ?').get(txHash) as Record<string, unknown> | undefined;
  return row ? rowToTransaction(row) : null;
}

export function getEVMTransactions(
  userWallet: string,
  options?: { chain?: EVMChain; type?: string; status?: string; limit?: number }
): EVMTransaction[] {
  const db = getDb();
  let query = 'SELECT * FROM evm_transactions WHERE user_wallet = ?';
  const params: (string | number)[] = [userWallet];

  if (options?.chain) {
    query += ' AND chain = ?';
    params.push(options.chain);
  }
  if (options?.type) {
    query += ' AND type = ?';
    params.push(options.type);
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
  return rows.map(rowToTransaction);
}

export function updateEVMTransaction(
  id: string,
  updates: Partial<Pick<EVMTransaction, 'status' | 'blockNumber' | 'gasUsed' | 'gasCostUsd' | 'error' | 'amountOut'>>
): EVMTransaction | null {
  const db = getDb();
  const now = Date.now();
  const setClauses: string[] = ['updated_at = ?'];
  const params: (string | number | null)[] = [now];

  if (updates.status !== undefined) {
    setClauses.push('status = ?');
    params.push(updates.status);
  }
  if (updates.blockNumber !== undefined) {
    setClauses.push('block_number = ?');
    params.push(updates.blockNumber);
  }
  if (updates.gasUsed !== undefined) {
    setClauses.push('gas_used = ?');
    params.push(updates.gasUsed);
  }
  if (updates.gasCostUsd !== undefined) {
    setClauses.push('gas_cost_usd = ?');
    params.push(updates.gasCostUsd);
  }
  if (updates.error !== undefined) {
    setClauses.push('error = ?');
    params.push(updates.error);
  }
  if (updates.amountOut !== undefined) {
    setClauses.push('amount_out = ?');
    params.push(updates.amountOut);
  }

  params.push(id);
  db.prepare(`UPDATE evm_transactions SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

  return getEVMTransactionById(id);
}

// Balance operations
export function updateEVMBalance(
  balance: Omit<EVMBalance, 'id'>
): EVMBalance {
  const db = getDb();
  const id = randomUUID();

  // Upsert balance
  db.prepare(`
    INSERT INTO evm_balances (
      id, user_wallet, evm_address, chain, token_address, token_symbol,
      token_decimals, balance, balance_usd, last_updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_wallet, evm_address, chain, token_address) DO UPDATE SET
      balance = excluded.balance,
      balance_usd = excluded.balance_usd,
      last_updated = excluded.last_updated
  `).run(
    id, balance.userWallet, balance.evmAddress, balance.chain,
    balance.tokenAddress, balance.tokenSymbol, balance.tokenDecimals,
    balance.balance, balance.balanceUsd, balance.lastUpdated
  );

  return { ...balance, id };
}

export function getEVMBalances(
  userWallet: string,
  options?: { chain?: EVMChain; evmAddress?: string }
): EVMBalance[] {
  const db = getDb();
  let query = 'SELECT * FROM evm_balances WHERE user_wallet = ?';
  const params: (string | number)[] = [userWallet];

  if (options?.chain) {
    query += ' AND chain = ?';
    params.push(options.chain);
  }
  if (options?.evmAddress) {
    query += ' AND evm_address = ?';
    params.push(options.evmAddress);
  }

  query += ' ORDER BY balance_usd DESC';

  const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
  return rows.map(row => ({
    id: row.id as string,
    userWallet: row.user_wallet as string,
    evmAddress: row.evm_address as string,
    chain: row.chain as EVMChain,
    tokenAddress: row.token_address as string,
    tokenSymbol: row.token_symbol as string,
    tokenDecimals: row.token_decimals as number,
    balance: row.balance as string,
    balanceUsd: row.balance_usd as number,
    lastUpdated: row.last_updated as number,
  }));
}

// Bridge operations
export function createBridgeTransaction(
  bridge: Omit<BridgeTransaction, 'id' | 'createdAt' | 'updatedAt'>
): BridgeTransaction {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO bridge_transactions (
      id, user_wallet, source_chain, target_chain, source_address, target_address,
      token_symbol, amount, amount_usd, bridge_protocol, source_tx_hash,
      target_tx_hash, status, estimated_arrival, actual_arrival, fee, fee_usd,
      error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, bridge.userWallet, bridge.sourceChain, bridge.targetChain,
    bridge.sourceAddress, bridge.targetAddress, bridge.tokenSymbol,
    bridge.amount, bridge.amountUsd, bridge.bridgeProtocol, bridge.sourceTxHash,
    bridge.targetTxHash, bridge.status, bridge.estimatedArrival,
    bridge.actualArrival, bridge.fee, bridge.feeUsd, bridge.error, now, now
  );

  return { ...bridge, id, createdAt: now, updatedAt: now };
}

export function getBridgeTransactionById(id: string): BridgeTransaction | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM bridge_transactions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToBridge(row) : null;
}

export function getBridgeTransactions(
  userWallet: string,
  options?: { status?: string; limit?: number }
): BridgeTransaction[] {
  const db = getDb();
  let query = 'SELECT * FROM bridge_transactions WHERE user_wallet = ?';
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
  return rows.map(rowToBridge);
}

export function updateBridgeTransaction(
  id: string,
  updates: Partial<Pick<BridgeTransaction, 'status' | 'targetTxHash' | 'actualArrival' | 'error'>>
): BridgeTransaction | null {
  const db = getDb();
  const now = Date.now();
  const setClauses: string[] = ['updated_at = ?'];
  const params: (string | number | null)[] = [now];

  if (updates.status !== undefined) {
    setClauses.push('status = ?');
    params.push(updates.status);
  }
  if (updates.targetTxHash !== undefined) {
    setClauses.push('target_tx_hash = ?');
    params.push(updates.targetTxHash);
  }
  if (updates.actualArrival !== undefined) {
    setClauses.push('actual_arrival = ?');
    params.push(updates.actualArrival);
  }
  if (updates.error !== undefined) {
    setClauses.push('error = ?');
    params.push(updates.error);
  }

  params.push(id);
  db.prepare(`UPDATE bridge_transactions SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

  return getBridgeTransactionById(id);
}

// Stats
export function getEVMStats(userWallet: string): {
  totalTransactions: number;
  totalVolume: number;
  totalGasCost: number;
  chainsUsed: EVMChain[];
  favoriteProtocol: string | null;
  pendingBridges: number;
} {
  const db = getDb();

  const txStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(value_usd) as volume,
      SUM(gas_cost_usd) as gas_cost,
      GROUP_CONCAT(DISTINCT chain) as chains
    FROM evm_transactions
    WHERE user_wallet = ?
  `).get(userWallet) as {
    total: number;
    volume: number;
    gas_cost: number;
    chains: string;
  };

  const protocolCount = db.prepare(`
    SELECT protocol, COUNT(*) as count
    FROM evm_transactions
    WHERE user_wallet = ?
    GROUP BY protocol
    ORDER BY count DESC
    LIMIT 1
  `).get(userWallet) as { protocol: string; count: number } | undefined;

  const pendingBridges = db.prepare(`
    SELECT COUNT(*) as count
    FROM bridge_transactions
    WHERE user_wallet = ? AND status NOT IN ('completed', 'failed')
  `).get(userWallet) as { count: number };

  return {
    totalTransactions: txStats.total || 0,
    totalVolume: txStats.volume || 0,
    totalGasCost: txStats.gas_cost || 0,
    chainsUsed: txStats.chains ? txStats.chains.split(',') as EVMChain[] : [],
    favoriteProtocol: protocolCount?.protocol || null,
    pendingBridges: pendingBridges.count || 0,
  };
}

// Get supported chains
export function getSupportedChains(): Array<{
  chain: EVMChain;
  config: typeof CHAIN_CONFIG[EVMChain];
}> {
  return Object.entries(CHAIN_CONFIG).map(([chain, config]) => ({
    chain: chain as EVMChain,
    config,
  }));
}
