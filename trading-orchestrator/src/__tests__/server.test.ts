/**
 * Server API Routes Tests
 *
 * Integration tests for all Sidex REST API endpoints
 */

import express from 'express';
import request from 'supertest';
import { createOrchestratorServer } from '../server';

describe('Server API Routes', () => {
  let app: express.Application;
  let server: ReturnType<typeof createOrchestratorServer>;

  beforeAll(async () => {
    // Create server but don't start listening
    server = createOrchestratorServer(0); // Port 0 = random available port
    app = server.app;
  });

  afterAll(async () => {
    // Cleanup
    try {
      await server.stop();
    } catch {
      // Ignore errors if server wasn't started
    }
  });

  // ==================== Health Endpoints ====================

  describe('GET /health', () => {
    it('should return health status', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/v1/health', () => {
    it('should return health status (v1)', async () => {
      const res = await request(app).get('/api/v1/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
    });
  });

  // ==================== Polymarket Routes ====================

  describe('GET /api/v1/sidex/polymarket/markets', () => {
    it('should return markets with default params', async () => {
      const res = await request(app).get('/api/v1/sidex/polymarket/markets');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const res = await request(app)
        .get('/api/v1/sidex/polymarket/markets')
        .query({ limit: 5 });

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(5);
    });
  });

  describe('GET /api/v1/sidex/polymarket/markets/search', () => {
    it('should return 400 without query', async () => {
      const res = await request(app).get('/api/v1/sidex/polymarket/markets/search');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('query');
    });

    it('should search markets with query', async () => {
      const res = await request(app)
        .get('/api/v1/sidex/polymarket/markets/search')
        .query({ q: 'trump' });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/sidex/polymarket/markets/:id', () => {
    it('should return market for valid ID', async () => {
      const res = await request(app).get('/api/v1/sidex/polymarket/markets/trump-2024');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('trump-2024');
    });

    it('should return 404 for invalid ID', async () => {
      const res = await request(app).get('/api/v1/sidex/polymarket/markets/invalid-id-12345');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/sidex/polymarket/user/:wallet/trades', () => {
    it('should return trades for wallet', async () => {
      const res = await request(app).get('/api/v1/sidex/polymarket/user/0x1234/trades');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ==================== Trading Routes ====================

  describe('GET /api/v1/sidex/balance', () => {
    it('should return balance', async () => {
      const res = await request(app).get('/api/v1/sidex/balance');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('available');
    });
  });

  describe('POST /api/v1/sidex/trade', () => {
    it('should open crypto position', async () => {
      const res = await request(app)
        .post('/api/v1/sidex/trade')
        .send({
          symbol: 'BTC/USDT',
          side: 'buy',
          amount: 100,
          leverage: 5,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 without required fields', async () => {
      const res = await request(app)
        .post('/api/v1/sidex/trade')
        .send({
          symbol: 'BTC/USDT',
          // Missing side, amount, leverage
        });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/sidex/trade/polymarket', () => {
    it('should open polymarket position', async () => {
      const res = await request(app)
        .post('/api/v1/sidex/trade/polymarket')
        .send({
          marketId: 'trump-2024',
          side: 'yes',
          shares: 100,
        });

      expect(res.status).toBe(200);
    });

    it('should return 400 without marketId', async () => {
      const res = await request(app)
        .post('/api/v1/sidex/trade/polymarket')
        .send({
          side: 'yes',
          shares: 100,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('marketId');
    });

    it('should return 400 for invalid side', async () => {
      const res = await request(app)
        .post('/api/v1/sidex/trade/polymarket')
        .send({
          marketId: 'trump-2024',
          side: 'invalid',
          shares: 100,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('side');
    });
  });

  describe('POST /api/v1/sidex/close', () => {
    it('should require symbol and direction', async () => {
      const res = await request(app)
        .post('/api/v1/sidex/close')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/sidex/close/polymarket', () => {
    it('should require positionId', async () => {
      const res = await request(app)
        .post('/api/v1/sidex/close/polymarket')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('positionId');
    });
  });

  describe('GET /api/v1/sidex/positions', () => {
    it('should return all positions', async () => {
      const res = await request(app).get('/api/v1/sidex/positions');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/sidex/positions/polymarket', () => {
    it('should return only polymarket positions', async () => {
      const res = await request(app).get('/api/v1/sidex/positions/polymarket');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/sidex/positions/crypto', () => {
    it('should return only crypto positions', async () => {
      const res = await request(app).get('/api/v1/sidex/positions/crypto');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ==================== Strategy Routes ====================

  describe('POST /api/v1/sidex/strategies', () => {
    it('should create strategy', async () => {
      const res = await request(app)
        .post('/api/v1/sidex/strategies')
        .send({
          platform: 'polymarket',
          marketId: 'trump-2024',
          description: 'Buy YES below 40 cents',
          capital: 500,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
    });

    it('should return 400 without required fields', async () => {
      const res = await request(app)
        .post('/api/v1/sidex/strategies')
        .send({
          platform: 'polymarket',
          // Missing description, capital
        });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid platform', async () => {
      const res = await request(app)
        .post('/api/v1/sidex/strategies')
        .send({
          platform: 'invalid',
          description: 'Test',
          capital: 100,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('platform');
    });

    it('should require marketId for polymarket', async () => {
      const res = await request(app)
        .post('/api/v1/sidex/strategies')
        .send({
          platform: 'polymarket',
          description: 'Buy YES',
          capital: 100,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('marketId');
    });

    it('should require symbol for crypto', async () => {
      const res = await request(app)
        .post('/api/v1/sidex/strategies')
        .send({
          platform: 'crypto',
          description: 'Buy BTC',
          capital: 100,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('symbol');
    });
  });

  describe('GET /api/v1/sidex/nl-strategies', () => {
    it('should return strategies', async () => {
      const res = await request(app).get('/api/v1/sidex/nl-strategies');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/sidex/nl-strategies/:id', () => {
    it('should return 404 for non-existent strategy', async () => {
      const res = await request(app).get('/api/v1/sidex/nl-strategies/non-existent');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/sidex/nl-strategies/:id/start', () => {
    it('should return error for non-existent strategy', async () => {
      const res = await request(app).post('/api/v1/sidex/nl-strategies/non-existent/start');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/sidex/nl-strategies/:id/stop', () => {
    it('should return error for non-existent strategy', async () => {
      const res = await request(app).post('/api/v1/sidex/nl-strategies/non-existent/stop');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/v1/sidex/nl-strategies/:id', () => {
    it('should handle non-existent strategy', async () => {
      const res = await request(app).delete('/api/v1/sidex/nl-strategies/non-existent');

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/v1/sidex/strategy-trades', () => {
    it('should return strategy trades', async () => {
      const res = await request(app).get('/api/v1/sidex/strategy-trades');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ==================== Copy Trading Routes ====================

  describe('GET /api/v1/sidex/copy-configs', () => {
    it('should return copy configs', async () => {
      const res = await request(app).get('/api/v1/sidex/copy-configs');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/v1/sidex/copy-configs/polymarket', () => {
    it('should create polymarket copy config', async () => {
      const res = await request(app)
        .post('/api/v1/sidex/copy-configs/polymarket')
        .send({
          targetWallet: '0x1234567890abcdef',
          targetLabel: 'Whale',
          sizingMode: 'fixed',
          fixedSize: 100,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.platform).toBe('polymarket');
    });

    it('should return 400 without required fields', async () => {
      const res = await request(app)
        .post('/api/v1/sidex/copy-configs/polymarket')
        .send({
          // Missing required fields
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/sidex/copy-configs/polymarket', () => {
    it('should return polymarket copy configs', async () => {
      const res = await request(app).get('/api/v1/sidex/copy-configs/polymarket');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/sidex/copy-configs/crypto', () => {
    it('should return crypto copy configs', async () => {
      const res = await request(app).get('/api/v1/sidex/copy-configs/crypto');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/v1/sidex/copy-configs/:id/toggle', () => {
    it('should return error for non-existent config', async () => {
      const res = await request(app)
        .post('/api/v1/sidex/copy-configs/non-existent/toggle')
        .send({ enabled: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/v1/sidex/copy-configs/:id', () => {
    it('should handle non-existent config', async () => {
      const res = await request(app).delete('/api/v1/sidex/copy-configs/non-existent');

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/v1/sidex/copy-trades', () => {
    it('should return copy trades', async () => {
      const res = await request(app).get('/api/v1/sidex/copy-trades');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ==================== Account Routes ====================

  describe('GET /api/v1/sidex/simulation', () => {
    it('should return simulation status', async () => {
      const res = await request(app).get('/api/v1/sidex/simulation');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('enabled');
    });
  });

  describe('POST /api/v1/sidex/simulation', () => {
    it('should toggle simulation mode', async () => {
      const res = await request(app)
        .post('/api/v1/sidex/simulation')
        .send({ enabled: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/v1/sidex/reset', () => {
    it('should reset account', async () => {
      const res = await request(app).post('/api/v1/sidex/reset');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.balance.total).toBe(10000);
    });
  });

  describe('GET /api/v1/sidex/health', () => {
    it('should return Sidex adapter health', async () => {
      const res = await request(app).get('/api/v1/sidex/health');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('healthy');
    });
  });

  // ==================== Prices Routes ====================

  describe('GET /api/v1/sidex/prices', () => {
    it('should return prices', async () => {
      const res = await request(app).get('/api/v1/sidex/prices');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('prices');
    });
  });

  describe('GET /api/v1/sidex/prices/:symbol', () => {
    it('should return price for valid symbol', async () => {
      const res = await request(app).get('/api/v1/sidex/prices/BTC-USDT');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('price');
    });

    it('should return 404 for invalid symbol', async () => {
      const res = await request(app).get('/api/v1/sidex/prices/INVALID-SYMBOL');

      expect(res.status).toBe(404);
    });
  });

  // ==================== AI Agent Routes ====================

  describe('GET /api/v1/sidex/agents', () => {
    it('should return agents', async () => {
      const res = await request(app).get('/api/v1/sidex/agents');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/v1/sidex/agents', () => {
    it('should create agent', async () => {
      const res = await request(app)
        .post('/api/v1/sidex/agents')
        .send({
          name: 'Test Agent',
          strategy: 'dca',
          capital: 1000,
          riskLevel: 'moderate',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 without required fields', async () => {
      const res = await request(app)
        .post('/api/v1/sidex/agents')
        .send({
          name: 'Test Agent',
          // Missing strategy, capital, riskLevel
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/sidex/agents/:agentId', () => {
    it('should return 404 for non-existent agent', async () => {
      const res = await request(app).get('/api/v1/sidex/agents/non-existent');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/sidex/agent-trades', () => {
    it('should return agent trades', async () => {
      const res = await request(app).get('/api/v1/sidex/agent-trades');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});
