/**
 * Database Operations for Signals
 */

import { getDatabase, parseJSON, stringifyJSON } from '../index.js';
import type { Signal, SignalSource } from '../../types.js';

interface SignalRow {
  id: string;
  source: string;
  type: string;
  data: string;
  confidence: number;
  timestamp: number;
  expires_at: number | null;
  metadata: string | null;
}

function rowToSignal(row: SignalRow): Signal {
  return {
    id: row.id,
    source: row.source as SignalSource,
    type: row.type,
    data: parseJSON(row.data, {}),
    confidence: row.confidence,
    timestamp: row.timestamp,
    expiresAt: row.expires_at || undefined,
    metadata: row.metadata ? parseJSON(row.metadata, {}) : undefined,
  };
}

export function getAllSignals(filters?: {
  source?: SignalSource;
  type?: string;
  minConfidence?: number;
  limit?: number;
}): Signal[] {
  const db = getDatabase();

  let query = 'SELECT * FROM signals WHERE 1=1';
  const params: unknown[] = [];

  if (filters?.source) {
    query += ' AND source = ?';
    params.push(filters.source);
  }

  if (filters?.type) {
    query += ' AND type = ?';
    params.push(filters.type);
  }

  if (filters?.minConfidence) {
    query += ' AND confidence >= ?';
    params.push(filters.minConfidence);
  }

  query += ' ORDER BY timestamp DESC';

  if (filters?.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as SignalRow[];

  return rows.map(rowToSignal);
}

export function getSignalById(id: string): Signal | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM signals WHERE id = ?');
  const row = stmt.get(id) as SignalRow | undefined;
  return row ? rowToSignal(row) : null;
}

export function createSignal(signal: Signal): Signal {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO signals (id, source, type, data, confidence, timestamp, expires_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    signal.id,
    signal.source,
    signal.type,
    stringifyJSON(signal.data),
    signal.confidence,
    signal.timestamp,
    signal.expiresAt || null,
    signal.metadata ? stringifyJSON(signal.metadata) : null
  );

  return signal;
}

export function deleteSignal(id: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM signals WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function deleteExpiredSignals(): number {
  const db = getDatabase();
  const now = Date.now();
  const stmt = db.prepare('DELETE FROM signals WHERE expires_at IS NOT NULL AND expires_at < ?');
  const result = stmt.run(now);
  return result.changes;
}

export function getRecentSignalsBySource(source: SignalSource, limit: number = 10): Signal[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM signals WHERE source = ? ORDER BY timestamp DESC LIMIT ?
  `);
  const rows = stmt.all(source, limit) as SignalRow[];
  return rows.map(rowToSignal);
}

export function getSignalCount(): number {
  const db = getDatabase();
  const stmt = db.prepare('SELECT COUNT(*) as count FROM signals');
  const row = stmt.get() as { count: number };
  return row.count;
}

export function cleanupOldSignals(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
  const db = getDatabase();
  const cutoff = Date.now() - maxAgeMs;
  const stmt = db.prepare('DELETE FROM signals WHERE timestamp < ? AND expires_at IS NULL');
  const result = stmt.run(cutoff);
  return result.changes;
}
