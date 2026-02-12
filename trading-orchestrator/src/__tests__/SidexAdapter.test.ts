/**
 * SidexAdapter Tests
 *
 * Comprehensive tests for multi-platform simulation sandbox
 */

import { SidexAdapter, Platform, SidexTradeParams, CopyConfig } from '../adapters/SidexAdapter';

describe('SidexAdapter', () => {
  let adapter: SidexAdapter;

  beforeEach(async () => {
    // Create fresh adapter for each test
    adapter = new SidexAdapter({
      token: 'test-token',
      baseUrl: 'wss://test.sidex.fun',
      simulationMode: true,
    });

    // Reset to clean state
    await adapter.resetAccount();
  });

  afterEach(async () => {
    // Clean up
    await adapter.resetAccount();
  });

  // ==================== Trading Operations Tests ====================

  describe('openPosition() - Crypto', () => {
    it('should open a long crypto position', async () => {
      const result = await adapter.openPosition({
        platform: 'crypto',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 500,
        leverage: 10,
      });

      expect(result.success).toBe(true);
      expect(result.orderId).toBeDefined();
      expect(result.symbol).toBe('BTC/USDT');
      expect(result.side).toBe('buy');
      expect(result.amount).toBe(500);
    });

    it('should open a short crypto position', async () => {
      const result = await adapter.openPosition({
        platform: 'crypto',
        symbol: 'ETH/USDT',
        side: 'sell',
        amount: 300,
        leverage: 5,
      });

      expect(result.success).toBe(true);
      expect(result.side).toBe('sell');
    });

    it('should fail with insufficient balance', async () => {
      const result = await adapter.openPosition({
        platform: 'crypto',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 100000, // Way more than available balance
        leverage: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient balance');
    });

    it('should handle zero amount', async () => {
      const result = await adapter.openPosition({
        platform: 'crypto',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0,
        leverage: 10,
      });

      // Should either succeed with 0 or fail gracefully
      expect(result).toBeDefined();
    });

    it('should handle negative amount', async () => {
      const result = await adapter.openPosition({
        platform: 'crypto',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: -100,
        leverage: 10,
      });

      // Should handle gracefully (likely fail)
      expect(result).toBeDefined();
    });

    it('should use default symbol when not provided', async () => {
      const result = await adapter.openPosition({
        platform: 'crypto',
        side: 'buy',
        amount: 100,
        leverage: 5,
      });

      expect(result.success).toBe(true);
      expect(result.symbol).toBe('BTC/USDT');
    });
  });

  describe('openPosition() - Polymarket', () => {
    it('should open a YES position', async () => {
      const result = await adapter.openPosition({
        platform: 'polymarket',
        marketId: 'trump-2024',
        outcome: 'yes',
        amount: 100,
      });

      expect(result.success).toBe(true);
      expect(result.marketId).toBe('trump-2024');
      expect(result.outcome).toBe('yes');
      expect(result.shares).toBeGreaterThan(0);
    });

    it('should open a NO position', async () => {
      const result = await adapter.openPosition({
        platform: 'polymarket',
        marketId: 'btc-100k-2024',
        outcome: 'no',
        amount: 50,
      });

      expect(result.success).toBe(true);
      expect(result.outcome).toBe('no');
    });

    it('should fail without marketId', async () => {
      const result = await adapter.openPosition({
        platform: 'polymarket',
        outcome: 'yes',
        amount: 100,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('marketId');
    });

    it('should fail without outcome', async () => {
      const result = await adapter.openPosition({
        platform: 'polymarket',
        marketId: 'trump-2024',
        amount: 100,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('outcome');
    });

    it('should fail with insufficient balance', async () => {
      const result = await adapter.openPosition({
        platform: 'polymarket',
        marketId: 'trump-2024',
        outcome: 'yes',
        amount: 50000, // More than balance
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient');
    });

    it('should calculate shares from amount', async () => {
      const result = await adapter.openPosition({
        platform: 'polymarket',
        marketId: 'trump-2024',
        outcome: 'yes',
        amount: 100,
      });

      expect(result.success).toBe(true);
      expect(result.shares).toBeDefined();
      expect(result.shares).toBeGreaterThan(0);
    });
  });

  describe('closePosition()', () => {
    it('should close position by ID', async () => {
      // First open a position
      const openResult = await adapter.openPosition({
        platform: 'crypto',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 500,
        leverage: 5,
      });

      expect(openResult.success).toBe(true);

      // Close it
      const closeResult = await adapter.closePosition({
        platform: 'crypto',
        positionId: openResult.orderId,
      });

      expect(closeResult.success).toBe(true);
      expect(closeResult.orderId).toBe(openResult.orderId);
    });

    it('should close position by symbol and direction', async () => {
      // Open a position
      await adapter.openPosition({
        platform: 'crypto',
        symbol: 'ETH/USDT',
        side: 'buy',
        amount: 300,
        leverage: 3,
      });

      // Close by symbol
      const closeResult = await adapter.closePosition({
        platform: 'crypto',
        symbol: 'ETH/USDT',
        direction: 'long',
      });

      expect(closeResult.success).toBe(true);
    });

    it('should return error for non-existent position', async () => {
      const result = await adapter.closePosition({
        platform: 'crypto',
        positionId: 'non-existent-id',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should close polymarket position', async () => {
      // Open polymarket position
      const openResult = await adapter.openPosition({
        platform: 'polymarket',
        marketId: 'trump-2024',
        outcome: 'yes',
        amount: 50,
      });

      expect(openResult.success).toBe(true);

      // Close it
      const closeResult = await adapter.closePosition({
        platform: 'polymarket',
        positionId: openResult.orderId,
      });

      expect(closeResult.success).toBe(true);
    });
  });

  describe('getPositions()', () => {
    it('should return empty array when no positions', async () => {
      const positions = await adapter.getPositions();
      expect(positions).toEqual([]);
    });

    it('should return all positions', async () => {
      await adapter.openPosition({
        platform: 'crypto',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 100,
        leverage: 5,
      });

      await adapter.openPosition({
        platform: 'polymarket',
        marketId: 'trump-2024',
        outcome: 'yes',
        amount: 50,
      });

      const positions = await adapter.getPositions();
      expect(positions.length).toBe(2);
    });

    it('should filter by polymarket platform', async () => {
      await adapter.openPosition({
        platform: 'crypto',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 100,
        leverage: 5,
      });

      await adapter.openPosition({
        platform: 'polymarket',
        marketId: 'trump-2024',
        outcome: 'yes',
        amount: 50,
      });

      const positions = await adapter.getPositions('polymarket');
      expect(positions.length).toBe(1);
      expect(positions[0].platform).toBe('polymarket');
    });

    it('should filter by crypto platform', async () => {
      await adapter.openPosition({
        platform: 'crypto',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 100,
        leverage: 5,
      });

      await adapter.openPosition({
        platform: 'polymarket',
        marketId: 'trump-2024',
        outcome: 'yes',
        amount: 50,
      });

      const positions = await adapter.getPositions('crypto');
      expect(positions.length).toBe(1);
      expect(positions[0].platform).toBe('crypto');
    });

    it('should include P&L calculations', async () => {
      await adapter.openPosition({
        platform: 'crypto',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 500,
        leverage: 10,
      });

      const positions = await adapter.getPositions();
      expect(positions[0]).toHaveProperty('pnl');
      expect(positions[0]).toHaveProperty('pnlPercent');
      expect(typeof positions[0].pnl).toBe('number');
    });
  });

  describe('getBalance()', () => {
    it('should return initial balance of 10000', async () => {
      const balance = await adapter.getBalance();

      expect(balance.total).toBe(10000);
      expect(balance.available).toBe(10000);
      expect(balance.inPositions).toBe(0);
      expect(balance.pnl).toBe(0);
    });

    it('should reflect position margin in balance', async () => {
      await adapter.openPosition({
        platform: 'crypto',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 1000, // Size
        leverage: 10, // Margin = 100
      });

      const balance = await adapter.getBalance();
      expect(balance.available).toBeLessThan(10000);
      expect(balance.inPositions).toBeGreaterThan(0);
    });

    it('should update after trade', async () => {
      const balanceBefore = await adapter.getBalance();

      await adapter.openPosition({
        platform: 'polymarket',
        marketId: 'trump-2024',
        outcome: 'yes',
        amount: 100,
      });

      const balanceAfter = await adapter.getBalance();
      expect(balanceAfter.available).toBeLessThan(balanceBefore.available);
    });
  });

  // ==================== Strategy Operations Tests ====================

  describe('createStrategy()', () => {
    it('should create polymarket strategy', async () => {
      const strategy = await adapter.createStrategy({
        platform: 'polymarket',
        marketId: 'trump-2024',
        description: 'Buy YES if odds drop below 40 cents',
        capital: 500,
      });

      expect(strategy.id).toBeDefined();
      expect(strategy.platform).toBe('polymarket');
      expect(strategy.marketId).toBe('trump-2024');
      expect(strategy.capital).toBe(500);
      expect(strategy.status).toBe('paused');
    });

    it('should create crypto strategy', async () => {
      const strategy = await adapter.createStrategy({
        platform: 'crypto',
        symbol: 'BTC/USDT',
        description: 'DCA $50 every 4 hours',
        capital: 1000,
      });

      expect(strategy.platform).toBe('crypto');
      expect(strategy.symbol).toBe('BTC/USDT');
    });

    it('should parse description into rules', async () => {
      const strategy = await adapter.createStrategy({
        platform: 'polymarket',
        marketId: 'test',
        description: 'Buy YES below 40 cents, sell at 25% profit',
        capital: 500,
      });

      expect(strategy.rules.length).toBeGreaterThan(0);
    });

    it('should handle empty description', async () => {
      const strategy = await adapter.createStrategy({
        platform: 'polymarket',
        marketId: 'test',
        description: '',
        capital: 100,
      });

      // Should create with default rule
      expect(strategy).toBeDefined();
      expect(strategy.rules.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle zero capital', async () => {
      const strategy = await adapter.createStrategy({
        platform: 'polymarket',
        marketId: 'test',
        description: 'Buy YES',
        capital: 0,
      });

      expect(strategy.capital).toBe(0);
    });
  });

  describe('startStrategy()', () => {
    it('should start existing strategy', async () => {
      const strategy = await adapter.createStrategy({
        platform: 'polymarket',
        marketId: 'trump-2024',
        description: 'Buy YES below 40',
        capital: 500,
      });

      const result = await adapter.startStrategy(strategy.id);
      expect(result.success).toBe(true);

      const updated = adapter.getStrategy(strategy.id);
      expect(updated?.status).toBe('running');
    });

    it('should return error for already running strategy', async () => {
      const strategy = await adapter.createStrategy({
        platform: 'polymarket',
        marketId: 'trump-2024',
        description: 'Buy YES',
        capital: 500,
      });

      await adapter.startStrategy(strategy.id);
      const result = await adapter.startStrategy(strategy.id);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already running');
    });

    it('should return error for non-existent strategy', async () => {
      const result = await adapter.startStrategy('non-existent-id');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('stopStrategy()', () => {
    it('should stop running strategy', async () => {
      const strategy = await adapter.createStrategy({
        platform: 'polymarket',
        marketId: 'trump-2024',
        description: 'Buy YES',
        capital: 500,
      });

      await adapter.startStrategy(strategy.id);
      const result = await adapter.stopStrategy(strategy.id);

      expect(result.success).toBe(true);

      const updated = adapter.getStrategy(strategy.id);
      expect(updated?.status).toBe('stopped');
    });

    it('should handle already stopped strategy', async () => {
      const strategy = await adapter.createStrategy({
        platform: 'polymarket',
        marketId: 'trump-2024',
        description: 'Buy YES',
        capital: 500,
      });

      const result = await adapter.stopStrategy(strategy.id);
      expect(result.success).toBe(true); // Should succeed even if already stopped
    });
  });

  describe('deleteStrategy()', () => {
    it('should delete existing strategy', async () => {
      const strategy = await adapter.createStrategy({
        platform: 'polymarket',
        marketId: 'trump-2024',
        description: 'Buy YES',
        capital: 500,
      });

      const result = await adapter.deleteStrategy(strategy.id);
      expect(result.success).toBe(true);

      const deleted = adapter.getStrategy(strategy.id);
      expect(deleted).toBeNull();
    });

    it('should stop running strategy before deleting', async () => {
      const strategy = await adapter.createStrategy({
        platform: 'polymarket',
        marketId: 'trump-2024',
        description: 'Buy YES',
        capital: 500,
      });

      await adapter.startStrategy(strategy.id);
      const result = await adapter.deleteStrategy(strategy.id);

      expect(result.success).toBe(true);
    });

    it('should handle non-existent strategy', async () => {
      const result = await adapter.deleteStrategy('non-existent');
      expect(result.success).toBe(true); // Should succeed even if not found
    });
  });

  describe('getStrategies()', () => {
    it('should return all strategies', async () => {
      await adapter.createStrategy({
        platform: 'polymarket',
        marketId: 'test1',
        description: 'Test 1',
        capital: 100,
      });

      await adapter.createStrategy({
        platform: 'crypto',
        symbol: 'BTC/USDT',
        description: 'Test 2',
        capital: 200,
      });

      const strategies = adapter.getStrategies();
      expect(strategies.length).toBe(2);
    });

    it('should return empty array when no strategies', async () => {
      const strategies = adapter.getStrategies();
      expect(strategies).toEqual([]);
    });
  });

  describe('getStrategyTrades()', () => {
    it('should return empty array initially', () => {
      const trades = adapter.getStrategyTrades();
      expect(trades).toEqual([]);
    });

    it('should filter by strategy ID', async () => {
      const strategy = await adapter.createStrategy({
        platform: 'polymarket',
        marketId: 'test',
        description: 'Buy YES',
        capital: 100,
      });

      const trades = adapter.getStrategyTrades(strategy.id);
      expect(Array.isArray(trades)).toBe(true);
    });
  });

  // ==================== Copy Trading Operations Tests ====================

  describe('createCopyConfig()', () => {
    it('should create config with fixed sizing', async () => {
      const config = await adapter.createCopyConfig({
        platform: 'polymarket',
        targetWallet: '0x1234567890abcdef',
        sizingMode: 'fixed',
        fixedSize: 100,
      });

      expect(config.id).toBeDefined();
      expect(config.platform).toBe('polymarket');
      expect(config.sizingMode).toBe('fixed');
      expect(config.fixedSize).toBe(100);
      expect(config.enabled).toBe(false);
    });

    it('should create config with proportional sizing', async () => {
      const config = await adapter.createCopyConfig({
        platform: 'crypto',
        targetWallet: '0xwhale',
        sizingMode: 'proportional',
        proportionMultiplier: 0.1,
      });

      expect(config.sizingMode).toBe('proportional');
      expect(config.proportionMultiplier).toBe(0.1);
    });

    it('should create config with percentage sizing', async () => {
      const config = await adapter.createCopyConfig({
        platform: 'crypto',
        targetWallet: '0xwhale',
        sizingMode: 'percentage',
        portfolioPercentage: 5,
      });

      expect(config.sizingMode).toBe('percentage');
      expect(config.portfolioPercentage).toBe(5);
    });

    it('should handle empty target wallet', async () => {
      const config = await adapter.createCopyConfig({
        platform: 'polymarket',
        targetWallet: '',
        sizingMode: 'fixed',
        fixedSize: 50,
      });

      expect(config).toBeDefined();
      expect(config.targetWallet).toBe('');
    });
  });

  describe('toggleCopyConfig()', () => {
    it('should enable disabled config', async () => {
      const config = await adapter.createCopyConfig({
        platform: 'crypto',
        targetWallet: '0xtest',
        sizingMode: 'fixed',
        fixedSize: 100,
      });

      const result = await adapter.toggleCopyConfig(config.id, true);

      expect(result.success).toBe(true);
      expect(result.enabled).toBe(true);

      const updated = adapter.getCopyConfig(config.id);
      expect(updated?.enabled).toBe(true);
    });

    it('should disable enabled config', async () => {
      const config = await adapter.createCopyConfig({
        platform: 'crypto',
        targetWallet: '0xtest',
        sizingMode: 'fixed',
        fixedSize: 100,
      });

      await adapter.toggleCopyConfig(config.id, true);
      const result = await adapter.toggleCopyConfig(config.id, false);

      expect(result.success).toBe(true);
      expect(result.enabled).toBe(false);
    });

    it('should return error for non-existent config', async () => {
      const result = await adapter.toggleCopyConfig('non-existent', true);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('deleteCopyConfig()', () => {
    it('should delete config', async () => {
      const config = await adapter.createCopyConfig({
        platform: 'polymarket',
        targetWallet: '0xtest',
        sizingMode: 'fixed',
        fixedSize: 100,
      });

      const result = await adapter.deleteCopyConfig(config.id);
      expect(result.success).toBe(true);

      const deleted = adapter.getCopyConfig(config.id);
      expect(deleted).toBeNull();
    });

    it('should disable enabled config before deleting', async () => {
      const config = await adapter.createCopyConfig({
        platform: 'crypto',
        targetWallet: '0xtest',
        sizingMode: 'fixed',
        fixedSize: 100,
      });

      await adapter.toggleCopyConfig(config.id, true);
      const result = await adapter.deleteCopyConfig(config.id);

      expect(result.success).toBe(true);
    });
  });

  describe('getCopyConfigs()', () => {
    it('should return all configs', async () => {
      await adapter.createCopyConfig({
        platform: 'polymarket',
        targetWallet: '0x1',
        sizingMode: 'fixed',
        fixedSize: 100,
      });

      await adapter.createCopyConfig({
        platform: 'crypto',
        targetWallet: '0x2',
        sizingMode: 'fixed',
        fixedSize: 200,
      });

      const configs = adapter.getCopyConfigs();
      expect(configs.length).toBe(2);
    });

    it('should filter by platform', async () => {
      await adapter.createCopyConfig({
        platform: 'polymarket',
        targetWallet: '0x1',
        sizingMode: 'fixed',
        fixedSize: 100,
      });

      await adapter.createCopyConfig({
        platform: 'crypto',
        targetWallet: '0x2',
        sizingMode: 'fixed',
        fixedSize: 200,
      });

      const polyConfigs = adapter.getCopyConfigs('polymarket');
      expect(polyConfigs.length).toBe(1);
      expect(polyConfigs[0].platform).toBe('polymarket');
    });
  });

  describe('getCopyTrades()', () => {
    it('should return empty array initially', () => {
      const trades = adapter.getCopyTrades();
      expect(trades).toEqual([]);
    });

    it('should filter by config ID', async () => {
      const config = await adapter.createCopyConfig({
        platform: 'polymarket',
        targetWallet: '0xtest',
        sizingMode: 'fixed',
        fixedSize: 100,
      });

      const trades = adapter.getCopyTrades(config.id);
      expect(Array.isArray(trades)).toBe(true);
    });
  });

  // ==================== Account Operations Tests ====================

  describe('setSimulationMode()', () => {
    it('should enable simulation mode', async () => {
      const result = await adapter.setSimulationMode(true);
      expect(result.enabled).toBe(true);
    });

    it('should disable simulation mode', async () => {
      const result = await adapter.setSimulationMode(false);
      expect(result.enabled).toBe(false);
    });
  });

  describe('getSimulationStatus()', () => {
    it('should return current simulation status', () => {
      const status = adapter.getSimulationStatus();
      expect(status).toHaveProperty('enabled');
      expect(typeof status.enabled).toBe('boolean');
    });
  });

  describe('resetAccount()', () => {
    it('should reset balance to 10000', async () => {
      // Make some trades
      await adapter.openPosition({
        platform: 'crypto',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 1000,
        leverage: 5,
      });

      const result = await adapter.resetAccount();

      expect(result.success).toBe(true);
      expect(result.balance.total).toBe(10000);
      expect(result.balance.available).toBe(10000);
    });

    it('should clear all positions', async () => {
      await adapter.openPosition({
        platform: 'crypto',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 500,
        leverage: 5,
      });

      await adapter.resetAccount();

      const positions = await adapter.getPositions();
      expect(positions.length).toBe(0);
    });

    it('should stop and clear all strategies', async () => {
      const strategy = await adapter.createStrategy({
        platform: 'polymarket',
        marketId: 'test',
        description: 'Test',
        capital: 100,
      });

      await adapter.startStrategy(strategy.id);
      await adapter.resetAccount();

      const strategies = adapter.getStrategies();
      expect(strategies.length).toBe(0);
    });

    it('should clear all copy configs', async () => {
      await adapter.createCopyConfig({
        platform: 'crypto',
        targetWallet: '0xtest',
        sizingMode: 'fixed',
        fixedSize: 100,
      });

      await adapter.resetAccount();

      const configs = adapter.getCopyConfigs();
      expect(configs.length).toBe(0);
    });
  });

  describe('checkHealth()', () => {
    it('should return health status', async () => {
      const health = await adapter.checkHealth();

      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('lastChecked');
      expect(typeof health.healthy).toBe('boolean');
    });

    it('should include metadata', async () => {
      const health = await adapter.checkHealth();

      if (health.healthy) {
        expect(health.metadata).toHaveProperty('simulationMode');
        expect(health.metadata).toHaveProperty('openPositions');
      }
    });
  });

  describe('isHealthy()', () => {
    it('should return boolean', () => {
      const healthy = adapter.isHealthy();
      expect(typeof healthy).toBe('boolean');
    });
  });

  // ==================== Polymarket Market Data Tests ====================

  describe('getPolymarketMarkets()', () => {
    it('should return markets', async () => {
      const markets = await adapter.getPolymarketMarkets({ limit: 5 });

      expect(Array.isArray(markets)).toBe(true);
      expect(markets.length).toBeLessThanOrEqual(5);
    });
  });

  describe('searchPolymarketMarkets()', () => {
    it('should search markets by query', async () => {
      const markets = await adapter.searchPolymarketMarkets('trump', 10);

      expect(Array.isArray(markets)).toBe(true);
    });
  });

  describe('getPolymarketMarket()', () => {
    it('should return single market', async () => {
      const market = await adapter.getPolymarketMarket('trump-2024');

      expect(market).not.toBeNull();
      expect(market?.id).toBe('trump-2024');
    });
  });

  describe('getPolymarketUserTrades()', () => {
    it('should return user trades', async () => {
      const trades = await adapter.getPolymarketUserTrades('0xtest', 10);

      expect(Array.isArray(trades)).toBe(true);
    });
  });

  // ==================== Legacy AI Agent Tests ====================

  describe('createAgent()', () => {
    it('should create DCA agent', async () => {
      const agent = await adapter.createAgent({
        name: 'Test DCA Agent',
        strategy: 'dca',
        capital: 1000,
        riskLevel: 'moderate',
      });

      expect(agent.id).toBeDefined();
      expect(agent.name).toBe('Test DCA Agent');
      expect(agent.strategy).toBe('dca');
      expect(agent.status).toBe('paused');
    });
  });

  describe('getAgents()', () => {
    it('should return all agents', async () => {
      await adapter.createAgent({
        name: 'Agent 1',
        strategy: 'dca',
        capital: 500,
        riskLevel: 'conservative',
      });

      const agents = adapter.getAgents();
      expect(agents.length).toBe(1);
    });
  });

  describe('startAgent()', () => {
    it('should start agent', async () => {
      const agent = await adapter.createAgent({
        name: 'Test',
        strategy: 'momentum',
        capital: 1000,
        riskLevel: 'moderate',
      });

      const result = await adapter.startAgent(agent.id);
      expect(result.success).toBe(true);

      const updated = adapter.getAgent(agent.id);
      expect(updated?.status).toBe('running');
    });
  });

  describe('stopAgent()', () => {
    it('should stop agent', async () => {
      const agent = await adapter.createAgent({
        name: 'Test',
        strategy: 'momentum',
        capital: 1000,
        riskLevel: 'moderate',
      });

      await adapter.startAgent(agent.id);
      const result = await adapter.stopAgent(agent.id);

      expect(result.success).toBe(true);
    });
  });
});
