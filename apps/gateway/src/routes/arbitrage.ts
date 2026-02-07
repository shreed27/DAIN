import { Router, Request, Response } from 'express';
import * as arbOps from '../db/operations/arbitrage';

const router = Router();

// ========== Opportunities ==========

// Get active opportunities
router.get('/opportunities', (req: Request, res: Response) => {
  try {
    const { type, minSpread, platform, limit } = req.query;

    const opportunities = arbOps.getActiveOpportunities({
      type: type as string,
      minSpread: minSpread ? parseFloat(minSpread as string) : undefined,
      platform: platform as string,
      limit: limit ? parseInt(limit as string) : 50,
    });

    res.json({ success: true, data: opportunities });
  } catch (error) {
    console.error('Error fetching opportunities:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch opportunities' });
  }
});

// Get opportunity by ID
router.get('/opportunities/:id', (req: Request, res: Response) => {
  try {
    const opportunity = arbOps.getOpportunityById(req.params.id);

    if (!opportunity) {
      return res.status(404).json({ success: false, error: 'Opportunity not found' });
    }

    res.json({ success: true, data: opportunity });
  } catch (error) {
    console.error('Error fetching opportunity:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch opportunity' });
  }
});

// Create new opportunity (for detection service)
router.post('/opportunities', (req: Request, res: Response) => {
  try {
    const {
      type, sourcePlatform, targetPlatform, symbol,
      buyPrice, sellPrice, spreadPercent, estimatedProfit,
      requiredCapital, expiresAt, metadata
    } = req.body;

    if (!type || !sourcePlatform || !symbol || !buyPrice || !sellPrice) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const opportunity = arbOps.createArbitrageOpportunity({
      type,
      sourcePlatform,
      targetPlatform: targetPlatform || sourcePlatform,
      symbol,
      buyPrice,
      sellPrice,
      spreadPercent: spreadPercent || ((sellPrice - buyPrice) / buyPrice) * 100,
      estimatedProfit: estimatedProfit || 0,
      requiredCapital: requiredCapital || buyPrice,
      expiresAt: expiresAt || Date.now() + 60000, // 1 minute default
      status: 'active',
      metadata,
      detectedAt: Date.now(),
    });

    res.status(201).json({ success: true, data: opportunity });
  } catch (error) {
    console.error('Error creating opportunity:', error);
    res.status(500).json({ success: false, error: 'Failed to create opportunity' });
  }
});

// Update opportunity status
router.patch('/opportunities/:id/status', (req: Request, res: Response) => {
  try {
    const { status } = req.body;

    if (!status || !['active', 'expired', 'executed', 'missed'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const opportunity = arbOps.updateOpportunityStatus(req.params.id, status);

    if (!opportunity) {
      return res.status(404).json({ success: false, error: 'Opportunity not found' });
    }

    res.json({ success: true, data: opportunity });
  } catch (error) {
    console.error('Error updating opportunity:', error);
    res.status(500).json({ success: false, error: 'Failed to update opportunity' });
  }
});

// Cleanup expired opportunities
router.post('/opportunities/cleanup', (req: Request, res: Response) => {
  try {
    const expired = arbOps.expireOldOpportunities();
    res.json({ success: true, data: { expiredCount: expired } });
  } catch (error) {
    console.error('Error cleaning up opportunities:', error);
    res.status(500).json({ success: false, error: 'Failed to cleanup opportunities' });
  }
});

// ========== Executions ==========

// Get executions for wallet
router.get('/executions', (req: Request, res: Response) => {
  try {
    const { wallet, status, limit } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const executions = arbOps.getExecutionsByWallet(
      wallet as string,
      { status: status as string, limit: limit ? parseInt(limit as string) : 50 }
    );

    res.json({ success: true, data: executions });
  } catch (error) {
    console.error('Error fetching executions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch executions' });
  }
});

// Execute arbitrage opportunity
router.post('/execute', (req: Request, res: Response) => {
  try {
    const {
      opportunityId, userWallet, buyPrice, sellPrice,
      quantity, buyOrderId, sellOrderId
    } = req.body;

    if (!opportunityId || !userWallet || !buyPrice || !sellPrice || !quantity) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const grossProfit = (sellPrice - buyPrice) * quantity;
    const estimatedFees = quantity * buyPrice * 0.001; // 0.1% fee estimate

    const execution = arbOps.createArbitrageExecution({
      opportunityId,
      userWallet,
      buyOrderId,
      sellOrderId,
      buyPrice,
      sellPrice,
      quantity,
      grossProfit,
      fees: estimatedFees,
      netProfit: grossProfit - estimatedFees,
      slippage: 0,
      executionTimeMs: 0,
      status: 'pending',
    });

    // Update opportunity status
    arbOps.updateOpportunityStatus(opportunityId, 'executed');

    res.status(201).json({ success: true, data: execution });
  } catch (error) {
    console.error('Error executing arbitrage:', error);
    res.status(500).json({ success: false, error: 'Failed to execute arbitrage' });
  }
});

// Update execution
router.patch('/executions/:id', (req: Request, res: Response) => {
  try {
    const { status, netProfit, slippage, error: execError } = req.body;

    const execution = arbOps.updateExecution(req.params.id, {
      status,
      netProfit,
      slippage,
      error: execError,
    });

    if (!execution) {
      return res.status(404).json({ success: false, error: 'Execution not found' });
    }

    res.json({ success: true, data: execution });
  } catch (error) {
    console.error('Error updating execution:', error);
    res.status(500).json({ success: false, error: 'Failed to update execution' });
  }
});

// ========== Config ==========

// Get user config
router.get('/config', (req: Request, res: Response) => {
  try {
    const { wallet } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const config = arbOps.getArbitrageConfig(wallet as string);

    if (!config) {
      // Return defaults
      return res.json({
        success: true,
        data: {
          enabled: false,
          minSpreadPercent: 1.0,
          maxCapitalPerTrade: 1000,
          allowedPlatforms: ['polymarket', 'kalshi', 'jupiter'],
          allowedTypes: ['internal', 'cross_platform'],
          autoExecute: false,
        }
      });
    }

    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Error fetching config:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch config' });
  }
});

// Save user config
router.post('/config', (req: Request, res: Response) => {
  try {
    const {
      userWallet, enabled, minSpreadPercent, maxCapitalPerTrade,
      allowedPlatforms, allowedTypes, autoExecute
    } = req.body;

    if (!userWallet) {
      return res.status(400).json({ success: false, error: 'userWallet is required' });
    }

    const config = arbOps.saveArbitrageConfig({
      userWallet,
      enabled: enabled ?? true,
      minSpreadPercent: minSpreadPercent ?? 1.0,
      maxCapitalPerTrade: maxCapitalPerTrade ?? 1000,
      allowedPlatforms: allowedPlatforms ?? [],
      allowedTypes: allowedTypes ?? ['internal', 'cross_platform'],
      autoExecute: autoExecute ?? false,
    });

    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Error saving config:', error);
    res.status(500).json({ success: false, error: 'Failed to save config' });
  }
});

// ========== Stats ==========

router.get('/stats', (req: Request, res: Response) => {
  try {
    const { wallet } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const stats = arbOps.getArbitrageStats(wallet as string);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

export default router;
