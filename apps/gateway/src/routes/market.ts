import { Router, Request, Response } from 'express';
import type { ServiceRegistry } from '../services/registry.js';

export const marketRouter = Router();

// GET /api/v1/market/prices/:mint - Get token price
marketRouter.get('/prices/:mint', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const serviceRegistry: ServiceRegistry = req.app.locals.serviceRegistry;

  try {
    const client = serviceRegistry.getClient('agent-dex');
    const response = await client.get(`/api/v1/prices/${req.params.mint}`);

    return res.json({
      success: true,
      source: 'agent-dex',
      data: response.data.data,
    });
  } catch (error) {
    logger.warn({ error }, 'Failed to fetch price from agent-dex');

    res.status(503).json({
      success: false,
      error: 'Price service unavailable',
      source: 'none',
    });
  }
});

// GET /api/v1/market/prices - Get multiple token prices
marketRouter.get('/prices', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const serviceRegistry: ServiceRegistry = req.app.locals.serviceRegistry;
  const { mints } = req.query;

  if (!mints) {
    return res.status(400).json({
      success: false,
      error: 'mints query parameter required',
    });
  }

  try {
    const client = serviceRegistry.getClient('agent-dex');
    const response = await client.get('/api/v1/prices', { params: { mints } });

    return res.json({
      success: true,
      source: 'agent-dex',
      data: response.data.data,
    });
  } catch (error) {
    logger.warn({ error }, 'Failed to fetch prices from agent-dex');

    res.status(503).json({
      success: false,
      error: 'Price service unavailable',
      source: 'none',
    });
  }
});

// GET /api/v1/market/trending - Get trending tokens
marketRouter.get('/trending', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const serviceRegistry: ServiceRegistry = req.app.locals.serviceRegistry;

  try {
    const client = serviceRegistry.getClient('agent-dex');
    const response = await client.get('/api/v1/tokens/trending');

    return res.json({
      success: true,
      source: 'agent-dex',
      data: response.data.data,
    });
  } catch (error) {
    logger.warn({ error }, 'Failed to fetch trending tokens');

    res.json({
      success: true,
      source: 'none',
      data: [],
      message: 'Trending data unavailable',
    });
  }
});

// GET /api/v1/market/prediction-markets - Get prediction markets from CloddsBot
marketRouter.get('/prediction-markets', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const serviceRegistry: ServiceRegistry = req.app.locals.serviceRegistry;

  try {
    const client = serviceRegistry.getClient('cloddsbot');
    const response = await client.get('/api/markets');

    return res.json({
      success: true,
      source: 'cloddsbot',
      data: response.data,
    });
  } catch (error) {
    logger.warn({ error }, 'Failed to fetch prediction markets');

    res.json({
      success: true,
      source: 'none',
      data: [],
      message: 'Prediction markets unavailable',
    });
  }
});

// GET /api/v1/market/arbitrage - Get arbitrage opportunities
marketRouter.get('/arbitrage', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const serviceRegistry: ServiceRegistry = req.app.locals.serviceRegistry;

  try {
    const client = serviceRegistry.getClient('cloddsbot');
    const response = await client.get('/api/arbitrage');

    return res.json({
      success: true,
      source: 'cloddsbot',
      data: response.data,
    });
  } catch (error) {
    logger.warn({ error }, 'Failed to fetch arbitrage opportunities');

    res.json({
      success: true,
      source: 'none',
      data: [],
      message: 'Arbitrage data unavailable',
    });
  }
});

// GET /api/v1/market/osint/bounties - Get OSINT bounties
marketRouter.get('/osint/bounties', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const serviceRegistry: ServiceRegistry = req.app.locals.serviceRegistry;

  try {
    const client = serviceRegistry.getClient('osint-market');
    const response = await client.get('/api/bounties', {
      params: req.query,
    });

    return res.json({
      success: true,
      source: 'osint-market',
      data: response.data,
    });
  } catch (error) {
    logger.warn({ error }, 'Failed to fetch OSINT bounties');

    res.json({
      success: true,
      source: 'none',
      data: [],
      message: 'OSINT bounties unavailable',
    });
  }
});

// GET /api/v1/market/agents - Get registered agents from ClawdNet
marketRouter.get('/agents', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const serviceRegistry: ServiceRegistry = req.app.locals.serviceRegistry;

  try {
    const client = serviceRegistry.getClient('clawdnet');
    const response = await client.get('/api/agents', {
      params: req.query,
    });

    return res.json({
      success: true,
      source: 'clawdnet',
      data: response.data,
    });
  } catch (error) {
    logger.warn({ error }, 'Failed to fetch ClawdNet agents');

    res.json({
      success: true,
      source: 'none',
      data: [],
      message: 'Agent registry unavailable',
    });
  }
});

// GET /api/v1/market/stats - Get market statistics (computed from real data)
marketRouter.get('/stats', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const serviceRegistry: ServiceRegistry = req.app.locals.serviceRegistry;

  // Try to aggregate stats from various services
  const stats = {
    totalVolume24h: 0,
    totalTrades24h: 0,
    activePredictionMarkets: 0,
    activeArbitrageOpportunities: 0,
    topGainers: [] as Array<{ symbol: string; change: number }>,
    topLosers: [] as Array<{ symbol: string; change: number }>,
    sentiment: 'neutral' as string,
    fearGreedIndex: 50,
    servicesOnline: 0,
    servicesTotal: 6,
  };

  // Check service health
  const healthStatus = await serviceRegistry.checkAllHealth();
  stats.servicesOnline = Object.values(healthStatus).filter(h => h.status === 'healthy').length;

  // Try to get prediction markets count
  try {
    const client = serviceRegistry.getClient('cloddsbot');
    const response = await client.get('/api/markets');
    if (Array.isArray(response.data)) {
      stats.activePredictionMarkets = response.data.length;
    }
  } catch (error) {
    logger.debug('Could not fetch prediction markets for stats');
  }

  // Try to get arbitrage opportunities count
  try {
    const client = serviceRegistry.getClient('cloddsbot');
    const response = await client.get('/api/arbitrage');
    if (Array.isArray(response.data)) {
      stats.activeArbitrageOpportunities = response.data.length;
    }
  } catch (error) {
    logger.debug('Could not fetch arbitrage for stats');
  }

  res.json({
    success: true,
    data: stats,
    message: stats.servicesOnline === 0 ? 'All services offline - stats unavailable' : undefined,
  });
});
