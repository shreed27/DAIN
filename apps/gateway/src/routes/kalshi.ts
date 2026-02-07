/**
 * Kalshi Integration Routes
 */

import { Router, Request, Response } from 'express';
import * as kalshiOps from '../db/operations/kalshi.js';

export const kalshiRouter = Router();

// GET /api/v1/kalshi/markets - List markets
kalshiRouter.get('/markets', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { category, status, limit } = req.query;

    const markets = kalshiOps.getMarkets({
      category: category as string | undefined,
      status: status as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });

    res.json({ success: true, data: markets, count: markets.length });
  } catch (error) {
    logger.error({ error }, 'Failed to get Kalshi markets');
    res.status(500).json({ success: false, error: 'Failed to get Kalshi markets' });
  }
});

// GET /api/v1/kalshi/markets/:id - Market details
kalshiRouter.get('/markets/:id', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { id } = req.params;
    let market = kalshiOps.getMarketById(id);

    // Also try by ticker
    if (!market) {
      market = kalshiOps.getMarketByTicker(id);
    }

    if (!market) {
      return res.status(404).json({ success: false, error: 'Market not found' });
    }

    res.json({ success: true, data: market });
  } catch (error) {
    logger.error({ error }, 'Failed to get Kalshi market');
    res.status(500).json({ success: false, error: 'Failed to get Kalshi market' });
  }
});

// GET /api/v1/kalshi/orderbook/:ticker - Order book
kalshiRouter.get('/orderbook/:ticker', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { ticker } = req.params;
    const market = kalshiOps.getMarketByTicker(ticker);

    if (!market) {
      return res.status(404).json({ success: false, error: 'Market not found' });
    }

    // Mock orderbook - would integrate with Kalshi API
    const orderbook = {
      ticker,
      yes: {
        bids: [
          { price: 55, size: 100 },
          { price: 54, size: 200 },
          { price: 53, size: 300 },
        ],
        asks: [
          { price: 56, size: 100 },
          { price: 57, size: 150 },
          { price: 58, size: 200 },
        ],
      },
      no: {
        bids: [
          { price: 44, size: 100 },
          { price: 43, size: 200 },
          { price: 42, size: 300 },
        ],
        asks: [
          { price: 45, size: 100 },
          { price: 46, size: 150 },
          { price: 47, size: 200 },
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

// POST /api/v1/kalshi/orders/place - Place order
kalshiRouter.post('/orders/place', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const io = req.app.locals.io;

  try {
    const { userWallet, marketTicker, side, action, orderType, price, count, expiresAt } = req.body;

    if (!userWallet || !marketTicker || !side || !action || !orderType || !price || !count) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Validate price is in cents (1-99)
    const priceNum = Number(price);
    if (priceNum < 1 || priceNum > 99) {
      return res.status(400).json({ success: false, error: 'Price must be between 1 and 99 cents' });
    }

    const order = kalshiOps.createOrder({
      userWallet,
      marketTicker,
      side,
      action,
      orderType,
      price: priceNum,
      count: Number(count),
      filledCount: 0,
      status: 'resting',
      expiresAt: expiresAt ? Number(expiresAt) : undefined,
    });

    logger.info({ orderId: order.id, marketTicker, side, action }, 'Kalshi order placed');

    io?.emit('kalshi_order_placed', { type: 'kalshi_order_placed', timestamp: Date.now(), data: order });

    res.status(201).json({ success: true, data: order });
  } catch (error) {
    logger.error({ error }, 'Failed to place Kalshi order');
    res.status(500).json({ success: false, error: 'Failed to place Kalshi order' });
  }
});

// POST /api/v1/kalshi/orders/cancel - Cancel order
kalshiRouter.post('/orders/cancel', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const io = req.app.locals.io;

  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, error: 'Missing required field: orderId' });
    }

    const order = kalshiOps.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const cancelled = kalshiOps.cancelOrder(orderId);
    logger.info({ orderId }, 'Kalshi order cancelled');

    io?.emit('kalshi_order_cancelled', { type: 'kalshi_order_cancelled', timestamp: Date.now(), data: cancelled });

    res.json({ success: true, data: cancelled });
  } catch (error) {
    logger.error({ error }, 'Failed to cancel Kalshi order');
    res.status(500).json({ success: false, error: 'Failed to cancel Kalshi order' });
  }
});

// GET /api/v1/kalshi/orders - Open orders
kalshiRouter.get('/orders', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { wallet, status, marketTicker } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'Missing required query parameter: wallet' });
    }

    const orders = kalshiOps.getOrdersByWallet(wallet as string, {
      status: status as string | undefined,
      marketTicker: marketTicker as string | undefined,
    });

    res.json({ success: true, data: orders, count: orders.length });
  } catch (error) {
    logger.error({ error }, 'Failed to get Kalshi orders');
    res.status(500).json({ success: false, error: 'Failed to get Kalshi orders' });
  }
});

// GET /api/v1/kalshi/positions - Positions
kalshiRouter.get('/positions', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { wallet, status, marketTicker } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'Missing required query parameter: wallet' });
    }

    const positions = kalshiOps.getPositionsByWallet(wallet as string, {
      status: status as string | undefined,
      marketTicker: marketTicker as string | undefined,
    });

    res.json({ success: true, data: positions, count: positions.length });
  } catch (error) {
    logger.error({ error }, 'Failed to get Kalshi positions');
    res.status(500).json({ success: false, error: 'Failed to get Kalshi positions' });
  }
});

// POST /api/v1/kalshi/positions/close - Close position
kalshiRouter.post('/positions/close', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const io = req.app.locals.io;

  try {
    const { positionId } = req.body;

    if (!positionId) {
      return res.status(400).json({ success: false, error: 'Missing required field: positionId' });
    }

    const position = kalshiOps.getPositionById(positionId);
    if (!position) {
      return res.status(404).json({ success: false, error: 'Position not found' });
    }

    const closed = kalshiOps.closePosition(positionId);
    logger.info({ positionId }, 'Kalshi position closed');

    io?.emit('kalshi_position_closed', { type: 'kalshi_position_closed', timestamp: Date.now(), data: closed });

    res.json({ success: true, data: closed });
  } catch (error) {
    logger.error({ error }, 'Failed to close Kalshi position');
    res.status(500).json({ success: false, error: 'Failed to close Kalshi position' });
  }
});

// GET /api/v1/kalshi/fills - Trade history
kalshiRouter.get('/fills', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { wallet, marketTicker } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'Missing required query parameter: wallet' });
    }

    // Get filled orders as trade history
    const fills = kalshiOps.getOrdersByWallet(wallet as string, {
      status: 'filled',
      marketTicker: marketTicker as string | undefined,
    });

    res.json({ success: true, data: fills, count: fills.length });
  } catch (error) {
    logger.error({ error }, 'Failed to get Kalshi fills');
    res.status(500).json({ success: false, error: 'Failed to get Kalshi fills' });
  }
});

// GET /api/v1/kalshi/portfolio-summary - Portfolio summary
kalshiRouter.get('/portfolio-summary', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { wallet } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'Missing required query parameter: wallet' });
    }

    const summary = kalshiOps.getPortfolioSummary(wallet as string);
    res.json({ success: true, data: summary });
  } catch (error) {
    logger.error({ error }, 'Failed to get portfolio summary');
    res.status(500).json({ success: false, error: 'Failed to get portfolio summary' });
  }
});

// GET /api/v1/kalshi/stats - Account stats
kalshiRouter.get('/stats', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { wallet } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'Missing required query parameter: wallet' });
    }

    const stats = kalshiOps.getAccountStats(wallet as string);
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error({ error }, 'Failed to get Kalshi stats');
    res.status(500).json({ success: false, error: 'Failed to get Kalshi stats' });
  }
});

// GET /api/v1/kalshi/events - List events (groups of markets)
kalshiRouter.get('/events', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { category, limit } = req.query;

    // Mock events - would integrate with Kalshi API
    const events = [
      {
        ticker: 'FED-2024',
        title: 'Federal Reserve Rate Decisions 2024',
        category: 'finance',
        marketCount: 12,
        totalVolume: 5000000,
      },
      {
        ticker: 'POTUS-2024',
        title: '2024 Presidential Election',
        category: 'politics',
        marketCount: 50,
        totalVolume: 25000000,
      },
      {
        ticker: 'NFL-2024',
        title: 'NFL 2024 Season',
        category: 'sports',
        marketCount: 200,
        totalVolume: 8000000,
      },
    ];

    const filtered = category
      ? events.filter(e => e.category === category)
      : events;

    res.json({ success: true, data: filtered.slice(0, limit ? parseInt(limit as string, 10) : 50) });
  } catch (error) {
    logger.error({ error }, 'Failed to get events');
    res.status(500).json({ success: false, error: 'Failed to get events' });
  }
});

// GET /api/v1/kalshi/series - List series
kalshiRouter.get('/series', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    // Mock series - would integrate with Kalshi API
    const series = [
      { ticker: 'INXD', title: 'S&P 500 Daily Close', category: 'finance', frequency: 'daily' },
      { ticker: 'KXBTC', title: 'Bitcoin Price', category: 'crypto', frequency: 'daily' },
      { ticker: 'KXETH', title: 'Ethereum Price', category: 'crypto', frequency: 'daily' },
      { ticker: 'WEATHER', title: 'Weather Forecasts', category: 'science', frequency: 'daily' },
    ];

    res.json({ success: true, data: series });
  } catch (error) {
    logger.error({ error }, 'Failed to get series');
    res.status(500).json({ success: false, error: 'Failed to get series' });
  }
});

// GET /api/v1/kalshi/balance - Account balance
kalshiRouter.get('/balance', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { wallet } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'Missing required query parameter: wallet' });
    }

    // Mock balance - would integrate with Kalshi API
    const balance = {
      wallet,
      balance: 10000,
      portfolioValue: 2500,
      availableBalance: 7500,
      bonusBalance: 0,
    };

    res.json({ success: true, data: balance });
  } catch (error) {
    logger.error({ error }, 'Failed to get balance');
    res.status(500).json({ success: false, error: 'Failed to get balance' });
  }
});
