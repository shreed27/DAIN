import { Router, Request, Response } from 'express';
import * as riskOps from '../db/operations/risk';

const router = Router();

// ========== Risk Metrics ==========

// Get latest risk metrics
router.get('/metrics', (req: Request, res: Response) => {
  try {
    const { wallet } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const metrics = riskOps.getLatestRiskMetrics(wallet as string);

    if (!metrics) {
      // Return default metrics
      return res.json({
        success: true,
        data: {
          portfolioValue: 0,
          varDaily: 0,
          varWeekly: 0,
          cvarDaily: 0,
          cvarWeekly: 0,
          volatility: 0,
          volatilityRegime: 'normal',
          beta: 1,
          sharpeRatio: 0,
          maxDrawdown: 0,
          currentDrawdown: 0,
          correlationBtc: 0,
          correlationEth: 0,
        }
      });
    }

    res.json({ success: true, data: metrics });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch metrics' });
  }
});

// Get metrics history
router.get('/metrics/history', (req: Request, res: Response) => {
  try {
    const { wallet, startDate, endDate, limit } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const metrics = riskOps.getRiskMetricsHistory(wallet as string, {
      startDate: startDate ? parseInt(startDate as string) : undefined,
      endDate: endDate ? parseInt(endDate as string) : undefined,
      limit: limit ? parseInt(limit as string) : 100,
    });

    res.json({ success: true, data: metrics });
  } catch (error) {
    console.error('Error fetching metrics history:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch metrics history' });
  }
});

// Save risk metrics (for calculation service)
router.post('/metrics', (req: Request, res: Response) => {
  try {
    const metrics = req.body;

    if (!metrics.userWallet) {
      return res.status(400).json({ success: false, error: 'userWallet is required' });
    }

    const saved = riskOps.saveRiskMetrics({
      ...metrics,
      calculatedAt: Date.now(),
    });

    res.status(201).json({ success: true, data: saved });
  } catch (error) {
    console.error('Error saving metrics:', error);
    res.status(500).json({ success: false, error: 'Failed to save metrics' });
  }
});

// ========== Circuit Breaker ==========

// Get circuit breaker config
router.get('/circuit-breaker', (req: Request, res: Response) => {
  try {
    const { wallet } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const config = riskOps.getCircuitBreakerConfig(wallet as string);

    if (!config) {
      // Return defaults
      return res.json({
        success: true,
        data: {
          enabled: false,
          maxDailyLoss: 10,
          maxDrawdown: 20,
          maxPositionSize: 10000,
          maxLeverage: 20,
          volatilityThreshold: 50,
          cooldownPeriod: 60,
          status: 'active',
        }
      });
    }

    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Error fetching circuit breaker:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch circuit breaker config' });
  }
});

// Save circuit breaker config
router.post('/circuit-breaker', (req: Request, res: Response) => {
  try {
    const {
      userWallet, enabled, maxDailyLoss, maxDrawdown, maxPositionSize,
      maxLeverage, volatilityThreshold, cooldownPeriod
    } = req.body;

    if (!userWallet) {
      return res.status(400).json({ success: false, error: 'userWallet is required' });
    }

    const config = riskOps.saveCircuitBreakerConfig({
      userWallet,
      enabled: enabled ?? true,
      maxDailyLoss: maxDailyLoss ?? 10,
      maxDrawdown: maxDrawdown ?? 20,
      maxPositionSize: maxPositionSize ?? 10000,
      maxLeverage: maxLeverage ?? 20,
      volatilityThreshold: volatilityThreshold ?? 50,
      cooldownPeriod: cooldownPeriod ?? 60,
      status: 'active',
    });

    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Error saving circuit breaker:', error);
    res.status(500).json({ success: false, error: 'Failed to save circuit breaker config' });
  }
});

// Trigger circuit breaker
router.post('/circuit-breaker/trigger', (req: Request, res: Response) => {
  try {
    const { wallet, reason } = req.body;

    if (!wallet || !reason) {
      return res.status(400).json({ success: false, error: 'wallet and reason are required' });
    }

    const config = riskOps.triggerCircuitBreaker(wallet, reason);

    if (!config) {
      return res.status(404).json({ success: false, error: 'Circuit breaker not configured' });
    }

    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Error triggering circuit breaker:', error);
    res.status(500).json({ success: false, error: 'Failed to trigger circuit breaker' });
  }
});

// Reset circuit breaker
router.post('/circuit-breaker/reset', (req: Request, res: Response) => {
  try {
    const { wallet } = req.body;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const config = riskOps.resetCircuitBreaker(wallet);

    if (!config) {
      return res.status(404).json({ success: false, error: 'Circuit breaker not configured' });
    }

    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Error resetting circuit breaker:', error);
    res.status(500).json({ success: false, error: 'Failed to reset circuit breaker' });
  }
});

// ========== Stress Tests ==========

// Get stress test results
router.get('/stress-tests', (req: Request, res: Response) => {
  try {
    const { wallet, scenarioType, limit } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const results = riskOps.getStressTestResults(wallet as string, {
      scenarioType: scenarioType as string,
      limit: limit ? parseInt(limit as string) : 20,
    });

    res.json({ success: true, data: results });
  } catch (error) {
    console.error('Error fetching stress tests:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stress test results' });
  }
});

// Get default stress scenarios
router.get('/stress-tests/scenarios', (req: Request, res: Response) => {
  try {
    const scenarios = riskOps.getDefaultStressScenarios();
    res.json({ success: true, data: scenarios });
  } catch (error) {
    console.error('Error fetching scenarios:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch scenarios' });
  }
});

// Run stress test
router.post('/stress-tests', (req: Request, res: Response) => {
  try {
    const { userWallet, scenarioName, scenarioType, description, parameters, portfolioImpact, positionImpacts, probability } = req.body;

    if (!userWallet || !scenarioName || !scenarioType) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const result = riskOps.saveStressTestResult({
      userWallet,
      scenarioName,
      scenarioType,
      description: description || '',
      parameters: typeof parameters === 'string' ? parameters : JSON.stringify(parameters),
      portfolioImpact: portfolioImpact || 0,
      positionImpacts: typeof positionImpacts === 'string' ? positionImpacts : JSON.stringify(positionImpacts || []),
      probability,
    });

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error('Error running stress test:', error);
    res.status(500).json({ success: false, error: 'Failed to run stress test' });
  }
});

// ========== Kill Switch ==========

// Get kill switch history
router.get('/kill-switch/history', (req: Request, res: Response) => {
  try {
    const { wallet, limit } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const history = riskOps.getKillSwitchHistory(wallet as string, limit ? parseInt(limit as string) : 10);
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Error fetching kill switch history:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch kill switch history' });
  }
});

// Trigger kill switch (emergency stop)
router.post('/kill-switch', (req: Request, res: Response) => {
  try {
    const { userWallet, triggeredBy, reason, positionsClosed, ordersCancelled, totalValue } = req.body;

    if (!userWallet || !reason) {
      return res.status(400).json({ success: false, error: 'userWallet and reason are required' });
    }

    // Record the event
    const event = riskOps.recordKillSwitchEvent({
      userWallet,
      triggeredBy: triggeredBy || 'user',
      reason,
      positionsClosed: positionsClosed || 0,
      ordersCancelled: ordersCancelled || 0,
      totalValue: totalValue || 0,
    });

    // In a real implementation, this would:
    // 1. Close all open positions
    // 2. Cancel all pending orders
    // 3. Disable all automation
    // 4. Send emergency notifications

    res.status(201).json({
      success: true,
      data: event,
      message: 'Kill switch activated. All trading halted.',
    });
  } catch (error) {
    console.error('Error activating kill switch:', error);
    res.status(500).json({ success: false, error: 'Failed to activate kill switch' });
  }
});

// ========== Dashboard ==========

// Get full risk dashboard
router.get('/dashboard', (req: Request, res: Response) => {
  try {
    const { wallet } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const dashboard = riskOps.getRiskDashboard(wallet as string);
    res.json({ success: true, data: dashboard });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch risk dashboard' });
  }
});

export default router;
