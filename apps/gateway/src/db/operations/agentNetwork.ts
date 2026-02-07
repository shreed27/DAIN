import { getDb } from '../index';
import { randomUUID } from 'crypto';

// Types
export interface AgentRegistration {
  id: string;
  agentId: string;
  name: string;
  description: string;
  ownerWallet: string;
  capabilities: string[]; // JSON array
  endpoint: string;
  pricePerCall: number; // In USDC
  minReputation: number;
  maxConcurrent: number;
  availability: 'online' | 'busy' | 'offline';
  reputation: number;
  totalCalls: number;
  successRate: number;
  avgResponseTimeMs: number;
  verifiedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface AgentSubscription {
  id: string;
  subscriberWallet: string;
  agentId: string;
  tier: 'basic' | 'pro' | 'enterprise';
  callsRemaining: number;
  callsUsed: number;
  pricePerCall: number;
  totalSpent: number;
  expiresAt: number;
  status: 'active' | 'expired' | 'cancelled';
  createdAt: number;
  updatedAt: number;
}

export interface AgentJob {
  id: string;
  agentId: string;
  callerWallet: string;
  capability: string;
  input: string; // JSON
  output?: string; // JSON
  cost: number;
  responseTimeMs?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'timeout';
  error?: string;
  startedAt: number;
  completedAt?: number;
  createdAt: number;
}

export interface AgentMessage {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  messageType: 'request' | 'response' | 'broadcast' | 'heartbeat';
  payload: string; // JSON
  correlationId?: string;
  acknowledged: boolean;
  createdAt: number;
}

// Row mappers
function rowToAgentRegistration(row: Record<string, unknown>): AgentRegistration {
  return {
    id: row.id as string,
    agentId: row.agent_id as string,
    name: row.name as string,
    description: row.description as string,
    ownerWallet: row.owner_wallet as string,
    capabilities: JSON.parse(row.capabilities as string || '[]'),
    endpoint: row.endpoint as string,
    pricePerCall: row.price_per_call as number,
    minReputation: row.min_reputation as number,
    maxConcurrent: row.max_concurrent as number,
    availability: row.availability as AgentRegistration['availability'],
    reputation: row.reputation as number,
    totalCalls: row.total_calls as number,
    successRate: row.success_rate as number,
    avgResponseTimeMs: row.avg_response_time_ms as number,
    verifiedAt: row.verified_at as number | undefined,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function rowToSubscription(row: Record<string, unknown>): AgentSubscription {
  return {
    id: row.id as string,
    subscriberWallet: row.subscriber_wallet as string,
    agentId: row.agent_id as string,
    tier: row.tier as AgentSubscription['tier'],
    callsRemaining: row.calls_remaining as number,
    callsUsed: row.calls_used as number,
    pricePerCall: row.price_per_call as number,
    totalSpent: row.total_spent as number,
    expiresAt: row.expires_at as number,
    status: row.status as AgentSubscription['status'],
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function rowToJob(row: Record<string, unknown>): AgentJob {
  return {
    id: row.id as string,
    agentId: row.agent_id as string,
    callerWallet: row.caller_wallet as string,
    capability: row.capability as string,
    input: row.input as string,
    output: row.output as string | undefined,
    cost: row.cost as number,
    responseTimeMs: row.response_time_ms as number | undefined,
    status: row.status as AgentJob['status'],
    error: row.error as string | undefined,
    startedAt: row.started_at as number,
    completedAt: row.completed_at as number | undefined,
    createdAt: row.created_at as number,
  };
}

// Agent Registration operations
export function registerAgent(
  agent: Omit<AgentRegistration, 'id' | 'reputation' | 'totalCalls' | 'successRate' | 'avgResponseTimeMs' | 'createdAt' | 'updatedAt'>
): AgentRegistration {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO agent_registry (
      id, agent_id, name, description, owner_wallet, capabilities, endpoint,
      price_per_call, min_reputation, max_concurrent, availability, reputation,
      total_calls, success_rate, avg_response_time_ms, verified_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 100, 0, 0, 0, ?, ?, ?)
  `);

  stmt.run(
    id, agent.agentId, agent.name, agent.description, agent.ownerWallet,
    JSON.stringify(agent.capabilities), agent.endpoint, agent.pricePerCall,
    agent.minReputation, agent.maxConcurrent, agent.availability, agent.verifiedAt,
    now, now
  );

  return {
    ...agent,
    id,
    reputation: 100,
    totalCalls: 0,
    successRate: 0,
    avgResponseTimeMs: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function getAgentById(agentId: string): AgentRegistration | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM agent_registry WHERE agent_id = ?').get(agentId) as Record<string, unknown> | undefined;
  return row ? rowToAgentRegistration(row) : null;
}

export function discoverAgents(options?: {
  capability?: string;
  minReputation?: number;
  maxPrice?: number;
  availability?: string;
  limit?: number;
}): AgentRegistration[] {
  const db = getDb();
  let query = 'SELECT * FROM agent_registry WHERE 1=1';
  const params: (string | number)[] = [];

  if (options?.capability) {
    query += ` AND capabilities LIKE ?`;
    params.push(`%${options.capability}%`);
  }
  if (options?.minReputation) {
    query += ' AND reputation >= ?';
    params.push(options.minReputation);
  }
  if (options?.maxPrice) {
    query += ' AND price_per_call <= ?';
    params.push(options.maxPrice);
  }
  if (options?.availability) {
    query += ' AND availability = ?';
    params.push(options.availability);
  }

  query += ' ORDER BY reputation DESC, success_rate DESC';

  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
  return rows.map(rowToAgentRegistration);
}

export function updateAgentAvailability(
  agentId: string,
  availability: AgentRegistration['availability']
): AgentRegistration | null {
  const db = getDb();
  const now = Date.now();
  db.prepare('UPDATE agent_registry SET availability = ?, updated_at = ? WHERE agent_id = ?').run(availability, now, agentId);
  return getAgentById(agentId);
}

export function updateAgentStats(
  agentId: string,
  callSuccess: boolean,
  responseTimeMs: number
): void {
  const db = getDb();
  const now = Date.now();
  const agent = getAgentById(agentId);
  if (!agent) return;

  const newTotalCalls = agent.totalCalls + 1;
  const newSuccessRate = ((agent.successRate * agent.totalCalls) + (callSuccess ? 100 : 0)) / newTotalCalls;
  const newAvgResponseTime = ((agent.avgResponseTimeMs * agent.totalCalls) + responseTimeMs) / newTotalCalls;

  // Adjust reputation
  let reputationDelta = callSuccess ? 1 : -5;
  if (responseTimeMs < 1000) reputationDelta += 0.5;
  const newReputation = Math.max(0, Math.min(100, agent.reputation + reputationDelta));

  db.prepare(`
    UPDATE agent_registry
    SET total_calls = ?, success_rate = ?, avg_response_time_ms = ?, reputation = ?, updated_at = ?
    WHERE agent_id = ?
  `).run(newTotalCalls, newSuccessRate, newAvgResponseTime, newReputation, now, agentId);
}

export function deregisterAgent(agentId: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM agent_registry WHERE agent_id = ?').run(agentId);
  return result.changes > 0;
}

// Subscription operations
export function createSubscription(
  sub: Omit<AgentSubscription, 'id' | 'callsUsed' | 'totalSpent' | 'createdAt' | 'updatedAt'>
): AgentSubscription {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO agent_subscriptions (
      id, subscriber_wallet, agent_id, tier, calls_remaining, calls_used,
      price_per_call, total_spent, expires_at, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?)
  `);

  stmt.run(
    id, sub.subscriberWallet, sub.agentId, sub.tier, sub.callsRemaining,
    sub.pricePerCall, sub.expiresAt, sub.status, now, now
  );

  return { ...sub, id, callsUsed: 0, totalSpent: 0, createdAt: now, updatedAt: now };
}

export function getSubscription(subscriberWallet: string, agentId: string): AgentSubscription | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM agent_subscriptions
    WHERE subscriber_wallet = ? AND agent_id = ? AND status = 'active'
  `).get(subscriberWallet, agentId) as Record<string, unknown> | undefined;

  return row ? rowToSubscription(row) : null;
}

export function getSubscriptionsByWallet(subscriberWallet: string): AgentSubscription[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM agent_subscriptions WHERE subscriber_wallet = ? ORDER BY created_at DESC
  `).all(subscriberWallet) as Record<string, unknown>[];

  return rows.map(rowToSubscription);
}

export function useSubscriptionCall(subscriberWallet: string, agentId: string, cost: number): boolean {
  const db = getDb();
  const now = Date.now();

  const result = db.prepare(`
    UPDATE agent_subscriptions
    SET calls_remaining = calls_remaining - 1,
        calls_used = calls_used + 1,
        total_spent = total_spent + ?,
        updated_at = ?
    WHERE subscriber_wallet = ? AND agent_id = ? AND status = 'active' AND calls_remaining > 0
  `).run(cost, now, subscriberWallet, agentId);

  return result.changes > 0;
}

export function expireSubscriptions(): number {
  const db = getDb();
  const now = Date.now();
  const result = db.prepare(`
    UPDATE agent_subscriptions SET status = 'expired', updated_at = ?
    WHERE status = 'active' AND expires_at < ?
  `).run(now, now);
  return result.changes;
}

// Job operations
export function createAgentJob(
  job: Omit<AgentJob, 'id' | 'createdAt'>
): AgentJob {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO agent_jobs (
      id, agent_id, caller_wallet, capability, input, output, cost,
      response_time_ms, status, error, started_at, completed_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, job.agentId, job.callerWallet, job.capability, job.input, job.output,
    job.cost, job.responseTimeMs, job.status, job.error, job.startedAt,
    job.completedAt, now
  );

  return { ...job, id, createdAt: now };
}

export function getJobById(id: string): AgentJob | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM agent_jobs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToJob(row) : null;
}

export function getJobsByWallet(
  callerWallet: string,
  options?: { agentId?: string; status?: string; limit?: number }
): AgentJob[] {
  const db = getDb();
  let query = 'SELECT * FROM agent_jobs WHERE caller_wallet = ?';
  const params: (string | number)[] = [callerWallet];

  if (options?.agentId) {
    query += ' AND agent_id = ?';
    params.push(options.agentId);
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
  return rows.map(rowToJob);
}

export function completeJob(
  id: string,
  output: string,
  responseTimeMs: number
): AgentJob | null {
  const db = getDb();
  const now = Date.now();

  db.prepare(`
    UPDATE agent_jobs
    SET output = ?, response_time_ms = ?, status = 'completed', completed_at = ?
    WHERE id = ?
  `).run(output, responseTimeMs, now, id);

  const job = getJobById(id);
  if (job) {
    updateAgentStats(job.agentId, true, responseTimeMs);
  }
  return job;
}

export function failJob(id: string, error: string): AgentJob | null {
  const db = getDb();
  const now = Date.now();

  db.prepare(`
    UPDATE agent_jobs SET error = ?, status = 'failed', completed_at = ? WHERE id = ?
  `).run(error, now, id);

  const job = getJobById(id);
  if (job) {
    updateAgentStats(job.agentId, false, 0);
  }
  return job;
}

// A2A Messaging
export function sendAgentMessage(
  message: Omit<AgentMessage, 'id' | 'acknowledged' | 'createdAt'>
): AgentMessage {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO agent_messages (
      id, from_agent_id, to_agent_id, message_type, payload, correlation_id,
      acknowledged, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `);

  stmt.run(
    id, message.fromAgentId, message.toAgentId, message.messageType,
    message.payload, message.correlationId, now
  );

  return { ...message, id, acknowledged: false, createdAt: now };
}

export function getMessagesForAgent(
  agentId: string,
  options?: { unacknowledgedOnly?: boolean; messageType?: string; limit?: number }
): AgentMessage[] {
  const db = getDb();
  let query = 'SELECT * FROM agent_messages WHERE to_agent_id = ?';
  const params: (string | number)[] = [agentId];

  if (options?.unacknowledgedOnly) {
    query += ' AND acknowledged = 0';
  }
  if (options?.messageType) {
    query += ' AND message_type = ?';
    params.push(options.messageType);
  }

  query += ' ORDER BY created_at ASC';

  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
  return rows.map(row => ({
    id: row.id as string,
    fromAgentId: row.from_agent_id as string,
    toAgentId: row.to_agent_id as string,
    messageType: row.message_type as AgentMessage['messageType'],
    payload: row.payload as string,
    correlationId: row.correlation_id as string | undefined,
    acknowledged: Boolean(row.acknowledged),
    createdAt: row.created_at as number,
  }));
}

export function acknowledgeMessage(messageId: string): boolean {
  const db = getDb();
  const result = db.prepare('UPDATE agent_messages SET acknowledged = 1 WHERE id = ?').run(messageId);
  return result.changes > 0;
}

// Network Stats
export function getNetworkStats(): {
  totalAgents: number;
  onlineAgents: number;
  totalJobs: number;
  totalVolume: number;
  avgResponseTime: number;
  topCapabilities: Array<{ capability: string; count: number }>;
} {
  const db = getDb();

  const agentStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN availability = 'online' THEN 1 ELSE 0 END) as online,
      AVG(avg_response_time_ms) as avg_time
    FROM agent_registry
  `).get() as { total: number; online: number; avg_time: number };

  const jobStats = db.prepare(`
    SELECT COUNT(*) as total, SUM(cost) as volume FROM agent_jobs
  `).get() as { total: number; volume: number };

  // Get top capabilities
  const agents = db.prepare('SELECT capabilities FROM agent_registry').all() as Array<{ capabilities: string }>;
  const capabilityCounts: Record<string, number> = {};

  agents.forEach(a => {
    const caps = JSON.parse(a.capabilities || '[]') as string[];
    caps.forEach(cap => {
      capabilityCounts[cap] = (capabilityCounts[cap] || 0) + 1;
    });
  });

  const topCapabilities = Object.entries(capabilityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([capability, count]) => ({ capability, count }));

  return {
    totalAgents: agentStats.total || 0,
    onlineAgents: agentStats.online || 0,
    totalJobs: jobStats.total || 0,
    totalVolume: jobStats.volume || 0,
    avgResponseTime: agentStats.avg_time || 0,
    topCapabilities,
  };
}
