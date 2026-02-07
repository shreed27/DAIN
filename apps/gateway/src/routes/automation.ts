/**
 * Automation Rules Routes (Cron-like scheduling)
 *
 * Endpoints:
 * - POST /api/v1/automation/rules - Create automation rule
 * - GET /api/v1/automation/rules - List user's rules
 * - GET /api/v1/automation/rules/:id - Get rule by ID
 * - PUT /api/v1/automation/rules/:id - Update rule
 * - DELETE /api/v1/automation/rules/:id - Delete rule
 * - POST /api/v1/automation/rules/:id/toggle - Enable/disable rule
 * - GET /api/v1/automation/history - Get automation history
 * - GET /api/v1/automation/stats - Get automation statistics
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as automationOps from '../db/operations/automation.js';
import type {
  AutomationRule,
  AutomationHistory,
  TriggerConfig,
  ActionConfig,
  RuleType,
} from '../db/operations/automation.js';

export const automationRouter = Router();

/**
 * POST /api/v1/automation/rules - Create automation rule
 */
automationRouter.post('/rules', (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      ruleType,
      triggerConfig,
      actionConfig,
      enabled,
      maxTriggers,
      expiresAt,
    } = req.body;

    const userWallet = req.headers['x-wallet-address'] as string || req.body.userWallet;

    if (!userWallet) {
      return res.status(400).json({
        success: false,
        error: 'Missing x-wallet-address header or userWallet in body',
      });
    }

    if (!name || !ruleType || !triggerConfig || !actionConfig) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, ruleType, triggerConfig, actionConfig',
      });
    }

    const validRuleTypes: RuleType[] = ['scheduled', 'price_trigger', 'condition', 'recurring'];
    if (!validRuleTypes.includes(ruleType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid ruleType. Must be one of: ${validRuleTypes.join(', ')}`,
      });
    }

    // Validate trigger config based on rule type
    if (ruleType === 'scheduled' || ruleType === 'recurring') {
      if (!triggerConfig.cronExpression) {
        return res.status(400).json({
          success: false,
          error: 'cronExpression is required for scheduled/recurring rules',
        });
      }
    }

    if (ruleType === 'price_trigger') {
      if (!triggerConfig.token || !triggerConfig.priceCondition || triggerConfig.targetPrice === undefined) {
        return res.status(400).json({
          success: false,
          error: 'token, priceCondition, and targetPrice are required for price_trigger rules',
        });
      }
    }

    // Validate action config
    const validActionTypes = ['trade', 'alert', 'rebalance', 'close_position', 'adjust_sl_tp', 'notify'];
    if (!validActionTypes.includes(actionConfig.actionType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid actionType. Must be one of: ${validActionTypes.join(', ')}`,
      });
    }

    const now = Date.now();

    // Calculate next trigger time for scheduled rules
    let nextTriggerAt: number | undefined;
    if (ruleType === 'scheduled' || ruleType === 'recurring') {
      // For simplicity, set next trigger to 1 minute from now
      // In production, parse the cron expression properly
      nextTriggerAt = now + 60000;
    }

    const rule: AutomationRule = {
      id: uuidv4(),
      userWallet,
      name,
      description: description || undefined,
      ruleType,
      triggerConfig,
      actionConfig,
      enabled: enabled !== false,
      nextTriggerAt,
      triggerCount: 0,
      maxTriggers: maxTriggers || undefined,
      expiresAt: expiresAt || undefined,
      createdAt: now,
      updatedAt: now,
    };

    const createdRule = automationOps.createAutomationRule(rule);

    // Emit WebSocket event
    const io = req.app.locals.io;
    io?.emit('automation_rule_created', {
      type: 'automation_rule_created',
      timestamp: now,
      data: createdRule,
    });

    res.status(201).json({
      success: true,
      data: createdRule,
    });
  } catch (error) {
    console.error('[Automation] Create rule error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create automation rule',
    });
  }
});

/**
 * GET /api/v1/automation/rules - List user's automation rules
 */
automationRouter.get('/rules', (req: Request, res: Response) => {
  try {
    const userWallet = req.headers['x-wallet-address'] as string || req.query.userWallet as string;

    if (!userWallet) {
      return res.status(400).json({
        success: false,
        error: 'Missing x-wallet-address header or userWallet query param',
      });
    }

    const rules = automationOps.getAutomationRulesByUser(userWallet);

    res.json({
      success: true,
      data: rules,
      total: rules.length,
    });
  } catch (error) {
    console.error('[Automation] List rules error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list automation rules',
    });
  }
});

/**
 * GET /api/v1/automation/rules/due - Get rules due for execution (internal)
 */
automationRouter.get('/rules/due', (req: Request, res: Response) => {
  try {
    const rules = automationOps.getRulesDueForExecution();

    res.json({
      success: true,
      data: rules,
      total: rules.length,
    });
  } catch (error) {
    console.error('[Automation] Due rules error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get due rules',
    });
  }
});

/**
 * GET /api/v1/automation/rules/price-triggers/:token - Get price trigger rules for a token
 */
automationRouter.get('/rules/price-triggers/:token', (req: Request, res: Response) => {
  try {
    const rules = automationOps.getPriceTriggerRules(req.params.token);

    res.json({
      success: true,
      data: rules,
      total: rules.length,
    });
  } catch (error) {
    console.error('[Automation] Price triggers error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get price trigger rules',
    });
  }
});

/**
 * GET /api/v1/automation/rules/:id - Get rule by ID
 */
automationRouter.get('/rules/:id', (req: Request, res: Response) => {
  try {
    const rule = automationOps.getAutomationRuleById(req.params.id);

    if (!rule) {
      return res.status(404).json({
        success: false,
        error: 'Automation rule not found',
      });
    }

    // Get recent history for this rule
    const history = automationOps.getAutomationHistoryByRule(rule.id, 20);

    res.json({
      success: true,
      data: {
        rule,
        recentHistory: history,
      },
    });
  } catch (error) {
    console.error('[Automation] Get rule error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get automation rule',
    });
  }
});

/**
 * PUT /api/v1/automation/rules/:id - Update rule
 */
automationRouter.put('/rules/:id', (req: Request, res: Response) => {
  try {
    const userWallet = req.headers['x-wallet-address'] as string;
    const rule = automationOps.getAutomationRuleById(req.params.id);

    if (!rule) {
      return res.status(404).json({
        success: false,
        error: 'Automation rule not found',
      });
    }

    if (userWallet && rule.userWallet !== userWallet) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this rule',
      });
    }

    const {
      name,
      description,
      triggerConfig,
      actionConfig,
      maxTriggers,
      expiresAt,
    } = req.body;

    // Update fields if provided
    if (name !== undefined) rule.name = name;
    if (description !== undefined) rule.description = description;
    if (triggerConfig !== undefined) rule.triggerConfig = triggerConfig;
    if (actionConfig !== undefined) rule.actionConfig = actionConfig;
    if (maxTriggers !== undefined) rule.maxTriggers = maxTriggers;
    if (expiresAt !== undefined) rule.expiresAt = expiresAt;

    const updatedRule = automationOps.updateAutomationRule(rule);

    res.json({
      success: true,
      data: updatedRule,
    });
  } catch (error) {
    console.error('[Automation] Update rule error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update automation rule',
    });
  }
});

/**
 * DELETE /api/v1/automation/rules/:id - Delete rule
 */
automationRouter.delete('/rules/:id', (req: Request, res: Response) => {
  try {
    const userWallet = req.headers['x-wallet-address'] as string;
    const rule = automationOps.getAutomationRuleById(req.params.id);

    if (!rule) {
      return res.status(404).json({
        success: false,
        error: 'Automation rule not found',
      });
    }

    if (userWallet && rule.userWallet !== userWallet) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this rule',
      });
    }

    const deleted = automationOps.deleteAutomationRule(req.params.id);

    res.json({
      success: true,
      message: deleted ? 'Rule deleted' : 'Rule not found',
    });
  } catch (error) {
    console.error('[Automation] Delete rule error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete automation rule',
    });
  }
});

/**
 * POST /api/v1/automation/rules/:id/toggle - Enable/disable rule
 */
automationRouter.post('/rules/:id/toggle', (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    const userWallet = req.headers['x-wallet-address'] as string;
    const rule = automationOps.getAutomationRuleById(req.params.id);

    if (!rule) {
      return res.status(404).json({
        success: false,
        error: 'Automation rule not found',
      });
    }

    if (userWallet && rule.userWallet !== userWallet) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to toggle this rule',
      });
    }

    const updatedRule = automationOps.toggleAutomationRule(
      req.params.id,
      enabled !== undefined ? enabled : !rule.enabled
    );

    // Emit WebSocket event
    const io = req.app.locals.io;
    io?.emit('automation_rule_toggled', {
      type: 'automation_rule_toggled',
      timestamp: Date.now(),
      data: updatedRule,
    });

    res.json({
      success: true,
      data: updatedRule,
    });
  } catch (error) {
    console.error('[Automation] Toggle rule error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle automation rule',
    });
  }
});

/**
 * GET /api/v1/automation/history - Get automation history
 */
automationRouter.get('/history', (req: Request, res: Response) => {
  try {
    const userWallet = req.headers['x-wallet-address'] as string || req.query.userWallet as string;
    const ruleId = req.query.ruleId as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

    if (!userWallet && !ruleId) {
      return res.status(400).json({
        success: false,
        error: 'Must provide userWallet or ruleId',
      });
    }

    let history: AutomationHistory[];

    if (ruleId) {
      history = automationOps.getAutomationHistoryByRule(ruleId, limit);
    } else {
      history = automationOps.getAutomationHistoryByUser(userWallet, limit);
    }

    res.json({
      success: true,
      data: history,
      total: history.length,
    });
  } catch (error) {
    console.error('[Automation] History error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get automation history',
    });
  }
});

/**
 * GET /api/v1/automation/stats - Get automation statistics
 */
automationRouter.get('/stats', (req: Request, res: Response) => {
  try {
    const userWallet = req.headers['x-wallet-address'] as string || req.query.userWallet as string;

    if (!userWallet) {
      return res.status(400).json({
        success: false,
        error: 'Missing x-wallet-address header or userWallet query param',
      });
    }

    const stats = automationOps.getAutomationStats(userWallet);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[Automation] Stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get automation stats',
    });
  }
});

/**
 * POST /api/v1/automation/execute - Record rule execution (internal use)
 */
automationRouter.post('/execute', (req: Request, res: Response) => {
  try {
    const {
      ruleId,
      triggerReason,
      actionTaken,
      result,
      resultData,
      error,
      nextTriggerAt,
    } = req.body;

    if (!ruleId || !actionTaken || !result) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: ruleId, actionTaken, result',
      });
    }

    const now = Date.now();

    const history: AutomationHistory = {
      id: uuidv4(),
      ruleId,
      triggeredAt: now,
      triggerReason,
      actionTaken,
      result,
      resultData,
      error,
      createdAt: now,
    };

    automationOps.createAutomationHistory(history);
    automationOps.markRuleTriggered(ruleId, nextTriggerAt);

    // Emit WebSocket event
    const io = req.app.locals.io;
    io?.emit('automation_executed', {
      type: 'automation_executed',
      timestamp: now,
      data: history,
    });

    res.status(201).json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error('[Automation] Execute error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record execution',
    });
  }
});
