import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { ServiceRegistry } from '../services/registry.js';
import type { Position } from '../types.js';
import * as positionOps from '../db/operations/positions.js';

export const portfolioRouter = Router();

// GET /api/v1/portfolio/positions - Get all positions
portfolioRouter.get('/positions', (req: Request, res: Response) => {
  const { agentId } = req.query;

  const positionList = positionOps.getAllPositions({
    agentId: agentId as string | undefined,
  });

  const summary = positionOps.getPositionsSummary(agentId as string | undefined);

  res.json({
    success: true,
    data: {
      positions: positionList,
      summary,
    },
  });
});

// GET /api/v1/portfolio/positions/:id - Get position by ID
portfolioRouter.get('/positions/:id', (req: Request, res: Response) => {
  const position = positionOps.getPositionById(req.params.id);
  if (!position) {
    return res.status(404).json({
      success: false,
      error: 'Position not found',
    });
  }
  res.json({
    success: true,
    data: position,
  });
});

// POST /api/v1/portfolio/positions - Create position
portfolioRouter.post('/positions', (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const io = req.app.locals.io;

  try {
    const { agentId, token, tokenSymbol, chain, side, amount, entryPrice, stopLoss, takeProfit, takeProfitLevels } = req.body;

    if (!agentId || !token || !chain || !side || !amount || !entryPrice) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
      });
    }

    const position: Position = {
      id: uuidv4(),
      agentId,
      token,
      tokenSymbol: tokenSymbol || token.slice(0, 6),
      chain,
      side,
      amount,
      entryPrice,
      currentPrice: entryPrice,
      unrealizedPnL: 0,
      unrealizedPnLPercent: 0,
      stopLoss,
      takeProfit,
      takeProfitLevels,
      openedAt: Date.now(),
      updatedAt: Date.now(),
    };

    positionOps.createPosition(position);
    logger.info({ positionId: position.id, token, side, amount }, 'Position opened');

    io?.emit('position_opened', {
      type: 'position_opened',
      timestamp: Date.now(),
      data: position,
    });

    res.status(201).json({
      success: true,
      data: position,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to create position');
    res.status(500).json({
      success: false,
      error: 'Failed to create position',
    });
  }
});

// PUT /api/v1/portfolio/positions/:id - Update position
portfolioRouter.put('/positions/:id', (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const io = req.app.locals.io;

  const position = positionOps.getPositionById(req.params.id);
  if (!position) {
    return res.status(404).json({
      success: false,
      error: 'Position not found',
    });
  }

  const { currentPrice, stopLoss, takeProfit, takeProfitLevels } = req.body;

  if (currentPrice !== undefined) {
    position.currentPrice = currentPrice;
    const priceDiff = currentPrice - position.entryPrice;
    position.unrealizedPnL = position.side === 'long'
      ? priceDiff * position.amount
      : -priceDiff * position.amount;
    position.unrealizedPnLPercent = (priceDiff / position.entryPrice) * 100;
    if (position.side === 'short') {
      position.unrealizedPnLPercent = -position.unrealizedPnLPercent;
    }
  }

  if (stopLoss !== undefined) position.stopLoss = stopLoss;
  if (takeProfit !== undefined) position.takeProfit = takeProfit;
  if (takeProfitLevels !== undefined) position.takeProfitLevels = takeProfitLevels;

  position.updatedAt = Date.now();
  positionOps.updatePosition(position);

  io?.emit('price_update', {
    type: 'price_update',
    timestamp: Date.now(),
    data: { positionId: position.id, currentPrice: position.currentPrice, unrealizedPnL: position.unrealizedPnL },
  });

  res.json({
    success: true,
    data: position,
  });
});

// DELETE /api/v1/portfolio/positions/:id - Close position
portfolioRouter.delete('/positions/:id', (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const io = req.app.locals.io;

  const position = positionOps.deletePosition(req.params.id);
  if (!position) {
    return res.status(404).json({
      success: false,
      error: 'Position not found',
    });
  }

  logger.info({ positionId: req.params.id, pnl: position.unrealizedPnL }, 'Position closed');

  io?.emit('position_closed', {
    type: 'position_closed',
    timestamp: Date.now(),
    data: {
      position,
      realizedPnL: position.unrealizedPnL,
      closedAt: Date.now(),
    },
  });

  res.json({
    success: true,
    message: 'Position closed',
    data: {
      position,
      realizedPnL: position.unrealizedPnL,
    },
  });
});

// GET /api/v1/portfolio/wallet/:address - Get wallet portfolio from agent-dex
portfolioRouter.get('/wallet/:address', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const serviceRegistry: ServiceRegistry = req.app.locals.serviceRegistry;

  try {
    const client = serviceRegistry.getClient('agent-dex');
    const response = await client.get(`/api/v1/portfolio/${req.params.address}`);

    return res.json({
      success: true,
      source: 'agent-dex',
      data: response.data.data,
    });
  } catch (error) {
    logger.warn({ error }, 'Failed to fetch wallet portfolio from agent-dex');

    // Return empty data instead of mock data
    res.json({
      success: true,
      source: 'none',
      data: {
        solBalance: 0,
        solUsdValue: 0,
        tokens: [],
        totalUsdValue: 0,
      },
      message: 'Wallet service unavailable',
    });
  }
});

// GET /api/v1/portfolio/history/:address - Get trade history
portfolioRouter.get('/history/:address', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const serviceRegistry: ServiceRegistry = req.app.locals.serviceRegistry;

  try {
    const client = serviceRegistry.getClient('agent-dex');
    const response = await client.get(`/api/v1/portfolio/${req.params.address}/history`);

    return res.json({
      success: true,
      source: 'agent-dex',
      data: response.data.data,
    });
  } catch (error) {
    logger.warn({ error }, 'Failed to fetch trade history');

    res.json({
      success: true,
      source: 'none',
      data: [],
      message: 'Trade history unavailable',
    });
  }
});

// GET /api/v1/portfolio/holdings - Get current holdings snapshot
portfolioRouter.get('/holdings', (req: Request, res: Response) => {
  const io = req.app.locals.io;

  const holdingsArray = positionOps.getHoldings();

  io?.emit('holdings_snapshot', {
    type: 'holdings_snapshot',
    timestamp: Date.now(),
    data: holdingsArray,
  });

  res.json({
    success: true,
    data: holdingsArray,
  });
});
