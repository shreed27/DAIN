/**
 * Price History Routes (OHLCV data)
 *
 * Endpoints:
 * - GET /api/v1/prices/:token/history - Get price history
 * - GET /api/v1/prices/:token/stats - Get price statistics
 * - GET /api/v1/prices/:token/latest - Get latest price
 * - GET /api/v1/prices/batch - Get latest prices for multiple tokens
 * - POST /api/v1/prices/ingest - Ingest price data (internal)
 * - GET /api/v1/prices/tokens - Get list of available tokens
 * - GET /api/v1/prices/:token/coverage - Get data coverage info
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as priceHistoryOps from '../db/operations/priceHistory.js';
import type { PriceCandle, PriceInterval } from '../db/operations/priceHistory.js';

export const priceHistoryRouter = Router();

const VALID_INTERVALS: PriceInterval[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

/**
 * GET /api/v1/prices/:token/history - Get price history
 */
priceHistoryRouter.get('/:token/history', (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const interval = (req.query.interval as PriceInterval) || '1h';
    const startTime = req.query.startTime ? parseInt(req.query.startTime as string) : undefined;
    const endTime = req.query.endTime ? parseInt(req.query.endTime as string) : undefined;
    const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string), 1000) : undefined;

    if (!VALID_INTERVALS.includes(interval)) {
      return res.status(400).json({
        success: false,
        error: `Invalid interval. Must be one of: ${VALID_INTERVALS.join(', ')}`,
      });
    }

    const candles = priceHistoryOps.getPriceHistory(token, interval, {
      startTime,
      endTime,
      limit,
    });

    // Calculate additional metrics
    let priceChange = 0;
    let priceChangePercent = 0;

    if (candles.length >= 2) {
      const first = candles[0];
      const last = candles[candles.length - 1];
      priceChange = last.close - first.open;
      priceChangePercent = first.open > 0 ? (priceChange / first.open) * 100 : 0;
    }

    res.json({
      success: true,
      data: {
        token,
        interval,
        candles,
        count: candles.length,
        priceChange,
        priceChangePercent,
      },
    });
  } catch (error) {
    console.error('[PriceHistory] Get history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get price history',
    });
  }
});

/**
 * GET /api/v1/prices/:token/stats - Get price statistics
 */
priceHistoryRouter.get('/:token/stats', (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const interval = (req.query.interval as PriceInterval) || '1h';
    const period = req.query.period as string || '24h';

    if (!VALID_INTERVALS.includes(interval)) {
      return res.status(400).json({
        success: false,
        error: `Invalid interval. Must be one of: ${VALID_INTERVALS.join(', ')}`,
      });
    }

    // Parse period to milliseconds
    const periodMs: Record<string, number> = {
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    };

    const duration = periodMs[period] || periodMs['24h'];
    const endTime = Date.now();
    const startTime = endTime - duration;

    const stats = priceHistoryOps.getPriceStats(token, interval, startTime, endTime);

    if (!stats) {
      return res.status(404).json({
        success: false,
        error: 'No price data available for this token',
      });
    }

    res.json({
      success: true,
      data: {
        token,
        interval,
        period,
        ...stats,
      },
    });
  } catch (error) {
    console.error('[PriceHistory] Get stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get price stats',
    });
  }
});

/**
 * GET /api/v1/prices/:token/latest - Get latest price
 */
priceHistoryRouter.get('/:token/latest', (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const latestCandle = priceHistoryOps.getLatestPrice(token);

    if (!latestCandle) {
      return res.status(404).json({
        success: false,
        error: 'No price data available for this token',
      });
    }

    res.json({
      success: true,
      data: {
        token,
        price: latestCandle.close,
        timestamp: latestCandle.timestamp,
        high24h: latestCandle.high,
        low24h: latestCandle.low,
        volume: latestCandle.volume,
        candle: latestCandle,
      },
    });
  } catch (error) {
    console.error('[PriceHistory] Get latest error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get latest price',
    });
  }
});

/**
 * GET /api/v1/prices/batch - Get latest prices for multiple tokens
 */
priceHistoryRouter.get('/batch', (req: Request, res: Response) => {
  try {
    const tokens = req.query.tokens as string;

    if (!tokens) {
      return res.status(400).json({
        success: false,
        error: 'Missing required query param: tokens (comma-separated)',
      });
    }

    const tokenList = tokens.split(',').map(t => t.trim()).filter(Boolean);

    if (tokenList.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid tokens provided',
      });
    }

    if (tokenList.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 50 tokens per request',
      });
    }

    const pricesMap = priceHistoryOps.getLatestPrices(tokenList);

    const prices = tokenList.map(token => {
      const candle = pricesMap.get(token);
      return {
        token,
        price: candle?.close || null,
        timestamp: candle?.timestamp || null,
        available: !!candle,
      };
    });

    res.json({
      success: true,
      data: prices,
      found: prices.filter(p => p.available).length,
      total: tokenList.length,
    });
  } catch (error) {
    console.error('[PriceHistory] Batch prices error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get batch prices',
    });
  }
});

/**
 * GET /api/v1/prices/tokens - Get list of available tokens
 */
priceHistoryRouter.get('/tokens', (req: Request, res: Response) => {
  try {
    const tokens = priceHistoryOps.getAvailableTokens();

    res.json({
      success: true,
      data: tokens,
      total: tokens.length,
    });
  } catch (error) {
    console.error('[PriceHistory] Get tokens error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get available tokens',
    });
  }
});

/**
 * GET /api/v1/prices/:token/coverage - Get data coverage info
 */
priceHistoryRouter.get('/:token/coverage', (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const interval = (req.query.interval as PriceInterval) || '1h';

    if (!VALID_INTERVALS.includes(interval)) {
      return res.status(400).json({
        success: false,
        error: `Invalid interval. Must be one of: ${VALID_INTERVALS.join(', ')}`,
      });
    }

    const coverage = priceHistoryOps.getDataCoverage(token, interval);

    if (!coverage) {
      return res.status(404).json({
        success: false,
        error: 'No price data available for this token',
      });
    }

    res.json({
      success: true,
      data: {
        token,
        interval,
        ...coverage,
        firstDate: new Date(coverage.firstTimestamp).toISOString(),
        lastDate: new Date(coverage.lastTimestamp).toISOString(),
      },
    });
  } catch (error) {
    console.error('[PriceHistory] Get coverage error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get data coverage',
    });
  }
});

/**
 * POST /api/v1/prices/ingest - Ingest price data (internal use)
 */
priceHistoryRouter.post('/ingest', (req: Request, res: Response) => {
  try {
    const { candles } = req.body;

    if (!candles || !Array.isArray(candles)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: candles (array)',
      });
    }

    // Validate and transform candles
    const validCandles: PriceCandle[] = [];
    const errors: string[] = [];

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];

      if (!candle.tokenMint || !candle.interval || candle.timestamp === undefined ||
          candle.open === undefined || candle.high === undefined ||
          candle.low === undefined || candle.close === undefined) {
        errors.push(`Candle ${i}: Missing required fields`);
        continue;
      }

      if (!VALID_INTERVALS.includes(candle.interval)) {
        errors.push(`Candle ${i}: Invalid interval`);
        continue;
      }

      validCandles.push({
        id: candle.id || uuidv4(),
        tokenMint: candle.tokenMint,
        interval: candle.interval,
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume || 0,
      });
    }

    if (validCandles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid candles provided',
        errors,
      });
    }

    const insertedCount = priceHistoryOps.batchUpsertCandles(validCandles);

    res.status(201).json({
      success: true,
      data: {
        inserted: insertedCount,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    console.error('[PriceHistory] Ingest error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to ingest price data',
    });
  }
});

/**
 * POST /api/v1/prices/cleanup - Cleanup old price data (internal use)
 */
priceHistoryRouter.post('/cleanup', (req: Request, res: Response) => {
  try {
    // Default retention: 1m/5m/15m = 7 days, 1h = 30 days, 4h = 90 days, 1d = 365 days
    const retentionDays: Record<PriceInterval, number> = {
      '1m': 7,
      '5m': 7,
      '15m': 7,
      '1h': 30,
      '4h': 90,
      '1d': 365,
      ...req.body.retentionDays,
    };

    const deletedCount = priceHistoryOps.cleanupOldPriceData(retentionDays);

    res.json({
      success: true,
      data: {
        deleted: deletedCount,
        retentionDays,
      },
    });
  } catch (error) {
    console.error('[PriceHistory] Cleanup error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup old price data',
    });
  }
});
