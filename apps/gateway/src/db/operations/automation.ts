/**
 * Database Operations for Automation Rules (Cron-like scheduling)
 */

import { getDatabase, parseJSON, stringifyJSON } from '../index.js';

export type RuleType = 'scheduled' | 'price_trigger' | 'condition' | 'recurring';

export interface TriggerConfig {
  // For scheduled/recurring
  cronExpression?: string;
  timezone?: string;

  // For price_trigger
  token?: string;
  priceCondition?: 'above' | 'below' | 'crosses';
  targetPrice?: number;

  // For condition
  conditionType?: 'portfolio_value' | 'pnl_threshold' | 'position_age';
  threshold?: number;
  operator?: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
}

export interface ActionConfig {
  actionType: 'trade' | 'alert' | 'rebalance' | 'close_position' | 'adjust_sl_tp' | 'notify';

  // For trade
  action?: 'buy' | 'sell';
  token?: string;
  amount?: number;
  amountType?: 'fixed' | 'percent_portfolio';

  // For alert/notify
  message?: string;
  channels?: string[]; // ['telegram', 'discord', etc.]

  // For rebalance
  targetAllocations?: Record<string, number>;

  // For close_position
  positionId?: string;

  // For adjust_sl_tp
  stopLossPercent?: number;
  takeProfitPercent?: number;
}

export interface AutomationRule {
  id: string;
  userWallet: string;
  name: string;
  description?: string;
  ruleType: RuleType;
  triggerConfig: TriggerConfig;
  actionConfig: ActionConfig;
  enabled: boolean;
  lastTriggeredAt?: number;
  nextTriggerAt?: number;
  triggerCount: number;
  maxTriggers?: number;
  expiresAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface AutomationHistory {
  id: string;
  ruleId: string;
  triggeredAt: number;
  triggerReason?: string;
  actionTaken: string;
  result: 'success' | 'failed' | 'skipped';
  resultData?: Record<string, unknown>;
  error?: string;
  createdAt: number;
}

interface AutomationRuleRow {
  id: string;
  user_wallet: string;
  name: string;
  description: string | null;
  rule_type: string;
  trigger_config: string;
  action_config: string;
  enabled: number;
  last_triggered_at: number | null;
  next_trigger_at: number | null;
  trigger_count: number;
  max_triggers: number | null;
  expires_at: number | null;
  created_at: number;
  updated_at: number;
}

interface AutomationHistoryRow {
  id: string;
  rule_id: string;
  triggered_at: number;
  trigger_reason: string | null;
  action_taken: string;
  result: string;
  result_data: string | null;
  error: string | null;
  created_at: number;
}

function rowToRule(row: AutomationRuleRow): AutomationRule {
  return {
    id: row.id,
    userWallet: row.user_wallet,
    name: row.name,
    description: row.description || undefined,
    ruleType: row.rule_type as RuleType,
    triggerConfig: parseJSON<TriggerConfig>(row.trigger_config, {}),
    actionConfig: parseJSON<ActionConfig>(row.action_config, { actionType: 'notify' }),
    enabled: row.enabled === 1,
    lastTriggeredAt: row.last_triggered_at || undefined,
    nextTriggerAt: row.next_trigger_at || undefined,
    triggerCount: row.trigger_count,
    maxTriggers: row.max_triggers || undefined,
    expiresAt: row.expires_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToHistory(row: AutomationHistoryRow): AutomationHistory {
  return {
    id: row.id,
    ruleId: row.rule_id,
    triggeredAt: row.triggered_at,
    triggerReason: row.trigger_reason || undefined,
    actionTaken: row.action_taken,
    result: row.result as 'success' | 'failed' | 'skipped',
    resultData: row.result_data ? parseJSON<Record<string, unknown>>(row.result_data, {}) : undefined,
    error: row.error || undefined,
    createdAt: row.created_at,
  };
}

// ============== Rule Operations ==============

export function createAutomationRule(rule: AutomationRule): AutomationRule {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO automation_rules (
      id, user_wallet, name, description, rule_type, trigger_config, action_config,
      enabled, last_triggered_at, next_trigger_at, trigger_count, max_triggers,
      expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    rule.id,
    rule.userWallet,
    rule.name,
    rule.description || null,
    rule.ruleType,
    stringifyJSON(rule.triggerConfig),
    stringifyJSON(rule.actionConfig),
    rule.enabled ? 1 : 0,
    rule.lastTriggeredAt || null,
    rule.nextTriggerAt || null,
    rule.triggerCount,
    rule.maxTriggers || null,
    rule.expiresAt || null,
    rule.createdAt,
    rule.updatedAt
  );

  return rule;
}

export function getAutomationRuleById(id: string): AutomationRule | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM automation_rules WHERE id = ?');
  const row = stmt.get(id) as AutomationRuleRow | undefined;
  return row ? rowToRule(row) : null;
}

export function getAutomationRulesByUser(userWallet: string): AutomationRule[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM automation_rules
    WHERE user_wallet = ?
    ORDER BY created_at DESC
  `);
  const rows = stmt.all(userWallet) as AutomationRuleRow[];
  return rows.map(rowToRule);
}

export function getActiveAutomationRules(): AutomationRule[] {
  const db = getDatabase();
  const now = Date.now();
  const stmt = db.prepare(`
    SELECT * FROM automation_rules
    WHERE enabled = 1
    AND (expires_at IS NULL OR expires_at > ?)
    AND (max_triggers IS NULL OR trigger_count < max_triggers)
  `);
  const rows = stmt.all(now) as AutomationRuleRow[];
  return rows.map(rowToRule);
}

export function getRulesDueForExecution(): AutomationRule[] {
  const db = getDatabase();
  const now = Date.now();
  const stmt = db.prepare(`
    SELECT * FROM automation_rules
    WHERE enabled = 1
    AND next_trigger_at IS NOT NULL
    AND next_trigger_at <= ?
    AND (expires_at IS NULL OR expires_at > ?)
    AND (max_triggers IS NULL OR trigger_count < max_triggers)
    ORDER BY next_trigger_at ASC
  `);
  const rows = stmt.all(now, now) as AutomationRuleRow[];
  return rows.map(rowToRule);
}

export function getPriceTriggerRules(token: string): AutomationRule[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM automation_rules
    WHERE enabled = 1
    AND rule_type = 'price_trigger'
    AND trigger_config LIKE ?
    AND (expires_at IS NULL OR expires_at > ?)
    AND (max_triggers IS NULL OR trigger_count < max_triggers)
  `);
  const rows = stmt.all(`%"token":"${token}"%`, Date.now()) as AutomationRuleRow[];
  return rows.map(rowToRule);
}

export function updateAutomationRule(rule: AutomationRule): AutomationRule {
  const db = getDatabase();
  rule.updatedAt = Date.now();

  const stmt = db.prepare(`
    UPDATE automation_rules SET
      name = ?, description = ?, rule_type = ?, trigger_config = ?, action_config = ?,
      enabled = ?, last_triggered_at = ?, next_trigger_at = ?, trigger_count = ?,
      max_triggers = ?, expires_at = ?, updated_at = ?
    WHERE id = ?
  `);

  stmt.run(
    rule.name,
    rule.description || null,
    rule.ruleType,
    stringifyJSON(rule.triggerConfig),
    stringifyJSON(rule.actionConfig),
    rule.enabled ? 1 : 0,
    rule.lastTriggeredAt || null,
    rule.nextTriggerAt || null,
    rule.triggerCount,
    rule.maxTriggers || null,
    rule.expiresAt || null,
    rule.updatedAt,
    rule.id
  );

  return rule;
}

export function toggleAutomationRule(id: string, enabled: boolean): AutomationRule | null {
  const db = getDatabase();
  const now = Date.now();
  const stmt = db.prepare(`
    UPDATE automation_rules SET enabled = ?, updated_at = ? WHERE id = ?
  `);
  stmt.run(enabled ? 1 : 0, now, id);
  return getAutomationRuleById(id);
}

export function markRuleTriggered(id: string, nextTriggerAt?: number): void {
  const db = getDatabase();
  const now = Date.now();
  const stmt = db.prepare(`
    UPDATE automation_rules SET
      last_triggered_at = ?,
      next_trigger_at = ?,
      trigger_count = trigger_count + 1,
      updated_at = ?
    WHERE id = ?
  `);
  stmt.run(now, nextTriggerAt || null, now, id);
}

export function deleteAutomationRule(id: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM automation_rules WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// ============== History Operations ==============

export function createAutomationHistory(history: AutomationHistory): AutomationHistory {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO automation_history (
      id, rule_id, triggered_at, trigger_reason, action_taken, result, result_data, error, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    history.id,
    history.ruleId,
    history.triggeredAt,
    history.triggerReason || null,
    history.actionTaken,
    history.result,
    history.resultData ? stringifyJSON(history.resultData) : null,
    history.error || null,
    history.createdAt
  );

  return history;
}

export function getAutomationHistoryByRule(ruleId: string, limit: number = 50): AutomationHistory[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM automation_history
    WHERE rule_id = ?
    ORDER BY triggered_at DESC
    LIMIT ?
  `);
  const rows = stmt.all(ruleId, limit) as AutomationHistoryRow[];
  return rows.map(rowToHistory);
}

export function getAutomationHistoryByUser(userWallet: string, limit: number = 100): AutomationHistory[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT h.* FROM automation_history h
    JOIN automation_rules r ON h.rule_id = r.id
    WHERE r.user_wallet = ?
    ORDER BY h.triggered_at DESC
    LIMIT ?
  `);
  const rows = stmt.all(userWallet, limit) as AutomationHistoryRow[];
  return rows.map(rowToHistory);
}

export function getAutomationStats(userWallet: string): {
  totalRules: number;
  activeRules: number;
  totalTriggers: number;
  successfulTriggers: number;
  failedTriggers: number;
  skippedTriggers: number;
  byType: Record<RuleType, number>;
} {
  const db = getDatabase();

  // Rule stats
  const ruleStmt = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) as active
    FROM automation_rules
    WHERE user_wallet = ?
  `);
  const ruleRow = ruleStmt.get(userWallet) as { total: number; active: number };

  // History stats
  const historyStmt = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN result = 'success' THEN 1 ELSE 0 END) as success,
      SUM(CASE WHEN result = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN result = 'skipped' THEN 1 ELSE 0 END) as skipped
    FROM automation_history h
    JOIN automation_rules r ON h.rule_id = r.id
    WHERE r.user_wallet = ?
  `);
  const historyRow = historyStmt.get(userWallet) as {
    total: number;
    success: number;
    failed: number;
    skipped: number;
  };

  // By type breakdown
  const typeStmt = db.prepare(`
    SELECT rule_type, COUNT(*) as count
    FROM automation_rules
    WHERE user_wallet = ?
    GROUP BY rule_type
  `);
  const typeRows = typeStmt.all(userWallet) as { rule_type: string; count: number }[];

  const byType: Record<RuleType, number> = {
    scheduled: 0,
    price_trigger: 0,
    condition: 0,
    recurring: 0,
  };
  for (const row of typeRows) {
    byType[row.rule_type as RuleType] = row.count;
  }

  return {
    totalRules: ruleRow.total || 0,
    activeRules: ruleRow.active || 0,
    totalTriggers: historyRow.total || 0,
    successfulTriggers: historyRow.success || 0,
    failedTriggers: historyRow.failed || 0,
    skippedTriggers: historyRow.skipped || 0,
    byType,
  };
}
