/**
 * Polymarket Integration Routes
 */

import { Router, Request, Response } from 'express';
import * as polyOps from '../db/operations/polymarket.js';

export const polymarketRouter = Router();

// GET /api/v1/polymarket/markets - List markets
polymarketRouter.get('/markets', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { category, resolved, limit } = req.query;

    const markets = polyOps.getMarkets({
      category: category as string | undefined,
      resolved: resolved === 'true' ? true : resolved === 'false' ? false : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });

    res.json({ success: true, data: markets, count: markets.length });
  } catch (error) {
    logger.error({ error }, 'Failed to get Polymarket markets');
    res.status(500).json({ success: false, error: 'Failed to get Polymarket markets' });
  }
});

// GET /api/v1/polymarket/markets/:id - Market details
polymarketRouter.get('/markets/:id', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { id } = req.params;
    const market = polyOps.getMarketById(id);

    if (!market) {
      return res.status(404).json({ success: false, error: 'Market not found' });
    }

    res.json({ success: true, data: market });
  } catch (error) {
    logger.error({ error }, 'Failed to get Polymarket market');
    res.status(500).json({ success: false, error: 'Failed to get Polymarket market' });
  }
});

// GET /api/v1/polymarket/orderbook/:id - Order book
polymarketRouter.get('/orderbook/:id', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { id } = req.params;
    const market = polyOps.getMarketById(id);

    if (!market) {
      return res.status(404).json({ success: false, error: 'Market not found' });
    }

    // Mock orderbook - would integrate with Polymarket API
    const orderbook = {
      marketId: id,
      yes: {
        bids: [
          { price: 0.55, size: 100 },
          { price: 0.54, size: 200 },
          { price: 0.53, size: 300 },
        ],
        asks: [
          { price: 0.56, size: 100 },
          { price: 0.57, size: 150 },
          { price: 0.58, size: 200 },
        ],
      },
      no: {
        bids: [
          { price: 0.44, size: 100 },
          { price: 0.43, size: 200 },
          { price: 0.42, size: 300 },
        ],
        asks: [
          { price: 0.45, size: 100 },
          { price: 0.46, size: 150 },
          { price: 0.47, size: 200 },
        ],
      },
      timestamp: Date.now(),
    };

    res.json({ success: true, data: orderbook });
  } catch (error) {
    logger.error({ error }, 'Failed to get orderbook');
    res.status(500).json({ success: false, error: 'Failed to get orderbook' });
  }
});

// POST /api/v1/polymarket/orders/place - Place order
polymarketRouter.post('/orders/place', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const io = req.app.locals.io;

  try {
    const { userWallet, marketId, conditionId, outcome, side, orderType, price, size, expiresAt } = req.body;

    if (!userWallet || !marketId || !conditionId || !outcome || !side || !orderType || !price || !size) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const order = polyOps.createOrder({
      userWallet,
      marketId,
      conditionId,
      outcome,
      side,
      orderType,
      price: Number(price),
      size: Number(size),
      filledSize: 0,
      status: 'open',
      expiresAt: expiresAt ? Number(expiresAt) : undefined,
    });

    logger.info({ orderId: order.id, marketId, side, outcome }, 'Polymarket order placed');

    io?.emit('polymarket_order_placed', { type: 'polymarket_order_placed', timestamp: Date.now(), data: order });

    res.status(201).json({ success: true, data: order });
  } catch (error) {
    logger.error({ error }, 'Failed to place Polymarket order');
    res.status(500).json({ success: false, error: 'Failed to place Polymarket order' });
  }
});

// POST /api/v1/polymarket/orders/cancel - Cancel order
polymarketRouter.post('/orders/cancel', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const io = req.app.locals.io;

  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, error: 'Missing required field: orderId' });
    }

    const order = polyOps.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const cancelled = polyOps.cancelOrder(orderId);
    logger.info({ orderId }, 'Polymarket order cancelled');

    io?.emit('polymarket_order_cancelled', { type: 'polymarket_order_cancelled', timestamp: Date.now(), data: cancelled });

    res.json({ success: true, data: cancelled });
  } catch (error) {
    logger.error({ error }, 'Failed to cancel Polymarket order');
    res.status(500).json({ success: false, error: 'Failed to cancel Polymarket order' });
  }
});

// GET /api/v1/polymarket/orders - Open orders
polymarketRouter.get('/orders', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { wallet, status, marketId } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'Missing required query parameter: wallet' });
    }

    const orders = polyOps.getOrdersByWallet(wallet as string, {
      status: status as string | undefined,
      marketId: marketId as string | undefined,
    });

    res.json({ success: true, data: orders, count: orders.length });
  } catch (error) {
    logger.error({ error }, 'Failed to get Polymarket orders');
    res.status(500).json({ success: false, error: 'Failed to get Polymarket orders' });
  }
});

// GET /api/v1/polymarket/fills - Trade history
polymarketRouter.get('/fills', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { wallet, marketId } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'Missing required query parameter: wallet' });
    }

    // Get filled orders as trade history
    const fills = polyOps.getOrdersByWallet(wallet as string, {
      status: 'filled',
      marketId: marketId as string | undefined,
    });

    res.json({ success: true, data: fills, count: fills.length });
  } catch (error) {
    logger.error({ error }, 'Failed to get Polymarket fills');
    res.status(500).json({ success: false, error: 'Failed to get Polymarket fills' });
  }
});

// GET /api/v1/polymarket/positions - Positions
polymarketRouter.get('/positions', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { wallet, status, marketId } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'Missing required query parameter: wallet' });
    }

    const positions = polyOps.getPositionsByWallet(wallet as string, {
      status: status as string | undefined,
      marketId: marketId as string | undefined,
    });

    res.json({ success: true, data: positions, count: positions.length });
  } catch (error) {
    logger.error({ error }, 'Failed to get Polymarket positions');
    res.status(500).json({ success: false, error: 'Failed to get Polymarket positions' });
  }
});

// POST /api/v1/polymarket/positions/close - Close position
polymarketRouter.post('/positions/close', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const io = req.app.locals.io;

  try {
    const { positionId } = req.body;

    if (!positionId) {
      return res.status(400).json({ success: false, error: 'Missing required field: positionId' });
    }

    const position = polyOps.getPositionById(positionId);
    if (!position) {
      return res.status(404).json({ success: false, error: 'Position not found' });
    }

    const closed = polyOps.closePosition(positionId);
    logger.info({ positionId }, 'Polymarket position closed');

    io?.emit('polymarket_position_closed', { type: 'polymarket_position_closed', timestamp: Date.now(), data: closed });

    res.json({ success: true, data: closed });
  } catch (error) {
    logger.error({ error }, 'Failed to close Polymarket position');
    res.status(500).json({ success: false, error: 'Failed to close Polymarket position' });
  }
});

// GET /api/v1/polymarket/stats - Account stats
polymarketRouter.get('/stats', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { wallet } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'Missing required query parameter: wallet' });
    }

    const stats = polyOps.getAccountStats(wallet as string);
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error({ error }, 'Failed to get Polymarket stats');
    res.status(500).json({ success: false, error: 'Failed to get Polymarket stats' });
  }
});

// GET /api/v1/polymarket/trending - Trending markets
polymarketRouter.get('/trending', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { limit } = req.query;

    // Get markets sorted by volume (trending)
    const markets = polyOps.getMarkets({
      resolved: false,
      limit: limit ? parseInt(limit as string, 10) : 20,
    });

    res.json({ success: true, data: markets, count: markets.length });
  } catch (error) {
    logger.error({ error }, 'Failed to get trending markets');
    res.status(500).json({ success: false, error: 'Failed to get trending markets' });
  }
});

// GET /api/v1/polymarket/categories - Market categories
polymarketRouter.get('/categories', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    // Mock categories - would query distinct categories from DB
    const categories = [
      { id: 'politics', name: 'Politics', count: 150 },
      { id: 'sports', name: 'Sports', count: 80 },
      { id: 'crypto', name: 'Crypto', count: 60 },
      { id: 'entertainment', name: 'Entertainment', count: 40 },
      { id: 'science', name: 'Science & Tech', count: 30 },
      { id: 'finance', name: 'Finance', count: 25 },
    ];

    res.json({ success: true, data: categories });
  } catch (error) {
    logger.error({ error }, 'Failed to get categories');
    res.status(500).json({ success: false, error: 'Failed to get categories' });
  }
});
