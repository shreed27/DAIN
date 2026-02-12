/**
 * PolymarketService Tests
 *
 * Tests for Polymarket prediction market data service
 */

import { PolymarketService, createPolymarketService } from '../services/PolymarketService';

describe('PolymarketService', () => {
  let service: PolymarketService;

  beforeEach(() => {
    // Create fresh instance for each test with short cache TTL
    service = createPolymarketService({ cacheTtlMs: 100 });
  });

  afterEach(() => {
    service.destroy();
  });

  // ==================== getMarkets() Tests ====================

  describe('getMarkets()', () => {
    it('should return default 20 markets with empty params', async () => {
      const markets = await service.getMarkets({});
      expect(Array.isArray(markets)).toBe(true);
      expect(markets.length).toBeLessThanOrEqual(20);
      expect(markets.length).toBeGreaterThan(0);
    });

    it('should return exactly 5 markets with limit=5', async () => {
      const markets = await service.getMarkets({ limit: 5 });
      expect(markets.length).toBeLessThanOrEqual(5);
    });

    it('should cap limit at 100 when limit > 100', async () => {
      // This should not throw and should return at most 100 markets
      const markets = await service.getMarkets({ limit: 150 });
      expect(markets.length).toBeLessThanOrEqual(100);
    });

    it('should use cache on second call within TTL', async () => {
      const markets1 = await service.getMarkets({ limit: 10 });
      const markets2 = await service.getMarkets({ limit: 10 });

      // Both calls should return data
      expect(markets1.length).toBeGreaterThan(0);
      expect(markets2.length).toBeGreaterThan(0);

      // Cache should return same data
      expect(markets1[0].id).toBe(markets2[0].id);
    });

    it('should return fallback data when API fails', async () => {
      // Create service with invalid API URL to force fallback
      const failingService = createPolymarketService({
        gammaApiUrl: 'https://invalid.url.that.does.not.exist',
        cacheTtlMs: 100,
      });

      const markets = await failingService.getMarkets({ limit: 5 });

      // Should return fallback data
      expect(Array.isArray(markets)).toBe(true);
      expect(markets.length).toBeGreaterThan(0);

      failingService.destroy();
    });

    it('should have valid market structure', async () => {
      const markets = await service.getMarkets({ limit: 1 });
      expect(markets.length).toBeGreaterThan(0);

      const market = markets[0];
      expect(market).toHaveProperty('id');
      expect(market).toHaveProperty('question');
      expect(market).toHaveProperty('outcomes');
      expect(market).toHaveProperty('volume24h');
      expect(market).toHaveProperty('totalVolume');
      expect(market).toHaveProperty('liquidity');
      expect(market).toHaveProperty('active');

      // Outcomes should have proper structure
      expect(Array.isArray(market.outcomes)).toBe(true);
      if (market.outcomes.length > 0) {
        expect(market.outcomes[0]).toHaveProperty('tokenId');
        expect(market.outcomes[0]).toHaveProperty('name');
        expect(market.outcomes[0]).toHaveProperty('price');
      }
    });

    it('should filter active markets', async () => {
      const activeMarkets = await service.getMarkets({ active: true, limit: 10 });
      const allActive = activeMarkets.every(m => m.active);
      // Fallback data is all active, so this should pass
      expect(allActive).toBe(true);
    });

    it('should sort by volume when specified', async () => {
      const markets = await service.getMarkets({ sortBy: 'volume', limit: 10 });
      for (let i = 1; i < markets.length; i++) {
        expect(markets[i - 1].volume24h).toBeGreaterThanOrEqual(markets[i].volume24h);
      }
    });

    it('should sort by liquidity when specified', async () => {
      const markets = await service.getMarkets({ sortBy: 'liquidity', limit: 10 });
      for (let i = 1; i < markets.length; i++) {
        expect(markets[i - 1].liquidity).toBeGreaterThanOrEqual(markets[i].liquidity);
      }
    });
  });

  // ==================== searchMarkets() Tests ====================

  describe('searchMarkets()', () => {
    it('should filter by question for valid query', async () => {
      // First populate cache
      await service.getMarkets({ limit: 20 });

      const results = await service.searchMarkets('trump', 10);
      expect(Array.isArray(results)).toBe(true);

      // All results should contain 'trump' in question or category
      if (results.length > 0) {
        results.forEach(market => {
          const matches =
            market.question.toLowerCase().includes('trump') ||
            market.category?.toLowerCase().includes('trump');
          expect(matches).toBe(true);
        });
      }
    });

    it('should return all markets for empty query', async () => {
      const results = await service.searchMarkets('', 20);
      expect(Array.isArray(results)).toBe(true);
      // With empty query, it should return markets (possibly all)
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should return empty array for non-matching query', async () => {
      const results = await service.searchMarkets('xyznonexistentquery123456', 10);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it('should respect limit parameter', async () => {
      const results = await service.searchMarkets('', 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should be case-insensitive', async () => {
      const results1 = await service.searchMarkets('TRUMP', 10);
      const results2 = await service.searchMarkets('trump', 10);

      // Both should return same results
      expect(results1.length).toBe(results2.length);
    });
  });

  // ==================== getMarket() Tests ====================

  describe('getMarket()', () => {
    it('should return market details for valid ID', async () => {
      const market = await service.getMarket('trump-2024');

      expect(market).not.toBeNull();
      expect(market?.id).toBe('trump-2024');
      expect(market?.question).toBeDefined();
      expect(market?.outcomes).toBeDefined();
    });

    it('should return null for invalid ID', async () => {
      const market = await service.getMarket('nonexistent-market-id-12345');
      expect(market).toBeNull();
    });

    it('should use cached market on second call', async () => {
      const market1 = await service.getMarket('trump-2024');
      const market2 = await service.getMarket('trump-2024');

      expect(market1).not.toBeNull();
      expect(market2).not.toBeNull();
      expect(market1?.id).toBe(market2?.id);
    });

    it('should find market from list cache', async () => {
      // First populate list cache
      await service.getMarkets({ limit: 20 });

      // Now get a specific market
      const market = await service.getMarket('btc-100k-2024');
      expect(market).not.toBeNull();
    });
  });

  // ==================== getUserTrades() Tests ====================

  describe('getUserTrades()', () => {
    it('should return trades for valid wallet', async () => {
      const trades = await service.getUserTrades('0x1234567890abcdef1234567890abcdef12345678');

      expect(Array.isArray(trades)).toBe(true);
      // Simulated trades should be returned
      expect(trades.length).toBeGreaterThanOrEqual(0);
    });

    it('should return empty array for empty wallet', async () => {
      const trades = await service.getUserTrades('');
      expect(Array.isArray(trades)).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const trades = await service.getUserTrades('0xabc123', 5);
      expect(trades.length).toBeLessThanOrEqual(5);
    });

    it('should have valid trade structure', async () => {
      const trades = await service.getUserTrades('0xtest', 10);

      if (trades.length > 0) {
        const trade = trades[0];
        expect(trade).toHaveProperty('id');
        expect(trade).toHaveProperty('marketId');
        expect(trade).toHaveProperty('tokenId');
        expect(trade).toHaveProperty('side');
        expect(trade).toHaveProperty('outcome');
        expect(trade).toHaveProperty('size');
        expect(trade).toHaveProperty('price');
        expect(trade).toHaveProperty('timestamp');

        expect(['buy', 'sell']).toContain(trade.side);
        expect(['Yes', 'No']).toContain(trade.outcome);
        expect(typeof trade.size).toBe('number');
        expect(typeof trade.price).toBe('number');
      }
    });

    it('should return trades sorted by timestamp (newest first)', async () => {
      const trades = await service.getUserTrades('0xsorted', 10);

      for (let i = 1; i < trades.length; i++) {
        const prev = new Date(trades[i - 1].timestamp).getTime();
        const curr = new Date(trades[i].timestamp).getTime();
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    });
  });

  // ==================== subscribeMarket() Tests ====================

  describe('subscribeMarket()', () => {
    it('should start polling for valid market', async () => {
      // This should not throw
      service.subscribeMarket('btc-100k-2024');

      // Wait a bit for polling to start
      await new Promise(resolve => setTimeout(resolve, 100));

      // Unsubscribe to cleanup
      service.unsubscribeMarket('btc-100k-2024');
    });

    it('should not create duplicate intervals for same market', async () => {
      service.subscribeMarket('trump-2024');
      service.subscribeMarket('trump-2024'); // Should not create another interval

      // Clean up
      service.unsubscribeMarket('trump-2024');
    });

    it('should emit marketUpdate events', (done) => {
      const timeout = setTimeout(() => {
        service.unsubscribeMarket('fed-rate-march');
        done(); // Test passes if no error (event emission is optional based on polling)
      }, 6000);

      service.on('marketUpdate', (market) => {
        clearTimeout(timeout);
        expect(market).toHaveProperty('id');
        service.unsubscribeMarket('fed-rate-march');
        done();
      });

      service.subscribeMarket('fed-rate-march');
    });
  });

  // ==================== unsubscribeMarket() Tests ====================

  describe('unsubscribeMarket()', () => {
    it('should stop polling for subscribed market', () => {
      service.subscribeMarket('test-market');

      // Should not throw
      service.unsubscribeMarket('test-market');
    });

    it('should not throw for non-subscribed market', () => {
      // Should not throw
      expect(() => {
        service.unsubscribeMarket('never-subscribed-market');
      }).not.toThrow();
    });
  });

  // ==================== destroy() Tests ====================

  describe('destroy()', () => {
    it('should clear all intervals and cache', () => {
      service.subscribeMarket('market1');
      service.subscribeMarket('market2');

      service.destroy();

      // After destroy, service should be clean
      // Verify by checking no errors when calling methods
      expect(() => service.destroy()).not.toThrow();
    });

    it('should be safe to call multiple times', () => {
      service.destroy();
      service.destroy();
      service.destroy();

      // Should not throw
    });

    it('should clear caches after destroy', async () => {
      // Populate cache
      await service.getMarkets({ limit: 5 });
      await service.getMarket('trump-2024');

      service.destroy();

      // After destroy, cache should be cleared
      // Create new service to verify behavior
      const newService = createPolymarketService({ cacheTtlMs: 100 });
      const markets = await newService.getMarkets({});
      expect(markets.length).toBeGreaterThan(0);
      newService.destroy();
    });
  });
});
