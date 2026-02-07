import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { ServiceRegistry } from '../services/registry.js';
import type { Signal, WhaleSignal, ArbitrageSignal, AISignal, SignalSource } from '../types.js';
import * as signalOps from '../db/operations/signals.js';

export const signalsRouter = Router();

// GET /api/v1/signals - List signals
signalsRouter.get('/', (req: Request, res: Response) => {
  const { source, type, minConfidence, limit } = req.query;

  const signalList = signalOps.getAllSignals({
    source: source as SignalSource | undefined,
    type: type as string | undefined,
    minConfidence: minConfidence ? Number(minConfidence) : undefined,
    limit: limit ? Number(limit) : 50,
  });

  res.json({
    success: true,
    data: signalList,
    count: signalList.length,
  });
});

// GET /api/v1/signals/:id - Get signal by ID
signalsRouter.get('/:id', (req: Request, res: Response) => {
  const signal = signalOps.getSignalById(req.params.id);
  if (!signal) {
    return res.status(404).json({
      success: false,
      error: 'Signal not found',
    });
  }
  res.json({
    success: true,
    data: signal,
  });
});

// POST /api/v1/signals - Create signal (internal use)
signalsRouter.post('/', (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const io = req.app.locals.io;

  try {
    const { source, type, data, confidence, expiresAt, metadata } = req.body;

    if (!source || !type || !data) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: source, type, data',
      });
    }

    const signal: Signal = {
      id: uuidv4(),
      source,
      type,
      data,
      confidence: confidence ?? 50,
      timestamp: Date.now(),
      expiresAt,
      metadata,
    };

    signalOps.createSignal(signal);
    logger.info({ signalId: signal.id, source, type }, 'Signal created');

    // Emit WebSocket event based on signal type
    io?.emit('signal_received', {
      type: 'signal_received',
      timestamp: Date.now(),
      data: signal,
    });

    // Emit specific event types
    if (source === 'whale' || source === 'god_wallet') {
      io?.emit('whale_detected', {
        type: 'whale_detected',
        timestamp: Date.now(),
        data: signal,
      });
    } else if (source === 'arbitrage') {
      io?.emit('arbitrage_opportunity', {
        type: 'arbitrage_opportunity',
        timestamp: Date.now(),
        data: signal,
      });
    } else if (source === 'ai') {
      io?.emit('ai_analysis', {
        type: 'ai_analysis',
        timestamp: Date.now(),
        data: signal,
      });
    }

    res.status(201).json({
      success: true,
      data: signal,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to create signal');
    res.status(500).json({
      success: false,
      error: 'Failed to create signal',
    });
  }
});

// POST /api/v1/signals/whale - Create whale signal
signalsRouter.post('/whale', (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const io = req.app.locals.io;

  try {
    const { walletAddress, walletLabel, token, tokenSymbol, action, amount, price, marketCap, txSignature, confidence } = req.body;

    const signal: WhaleSignal = {
      id: uuidv4(),
      source: 'whale',
      type: 'whale_trade',
      data: {
        walletAddress,
        walletLabel,
        token,
        tokenSymbol,
        action,
        amount,
        price,
        marketCap,
        txSignature,
      },
      confidence: confidence ?? 75,
      timestamp: Date.now(),
    };

    signalOps.createSignal(signal);
    logger.info({ signalId: signal.id, wallet: walletAddress, action, token }, 'Whale signal created');

    io?.emit('whale_detected', {
      type: 'whale_detected',
      timestamp: Date.now(),
      data: signal,
    });

    res.status(201).json({
      success: true,
      data: signal,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to create whale signal');
    res.status(500).json({
      success: false,
      error: 'Failed to create whale signal',
    });
  }
});

// POST /api/v1/signals/arbitrage - Create arbitrage signal
signalsRouter.post('/arbitrage', (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const io = req.app.locals.io;

  try {
    const { token, buyPlatform, buyPrice, sellPlatform, sellPrice, profitPercent, liquidity, confidence } = req.body;

    const signal: ArbitrageSignal = {
      id: uuidv4(),
      source: 'arbitrage',
      type: 'arbitrage_opportunity',
      data: {
        token,
        buyPlatform,
        buyPrice,
        sellPlatform,
        sellPrice,
        profitPercent,
        liquidity,
      },
      confidence: confidence ?? 80,
      timestamp: Date.now(),
      expiresAt: Date.now() + 60000, // Expires in 1 minute
    };

    signalOps.createSignal(signal);
    logger.info({ signalId: signal.id, token, profitPercent }, 'Arbitrage signal created');

    io?.emit('arbitrage_opportunity', {
      type: 'arbitrage_opportunity',
      timestamp: Date.now(),
      data: signal,
    });

    res.status(201).json({
      success: true,
      data: signal,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to create arbitrage signal');
    res.status(500).json({
      success: false,
      error: 'Failed to create arbitrage signal',
    });
  }
});

// POST /api/v1/signals/ai - Create AI analysis signal
signalsRouter.post('/ai', (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const io = req.app.locals.io;

  try {
    const { token, recommendation, reasoning, metrics, confidence } = req.body;

    const signal: AISignal = {
      id: uuidv4(),
      source: 'ai',
      type: 'ai_recommendation',
      data: {
        token,
        recommendation,
        reasoning,
        metrics: {
          confidence: metrics?.confidence ?? 50,
          liquidity: metrics?.liquidity ?? 0,
          holders: metrics?.holders ?? 0,
          momentum: metrics?.momentum ?? 0,
          trustScore: metrics?.trustScore ?? 0,
        },
      },
      confidence: confidence ?? 70,
      timestamp: Date.now(),
    };

    signalOps.createSignal(signal);
    logger.info({ signalId: signal.id, token, recommendation }, 'AI signal created');

    io?.emit('ai_analysis', {
      type: 'ai_analysis',
      timestamp: Date.now(),
      data: signal,
    });

    res.status(201).json({
      success: true,
      data: signal,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to create AI signal');
    res.status(500).json({
      success: false,
      error: 'Failed to create AI signal',
    });
  }
});

// GET /api/v1/signals/god-wallets - Get god wallet signals from opus-x
signalsRouter.get('/god-wallets', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const serviceRegistry: ServiceRegistry = req.app.locals.serviceRegistry;

  try {
    // Try to fetch from opus-x
    const client = serviceRegistry.getClient('opus-x');
    const response = await client.get('/api/wallets/god');
    return res.json({
      success: true,
      source: 'opus-x',
      data: response.data,
    });
  } catch (error) {
    logger.warn('Failed to fetch god wallets from opus-x, returning empty array');

    // Return empty data instead of mock data
    res.json({
      success: true,
      source: 'none',
      data: [],
      message: 'God wallet service unavailable',
    });
  }
});

// Cleanup expired signals periodically (every 60 seconds)
setInterval(() => {
  const deleted = signalOps.deleteExpiredSignals();
  if (deleted > 0) {
    console.log(`[Signals] Cleaned up ${deleted} expired signals`);
  }
}, 60000);

// Cleanup old signals periodically (every hour)
setInterval(() => {
  const deleted = signalOps.cleanupOldSignals(24 * 60 * 60 * 1000); // 24 hours
  if (deleted > 0) {
    console.log(`[Signals] Cleaned up ${deleted} old signals`);
  }
}, 60 * 60 * 1000);
