import { Router, Request, Response } from 'express';
import * as futuresOps from '../db/operations/futures';

const router = Router();

// ========== Positions ==========

// Get all positions for a wallet
router.get('/positions', (req: Request, res: Response) => {
  try {
    const { wallet, exchange, status, symbol } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const positions = futuresOps.getFuturesPositionsByWallet(
      wallet as string,
      { exchange: exchange as string, status: status as string, symbol: symbol as string }
    );

    res.json({ success: true, data: positions });
  } catch (error) {
    console.error('Error fetching positions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch positions' });
  }
});

// Get open positions
router.get('/positions/open', (req: Request, res: Response) => {
  try {
    const { wallet } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const positions = futuresOps.getOpenFuturesPositions(wallet as string);
    res.json({ success: true, data: positions });
  } catch (error) {
    console.error('Error fetching open positions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch open positions' });
  }
});

// Get position by ID
router.get('/positions/:id', (req: Request, res: Response) => {
  try {
    const position = futuresOps.getFuturesPositionById(req.params.id);

    if (!position) {
      return res.status(404).json({ success: false, error: 'Position not found' });
    }

    res.json({ success: true, data: position });
  } catch (error) {
    console.error('Error fetching position:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch position' });
  }
});

// Open new position
router.post('/positions', (req: Request, res: Response) => {
  try {
    const {
      userWallet, exchange, symbol, side, leverage, size,
      entryPrice, marginType, stopLoss, takeProfit, margin
    } = req.body;

    if (!userWallet || !exchange || !symbol || !side || !leverage || !size || !entryPrice) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const position = futuresOps.createFuturesPosition({
      userWallet,
      exchange,
      symbol,
      side,
      leverage,
      size,
      entryPrice,
      margin: margin || (size * entryPrice / leverage),
      marginType: marginType || 'isolated',
      stopLoss,
      takeProfit,
      unrealizedPnl: 0,
      realizedPnl: 0,
      status: 'open',
      openedAt: Date.now(),
    });

    res.status(201).json({ success: true, data: position });
  } catch (error) {
    console.error('Error creating position:', error);
    res.status(500).json({ success: false, error: 'Failed to create position' });
  }
});

// Update position
router.patch('/positions/:id', (req: Request, res: Response) => {
  try {
    const { markPrice, liquidationPrice, unrealizedPnl, stopLoss, takeProfit } = req.body;

    const position = futuresOps.updateFuturesPosition(req.params.id, {
      markPrice,
      liquidationPrice,
      unrealizedPnl,
      stopLoss,
      takeProfit,
    });

    if (!position) {
      return res.status(404).json({ success: false, error: 'Position not found' });
    }

    res.json({ success: true, data: position });
  } catch (error) {
    console.error('Error updating position:', error);
    res.status(500).json({ success: false, error: 'Failed to update position' });
  }
});

// Close position
router.post('/positions/:id/close', (req: Request, res: Response) => {
  try {
    const { realizedPnl } = req.body;

    const position = futuresOps.closeFuturesPosition(req.params.id, realizedPnl || 0);

    if (!position) {
      return res.status(404).json({ success: false, error: 'Position not found' });
    }

    res.json({ success: true, data: position });
  } catch (error) {
    console.error('Error closing position:', error);
    res.status(500).json({ success: false, error: 'Failed to close position' });
  }
});

// ========== Orders ==========

// Get orders for wallet
router.get('/orders', (req: Request, res: Response) => {
  try {
    const { wallet, exchange, status, limit } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const orders = futuresOps.getFuturesOrdersByWallet(
      wallet as string,
      { exchange: exchange as string, status: status as string, limit: limit ? parseInt(limit as string) : undefined }
    );

    res.json({ success: true, data: orders });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch orders' });
  }
});

// Get order by ID
router.get('/orders/:id', (req: Request, res: Response) => {
  try {
    const order = futuresOps.getFuturesOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch order' });
  }
});

// Place new order
router.post('/orders', (req: Request, res: Response) => {
  try {
    const {
      userWallet, exchange, symbol, side, orderType, quantity,
      price, stopPrice, leverage, reduceOnly, timeInForce
    } = req.body;

    if (!userWallet || !exchange || !symbol || !side || !orderType || !quantity) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const order = futuresOps.createFuturesOrder({
      userWallet,
      exchange,
      symbol,
      side,
      orderType,
      quantity,
      price,
      stopPrice,
      leverage: leverage || 10,
      reduceOnly: reduceOnly || false,
      timeInForce: timeInForce || 'GTC',
      status: 'pending',
      filledQuantity: 0,
    });

    res.status(201).json({ success: true, data: order });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ success: false, error: 'Failed to create order' });
  }
});

// Update order
router.patch('/orders/:id', (req: Request, res: Response) => {
  try {
    const { status, filledQuantity, avgFillPrice, exchangeOrderId, error: orderError } = req.body;

    const order = futuresOps.updateFuturesOrder(req.params.id, {
      status,
      filledQuantity,
      avgFillPrice,
      exchangeOrderId,
      error: orderError,
    });

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ success: false, error: 'Failed to update order' });
  }
});

// Cancel order
router.post('/orders/:id/cancel', (req: Request, res: Response) => {
  try {
    const order = futuresOps.cancelFuturesOrder(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel order' });
  }
});

// ========== Credentials ==========

// Get connected exchanges
router.get('/exchanges', (req: Request, res: Response) => {
  try {
    const { wallet } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const exchanges = futuresOps.getConnectedExchanges(wallet as string);
    res.json({ success: true, data: exchanges });
  } catch (error) {
    console.error('Error fetching exchanges:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch exchanges' });
  }
});

// Save exchange credentials
router.post('/credentials', (req: Request, res: Response) => {
  try {
    const { userWallet, exchange, apiKeyEncrypted, apiSecretEncrypted, passphraseEncrypted, isTestnet, permissions } = req.body;

    if (!userWallet || !exchange || !apiKeyEncrypted || !apiSecretEncrypted) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const creds = futuresOps.saveExchangeCredentials({
      userWallet,
      exchange,
      apiKeyEncrypted,
      apiSecretEncrypted,
      passphraseEncrypted,
      isTestnet: isTestnet || false,
      permissions: permissions || [],
    });

    // Don't return encrypted keys
    res.status(201).json({
      success: true,
      data: {
        id: creds.id,
        exchange: creds.exchange,
        isTestnet: creds.isTestnet,
        permissions: creds.permissions,
      }
    });
  } catch (error) {
    console.error('Error saving credentials:', error);
    res.status(500).json({ success: false, error: 'Failed to save credentials' });
  }
});

// Delete exchange credentials
router.delete('/credentials/:exchange', (req: Request, res: Response) => {
  try {
    const { wallet } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const deleted = futuresOps.deleteExchangeCredentials(wallet as string, req.params.exchange);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Credentials not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting credentials:', error);
    res.status(500).json({ success: false, error: 'Failed to delete credentials' });
  }
});

// ========== Stats ==========

router.get('/stats', (req: Request, res: Response) => {
  try {
    const { wallet } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const stats = futuresOps.getFuturesStats(wallet as string);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

// ========== Markets (mock data for now) ==========

router.get('/markets', (req: Request, res: Response) => {
  const markets = [
    { symbol: 'BTCUSDT', name: 'Bitcoin', exchange: 'binance', maxLeverage: 125 },
    { symbol: 'ETHUSDT', name: 'Ethereum', exchange: 'binance', maxLeverage: 100 },
    { symbol: 'SOLUSDT', name: 'Solana', exchange: 'binance', maxLeverage: 50 },
    { symbol: 'BTCUSDT', name: 'Bitcoin', exchange: 'bybit', maxLeverage: 100 },
    { symbol: 'ETHUSDT', name: 'Ethereum', exchange: 'bybit', maxLeverage: 100 },
    { symbol: 'BTC-PERP', name: 'Bitcoin', exchange: 'hyperliquid', maxLeverage: 50 },
    { symbol: 'ETH-PERP', name: 'Ethereum', exchange: 'hyperliquid', maxLeverage: 50 },
    { symbol: 'BTCUSDT', name: 'Bitcoin', exchange: 'mexc', maxLeverage: 200 },
    { symbol: 'ETHUSDT', name: 'Ethereum', exchange: 'mexc', maxLeverage: 200 },
  ];

  const { exchange } = req.query;
  const filtered = exchange ? markets.filter(m => m.exchange === exchange) : markets;

  res.json({ success: true, data: filtered });
});

export default router;
