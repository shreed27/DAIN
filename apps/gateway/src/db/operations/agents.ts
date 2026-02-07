/**
 * Database Operations for Agents
 */

import { getDatabase, parseJSON, stringifyJSON } from '../index.js';
import type { Agent, AgentConfig, AgentPerformance, AgentStatus, AgentType } from '../../types.js';

interface AgentRow {
  id: string;
  name: string;
  type: string;
  status: string;
  strategy_id: string | null;
  wallet_address: string | null;
  config: string;
  performance: string;
  created_at: number;
  updated_at: number;
}

function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    type: row.type as AgentType,
    status: row.status as AgentStatus,
    strategyId: row.strategy_id || undefined,
    walletAddress: row.wallet_address || undefined,
    config: parseJSON<AgentConfig>(row.config, {
      maxPositionSize: 1000,
      maxDailyLoss: 100,
      maxOpenPositions: 5,
      allowedMarkets: ['dex'],
      allowedChains: ['solana'],
      riskLevel: 'moderate',
      autoExecute: false,
    }),
    performance: parseJSON<AgentPerformance>(row.performance, {
      totalTrades: 0,
      winRate: 0,
      totalPnL: 0,
      dailyPnL: 0,
      avgTradeSize: 0,
      avgHoldTime: 0,
    }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getAllAgents(): Agent[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM agents ORDER BY updated_at DESC');
  const rows = stmt.all() as AgentRow[];
  return rows.map(rowToAgent);
}

export function getAgentById(id: string): Agent | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM agents WHERE id = ?');
  const row = stmt.get(id) as AgentRow | undefined;
  return row ? rowToAgent(row) : null;
}

export function getAgentsByStatus(status: AgentStatus): Agent[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM agents WHERE status = ? ORDER BY updated_at DESC');
  const rows = stmt.all(status) as AgentRow[];
  return rows.map(rowToAgent);
}

export function createAgent(agent: Agent): Agent {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO agents (id, name, type, status, strategy_id, wallet_address, config, performance, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    agent.id,
    agent.name,
    agent.type,
    agent.status,
    agent.strategyId || null,
    agent.walletAddress || null,
    stringifyJSON(agent.config),
    stringifyJSON(agent.performance),
    agent.createdAt,
    agent.updatedAt
  );

  return agent;
}

export function updateAgent(agent: Agent): Agent {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE agents
    SET name = ?, type = ?, status = ?, strategy_id = ?, wallet_address = ?,
        config = ?, performance = ?, updated_at = ?
    WHERE id = ?
  `);

  stmt.run(
    agent.name,
    agent.type,
    agent.status,
    agent.strategyId || null,
    agent.walletAddress || null,
    stringifyJSON(agent.config),
    stringifyJSON(agent.performance),
    agent.updatedAt,
    agent.id
  );

  return agent;
}

export function updateAgentStatus(id: string, status: AgentStatus): Agent | null {
  const db = getDatabase();
  const now = Date.now();

  const stmt = db.prepare(`
    UPDATE agents SET status = ?, updated_at = ? WHERE id = ?
  `);
  stmt.run(status, now, id);

  return getAgentById(id);
}

export function updateAgentPerformance(id: string, performance: AgentPerformance): Agent | null {
  const db = getDatabase();
  const now = Date.now();

  const stmt = db.prepare(`
    UPDATE agents SET performance = ?, updated_at = ? WHERE id = ?
  `);
  stmt.run(stringifyJSON(performance), now, id);

  return getAgentById(id);
}

export function deleteAgent(id: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM agents WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function getAgentCount(): number {
  const db = getDatabase();
  const stmt = db.prepare('SELECT COUNT(*) as count FROM agents');
  const row = stmt.get() as { count: number };
  return row.count;
}
