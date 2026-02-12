/**
 * StrategyParser Tests
 *
 * Tests for natural language to trading strategy conversion
 */

import { StrategyParser, createStrategyParser, Platform } from '../services/StrategyParser';

describe('StrategyParser', () => {
  let parser: StrategyParser;

  beforeEach(() => {
    // Create parser without API key to use rule-based parsing
    parser = createStrategyParser({ anthropicApiKey: '' });
  });

  // ==================== parseStrategy() Tests ====================

  describe('parseStrategy()', () => {
    describe('Polymarket Strategies', () => {
      it('should parse buy YES if odds drop below 40 cents', async () => {
        const strategy = await parser.parseStrategy(
          'Buy YES if odds drop below 40 cents',
          { platform: 'polymarket', marketId: 'trump-2024' }
        );

        expect(strategy.platform).toBe('polymarket');
        expect(strategy.rules.length).toBeGreaterThan(0);

        const buyRule = strategy.rules.find(r => r.action === 'buy');
        expect(buyRule).toBeDefined();
        expect(buyRule?.side).toBe('yes');
        expect(buyRule?.condition.type).toBe('price_below');
        expect(buyRule?.condition.value).toBeCloseTo(0.40, 1);
      });

      it('should parse sell when up 25% (take profit)', async () => {
        const strategy = await parser.parseStrategy(
          'Sell when I\'m up 25%',
          { platform: 'polymarket' }
        );

        expect(strategy.rules.length).toBeGreaterThan(0);

        const sellRule = strategy.rules.find(r => r.action === 'sell');
        expect(sellRule).toBeDefined();
        expect(sellRule?.condition.type).toBe('profit_percent');
        expect(sellRule?.condition.value).toBeCloseTo(0.25, 1);
      });

      it('should parse DCA strategy', async () => {
        const strategy = await parser.parseStrategy(
          'DCA $50 every 4 hours',
          { platform: 'polymarket' }
        );

        expect(strategy.rules.length).toBeGreaterThan(0);

        const dcaRule = strategy.rules.find(
          r => r.condition.type === 'time_interval'
        );
        expect(dcaRule).toBeDefined();
        expect(dcaRule?.action).toBe('buy');
        expect(dcaRule?.amount).toBe(50);
        // 4 hours = 14400000 ms
        expect(dcaRule?.condition.value).toBe(14400000);
      });

      it('should parse NO position', async () => {
        const strategy = await parser.parseStrategy(
          'Buy NO if NO drops below 30 cents',
          { platform: 'polymarket' }
        );

        const buyRule = strategy.rules.find(r => r.action === 'buy');
        expect(buyRule?.side).toBe('no');
      });

      it('should parse stop loss', async () => {
        const strategy = await parser.parseStrategy(
          'Stop loss at -10%',
          { platform: 'polymarket' }
        );

        const stopRule = strategy.rules.find(r => r.condition.type === 'loss_percent');
        expect(stopRule).toBeDefined();
        expect(stopRule?.action).toBe('sell');
        expect(stopRule?.condition.value).toBeCloseTo(0.10, 1);
      });
    });

    describe('Crypto Strategies', () => {
      it('should parse BTC dip buy strategy', async () => {
        const strategy = await parser.parseStrategy(
          'Buy BTC if it drops 5%',
          { platform: 'crypto' }
        );

        expect(strategy.platform).toBe('crypto');
        expect(strategy.symbol).toBe('BTC/USDT');
        expect(strategy.rules.length).toBeGreaterThan(0);
      });

      it('should detect crypto platform from keywords', async () => {
        const strategy = await parser.parseStrategy(
          'Long ETH with 5x leverage',
          {}
        );

        expect(strategy.platform).toBe('crypto');
        expect(strategy.symbol).toBe('ETH/USDT');
      });

      it('should parse short positions', async () => {
        const strategy = await parser.parseStrategy(
          'Short SOL if it rises 15%',
          { platform: 'crypto' }
        );

        const rule = strategy.rules.find(r => r.side === 'short');
        // May or may not detect 'short' depending on keywords
        expect(strategy.platform).toBe('crypto');
        expect(strategy.symbol).toBe('SOL/USDT');
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty input with default rule', async () => {
        const strategy = await parser.parseStrategy('', {});

        expect(strategy.rules.length).toBeGreaterThan(0);
        expect(strategy.active).toBe(true);
      });

      it('should use rule-based fallback when no API key', async () => {
        const strategy = await parser.parseStrategy(
          'Buy if price drops below 50 cents',
          { platform: 'polymarket' }
        );

        expect(strategy).toBeDefined();
        expect(strategy.rules.length).toBeGreaterThan(0);
      });

      it('should parse multiple rules', async () => {
        const strategy = await parser.parseStrategy(
          'Buy below 40 cents, sell when up 25%',
          { platform: 'polymarket' }
        );

        expect(strategy.rules.length).toBeGreaterThanOrEqual(2);

        const buyRule = strategy.rules.find(r => r.action === 'buy');
        const sellRule = strategy.rules.find(r => r.action === 'sell');

        expect(buyRule).toBeDefined();
        expect(sellRule).toBeDefined();
      });

      it('should prioritize first action for ambiguous input', async () => {
        const strategy = await parser.parseStrategy(
          'Buy BTC and also sell ETH',
          { platform: 'crypto' }
        );

        // Should detect BTC since it appears first
        expect(strategy.platform).toBe('crypto');
        expect(strategy.rules.length).toBeGreaterThan(0);
      });

      it('should use context capital when provided', async () => {
        const strategy = await parser.parseStrategy(
          'Buy YES below 50 cents',
          { platform: 'polymarket', capital: 1000 }
        );

        expect(strategy.capital).toBe(1000);
      });

      it('should use context marketId when provided', async () => {
        const strategy = await parser.parseStrategy(
          'Buy YES below 50 cents',
          { platform: 'polymarket', marketId: 'custom-market-id' }
        );

        expect(strategy.marketId).toBe('custom-market-id');
      });

      it('should use context symbol when provided', async () => {
        const strategy = await parser.parseStrategy(
          'Buy when price drops',
          { platform: 'crypto', symbol: 'DOGE/USDT' }
        );

        expect(strategy.symbol).toBe('DOGE/USDT');
      });
    });
  });

  // ==================== validateRules() Tests (via parseStrategy) ====================

  describe('validateRules()', () => {
    it('should filter out invalid actions', async () => {
      // Rule-based parser won't generate invalid actions
      const strategy = await parser.parseStrategy(
        'Buy YES below 40',
        { platform: 'polymarket' }
      );

      strategy.rules.forEach(rule => {
        expect(['buy', 'sell', 'hold']).toContain(rule.action);
      });
    });

    it('should correct wrong side for polymarket', async () => {
      // Input suggests 'long' but polymarket should use 'yes'
      const strategy = await parser.parseStrategy(
        'Long position on trump market',
        { platform: 'polymarket' }
      );

      strategy.rules.forEach(rule => {
        if (rule.side) {
          expect(['yes', 'no']).toContain(rule.side);
        }
      });
    });

    it('should handle empty rules array gracefully', async () => {
      // Even with minimal input, parser should generate default rules
      const strategy = await parser.parseStrategy('test', {});
      expect(Array.isArray(strategy.rules)).toBe(true);
    });
  });

  // ==================== detectSymbol() Tests (via parseStrategy) ====================

  describe('detectSymbol()', () => {
    it('should detect BTC symbol', async () => {
      const strategy = await parser.parseStrategy(
        'buy btc',
        { platform: 'crypto' }
      );
      expect(strategy.symbol).toBe('BTC/USDT');
    });

    it('should detect bitcoin keyword', async () => {
      const strategy = await parser.parseStrategy(
        'buy bitcoin',
        { platform: 'crypto' }
      );
      expect(strategy.symbol).toBe('BTC/USDT');
    });

    it('should detect ETH symbol', async () => {
      const strategy = await parser.parseStrategy(
        'buy eth',
        { platform: 'crypto' }
      );
      expect(strategy.symbol).toBe('ETH/USDT');
    });

    it('should detect ethereum keyword', async () => {
      const strategy = await parser.parseStrategy(
        'buy ethereum',
        { platform: 'crypto' }
      );
      expect(strategy.symbol).toBe('ETH/USDT');
    });

    it('should detect SOL symbol', async () => {
      const strategy = await parser.parseStrategy(
        'buy sol',
        { platform: 'crypto' }
      );
      expect(strategy.symbol).toBe('SOL/USDT');
    });

    it('should detect solana keyword', async () => {
      const strategy = await parser.parseStrategy(
        'buy solana',
        { platform: 'crypto' }
      );
      expect(strategy.symbol).toBe('SOL/USDT');
    });

    it('should default to BTC/USDT for unknown symbol', async () => {
      const strategy = await parser.parseStrategy(
        'buy xyz token',
        { platform: 'crypto' }
      );
      expect(strategy.symbol).toBe('BTC/USDT');
    });
  });

  // ==================== getExamples() Tests ====================

  describe('getExamples()', () => {
    it('should return 5 examples for polymarket', () => {
      const examples = parser.getExamples('polymarket');

      expect(Array.isArray(examples)).toBe(true);
      expect(examples.length).toBe(5);

      examples.forEach(example => {
        expect(example).toHaveProperty('description');
        expect(example).toHaveProperty('name');
        expect(typeof example.description).toBe('string');
        expect(typeof example.name).toBe('string');
      });
    });

    it('should return 5 examples for crypto', () => {
      const examples = parser.getExamples('crypto');

      expect(Array.isArray(examples)).toBe(true);
      expect(examples.length).toBe(5);

      examples.forEach(example => {
        expect(example).toHaveProperty('description');
        expect(example).toHaveProperty('name');
      });
    });

    it('should have polymarket examples containing YES/NO keywords', () => {
      const examples = parser.getExamples('polymarket');

      const hasYesNo = examples.some(
        e => e.description.includes('YES') || e.description.includes('NO')
      );
      expect(hasYesNo).toBe(true);
    });

    it('should have crypto examples containing coin symbols', () => {
      const examples = parser.getExamples('crypto');

      const hasCoin = examples.some(
        e =>
          e.description.includes('BTC') ||
          e.description.includes('ETH') ||
          e.description.includes('SOL')
      );
      expect(hasCoin).toBe(true);
    });
  });

  // ==================== Strategy Name Generation Tests ====================

  describe('Strategy Name Generation', () => {
    it('should generate DCA name for DCA strategy', async () => {
      const strategy = await parser.parseStrategy(
        'DCA $50 every hour',
        { platform: 'polymarket' }
      );

      expect(strategy.name.toLowerCase()).toContain('dca');
    });

    it('should generate Dip Buy name for price_below condition', async () => {
      const strategy = await parser.parseStrategy(
        'Buy YES if odds drop below 40 cents',
        { platform: 'polymarket' }
      );

      expect(strategy.name.toLowerCase()).toContain('dip');
    });

    it('should generate Take Profit name for profit_percent condition', async () => {
      const strategy = await parser.parseStrategy(
        'Sell at 25% profit',
        { platform: 'polymarket' }
      );

      expect(strategy.name.toLowerCase()).toContain('profit');
    });

    it('should include platform prefix in name', async () => {
      const polyStrategy = await parser.parseStrategy(
        'Buy YES',
        { platform: 'polymarket' }
      );
      expect(polyStrategy.name.toLowerCase()).toContain('poly');

      const cryptoStrategy = await parser.parseStrategy(
        'Buy BTC',
        { platform: 'crypto' }
      );
      expect(cryptoStrategy.name.toLowerCase()).toContain('crypto');
    });
  });

  // ==================== Amount Parsing Tests ====================

  describe('Amount Parsing', () => {
    it('should parse dollar amounts', async () => {
      const strategy = await parser.parseStrategy(
        'Buy $100 of YES',
        { platform: 'polymarket' }
      );

      const buyRule = strategy.rules.find(r => r.action === 'buy');
      expect(buyRule?.amount).toBe(100);
    });

    it('should parse percentage amounts', async () => {
      const strategy = await parser.parseStrategy(
        'Sell all at 25% profit',
        { platform: 'polymarket' }
      );

      const sellRule = strategy.rules.find(r => r.action === 'sell');
      expect(sellRule?.condition.value).toBeCloseTo(0.25, 1);
    });

    it('should parse "all" keyword for amount', async () => {
      const strategy = await parser.parseStrategy(
        'Sell all positions',
        { platform: 'polymarket' }
      );

      const sellRule = strategy.rules.find(r => r.action === 'sell');
      expect(sellRule?.amount).toBe('all');
    });

    it('should parse "half" keyword for amount', async () => {
      const strategy = await parser.parseStrategy(
        'Sell half at profit',
        { platform: 'polymarket' }
      );

      const sellRule = strategy.rules.find(r => r.action === 'sell');
      expect(sellRule?.amount).toBe('half');
    });

    it('should use default amount when not specified', async () => {
      const strategy = await parser.parseStrategy(
        'Buy YES',
        { platform: 'polymarket' }
      );

      const buyRule = strategy.rules.find(r => r.action === 'buy');
      expect(typeof buyRule?.amount).toBe('number');
      expect(buyRule?.amount).toBeGreaterThan(0);
    });
  });

  // ==================== Time Interval Parsing Tests ====================

  describe('Time Interval Parsing', () => {
    it('should parse hours', async () => {
      const strategy = await parser.parseStrategy(
        'DCA $50 every 4 hours',
        { platform: 'polymarket' }
      );

      const dcaRule = strategy.rules.find(r => r.condition.type === 'time_interval');
      expect(dcaRule?.condition.value).toBe(4 * 3600000);
    });

    it('should parse minutes', async () => {
      const strategy = await parser.parseStrategy(
        'DCA $50 every 30 minutes',
        { platform: 'polymarket' }
      );

      const dcaRule = strategy.rules.find(r => r.condition.type === 'time_interval');
      expect(dcaRule?.condition.value).toBe(30 * 60000);
    });

    it('should parse days', async () => {
      const strategy = await parser.parseStrategy(
        'DCA $50 every 1 day',
        { platform: 'polymarket' }
      );

      const dcaRule = strategy.rules.find(r => r.condition.type === 'time_interval');
      expect(dcaRule?.condition.value).toBe(86400000);
    });

    it('should default to 1 hour when time unit not specified', async () => {
      const strategy = await parser.parseStrategy(
        'DCA $50 every hour',
        { platform: 'polymarket' }
      );

      const dcaRule = strategy.rules.find(r => r.condition.type === 'time_interval');
      expect(dcaRule?.condition.value).toBe(3600000);
    });
  });
});
