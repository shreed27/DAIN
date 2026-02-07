/**
 * Copy Trading Routes
 *
 * Endpoints:
 * - POST /api/v1/copy-trading/configs - Create copy trading config
 * - GET /api/v1/copy-trading/configs - List user's copy configs
 * - GET /api/v1/copy-trading/configs/:id - Get config by ID
 * - PUT /api/v1/copy-trading/configs/:id - Update config
 * - DELETE /api/v1/copy-trading/configs/:id - Delete config
 * - POST /api/v1/copy-trading/configs/:id/toggle - Enable/disable config
 * - GET /api/v1/copy-trading/history - Get copy trading history
 * - GET /api/v1/copy-trading/stats - Get copy trading statistics
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as copyTradingOps from '../db/operations/copyTrading.js';
import type { CopyTradingConfig, CopyTradingHistory } from '../db/operations/copyTrading.js';

export const copyTradingRouter = Router();

/**
 * POST /api/v1/copy-trading/configs - Create copy trading configuration
 */
copyTradingRouter.post('/configs', (req: Request, res: Response) => {
  try {
    const {
      targetWallet,
      targetLabel,
      allocationPercent,
      maxPositionSize,
      minPositionSize,
      followSells,
      followBuys,
      delaySeconds,
      stopLossPercent,
      takeProfitPercent,
      maxDailyTrades,
    } = req.body;

    const userWallet = req.headers['x-wallet-address'] as string || req.body.userWallet;

    if (!userWallet) {
      return res.status(400).json({
        success: false,
        error: 'Missing x-wallet-address header or userWallet in body',
      });
    }

    if (!targetWallet) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: targetWallet',
      });
    }

    if (userWallet === targetWallet) {
      return res.status(400).json({
        success: false,
        error: 'Cannot copy your own wallet',
      });
    }

    // Check if config already exists
    const existing = copyTradingOps.getCopyConfigByUserAndTarget(userWallet, targetWallet);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Copy trading config already exists for this target wallet',
        existingConfig: existing,
      });
    }

    const now = Date.now();
    const config: CopyTradingConfig = {
      id: uuidv4(),
      userWallet,
      targetWallet,
      targetLabel: targetLabel || undefined,
      enabled: true,
      allocationPercent: allocationPercent || 10,
      maxPositionSize: maxPositionSize || undefined,
      minPositionSize: minPositionSize || 10,
      followSells: followSells !== false,
      followBuys: followBuys !== false,
      delaySeconds: delaySeconds || 0,
      stopLossPercent: stopLossPercent || undefined,
      takeProfitPercent: takeProfitPercent || undefined,
      maxDailyTrades: maxDailyTrades || 20,
      tradesToday: 0,
      totalTrades: 0,
      totalPnl: 0,
      createdAt: now,
      updatedAt: now,
    };

    const createdConfig = copyTradingOps.createCopyConfig(config);

    // Emit WebSocket event
    const io = req.app.locals.io;
    io?.emit('copy_trading_config_created', {
      type: 'copy_trading_config_created',
      timestamp: now,
      data: createdConfig,
    });

    res.status(201).json({
      success: true,
      data: createdConfig,
    });
  } catch (error) {
    console.error('[CopyTrading] Create config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create copy trading config',
    });
  }
});

/**
 * GET /api/v1/copy-trading/configs - List user's copy trading configs
 */
copyTradingRouter.get('/configs', (req: Request, res: Response) => {
  try {
    const userWallet = req.headers['x-wallet-address'] as string || req.query.userWallet as string;

    if (!userWallet) {
      return res.status(400).json({
        success: false,
        error: 'Missing x-wallet-address header or userWallet query param',
      });
    }

    const configs = copyTradingOps.getCopyConfigsByUser(userWallet);

    res.json({
      success: true,
      data: configs,
      total: configs.length,
    });
  } catch (error) {
    console.error('[CopyTrading] List configs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list copy trading configs',
    });
  }
});

/**
 * GET /api/v1/copy-trading/configs/:id - Get config by ID
 */
copyTradingRouter.get('/configs/:id', (req: Request, res: Response) => {
  try {
    const config = copyTradingOps.getCopyConfigById(req.params.id);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Copy trading config not found',
      });
    }

    // Get recent history for this config
    const history = copyTradingOps.getCopyHistoryByConfig(config.id, 20);

    res.json({
      success: true,
      data: {
        config,
        recentHistory: history,
      },
    });
  } catch (error) {
    console.error('[CopyTrading] Get config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get copy trading config',
    });
  }
});

/**
 * PUT /api/v1/copy-trading/configs/:id - Update config
 */
copyTradingRouter.put('/configs/:id', (req: Request, res: Response) => {
  try {
    const userWallet = req.headers['x-wallet-address'] as string;
    const config = copyTradingOps.getCopyConfigById(req.params.id);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Copy trading config not found',
      });
    }

    if (userWallet && config.userWallet !== userWallet) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this config',
      });
    }

    const {
      targetLabel,
      allocationPercent,
      maxPositionSize,
      minPositionSize,
      followSells,
      followBuys,
      delaySeconds,
      stopLossPercent,
      takeProfitPercent,
      maxDailyTrades,
    } = req.body;

    // Update fields if provided
    if (targetLabel !== undefined) config.targetLabel = targetLabel;
    if (allocationPercent !== undefined) config.allocationPercent = allocationPercent;
    if (maxPositionSize !== undefined) config.maxPositionSize = maxPositionSize;
    if (minPositionSize !== undefined) config.minPositionSize = minPositionSize;
    if (followSells !== undefined) config.followSells = followSells;
    if (followBuys !== undefined) config.followBuys = followBuys;
    if (delaySeconds !== undefined) config.delaySeconds = delaySeconds;
    if (stopLossPercent !== undefined) config.stopLossPercent = stopLossPercent;
    if (takeProfitPercent !== undefined) config.takeProfitPercent = takeProfitPercent;
    if (maxDailyTrades !== undefined) config.maxDailyTrades = maxDailyTrades;

    const updatedConfig = copyTradingOps.updateCopyConfig(config);

    res.json({
      success: true,
      data: updatedConfig,
    });
  } catch (error) {
    console.error('[CopyTrading] Update config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update copy trading config',
    });
  }
});

/**
 * DELETE /api/v1/copy-trading/configs/:id - Delete config
 */
copyTradingRouter.delete('/configs/:id', (req: Request, res: Response) => {
  try {
    const userWallet = req.headers['x-wallet-address'] as string;
    const config = copyTradingOps.getCopyConfigById(req.params.id);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Copy trading config not found',
      });
    }

    if (userWallet && config.userWallet !== userWallet) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this config',
      });
    }

    const deleted = copyTradingOps.deleteCopyConfig(req.params.id);

    res.json({
      success: true,
      message: deleted ? 'Config deleted' : 'Config not found',
    });
  } catch (error) {
    console.error('[CopyTrading] Delete config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete copy trading config',
    });
  }
});

/**
 * POST /api/v1/copy-trading/configs/:id/toggle - Enable/disable config
 */
copyTradingRouter.post('/configs/:id/toggle', (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    const userWallet = req.headers['x-wallet-address'] as string;
    const config = copyTradingOps.getCopyConfigById(req.params.id);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Copy trading config not found',
      });
    }

    if (userWallet && config.userWallet !== userWallet) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to toggle this config',
      });
    }

    const updatedConfig = copyTradingOps.toggleCopyConfig(
      req.params.id,
      enabled !== undefined ? enabled : !config.enabled
    );

    // Emit WebSocket event
    const io = req.app.locals.io;
    io?.emit('copy_trading_config_toggled', {
      type: 'copy_trading_config_toggled',
      timestamp: Date.now(),
      data: updatedConfig,
    });

    res.json({
      success: true,
      data: updatedConfig,
    });
  } catch (error) {
    console.error('[CopyTrading] Toggle config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle copy trading config',
    });
  }
});

/**
 * GET /api/v1/copy-trading/history - Get copy trading history
 */
copyTradingRouter.get('/history', (req: Request, res: Response) => {
  try {
    const userWallet = req.headers['x-wallet-address'] as string || req.query.userWallet as string;
    const configId = req.query.configId as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

    if (!userWallet && !configId) {
      return res.status(400).json({
        success: false,
        error: 'Must provide userWallet or configId',
      });
    }

    let history: CopyTradingHistory[];

    if (configId) {
      history = copyTradingOps.getCopyHistoryByConfig(configId, limit);
    } else {
      history = copyTradingOps.getCopyHistoryByUser(userWallet, limit);
    }

    res.json({
      success: true,
      data: history,
      total: history.length,
    });
  } catch (error) {
    console.error('[CopyTrading] History error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get copy trading history',
    });
  }
});

/**
 * GET /api/v1/copy-trading/stats - Get copy trading statistics
 */
copyTradingRouter.get('/stats', (req: Request, res: Response) => {
  try {
    const userWallet = req.headers['x-wallet-address'] as string || req.query.userWallet as string;

    if (!userWallet) {
      return res.status(400).json({
        success: false,
        error: 'Missing x-wallet-address header or userWallet query param',
      });
    }

    const stats = copyTradingOps.getCopyTradingStats(userWallet);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[CopyTrading] Stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get copy trading stats',
    });
  }
});

/**
 * GET /api/v1/copy-trading/active - Get all active copy configs (for copy service)
 */
copyTradingRouter.get('/active', (req: Request, res: Response) => {
  try {
    const configs = copyTradingOps.getActiveCopyConfigs();

    res.json({
      success: true,
      data: configs,
      total: configs.length,
    });
  } catch (error) {
    console.error('[CopyTrading] Active configs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get active copy configs',
    });
  }
});

/**
 * GET /api/v1/copy-trading/target/:wallet - Get configs following a target wallet
 */
copyTradingRouter.get('/target/:wallet', (req: Request, res: Response) => {
  try {
    const configs = copyTradingOps.getConfigsForTarget(req.params.wallet);

    res.json({
      success: true,
      data: configs,
      total: configs.length,
    });
  } catch (error) {
    console.error('[CopyTrading] Target configs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get configs for target',
    });
  }
});

/**
 * POST /api/v1/copy-trading/record - Record a copied trade (internal use)
 */
copyTradingRouter.post('/record', (req: Request, res: Response) => {
  try {
    const {
      configId,
      originalTx,
      copiedTx,
      targetWallet,
      action,
      token,
      originalAmount,
      copiedAmount,
      originalPrice,
      copiedPrice,
      slippage,
      status,
      skipReason,
      pnl,
    } = req.body;

    if (!configId || !originalTx || !targetWallet || !action || !token || originalAmount === undefined || originalPrice === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
      });
    }

    const history: CopyTradingHistory = {
      id: uuidv4(),
      configId,
      originalTx,
      copiedTx,
      targetWallet,
      action,
      token,
      originalAmount,
      copiedAmount,
      originalPrice,
      copiedPrice,
      slippage,
      status: status || 'pending',
      skipReason,
      pnl,
      createdAt: Date.now(),
    };

    const created = copyTradingOps.createCopyHistory(history);

    // Update config stats
    const config = copyTradingOps.getCopyConfigById(configId);
    if (config && status === 'executed') {
      config.tradesToday += 1;
      config.totalTrades += 1;
      config.lastTradeAt = Date.now();
      if (pnl) config.totalPnl += pnl;
      copyTradingOps.updateCopyConfig(config);
    }

    // Emit WebSocket event
    const io = req.app.locals.io;
    io?.emit('copy_trade_recorded', {
      type: 'copy_trade_recorded',
      timestamp: Date.now(),
      data: created,
    });

    res.status(201).json({
      success: true,
      data: created,
    });
  } catch (error) {
    console.error('[CopyTrading] Record trade error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record copied trade',
    });
  }
});
