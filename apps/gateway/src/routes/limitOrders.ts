/**
 * Limit Orders Routes
 *
 * Endpoints:
 * - POST /api/v1/limit-orders - Create limit order
 * - GET /api/v1/limit-orders - List user's limit orders
 * - GET /api/v1/limit-orders/:id - Get limit order by ID
 * - DELETE /api/v1/limit-orders/:id - Cancel limit order
 * - GET /api/v1/limit-orders/stats - Get limit order statistics
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as limitOrderOps from '../db/operations/limitOrders.js';
import type { LimitOrder } from '../db/operations/limitOrders.js';

export const limitOrdersRouter = Router();

/**
 * POST /api/v1/limit-orders - Create a new limit order
 */
limitOrdersRouter.post('/', (req: Request, res: Response) => {
  try {
    const {
      inputMint,
      outputMint,
      inputAmount,
      targetPrice,
      direction,
      expiresAt,
      slippageBps,
      agentId,
    } = req.body;

    const walletAddress = req.headers['x-wallet-address'] as string || req.body.walletAddress;

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing x-wallet-address header or walletAddress in body',
      });
    }

    if (!inputMint || !outputMint || !inputAmount || !targetPrice || !direction) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: inputMint, outputMint, inputAmount, targetPrice, direction',
      });
    }

    if (!['above', 'below'].includes(direction)) {
      return res.status(400).json({
        success: false,
        error: 'Direction must be "above" or "below"',
      });
    }

    const now = Date.now();
    const order: LimitOrder = {
      id: uuidv4(),
      agentId: agentId || undefined,
      walletAddress,
      inputMint,
      outputMint,
      inputAmount,
      targetPrice,
      direction,
      status: 'active',
      expiresAt: expiresAt || now + 7 * 24 * 60 * 60 * 1000, // Default: 7 days
      createdAt: now,
      updatedAt: now,
      slippageBps: slippageBps || 100, // Default: 1%
    };

    const createdOrder = limitOrderOps.createLimitOrder(order);

    // Emit WebSocket event
    const io = req.app.locals.io;
    io?.emit('limit_order_created', {
      type: 'limit_order_created',
      timestamp: now,
      data: createdOrder,
    });

    res.status(201).json({
      success: true,
      data: createdOrder,
    });
  } catch (error) {
    console.error('[LimitOrders] Create error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create limit order',
    });
  }
});

/**
 * GET /api/v1/limit-orders - List limit orders for a wallet
 */
limitOrdersRouter.get('/', (req: Request, res: Response) => {
  try {
    const walletAddress = req.headers['x-wallet-address'] as string || req.query.walletAddress as string;
    const status = req.query.status as string | undefined;

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing x-wallet-address header or walletAddress query param',
      });
    }

    const orders = limitOrderOps.getLimitOrdersByWallet(walletAddress, status);

    res.json({
      success: true,
      data: orders,
      total: orders.length,
    });
  } catch (error) {
    console.error('[LimitOrders] List error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list limit orders',
    });
  }
});

/**
 * GET /api/v1/limit-orders/active - Get all active limit orders (for checker service)
 */
limitOrdersRouter.get('/active', (req: Request, res: Response) => {
  try {
    const orders = limitOrderOps.getActiveLimitOrders();

    res.json({
      success: true,
      data: orders,
      total: orders.length,
    });
  } catch (error) {
    console.error('[LimitOrders] Active list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list active limit orders',
    });
  }
});

/**
 * GET /api/v1/limit-orders/stats - Get limit order statistics
 */
limitOrdersRouter.get('/stats', (req: Request, res: Response) => {
  try {
    const walletAddress = req.headers['x-wallet-address'] as string || req.query.walletAddress as string;

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing x-wallet-address header or walletAddress query param',
      });
    }

    const stats = limitOrderOps.getLimitOrderStats(walletAddress);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[LimitOrders] Stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get limit order stats',
    });
  }
});

/**
 * GET /api/v1/limit-orders/:id - Get limit order by ID
 */
limitOrdersRouter.get('/:id', (req: Request, res: Response) => {
  try {
    const order = limitOrderOps.getLimitOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Limit order not found',
      });
    }

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error('[LimitOrders] Get error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get limit order',
    });
  }
});

/**
 * DELETE /api/v1/limit-orders/:id - Cancel a limit order
 */
limitOrdersRouter.delete('/:id', (req: Request, res: Response) => {
  try {
    const walletAddress = req.headers['x-wallet-address'] as string;
    const order = limitOrderOps.getLimitOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Limit order not found',
      });
    }

    if (walletAddress && order.walletAddress !== walletAddress) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to cancel this order',
      });
    }

    if (order.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel order with status: ${order.status}`,
      });
    }

    const cancelledOrder = limitOrderOps.cancelLimitOrder(req.params.id);

    // Emit WebSocket event
    const io = req.app.locals.io;
    io?.emit('limit_order_cancelled', {
      type: 'limit_order_cancelled',
      timestamp: Date.now(),
      data: cancelledOrder,
    });

    res.json({
      success: true,
      message: 'Limit order cancelled',
      data: cancelledOrder,
    });
  } catch (error) {
    console.error('[LimitOrders] Cancel error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel limit order',
    });
  }
});

/**
 * POST /api/v1/limit-orders/:id/trigger - Mark order as triggered (internal use)
 */
limitOrdersRouter.post('/:id/trigger', (req: Request, res: Response) => {
  try {
    const order = limitOrderOps.getLimitOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Limit order not found',
      });
    }

    if (order.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: `Cannot trigger order with status: ${order.status}`,
      });
    }

    const triggeredOrder = limitOrderOps.updateLimitOrderStatus(req.params.id, 'triggered', {
      triggeredAt: Date.now(),
    });

    // Emit WebSocket event
    const io = req.app.locals.io;
    io?.emit('limit_order_triggered', {
      type: 'limit_order_triggered',
      timestamp: Date.now(),
      data: triggeredOrder,
    });

    res.json({
      success: true,
      message: 'Limit order triggered',
      data: triggeredOrder,
    });
  } catch (error) {
    console.error('[LimitOrders] Trigger error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger limit order',
    });
  }
});

/**
 * POST /api/v1/limit-orders/:id/execute - Mark order as executed (internal use)
 */
limitOrdersRouter.post('/:id/execute', (req: Request, res: Response) => {
  try {
    const { txSignature } = req.body;
    const order = limitOrderOps.getLimitOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Limit order not found',
      });
    }

    if (!['active', 'triggered'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot execute order with status: ${order.status}`,
      });
    }

    const executedOrder = limitOrderOps.updateLimitOrderStatus(req.params.id, 'executed', {
      executedAt: Date.now(),
      txSignature,
    });

    // Emit WebSocket event
    const io = req.app.locals.io;
    io?.emit('limit_order_executed', {
      type: 'limit_order_executed',
      timestamp: Date.now(),
      data: executedOrder,
    });

    res.json({
      success: true,
      message: 'Limit order executed',
      data: executedOrder,
    });
  } catch (error) {
    console.error('[LimitOrders] Execute error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute limit order',
    });
  }
});

/**
 * POST /api/v1/limit-orders/expire-old - Expire old orders (cron endpoint)
 */
limitOrdersRouter.post('/expire-old', (req: Request, res: Response) => {
  try {
    const expiredCount = limitOrderOps.expireOldOrders();

    res.json({
      success: true,
      message: `Expired ${expiredCount} orders`,
      expiredCount,
    });
  } catch (error) {
    console.error('[LimitOrders] Expire error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to expire old orders',
    });
  }
});
