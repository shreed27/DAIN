/**
 * Database Operations for Price History (OHLCV data)
 */

import { getDatabase } from '../index.js';

export type PriceInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface PriceCandle {
  id: string;
  tokenMint: string;
  interval: PriceInterval;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PriceCandleRow {
  id: string;
  token_mint: string;
  interval: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function rowToPriceCandle(row: PriceCandleRow): PriceCandle {
  return {
    id: row.id,
    tokenMint: row.token_mint,
    interval: row.interval as PriceInterval,
    timestamp: row.timestamp,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
  };
}

export function upsertPriceCandle(candle: PriceCandle): PriceCandle {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO price_history (id, token_mint, interval, timestamp, open, high, low, close, volume)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(token_mint, interval, timestamp) DO UPDATE SET
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      volume = excluded.volume
  `);

  stmt.run(
    candle.id,
    candle.tokenMint,
    candle.interval,
    candle.timestamp,
    candle.open,
    candle.high,
    candle.low,
    candle.close,
    candle.volume
  );

  return candle;
}

export function batchUpsertCandles(candles: PriceCandle[]): number {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO price_history (id, token_mint, interval, timestamp, open, high, low, close, volume)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(token_mint, interval, timestamp) DO UPDATE SET
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      volume = excluded.volume
  `);

  const insertMany = db.transaction((candles: PriceCandle[]) => {
    for (const candle of candles) {
      stmt.run(
        candle.id,
        candle.tokenMint,
        candle.interval,
        candle.timestamp,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume
      );
    }
    return candles.length;
  });

  return insertMany(candles);
}

export function getPriceHistory(
  tokenMint: string,
  interval: PriceInterval,
  options?: {
    startTime?: number;
    endTime?: number;
    limit?: number;
  }
): PriceCandle[] {
  const db = getDatabase();

  let query = 'SELECT * FROM price_history WHERE token_mint = ? AND interval = ?';
  const params: unknown[] = [tokenMint, interval];

  if (options?.startTime) {
    query += ' AND timestamp >= ?';
    params.push(options.startTime);
  }

  if (options?.endTime) {
    query += ' AND timestamp <= ?';
    params.push(options.endTime);
  }

  query += ' ORDER BY timestamp ASC';

  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as PriceCandleRow[];
  return rows.map(rowToPriceCandle);
}

export function getLatestPrice(tokenMint: string): PriceCandle | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM price_history
    WHERE token_mint = ?
    ORDER BY timestamp DESC
    LIMIT 1
  `);
  const row = stmt.get(tokenMint) as PriceCandleRow | undefined;
  return row ? rowToPriceCandle(row) : null;
}

export function getLatestPrices(tokenMints: string[]): Map<string, PriceCandle> {
  const db = getDatabase();
  const results = new Map<string, PriceCandle>();

  // Use a CTE to get the latest price for each token
  const placeholders = tokenMints.map(() => '?').join(',');
  const stmt = db.prepare(`
    SELECT p.* FROM price_history p
    INNER JOIN (
      SELECT token_mint, MAX(timestamp) as max_ts
      FROM price_history
      WHERE token_mint IN (${placeholders})
      GROUP BY token_mint
    ) latest ON p.token_mint = latest.token_mint AND p.timestamp = latest.max_ts
  `);

  const rows = stmt.all(...tokenMints) as PriceCandleRow[];
  for (const row of rows) {
    results.set(row.token_mint, rowToPriceCandle(row));
  }

  return results;
}

export function getPriceStats(
  tokenMint: string,
  interval: PriceInterval,
  startTime: number,
  endTime: number
): {
  high: number;
  low: number;
  open: number;
  close: number;
  avgPrice: number;
  totalVolume: number;
  priceChange: number;
  priceChangePercent: number;
  volatility: number;
} | null {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT
      MAX(high) as high,
      MIN(low) as low,
      SUM(volume) as total_volume,
      AVG((open + high + low + close) / 4) as avg_price,
      COUNT(*) as candle_count
    FROM price_history
    WHERE token_mint = ? AND interval = ? AND timestamp >= ? AND timestamp <= ?
  `);
  const statsRow = stmt.get(tokenMint, interval, startTime, endTime) as {
    high: number;
    low: number;
    total_volume: number;
    avg_price: number;
    candle_count: number;
  } | undefined;

  if (!statsRow || statsRow.candle_count === 0) {
    return null;
  }

  // Get first and last candles for open/close
  const firstStmt = db.prepare(`
    SELECT open FROM price_history
    WHERE token_mint = ? AND interval = ? AND timestamp >= ? AND timestamp <= ?
    ORDER BY timestamp ASC LIMIT 1
  `);
  const firstRow = firstStmt.get(tokenMint, interval, startTime, endTime) as { open: number } | undefined;

  const lastStmt = db.prepare(`
    SELECT close FROM price_history
    WHERE token_mint = ? AND interval = ? AND timestamp >= ? AND timestamp <= ?
    ORDER BY timestamp DESC LIMIT 1
  `);
  const lastRow = lastStmt.get(tokenMint, interval, startTime, endTime) as { close: number } | undefined;

  const open = firstRow?.open || 0;
  const close = lastRow?.close || 0;
  const priceChange = close - open;
  const priceChangePercent = open > 0 ? (priceChange / open) * 100 : 0;

  // Calculate volatility (standard deviation of returns)
  const volatilityStmt = db.prepare(`
    SELECT close FROM price_history
    WHERE token_mint = ? AND interval = ? AND timestamp >= ? AND timestamp <= ?
    ORDER BY timestamp ASC
  `);
  const closes = volatilityStmt.all(tokenMint, interval, startTime, endTime) as { close: number }[];

  let volatility = 0;
  if (closes.length > 1) {
    const returns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      if (closes[i - 1].close > 0) {
        returns.push((closes[i].close - closes[i - 1].close) / closes[i - 1].close);
      }
    }

    if (returns.length > 0) {
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const squaredDiffs = returns.map(r => Math.pow(r - avgReturn, 2));
      volatility = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / returns.length) * 100;
    }
  }

  return {
    high: statsRow.high,
    low: statsRow.low,
    open,
    close,
    avgPrice: statsRow.avg_price,
    totalVolume: statsRow.total_volume,
    priceChange,
    priceChangePercent,
    volatility,
  };
}

export function deletePriceHistory(tokenMint: string, olderThan: number): number {
  const db = getDatabase();
  const stmt = db.prepare(`
    DELETE FROM price_history
    WHERE token_mint = ? AND timestamp < ?
  `);
  const result = stmt.run(tokenMint, olderThan);
  return result.changes;
}

export function cleanupOldPriceData(retentionDays: Record<PriceInterval, number>): number {
  const db = getDatabase();
  const now = Date.now();
  let totalDeleted = 0;

  for (const [interval, days] of Object.entries(retentionDays)) {
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    const stmt = db.prepare(`
      DELETE FROM price_history
      WHERE interval = ? AND timestamp < ?
    `);
    const result = stmt.run(interval, cutoff);
    totalDeleted += result.changes;
  }

  return totalDeleted;
}

export function getAvailableTokens(): string[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT DISTINCT token_mint FROM price_history
    ORDER BY token_mint
  `);
  const rows = stmt.all() as { token_mint: string }[];
  return rows.map(r => r.token_mint);
}

export function getDataCoverage(tokenMint: string, interval: PriceInterval): {
  firstTimestamp: number;
  lastTimestamp: number;
  candleCount: number;
  expectedCandles: number;
  coveragePercent: number;
} | null {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT
      MIN(timestamp) as first_ts,
      MAX(timestamp) as last_ts,
      COUNT(*) as candle_count
    FROM price_history
    WHERE token_mint = ? AND interval = ?
  `);
  const row = stmt.get(tokenMint, interval) as {
    first_ts: number | null;
    last_ts: number | null;
    candle_count: number;
  };

  if (!row.first_ts || !row.last_ts) {
    return null;
  }

  // Calculate expected candles based on interval
  const intervalMs: Record<PriceInterval, number> = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
  };

  const timeRange = row.last_ts - row.first_ts;
  const expectedCandles = Math.ceil(timeRange / intervalMs[interval]) + 1;
  const coveragePercent = (row.candle_count / expectedCandles) * 100;

  return {
    firstTimestamp: row.first_ts,
    lastTimestamp: row.last_ts,
    candleCount: row.candle_count,
    expectedCandles,
    coveragePercent: Math.min(100, coveragePercent),
  };
}
