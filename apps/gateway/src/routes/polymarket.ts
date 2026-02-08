/**
 * Polymarket Integration Routes
 *
 * Provides both local DB operations and real CLOB API integration.
 * When CLOB credentials are configured, orders are submitted to Polymarket.
 */

import { Router, Request, Response } from 'express';
import * as polyOps from '../db/operations/polymarket.js';
import { polymarketClob, OrderParams } from '../services/polymarketClob.js';

export const polymarketRouter = Router();

// GET /api/v1/polymarket/status - Check credential configuration
polymarketRouter.get('/status', async (req: Request, res: Response) => {
  const status = polymarketClob.getCredentialsStatus();

  res.json({
    success: true,
    data: {
      clobConfigured: status.configured,
      funderAddress: status.address,
      features: {
        realOrderExecution: status.configured,
        marketData: true,
        positionSync: status.configured,
      },
    },
  });
});

// GET /api/v1/polymarket/markets - List markets (from Gamma API)
polymarketRouter.get('/markets', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { category, resolved, limit, active } = req.query;

    // Try to fetch from Polymarket Gamma API first
    const gammaMarkets = await polymarketClob.getMarkets({
      active: active === 'true' ? true : active === 'false' ? false : undefined,
      closed: resolved === 'true' ? true : undefined,
      limit: limit ? parseInt(limit as string, 10) : 50,
    });

    if (gammaMarkets.length > 0) {
      return res.json({ success: true, data: gammaMarkets, count: gammaMarkets.length, source: 'gamma_api' });
    }

    // Fallback to local DB
    const markets = polyOps.getMarkets({
      category: category as string | undefined,
      resolved: resolved === 'true' ? true : resolved === 'false' ? false : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });

    res.json({ success: true, data: markets, count: markets.length, source: 'local_db' });
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

    // Try Gamma API first
    const gammaMarket = await polymarketClob.getMarket(id);
    if (gammaMarket) {
      return res.json({ success: true, data: gammaMarket, source: 'gamma_api' });
    }

    // Fallback to local DB
    const market = polyOps.getMarketById(id);

    if (!market) {
      return res.status(404).json({ success: false, error: 'Market not found' });
    }

    res.json({ success: true, data: market, source: 'local_db' });
  } catch (error) {
    logger.error({ error }, 'Failed to get Polymarket market');
    res.status(500).json({ success: false, error: 'Failed to get Polymarket market' });
  }
});

// GET /api/v1/polymarket/orderbook/:tokenId - Real order book from CLOB
polymarketRouter.get('/orderbook/:tokenId', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { tokenId } = req.params;

    // Fetch real orderbook from CLOB API
    const orderbook = await polymarketClob.getOrderbook(tokenId);
    const midpoint = await polymarketClob.getMidpoint(tokenId);

    res.json({
      success: true,
      data: {
        tokenId,
        bids: orderbook.bids,
        asks: orderbook.asks,
        midpoint,
        timestamp: Date.now(),
      },
      source: 'clob_api',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get orderbook');
    res.status(500).json({ success: false, error: 'Failed to get orderbook' });
  }
});

// GET /api/v1/polymarket/price/:tokenId - Get current price
polymarketRouter.get('/price/:tokenId', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { tokenId } = req.params;
    const { side } = req.query;

    const midpoint = await polymarketClob.getMidpoint(tokenId);
    const buyPrice = await polymarketClob.getPrice(tokenId, 'buy');
    const sellPrice = await polymarketClob.getPrice(tokenId, 'sell');

    res.json({
      success: true,
      data: {
        tokenId,
        midpoint,
        buyPrice,
        sellPrice,
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get price');
    res.status(500).json({ success: false, error: 'Failed to get price' });
  }
});

// POST /api/v1/polymarket/orders/place - Place order (real execution if configured)
polymarketRouter.post('/orders/place', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const io = req.app.locals.io;

  try {
    const {
      userWallet,
      marketId,
      conditionId,
      tokenId,
      outcome,
      side,
      orderType,
      price,
      size,
      expiresAt,
      negRisk,
    } = req.body;

    // Validate required fields
    if (!tokenId || !side || !price || !size) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: tokenId, side, price, size',
      });
    }

    // Check if CLOB is configured for real execution
    if (polymarketClob.isConfigured()) {
      // Build order params for CLOB
      const orderParams: OrderParams = {
        tokenId,
        price: Number(price),
        size: Number(size),
        side: side.toLowerCase() as 'buy' | 'sell',
        negRisk: negRisk || false,
      };

      // Place real order on Polymarket
      const clobResult = await polymarketClob.placeOrder(orderParams);

      if (!clobResult.success) {
        logger.error({ error: clobResult.errorMsg }, 'CLOB order placement failed');

        // Save failed order to local DB for tracking
        const localOrder = polyOps.createOrder({
          userWallet: userWallet || polymarketClob.getCredentialsStatus().address || 'unknown',
          marketId: marketId || conditionId || tokenId,
          conditionId: conditionId || tokenId,
          outcome: outcome || (side === 'buy' ? 'YES' : 'NO'),
          side: side.toLowerCase() as 'buy' | 'sell',
          orderType: (orderType || 'limit') as 'limit' | 'market',
          price: Number(price),
          size: Number(size),
          filledSize: 0,
          status: 'cancelled',
          error: clobResult.errorMsg,
          expiresAt: expiresAt ? Number(expiresAt) : undefined,
        });

        return res.status(400).json({
          success: false,
          error: clobResult.errorMsg,
          data: localOrder,
          source: 'clob_api_failed',
        });
      }

      // Save successful order to local DB for tracking
      const localOrder = polyOps.createOrder({
        userWallet: userWallet || polymarketClob.getCredentialsStatus().address || 'unknown',
        marketId: marketId || conditionId || tokenId,
        conditionId: conditionId || tokenId,
        outcome: outcome || (side === 'buy' ? 'YES' : 'NO'),
        side: side.toLowerCase() as 'buy' | 'sell',
        orderType: (orderType || 'limit') as 'limit' | 'market',
        price: Number(price),
        size: Number(size),
        filledSize: 0,
        status: 'open',
        exchangeOrderId: clobResult.orderId,
        expiresAt: expiresAt ? Number(expiresAt) : undefined,
      });

      logger.info(
        { orderId: localOrder.id, clobOrderId: clobResult.orderId, side, price, size },
        'Polymarket order placed on CLOB'
      );

      io?.emit('polymarket_order_placed', {
        type: 'polymarket_order_placed',
        timestamp: Date.now(),
        data: { ...localOrder, clobOrderId: clobResult.orderId },
      });

      return res.status(201).json({
        success: true,
        data: { ...localOrder, clobOrderId: clobResult.orderId },
        source: 'clob_api',
      });
    }

    // Fallback: Save to local DB only (no real execution)
    if (!userWallet || !marketId || !conditionId || !outcome) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields for local order: userWallet, marketId, conditionId, outcome',
      });
    }

    const order = polyOps.createOrder({
      userWallet,
      marketId,
      conditionId,
      outcome,
      side: side.toLowerCase() as 'buy' | 'sell',
      orderType: (orderType || 'limit') as 'limit' | 'market',
      price: Number(price),
      size: Number(size),
      filledSize: 0,
      status: 'open',
      expiresAt: expiresAt ? Number(expiresAt) : undefined,
    });

    logger.info({ orderId: order.id, marketId, side, outcome }, 'Polymarket order placed (local only)');

    io?.emit('polymarket_order_placed', { type: 'polymarket_order_placed', timestamp: Date.now(), data: order });

    res.status(201).json({
      success: true,
      data: order,
      source: 'local_db',
      warning: 'CLOB credentials not configured - order saved locally only',
    });
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
    const { orderId, exchangeOrderId } = req.body;

    if (!orderId && !exchangeOrderId) {
      return res.status(400).json({ success: false, error: 'Missing required field: orderId or exchangeOrderId' });
    }

    // If CLOB is configured and we have an exchange order ID, cancel on CLOB
    if (polymarketClob.isConfigured() && exchangeOrderId) {
      const clobResult = await polymarketClob.cancelOrder(exchangeOrderId);

      if (!clobResult.success) {
        logger.error({ error: clobResult.errorMsg, exchangeOrderId }, 'CLOB order cancellation failed');
        return res.status(400).json({
          success: false,
          error: clobResult.errorMsg,
          source: 'clob_api',
        });
      }

      logger.info({ exchangeOrderId }, 'Polymarket order cancelled on CLOB');
    }

    // Update local DB
    if (orderId) {
      const order = polyOps.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ success: false, error: 'Order not found in local DB' });
      }

      const cancelled = polyOps.cancelOrder(orderId);
      logger.info({ orderId }, 'Polymarket order cancelled');

      io?.emit('polymarket_order_cancelled', {
        type: 'polymarket_order_cancelled',
        timestamp: Date.now(),
        data: cancelled,
      });

      return res.json({ success: true, data: cancelled });
    }

    res.json({ success: true, message: 'Order cancelled on exchange' });
  } catch (error) {
    logger.error({ error }, 'Failed to cancel Polymarket order');
    res.status(500).json({ success: false, error: 'Failed to cancel Polymarket order' });
  }
});

// POST /api/v1/polymarket/orders/cancel-all - Cancel all orders
polymarketRouter.post('/orders/cancel-all', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { marketId } = req.body;

    if (!polymarketClob.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'CLOB credentials not configured',
      });
    }

    const result = await polymarketClob.cancelAllOrders(marketId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.errorMsg,
      });
    }

    logger.info({ marketId }, 'All Polymarket orders cancelled');

    res.json({ success: true, message: 'All orders cancelled' });
  } catch (error) {
    logger.error({ error }, 'Failed to cancel all Polymarket orders');
    res.status(500).json({ success: false, error: 'Failed to cancel all orders' });
  }
});

// GET /api/v1/polymarket/orders - Get orders (from CLOB if configured, else local DB)
polymarketRouter.get('/orders', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { wallet, status, marketId, open } = req.query;

    // If CLOB is configured, fetch from exchange
    if (polymarketClob.isConfigured() && (open === 'true' || !wallet)) {
      const clobOrders = await polymarketClob.getOpenOrders(marketId as string | undefined);
      return res.json({
        success: true,
        data: clobOrders,
        count: Array.isArray(clobOrders) ? clobOrders.length : 0,
        source: 'clob_api',
      });
    }

    // Fallback to local DB
    if (!wallet) {
      return res.status(400).json({ success: false, error: 'Missing required query parameter: wallet' });
    }

    const orders = polyOps.getOrdersByWallet(wallet as string, {
      status: status as string | undefined,
      marketId: marketId as string | undefined,
    });

    res.json({ success: true, data: orders, count: orders.length, source: 'local_db' });
  } catch (error) {
    logger.error({ error }, 'Failed to get Polymarket orders');
    res.status(500).json({ success: false, error: 'Failed to get Polymarket orders' });
  }
});

// GET /api/v1/polymarket/fills - Trade history
polymarketRouter.get('/fills', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { wallet, marketId, limit } = req.query;

    // If CLOB configured, get order history
    if (polymarketClob.isConfigured()) {
      const history = await polymarketClob.getOrderHistory(limit ? parseInt(limit as string, 10) : 100);
      return res.json({
        success: true,
        data: history,
        count: Array.isArray(history) ? history.length : 0,
        source: 'clob_api',
      });
    }

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'Missing required query parameter: wallet' });
    }

    // Fallback to local DB
    const fills = polyOps.getOrdersByWallet(wallet as string, {
      status: 'filled',
      marketId: marketId as string | undefined,
    });

    res.json({ success: true, data: fills, count: fills.length, source: 'local_db' });
  } catch (error) {
    logger.error({ error }, 'Failed to get Polymarket fills');
    res.status(500).json({ success: false, error: 'Failed to get Polymarket fills' });
  }
});

// GET /api/v1/polymarket/positions - Positions (from CLOB if configured)
polymarketRouter.get('/positions', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { wallet, status, marketId, sync } = req.query;

    // If CLOB configured, fetch real positions
    if (polymarketClob.isConfigured() && sync !== 'false') {
      const clobPositions = await polymarketClob.getPositions();
      return res.json({
        success: true,
        data: clobPositions,
        count: Array.isArray(clobPositions) ? clobPositions.length : 0,
        source: 'clob_api',
      });
    }

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'Missing required query parameter: wallet' });
    }

    const positions = polyOps.getPositionsByWallet(wallet as string, {
      status: status as string | undefined,
      marketId: marketId as string | undefined,
    });

    res.json({ success: true, data: positions, count: positions.length, source: 'local_db' });
  } catch (error) {
    logger.error({ error }, 'Failed to get Polymarket positions');
    res.status(500).json({ success: false, error: 'Failed to get Polymarket positions' });
  }
});

// GET /api/v1/polymarket/balances - Account balances
polymarketRouter.get('/balances', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    if (!polymarketClob.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'CLOB credentials not configured',
      });
    }

    const balances = await polymarketClob.getBalances();

    res.json({
      success: true,
      data: balances,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get Polymarket balances');
    res.status(500).json({ success: false, error: 'Failed to get balances' });
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

    // Try Gamma API for real trending data
    const gammaMarkets = await polymarketClob.getMarkets({
      active: true,
      limit: limit ? parseInt(limit as string, 10) : 20,
    });

    if (gammaMarkets.length > 0) {
      return res.json({ success: true, data: gammaMarkets, count: gammaMarkets.length, source: 'gamma_api' });
    }

    // Fallback to local DB
    const markets = polyOps.getMarkets({
      resolved: false,
      limit: limit ? parseInt(limit as string, 10) : 20,
    });

    res.json({ success: true, data: markets, count: markets.length, source: 'local_db' });
  } catch (error) {
    logger.error({ error }, 'Failed to get trending markets');
    res.status(500).json({ success: false, error: 'Failed to get trending markets' });
  }
});

// GET /api/v1/polymarket/categories - Market categories
polymarketRouter.get('/categories', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    // Categories from Polymarket
    const categories = [
      { id: 'politics', name: 'Politics', count: 150 },
      { id: 'sports', name: 'Sports', count: 80 },
      { id: 'crypto', name: 'Crypto', count: 60 },
      { id: 'entertainment', name: 'Entertainment', count: 40 },
      { id: 'science', name: 'Science & Tech', count: 30 },
      { id: 'finance', name: 'Finance', count: 25 },
      { id: 'global', name: 'Global Affairs', count: 45 },
      { id: 'business', name: 'Business', count: 35 },
    ];

    res.json({ success: true, data: categories });
  } catch (error) {
    logger.error({ error }, 'Failed to get categories');
    res.status(500).json({ success: false, error: 'Failed to get categories' });
  }
});
