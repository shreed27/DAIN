/**
 * Database Module for Super Trading Platform Gateway
 * Uses better-sqlite3 for SQLite with WAL mode
 */

import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database file path - defaults to ./data/gateway.db
const DB_PATH = process.env.DATABASE_PATH || join(process.cwd(), 'data', 'gateway.db');

// Database instance
let db: Database.Database | null = null;

export function initializeDatabase(): Database.Database {
  // Ensure data directory exists
  const dataDir = dirname(DB_PATH);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  // Create database with WAL mode for better concurrency
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000'); // 64MB cache
  db.pragma('foreign_keys = ON');

  // Run schema
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  console.log(`[Database] Initialized at ${DB_PATH}`);

  return db;
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log('[Database] Closed');
  }
}

// Helper function to parse JSON fields safely
export function parseJSON<T>(value: string | null | undefined, defaultValue: T): T {
  if (!value) return defaultValue;
  try {
    return JSON.parse(value) as T;
  } catch {
    return defaultValue;
  }
}

// Helper function to stringify JSON fields
export function stringifyJSON(value: unknown): string {
  return JSON.stringify(value);
}

export { db };
