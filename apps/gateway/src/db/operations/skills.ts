import { getDb } from '../index';
import { randomUUID } from 'crypto';

// Types
export interface Skill {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  subcategory?: string;
  version: string;
  inputSchema: string; // JSON schema
  outputSchema: string; // JSON schema
  examples: string; // JSON array of example calls
  costPerCall: number;
  avgExecutionTimeMs: number;
  requiredPermissions: string[]; // JSON array
  enabled: boolean;
  popularity: number;
  successRate: number;
  createdAt: number;
  updatedAt: number;
}

export interface SkillExecution {
  id: string;
  skillId: string;
  userWallet: string;
  input: string; // JSON
  output?: string; // JSON
  cost: number;
  executionTimeMs?: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  error?: string;
  startedAt: number;
  completedAt?: number;
  createdAt: number;
}

export interface SkillFavorite {
  id: string;
  userWallet: string;
  skillId: string;
  createdAt: number;
}

// Categories
export const SKILL_CATEGORIES = {
  TRADING: 'trading',
  ANALYSIS: 'analysis',
  DATA: 'data',
  SOCIAL: 'social',
  DEFI: 'defi',
  NFT: 'nft',
  AUTOMATION: 'automation',
  RESEARCH: 'research',
  UTILITY: 'utility',
};

// Row mappers
function rowToSkill(row: Record<string, unknown>): Skill {
  return {
    id: row.id as string,
    name: row.name as string,
    displayName: row.display_name as string,
    description: row.description as string,
    category: row.category as string,
    subcategory: row.subcategory as string | undefined,
    version: row.version as string,
    inputSchema: row.input_schema as string,
    outputSchema: row.output_schema as string,
    examples: row.examples as string,
    costPerCall: row.cost_per_call as number,
    avgExecutionTimeMs: row.avg_execution_time_ms as number,
    requiredPermissions: JSON.parse(row.required_permissions as string || '[]'),
    enabled: Boolean(row.enabled),
    popularity: row.popularity as number,
    successRate: row.success_rate as number,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function rowToExecution(row: Record<string, unknown>): SkillExecution {
  return {
    id: row.id as string,
    skillId: row.skill_id as string,
    userWallet: row.user_wallet as string,
    input: row.input as string,
    output: row.output as string | undefined,
    cost: row.cost as number,
    executionTimeMs: row.execution_time_ms as number | undefined,
    status: row.status as SkillExecution['status'],
    error: row.error as string | undefined,
    startedAt: row.started_at as number,
    completedAt: row.completed_at as number | undefined,
    createdAt: row.created_at as number,
  };
}

// Skill operations
export function registerSkill(
  skill: Omit<Skill, 'id' | 'popularity' | 'successRate' | 'createdAt' | 'updatedAt'>
): Skill {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO skills_registry (
      id, name, display_name, description, category, subcategory, version,
      input_schema, output_schema, examples, cost_per_call, avg_execution_time_ms,
      required_permissions, enabled, popularity, success_rate, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 100, ?, ?)
  `);

  stmt.run(
    id, skill.name, skill.displayName, skill.description, skill.category,
    skill.subcategory, skill.version, skill.inputSchema, skill.outputSchema,
    skill.examples, skill.costPerCall, skill.avgExecutionTimeMs,
    JSON.stringify(skill.requiredPermissions), skill.enabled ? 1 : 0, now, now
  );

  return { ...skill, id, popularity: 0, successRate: 100, createdAt: now, updatedAt: now };
}

export function getSkillById(id: string): Skill | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM skills_registry WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToSkill(row) : null;
}

export function getSkillByName(name: string): Skill | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM skills_registry WHERE name = ?').get(name) as Record<string, unknown> | undefined;
  return row ? rowToSkill(row) : null;
}

export function getAllSkills(options?: {
  category?: string;
  enabled?: boolean;
  search?: string;
  sortBy?: 'popularity' | 'successRate' | 'name';
  limit?: number;
}): Skill[] {
  const db = getDb();
  let query = 'SELECT * FROM skills_registry WHERE 1=1';
  const params: (string | number)[] = [];

  if (options?.category) {
    query += ' AND category = ?';
    params.push(options.category);
  }
  if (options?.enabled !== undefined) {
    query += ' AND enabled = ?';
    params.push(options.enabled ? 1 : 0);
  }
  if (options?.search) {
    query += ' AND (name LIKE ? OR display_name LIKE ? OR description LIKE ?)';
    const searchTerm = `%${options.search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  const sortBy = options?.sortBy || 'popularity';
  if (sortBy === 'popularity') query += ' ORDER BY popularity DESC';
  else if (sortBy === 'successRate') query += ' ORDER BY success_rate DESC';
  else query += ' ORDER BY display_name ASC';

  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
  return rows.map(rowToSkill);
}

export function getSkillsByCategory(): Record<string, Skill[]> {
  const skills = getAllSkills({ enabled: true });
  const byCategory: Record<string, Skill[]> = {};

  skills.forEach(skill => {
    if (!byCategory[skill.category]) {
      byCategory[skill.category] = [];
    }
    byCategory[skill.category].push(skill);
  });

  return byCategory;
}

export function updateSkillStats(skillId: string, success: boolean, executionTimeMs: number): void {
  const db = getDb();
  const now = Date.now();
  const skill = getSkillById(skillId);
  if (!skill) return;

  // Calculate new stats
  const totalCalls = skill.popularity + 1;
  const newSuccessRate = ((skill.successRate * skill.popularity) + (success ? 100 : 0)) / totalCalls;
  const newAvgTime = ((skill.avgExecutionTimeMs * skill.popularity) + executionTimeMs) / totalCalls;

  db.prepare(`
    UPDATE skills_registry
    SET popularity = ?, success_rate = ?, avg_execution_time_ms = ?, updated_at = ?
    WHERE id = ?
  `).run(totalCalls, newSuccessRate, newAvgTime, now, skillId);
}

export function toggleSkill(skillId: string, enabled: boolean): Skill | null {
  const db = getDb();
  const now = Date.now();
  db.prepare('UPDATE skills_registry SET enabled = ?, updated_at = ? WHERE id = ?').run(enabled ? 1 : 0, now, skillId);
  return getSkillById(skillId);
}

// Execution operations
export function createSkillExecution(
  exec: Omit<SkillExecution, 'id' | 'createdAt'>
): SkillExecution {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO skill_executions (
      id, skill_id, user_wallet, input, output, cost, execution_time_ms,
      status, error, started_at, completed_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, exec.skillId, exec.userWallet, exec.input, exec.output, exec.cost,
    exec.executionTimeMs, exec.status, exec.error, exec.startedAt,
    exec.completedAt, now
  );

  return { ...exec, id, createdAt: now };
}

export function getExecutionById(id: string): SkillExecution | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM skill_executions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToExecution(row) : null;
}

export function getExecutionsByWallet(
  userWallet: string,
  options?: { skillId?: string; status?: string; limit?: number }
): SkillExecution[] {
  const db = getDb();
  let query = 'SELECT * FROM skill_executions WHERE user_wallet = ?';
  const params: (string | number)[] = [userWallet];

  if (options?.skillId) {
    query += ' AND skill_id = ?';
    params.push(options.skillId);
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
  return rows.map(rowToExecution);
}

export function completeExecution(
  id: string,
  output: string,
  executionTimeMs: number
): SkillExecution | null {
  const db = getDb();
  const now = Date.now();

  db.prepare(`
    UPDATE skill_executions
    SET output = ?, execution_time_ms = ?, status = 'completed', completed_at = ?
    WHERE id = ?
  `).run(output, executionTimeMs, now, id);

  const exec = getExecutionById(id);
  if (exec) {
    updateSkillStats(exec.skillId, true, executionTimeMs);
  }
  return exec;
}

export function failExecution(id: string, error: string): SkillExecution | null {
  const db = getDb();
  const now = Date.now();

  db.prepare(`
    UPDATE skill_executions SET error = ?, status = 'failed', completed_at = ? WHERE id = ?
  `).run(error, now, id);

  const exec = getExecutionById(id);
  if (exec) {
    updateSkillStats(exec.skillId, false, 0);
  }
  return exec;
}

// Favorites
export function addFavoriteSkill(userWallet: string, skillId: string): SkillFavorite {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  db.prepare(`
    INSERT OR IGNORE INTO skill_favorites (id, user_wallet, skill_id, created_at)
    VALUES (?, ?, ?, ?)
  `).run(id, userWallet, skillId, now);

  return { id, userWallet, skillId, createdAt: now };
}

export function removeFavoriteSkill(userWallet: string, skillId: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM skill_favorites WHERE user_wallet = ? AND skill_id = ?').run(userWallet, skillId);
  return result.changes > 0;
}

export function getFavoriteSkills(userWallet: string): Skill[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT s.* FROM skills_registry s
    INNER JOIN skill_favorites f ON s.id = f.skill_id
    WHERE f.user_wallet = ?
    ORDER BY f.created_at DESC
  `).all(userWallet) as Record<string, unknown>[];

  return rows.map(rowToSkill);
}

// Stats
export function getSkillStats(userWallet: string): {
  totalExecutions: number;
  successfulExecutions: number;
  totalCost: number;
  favoriteSkills: number;
  mostUsedSkill: { skill: Skill; count: number } | null;
} {
  const db = getDb();

  const execStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful,
      SUM(cost) as total_cost
    FROM skill_executions
    WHERE user_wallet = ?
  `).get(userWallet) as { total: number; successful: number; total_cost: number };

  const favCount = db.prepare(`
    SELECT COUNT(*) as count FROM skill_favorites WHERE user_wallet = ?
  `).get(userWallet) as { count: number };

  const mostUsed = db.prepare(`
    SELECT skill_id, COUNT(*) as count
    FROM skill_executions
    WHERE user_wallet = ?
    GROUP BY skill_id
    ORDER BY count DESC
    LIMIT 1
  `).get(userWallet) as { skill_id: string; count: number } | undefined;

  let mostUsedSkill = null;
  if (mostUsed) {
    const skill = getSkillById(mostUsed.skill_id);
    if (skill) {
      mostUsedSkill = { skill, count: mostUsed.count };
    }
  }

  return {
    totalExecutions: execStats.total || 0,
    successfulExecutions: execStats.successful || 0,
    totalCost: execStats.total_cost || 0,
    favoriteSkills: favCount.count || 0,
    mostUsedSkill,
  };
}

// Seed default skills
export function seedDefaultSkills(): void {
  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) as count FROM skills_registry').get() as { count: number };

  if (existing.count > 0) return;

  const defaultSkills = [
    // Trading skills
    {
      name: 'swap_tokens',
      displayName: 'Token Swap',
      description: 'Swap tokens using Jupiter aggregator with optimal routing',
      category: 'trading',
      version: '1.0.0',
      inputSchema: JSON.stringify({ inputMint: 'string', outputMint: 'string', amount: 'number', slippage: 'number' }),
      outputSchema: JSON.stringify({ txHash: 'string', amountOut: 'number' }),
      examples: JSON.stringify([{ input: { inputMint: 'SOL', outputMint: 'USDC', amount: 1, slippage: 0.5 } }]),
      costPerCall: 0,
      avgExecutionTimeMs: 3000,
      requiredPermissions: ['trade'],
      enabled: true,
    },
    {
      name: 'place_limit_order',
      displayName: 'Place Limit Order',
      description: 'Create a conditional limit order that executes when price targets are hit',
      category: 'trading',
      version: '1.0.0',
      inputSchema: JSON.stringify({ token: 'string', side: 'string', price: 'number', amount: 'number' }),
      outputSchema: JSON.stringify({ orderId: 'string', status: 'string' }),
      examples: JSON.stringify([{ input: { token: 'SOL', side: 'buy', price: 100, amount: 10 } }]),
      costPerCall: 0,
      avgExecutionTimeMs: 1000,
      requiredPermissions: ['trade'],
      enabled: true,
    },
    // Analysis skills
    {
      name: 'analyze_token',
      displayName: 'Token Analysis',
      description: 'Comprehensive token analysis including fundamentals, technicals, and sentiment',
      category: 'analysis',
      version: '1.0.0',
      inputSchema: JSON.stringify({ tokenAddress: 'string' }),
      outputSchema: JSON.stringify({ score: 'number', analysis: 'object' }),
      examples: JSON.stringify([{ input: { tokenAddress: 'So11111111111111111111111111111111111111112' } }]),
      costPerCall: 0.01,
      avgExecutionTimeMs: 5000,
      requiredPermissions: [],
      enabled: true,
    },
    {
      name: 'sentiment_analysis',
      displayName: 'Sentiment Analysis',
      description: 'Analyze social sentiment for a token across Twitter, Discord, and Telegram',
      category: 'analysis',
      version: '1.0.0',
      inputSchema: JSON.stringify({ symbol: 'string', sources: 'array' }),
      outputSchema: JSON.stringify({ sentiment: 'number', summary: 'string' }),
      examples: JSON.stringify([{ input: { symbol: 'SOL', sources: ['twitter', 'discord'] } }]),
      costPerCall: 0.02,
      avgExecutionTimeMs: 8000,
      requiredPermissions: [],
      enabled: true,
    },
    // Data skills
    {
      name: 'fetch_price',
      displayName: 'Fetch Price',
      description: 'Get real-time price data for any token',
      category: 'data',
      version: '1.0.0',
      inputSchema: JSON.stringify({ tokenAddress: 'string' }),
      outputSchema: JSON.stringify({ price: 'number', change24h: 'number' }),
      examples: JSON.stringify([{ input: { tokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' } }]),
      costPerCall: 0,
      avgExecutionTimeMs: 500,
      requiredPermissions: [],
      enabled: true,
    },
    {
      name: 'whale_tracker',
      displayName: 'Whale Tracker',
      description: 'Track large wallet movements and transactions',
      category: 'data',
      version: '1.0.0',
      inputSchema: JSON.stringify({ minAmount: 'number', tokenFilter: 'string' }),
      outputSchema: JSON.stringify({ transactions: 'array' }),
      examples: JSON.stringify([{ input: { minAmount: 100000, tokenFilter: 'USDC' } }]),
      costPerCall: 0.01,
      avgExecutionTimeMs: 2000,
      requiredPermissions: [],
      enabled: true,
    },
    // DeFi skills
    {
      name: 'provide_liquidity',
      displayName: 'Provide Liquidity',
      description: 'Add liquidity to AMM pools on Raydium, Orca, or Meteora',
      category: 'defi',
      version: '1.0.0',
      inputSchema: JSON.stringify({ pool: 'string', tokenA: 'number', tokenB: 'number' }),
      outputSchema: JSON.stringify({ lpTokens: 'number', txHash: 'string' }),
      examples: JSON.stringify([{ input: { pool: 'SOL-USDC', tokenA: 1, tokenB: 150 } }]),
      costPerCall: 0,
      avgExecutionTimeMs: 5000,
      requiredPermissions: ['trade', 'defi'],
      enabled: true,
    },
    {
      name: 'yield_farming',
      displayName: 'Yield Farming',
      description: 'Stake tokens in yield farming protocols',
      category: 'defi',
      version: '1.0.0',
      inputSchema: JSON.stringify({ protocol: 'string', pool: 'string', amount: 'number' }),
      outputSchema: JSON.stringify({ stakedAmount: 'number', estimatedApy: 'number' }),
      examples: JSON.stringify([{ input: { protocol: 'Kamino', pool: 'SOL-USDC', amount: 100 } }]),
      costPerCall: 0,
      avgExecutionTimeMs: 4000,
      requiredPermissions: ['trade', 'defi'],
      enabled: true,
    },
    // Automation skills
    {
      name: 'dca_setup',
      displayName: 'DCA Setup',
      description: 'Set up dollar-cost averaging for automatic periodic buys',
      category: 'automation',
      version: '1.0.0',
      inputSchema: JSON.stringify({ token: 'string', amount: 'number', frequency: 'string' }),
      outputSchema: JSON.stringify({ dcaId: 'string', nextExecution: 'number' }),
      examples: JSON.stringify([{ input: { token: 'SOL', amount: 100, frequency: 'daily' } }]),
      costPerCall: 0,
      avgExecutionTimeMs: 1000,
      requiredPermissions: ['trade', 'automation'],
      enabled: true,
    },
    {
      name: 'alert_setup',
      displayName: 'Price Alert',
      description: 'Set up price alerts with notifications',
      category: 'automation',
      version: '1.0.0',
      inputSchema: JSON.stringify({ token: 'string', condition: 'string', price: 'number', channel: 'string' }),
      outputSchema: JSON.stringify({ alertId: 'string', status: 'string' }),
      examples: JSON.stringify([{ input: { token: 'BTC', condition: 'above', price: 100000, channel: 'telegram' } }]),
      costPerCall: 0,
      avgExecutionTimeMs: 500,
      requiredPermissions: ['automation'],
      enabled: true,
    },
  ];

  for (const skill of defaultSkills) {
    registerSkill(skill);
  }
}
