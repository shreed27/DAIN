/**
 * Database Operations for Token Migrations Detection
 */

import { getDatabase, parseJSON, stringifyJSON } from '../index.js';

export type MigrationType = 'pump_to_raydium' | 'bonding_curve' | 'upgrade' | 'rebrand' | 'other';

export interface TokenMigration {
  id: string;
  oldMint: string;
  newMint: string;
  oldSymbol?: string;
  newSymbol?: string;
  migrationType: MigrationType;
  detectedAt: number;
  rankingScore: number;
  godWalletCount: number;
  volume24h: number;
  marketCap: number;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

interface TokenMigrationRow {
  id: string;
  old_mint: string;
  new_mint: string;
  old_symbol: string | null;
  new_symbol: string | null;
  migration_type: string;
  detected_at: number;
  ranking_score: number;
  god_wallet_count: number;
  volume_24h: number;
  market_cap: number;
  metadata: string | null;
  created_at: number;
}

function rowToTokenMigration(row: TokenMigrationRow): TokenMigration {
  return {
    id: row.id,
    oldMint: row.old_mint,
    newMint: row.new_mint,
    oldSymbol: row.old_symbol || undefined,
    newSymbol: row.new_symbol || undefined,
    migrationType: row.migration_type as MigrationType,
    detectedAt: row.detected_at,
    rankingScore: row.ranking_score,
    godWalletCount: row.god_wallet_count,
    volume24h: row.volume_24h,
    marketCap: row.market_cap,
    metadata: row.metadata ? parseJSON<Record<string, unknown>>(row.metadata, {}) : undefined,
    createdAt: row.created_at,
  };
}

export function createTokenMigration(migration: TokenMigration): TokenMigration {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO token_migrations (
      id, old_mint, new_mint, old_symbol, new_symbol, migration_type,
      detected_at, ranking_score, god_wallet_count, volume_24h, market_cap,
      metadata, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    migration.id,
    migration.oldMint,
    migration.newMint,
    migration.oldSymbol || null,
    migration.newSymbol || null,
    migration.migrationType,
    migration.detectedAt,
    migration.rankingScore,
    migration.godWalletCount,
    migration.volume24h,
    migration.marketCap,
    migration.metadata ? stringifyJSON(migration.metadata) : null,
    migration.createdAt
  );

  return migration;
}

export function getTokenMigrationById(id: string): TokenMigration | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM token_migrations WHERE id = ?');
  const row = stmt.get(id) as TokenMigrationRow | undefined;
  return row ? rowToTokenMigration(row) : null;
}

export function getTokenMigrationByMints(oldMint?: string, newMint?: string): TokenMigration | null {
  const db = getDatabase();

  if (oldMint && newMint) {
    const stmt = db.prepare('SELECT * FROM token_migrations WHERE old_mint = ? AND new_mint = ?');
    const row = stmt.get(oldMint, newMint) as TokenMigrationRow | undefined;
    return row ? rowToTokenMigration(row) : null;
  } else if (oldMint) {
    const stmt = db.prepare('SELECT * FROM token_migrations WHERE old_mint = ? ORDER BY detected_at DESC LIMIT 1');
    const row = stmt.get(oldMint) as TokenMigrationRow | undefined;
    return row ? rowToTokenMigration(row) : null;
  } else if (newMint) {
    const stmt = db.prepare('SELECT * FROM token_migrations WHERE new_mint = ? ORDER BY detected_at DESC LIMIT 1');
    const row = stmt.get(newMint) as TokenMigrationRow | undefined;
    return row ? rowToTokenMigration(row) : null;
  }

  return null;
}

export function getRecentMigrations(options?: {
  migrationType?: MigrationType;
  minRankingScore?: number;
  minGodWalletCount?: number;
  limit?: number;
  offset?: number;
}): { migrations: TokenMigration[]; total: number } {
  const db = getDatabase();

  let query = 'SELECT * FROM token_migrations WHERE 1=1';
  let countQuery = 'SELECT COUNT(*) as count FROM token_migrations WHERE 1=1';
  const params: unknown[] = [];

  if (options?.migrationType) {
    query += ' AND migration_type = ?';
    countQuery += ' AND migration_type = ?';
    params.push(options.migrationType);
  }

  if (options?.minRankingScore !== undefined) {
    query += ' AND ranking_score >= ?';
    countQuery += ' AND ranking_score >= ?';
    params.push(options.minRankingScore);
  }

  if (options?.minGodWalletCount !== undefined) {
    query += ' AND god_wallet_count >= ?';
    countQuery += ' AND god_wallet_count >= ?';
    params.push(options.minGodWalletCount);
  }

  // Get total count
  const countStmt = db.prepare(countQuery);
  const countRow = countStmt.get(...params) as { count: number };

  // Add ordering and pagination
  query += ' ORDER BY ranking_score DESC, detected_at DESC';

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  query += ' LIMIT ? OFFSET ?';

  const stmt = db.prepare(query);
  const rows = stmt.all(...params, limit, offset) as TokenMigrationRow[];

  return {
    migrations: rows.map(rowToTokenMigration),
    total: countRow.count,
  };
}

export function getTopRankedMigrations(limit: number = 20): TokenMigration[] {
  const db = getDatabase();
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

  const stmt = db.prepare(`
    SELECT * FROM token_migrations
    WHERE detected_at >= ?
    ORDER BY ranking_score DESC
    LIMIT ?
  `);
  const rows = stmt.all(oneDayAgo, limit) as TokenMigrationRow[];
  return rows.map(rowToTokenMigration);
}

export function getMigrationsByGodWalletActivity(minWalletCount: number = 3, limit: number = 20): TokenMigration[] {
  const db = getDatabase();
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const stmt = db.prepare(`
    SELECT * FROM token_migrations
    WHERE detected_at >= ? AND god_wallet_count >= ?
    ORDER BY god_wallet_count DESC, ranking_score DESC
    LIMIT ?
  `);
  const rows = stmt.all(oneWeekAgo, minWalletCount, limit) as TokenMigrationRow[];
  return rows.map(rowToTokenMigration);
}

export function updateMigrationMetrics(
  id: string,
  updates: {
    rankingScore?: number;
    godWalletCount?: number;
    volume24h?: number;
    marketCap?: number;
    metadata?: Record<string, unknown>;
  }
): TokenMigration | null {
  const db = getDatabase();

  let query = 'UPDATE token_migrations SET';
  const params: unknown[] = [];
  const setClauses: string[] = [];

  if (updates.rankingScore !== undefined) {
    setClauses.push(' ranking_score = ?');
    params.push(updates.rankingScore);
  }

  if (updates.godWalletCount !== undefined) {
    setClauses.push(' god_wallet_count = ?');
    params.push(updates.godWalletCount);
  }

  if (updates.volume24h !== undefined) {
    setClauses.push(' volume_24h = ?');
    params.push(updates.volume24h);
  }

  if (updates.marketCap !== undefined) {
    setClauses.push(' market_cap = ?');
    params.push(updates.marketCap);
  }

  if (updates.metadata !== undefined) {
    setClauses.push(' metadata = ?');
    params.push(stringifyJSON(updates.metadata));
  }

  if (setClauses.length === 0) {
    return getTokenMigrationById(id);
  }

  query += setClauses.join(',') + ' WHERE id = ?';
  params.push(id);

  const stmt = db.prepare(query);
  stmt.run(...params);

  return getTokenMigrationById(id);
}

export function deleteMigration(id: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM token_migrations WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function getMigrationStats(): {
  total: number;
  last24h: number;
  last7d: number;
  byType: Record<MigrationType, number>;
  avgRankingScore: number;
  avgGodWalletCount: number;
} {
  const db = getDatabase();
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

  // Overall stats
  const statsStmt = db.prepare(`
    SELECT
      COUNT(*) as total,
      AVG(ranking_score) as avg_ranking,
      AVG(god_wallet_count) as avg_god_wallets
    FROM token_migrations
  `);
  const statsRow = statsStmt.get() as {
    total: number;
    avg_ranking: number;
    avg_god_wallets: number;
  };

  // Time-based counts
  const timeStmt = db.prepare(`
    SELECT
      SUM(CASE WHEN detected_at >= ? THEN 1 ELSE 0 END) as last_24h,
      SUM(CASE WHEN detected_at >= ? THEN 1 ELSE 0 END) as last_7d
    FROM token_migrations
  `);
  const timeRow = timeStmt.get(oneDayAgo, oneWeekAgo) as {
    last_24h: number;
    last_7d: number;
  };

  // By type breakdown
  const typeStmt = db.prepare(`
    SELECT migration_type, COUNT(*) as count
    FROM token_migrations
    GROUP BY migration_type
  `);
  const typeRows = typeStmt.all() as { migration_type: string; count: number }[];

  const byType: Record<MigrationType, number> = {
    pump_to_raydium: 0,
    bonding_curve: 0,
    upgrade: 0,
    rebrand: 0,
    other: 0,
  };
  for (const row of typeRows) {
    byType[row.migration_type as MigrationType] = row.count;
  }

  return {
    total: statsRow.total || 0,
    last24h: timeRow.last_24h || 0,
    last7d: timeRow.last_7d || 0,
    byType,
    avgRankingScore: statsRow.avg_ranking || 0,
    avgGodWalletCount: statsRow.avg_god_wallets || 0,
  };
}

export function cleanupOldMigrations(olderThanDays: number = 30): number {
  const db = getDatabase();
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

  const stmt = db.prepare(`
    DELETE FROM token_migrations
    WHERE detected_at < ?
  `);
  const result = stmt.run(cutoff);
  return result.changes;
}
