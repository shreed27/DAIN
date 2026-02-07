import { Router, Request, Response } from 'express';
import * as survivalOps from '../db/operations/survivalMode';

const router = Router();

// ========== Config ==========

// Get survival mode status
router.get('/status', (req: Request, res: Response) => {
  try {
    const { wallet } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    let config = survivalOps.getSurvivalConfig(wallet as string);

    if (!config) {
      // Create default config
      config = survivalOps.createSurvivalConfig(wallet as string, true);
    }

    const stateConfig = survivalOps.getStateConfig(config.currentState, config);

    res.json({
      success: true,
      data: {
        ...config,
        stateConfig,
      }
    });
  } catch (error) {
    console.error('Error fetching survival status:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch survival status' });
  }
});

// Update config
router.patch('/config', (req: Request, res: Response) => {
  try {
    const { wallet } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const updates = req.body;
    const config = survivalOps.updateSurvivalConfig(wallet as string, updates);

    if (!config) {
      return res.status(404).json({ success: false, error: 'Config not found' });
    }

    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({ success: false, error: 'Failed to update config' });
  }
});

// Enable/disable survival mode
router.post('/toggle', (req: Request, res: Response) => {
  try {
    const { wallet, enabled } = req.body;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const config = survivalOps.updateSurvivalConfig(wallet, { enabled: enabled !== false });

    if (!config) {
      return res.status(404).json({ success: false, error: 'Config not found' });
    }

    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Error toggling survival mode:', error);
    res.status(500).json({ success: false, error: 'Failed to toggle survival mode' });
  }
});

// ========== State Transitions ==========

// Manually change state
router.post('/transition', (req: Request, res: Response) => {
  try {
    const { wallet, newState, portfolioValue, portfolioChange, reason, actions } = req.body;

    if (!wallet || !newState) {
      return res.status(400).json({ success: false, error: 'wallet and newState are required' });
    }

    const validStates = ['growth', 'normal', 'defensive', 'critical', 'hibernation'];
    if (!validStates.includes(newState)) {
      return res.status(400).json({ success: false, error: 'Invalid state' });
    }

    const config = survivalOps.transitionState(
      wallet,
      newState,
      portfolioValue || 0,
      portfolioChange || 0,
      reason || 'Manual transition',
      actions || []
    );

    if (!config) {
      return res.status(404).json({ success: false, error: 'Config not found' });
    }

    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Error transitioning state:', error);
    res.status(500).json({ success: false, error: 'Failed to transition state' });
  }
});

// Calculate recommended state based on portfolio change
router.post('/calculate', (req: Request, res: Response) => {
  try {
    const { wallet, portfolioChange } = req.body;

    if (!wallet || portfolioChange === undefined) {
      return res.status(400).json({ success: false, error: 'wallet and portfolioChange are required' });
    }

    let config = survivalOps.getSurvivalConfig(wallet);

    if (!config) {
      config = survivalOps.createSurvivalConfig(wallet, true);
    }

    const recommendedState = survivalOps.calculateRecommendedState(portfolioChange, config);
    const currentStateConfig = survivalOps.getStateConfig(config.currentState, config);
    const recommendedStateConfig = survivalOps.getStateConfig(recommendedState, config);

    res.json({
      success: true,
      data: {
        currentState: config.currentState,
        recommendedState,
        portfolioChange,
        shouldTransition: config.currentState !== recommendedState,
        currentStateConfig,
        recommendedStateConfig,
      }
    });
  } catch (error) {
    console.error('Error calculating state:', error);
    res.status(500).json({ success: false, error: 'Failed to calculate state' });
  }
});

// ========== History ==========

// Get state transition history
router.get('/history', (req: Request, res: Response) => {
  try {
    const { wallet, limit, fromDate } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const history = survivalOps.getStateHistory(wallet as string, {
      limit: limit ? parseInt(limit as string) : 20,
      fromDate: fromDate ? parseInt(fromDate as string) : undefined,
    });

    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch history' });
  }
});

// ========== Metrics ==========

// Get latest metrics
router.get('/metrics', (req: Request, res: Response) => {
  try {
    const { wallet } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const metrics = survivalOps.getLatestMetrics(wallet as string);

    if (!metrics) {
      // Return default metrics
      return res.json({
        success: true,
        data: {
          portfolioValue: 0,
          portfolioChange24h: 0,
          portfolioChange7d: 0,
          riskScore: 50,
          liquidityScore: 50,
          diversificationScore: 50,
          currentState: 'normal',
          recommendedState: 'normal',
          alerts: [],
        }
      });
    }

    res.json({
      success: true,
      data: {
        ...metrics,
        alerts: JSON.parse(metrics.alerts),
      }
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch metrics' });
  }
});

// Get metrics history
router.get('/metrics/history', (req: Request, res: Response) => {
  try {
    const { wallet, limit, startDate, endDate } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const metrics = survivalOps.getMetricsHistory(wallet as string, {
      limit: limit ? parseInt(limit as string) : 100,
      startDate: startDate ? parseInt(startDate as string) : undefined,
      endDate: endDate ? parseInt(endDate as string) : undefined,
    });

    res.json({ success: true, data: metrics });
  } catch (error) {
    console.error('Error fetching metrics history:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch metrics history' });
  }
});

// Save metrics (for monitoring service)
router.post('/metrics', (req: Request, res: Response) => {
  try {
    const metrics = req.body;

    if (!metrics.userWallet) {
      return res.status(400).json({ success: false, error: 'userWallet is required' });
    }

    const saved = survivalOps.saveMetrics({
      ...metrics,
      timestamp: Date.now(),
      alerts: typeof metrics.alerts === 'string' ? metrics.alerts : JSON.stringify(metrics.alerts || []),
    });

    res.status(201).json({ success: true, data: saved });
  } catch (error) {
    console.error('Error saving metrics:', error);
    res.status(500).json({ success: false, error: 'Failed to save metrics' });
  }
});

// ========== Dashboard ==========

// Get full survival dashboard
router.get('/dashboard', (req: Request, res: Response) => {
  try {
    const { wallet } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    // Ensure config exists
    let config = survivalOps.getSurvivalConfig(wallet as string);
    if (!config) {
      config = survivalOps.createSurvivalConfig(wallet as string, true);
    }

    const dashboard = survivalOps.getSurvivalDashboard(wallet as string);
    res.json({ success: true, data: dashboard });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard' });
  }
});

// ========== State Behaviors ==========

// Get behavior config for a state
router.get('/state/:state', (req: Request, res: Response) => {
  try {
    const { wallet } = req.query;
    const state = req.params.state as survivalOps.SurvivalState;

    const validStates = ['growth', 'normal', 'defensive', 'critical', 'hibernation'];
    if (!validStates.includes(state)) {
      return res.status(400).json({ success: false, error: 'Invalid state' });
    }

    let config = wallet
      ? survivalOps.getSurvivalConfig(wallet as string)
      : null;

    if (!config && wallet) {
      config = survivalOps.createSurvivalConfig(wallet as string, true);
    }

    // Use defaults if no config
    const defaultConfig = {
      growthMaxAllocation: 25,
      normalMaxAllocation: 15,
      defensiveMaxAllocation: 5,
      criticalMaxAllocation: 2,
      growthRiskMultiplier: 1.5,
      normalRiskMultiplier: 1.0,
      defensiveRiskMultiplier: 0.5,
      criticalRiskMultiplier: 0.2,
    };

    const stateConfig = survivalOps.getStateConfig(state, config || defaultConfig as any);

    res.json({ success: true, data: stateConfig });
  } catch (error) {
    console.error('Error fetching state config:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch state config' });
  }
});

// Get all state definitions
router.get('/states', (req: Request, res: Response) => {
  const states = [
    { state: 'growth', description: 'Aggressive growth - maximize opportunities', color: '#22c55e' },
    { state: 'normal', description: 'Balanced operations', color: '#3b82f6' },
    { state: 'defensive', description: 'Risk reduction mode', color: '#f59e0b' },
    { state: 'critical', description: 'Capital preservation', color: '#ef4444' },
    { state: 'hibernation', description: 'No trading - wait for recovery', color: '#6b7280' },
  ];

  res.json({ success: true, data: states });
});

export default router;
