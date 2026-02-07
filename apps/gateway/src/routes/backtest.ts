import { Router, Request, Response } from 'express';
import * as backtestOps from '../db/operations/backtest';

const router = Router();

// ========== Strategies ==========

// Get available strategies
router.get('/strategies', (req: Request, res: Response) => {
  try {
    // Seed defaults if empty
    backtestOps.seedDefaultStrategies();

    const strategies = backtestOps.getAvailableStrategies();
    res.json({ success: true, data: strategies });
  } catch (error) {
    console.error('Error fetching strategies:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch strategies' });
  }
});

// Create custom strategy
router.post('/strategies', (req: Request, res: Response) => {
  try {
    const { name, description, category, parameters, defaultParams } = req.body;

    if (!name || !description || !category) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const strategy = backtestOps.createStrategy({
      name,
      description,
      category,
      parameters: typeof parameters === 'string' ? parameters : JSON.stringify(parameters),
      defaultParams: typeof defaultParams === 'string' ? defaultParams : JSON.stringify(defaultParams),
    });

    res.status(201).json({ success: true, data: strategy });
  } catch (error) {
    console.error('Error creating strategy:', error);
    res.status(500).json({ success: false, error: 'Failed to create strategy' });
  }
});

// ========== Backtest Runs ==========

// Get runs for wallet
router.get('/runs', (req: Request, res: Response) => {
  try {
    const { wallet, strategy, status, limit } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const runs = backtestOps.getBacktestRunsByWallet(
      wallet as string,
      {
        strategy: strategy as string,
        status: status as string,
        limit: limit ? parseInt(limit as string) : 50,
      }
    );

    res.json({ success: true, data: runs });
  } catch (error) {
    console.error('Error fetching runs:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch runs' });
  }
});

// Get run by ID
router.get('/runs/:id', (req: Request, res: Response) => {
  try {
    const run = backtestOps.getBacktestRunById(req.params.id);

    if (!run) {
      return res.status(404).json({ success: false, error: 'Run not found' });
    }

    res.json({ success: true, data: run });
  } catch (error) {
    console.error('Error fetching run:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch run' });
  }
});

// Start new backtest
router.post('/runs', (req: Request, res: Response) => {
  try {
    const {
      userWallet, name, strategy, symbol, startDate, endDate,
      initialCapital, parameters
    } = req.body;

    if (!userWallet || !name || !strategy || !symbol || !startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const run = backtestOps.createBacktestRun({
      userWallet,
      name,
      strategy,
      symbol,
      startDate: typeof startDate === 'number' ? startDate : new Date(startDate).getTime(),
      endDate: typeof endDate === 'number' ? endDate : new Date(endDate).getTime(),
      initialCapital: initialCapital || 10000,
      parameters: parameters || {},
    });

    // In a real implementation, this would trigger the backtest engine
    // For now, we'll simulate by updating to 'running' status
    backtestOps.updateBacktestRun(run.id, { status: 'running', progress: 0 });

    res.status(201).json({ success: true, data: run });
  } catch (error) {
    console.error('Error creating run:', error);
    res.status(500).json({ success: false, error: 'Failed to create run' });
  }
});

// Update run progress
router.patch('/runs/:id', (req: Request, res: Response) => {
  try {
    const { status, progress, error: runError } = req.body;

    const run = backtestOps.updateBacktestRun(req.params.id, {
      status,
      progress,
      error: runError,
    });

    if (!run) {
      return res.status(404).json({ success: false, error: 'Run not found' });
    }

    res.json({ success: true, data: run });
  } catch (error) {
    console.error('Error updating run:', error);
    res.status(500).json({ success: false, error: 'Failed to update run' });
  }
});

// Delete run
router.delete('/runs/:id', (req: Request, res: Response) => {
  try {
    const deleted = backtestOps.deleteBacktestRun(req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Run not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting run:', error);
    res.status(500).json({ success: false, error: 'Failed to delete run' });
  }
});

// ========== Results ==========

// Get results for a run
router.get('/runs/:id/results', (req: Request, res: Response) => {
  try {
    const result = backtestOps.getBacktestResult(req.params.id);

    if (!result) {
      return res.status(404).json({ success: false, error: 'Results not found' });
    }

    // Parse JSON strings
    const data = {
      ...result,
      equityCurve: JSON.parse(result.equityCurve),
      drawdownCurve: JSON.parse(result.drawdownCurve),
      trades: JSON.parse(result.trades),
    };

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching results:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch results' });
  }
});

// Save results (for backtest engine)
router.post('/runs/:id/results', (req: Request, res: Response) => {
  try {
    const {
      totalReturn, annualizedReturn, maxDrawdown, sharpeRatio, sortinoRatio,
      winRate, profitFactor, totalTrades, winningTrades, losingTrades,
      avgWin, avgLoss, largestWin, largestLoss, avgHoldingPeriod,
      equityCurve, drawdownCurve, trades
    } = req.body;

    const result = backtestOps.saveBacktestResult({
      backtestId: req.params.id,
      totalReturn: totalReturn || 0,
      annualizedReturn: annualizedReturn || 0,
      maxDrawdown: maxDrawdown || 0,
      sharpeRatio: sharpeRatio || 0,
      sortinoRatio: sortinoRatio || 0,
      winRate: winRate || 0,
      profitFactor: profitFactor || 0,
      totalTrades: totalTrades || 0,
      winningTrades: winningTrades || 0,
      losingTrades: losingTrades || 0,
      avgWin: avgWin || 0,
      avgLoss: avgLoss || 0,
      largestWin: largestWin || 0,
      largestLoss: largestLoss || 0,
      avgHoldingPeriod: avgHoldingPeriod || 0,
      equityCurve: typeof equityCurve === 'string' ? equityCurve : JSON.stringify(equityCurve || []),
      drawdownCurve: typeof drawdownCurve === 'string' ? drawdownCurve : JSON.stringify(drawdownCurve || []),
      trades: typeof trades === 'string' ? trades : JSON.stringify(trades || []),
    });

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error('Error saving results:', error);
    res.status(500).json({ success: false, error: 'Failed to save results' });
  }
});

// ========== Compare ==========

// Compare multiple backtests
router.post('/compare', (req: Request, res: Response) => {
  try {
    const { backtestIds } = req.body;

    if (!backtestIds || !Array.isArray(backtestIds) || backtestIds.length < 2) {
      return res.status(400).json({ success: false, error: 'Need at least 2 backtest IDs to compare' });
    }

    const comparison = backtestOps.compareBacktests(backtestIds);
    res.json({ success: true, data: comparison });
  } catch (error) {
    console.error('Error comparing backtests:', error);
    res.status(500).json({ success: false, error: 'Failed to compare backtests' });
  }
});

// ========== Simulate (Quick backtest preview) ==========

router.post('/simulate', (req: Request, res: Response) => {
  try {
    const { strategy, symbol, startDate, endDate, parameters, initialCapital } = req.body;

    // This would connect to a real backtest engine
    // For now, return mock simulation results
    const mockEquityCurve = [];
    let equity = initialCapital || 10000;
    const days = Math.floor((new Date(endDate).getTime() - new Date(startDate).getTime()) / (24 * 60 * 60 * 1000));

    for (let i = 0; i <= days; i += 7) {
      const change = (Math.random() - 0.45) * 0.1; // Slight upward bias
      equity = equity * (1 + change);
      mockEquityCurve.push({
        timestamp: new Date(startDate).getTime() + i * 24 * 60 * 60 * 1000,
        equity: Math.round(equity * 100) / 100,
      });
    }

    const totalReturn = ((equity - (initialCapital || 10000)) / (initialCapital || 10000)) * 100;
    const maxDrawdown = Math.random() * 20; // Mock
    const sharpeRatio = totalReturn > 0 ? 1 + Math.random() : Math.random() - 1;

    res.json({
      success: true,
      data: {
        preview: true,
        strategy,
        symbol,
        totalReturn: Math.round(totalReturn * 100) / 100,
        maxDrawdown: Math.round(maxDrawdown * 100) / 100,
        sharpeRatio: Math.round(sharpeRatio * 100) / 100,
        equityCurve: mockEquityCurve,
      }
    });
  } catch (error) {
    console.error('Error simulating:', error);
    res.status(500).json({ success: false, error: 'Failed to simulate' });
  }
});

export default router;
