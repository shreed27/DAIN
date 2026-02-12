/**
 * StrategyParser - Natural language to trading strategy conversion using Claude
 *
 * Features:
 * - Parse user descriptions into structured strategy rules
 * - Support both Polymarket (odds-based) and Crypto (price-based) conditions
 * - Validate strategy rules
 * - Generate default parameters for incomplete descriptions
 */

import Anthropic from '@anthropic-ai/sdk';

// ==================== Types ====================

export type Platform = 'polymarket' | 'crypto';
export type StrategyAction = 'buy' | 'sell' | 'hold';
export type PolymarketSide = 'yes' | 'no';
export type CryptoSide = 'long' | 'short';

export type ConditionType =
  | 'price_below'      // Trigger when price drops below threshold
  | 'price_above'      // Trigger when price rises above threshold
  | 'profit_percent'   // Take profit at X% gain
  | 'loss_percent'     // Stop loss at X% loss
  | 'time_interval'    // DCA: execute every X milliseconds
  | 'volume_spike'     // Trigger on volume increase
  | 'position_size';   // Based on current position

export interface StrategyCondition {
  type: ConditionType;
  value: number;
  comparison?: 'gte' | 'lte' | 'eq';
}

export interface StrategyRule {
  action: StrategyAction;
  side?: PolymarketSide | CryptoSide;
  amount: number | 'all' | 'half';
  percentage?: number;  // For percentage-based sizing
  condition: StrategyCondition;
  priority?: number;    // Higher priority rules execute first
}

export interface ParsedStrategy {
  name: string;
  description: string;
  platform: Platform;
  marketId?: string;    // For Polymarket
  symbol?: string;      // For Crypto
  rules: StrategyRule[];
  capital: number;
  maxPositionSize?: number;
  active: boolean;
  createdAt: string;
}

export interface StrategyParserConfig {
  anthropicApiKey?: string;
  model?: string;
}

// ==================== Claude Prompt ====================

const STRATEGY_PARSER_PROMPT = `You are a trading strategy parser. Convert the user's natural language description into a structured JSON strategy.

IMPORTANT: Return ONLY valid JSON, no explanations or markdown.

Platform types:
- "polymarket": Prediction markets with YES/NO outcomes, prices 0.00-1.00 (odds/cents)
- "crypto": Cryptocurrency pairs like BTC/USDT with USD prices

For Polymarket:
- "odds" or "cents" or "price" refer to the 0-1 price (e.g., "40 cents" = 0.40)
- Side is "yes" or "no"
- "buy YES below 40" means buy YES shares when YES price < 0.40

For Crypto:
- Side is "long" or "short"
- Prices are in USD
- Support leverage specifications

Condition types:
- "price_below": Trigger when price drops below value
- "price_above": Trigger when price rises above value
- "profit_percent": Take profit at percentage gain (e.g., 0.25 = 25%)
- "loss_percent": Stop loss at percentage loss (e.g., 0.10 = 10%)
- "time_interval": DCA interval in milliseconds

Amount can be:
- A number (USD amount or shares)
- "all" for closing entire position
- "half" for half position

Example output for "Buy YES if odds drop below 40 cents, sell all when up 25%":
{
  "name": "Poly Dip Buy",
  "description": "Buy YES if odds drop below 40 cents, sell all when up 25%",
  "platform": "polymarket",
  "rules": [
    {
      "action": "buy",
      "side": "yes",
      "amount": 100,
      "condition": { "type": "price_below", "value": 0.40 }
    },
    {
      "action": "sell",
      "side": "yes",
      "amount": "all",
      "condition": { "type": "profit_percent", "value": 0.25 }
    }
  ],
  "capital": 500,
  "active": true
}

Example output for "DCA $50 into BTC every 4 hours":
{
  "name": "BTC DCA",
  "description": "DCA $50 into BTC every 4 hours",
  "platform": "crypto",
  "symbol": "BTC/USDT",
  "rules": [
    {
      "action": "buy",
      "side": "long",
      "amount": 50,
      "condition": { "type": "time_interval", "value": 14400000 }
    }
  ],
  "capital": 1000,
  "active": true
}

Now parse the following user input:`;

// ==================== Main Parser ====================

export class StrategyParser {
  private client: Anthropic | null = null;
  private model: string;

  constructor(config: StrategyParserConfig = {}) {
    const apiKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
    this.model = config.model || 'claude-3-5-haiku-20241022';
  }

  /**
   * Parse natural language strategy description
   */
  async parseStrategy(
    userInput: string,
    context?: {
      platform?: Platform;
      marketId?: string;
      symbol?: string;
      capital?: number;
    }
  ): Promise<ParsedStrategy> {
    // If no Claude client, use rule-based parsing
    if (!this.client) {
      console.log('[StrategyParser] No API key, using rule-based parsing');
      return this.parseWithRules(userInput, context);
    }

    try {
      // Build context string
      let contextStr = '';
      if (context?.platform) contextStr += `\nPlatform: ${context.platform}`;
      if (context?.marketId) contextStr += `\nMarket ID: ${context.marketId}`;
      if (context?.symbol) contextStr += `\nSymbol: ${context.symbol}`;
      if (context?.capital) contextStr += `\nCapital: $${context.capital}`;

      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `${STRATEGY_PARSER_PROMPT}

User input: "${userInput}"${contextStr}

Return ONLY the JSON object, no markdown or explanation.`
          }
        ]
      });

      // Extract JSON from response
      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
      const parsed = this.extractJson(responseText);

      if (!parsed) {
        console.warn('[StrategyParser] Failed to parse Claude response, using fallback');
        return this.parseWithRules(userInput, context);
      }

      // Validate and normalize the strategy
      return this.validateStrategy(parsed, context);
    } catch (error) {
      console.error('[StrategyParser] Claude API error:', error);
      return this.parseWithRules(userInput, context);
    }
  }

  /**
   * Extract JSON from Claude's response
   */
  private extractJson(text: string): Record<string, unknown> | null {
    try {
      // Try direct parse first
      return JSON.parse(text);
    } catch {
      // Try to find JSON in the text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  /**
   * Rule-based parsing fallback
   */
  private parseWithRules(
    userInput: string,
    context?: {
      platform?: Platform;
      marketId?: string;
      symbol?: string;
      capital?: number;
    }
  ): ParsedStrategy {
    const input = userInput.toLowerCase();
    const rules: StrategyRule[] = [];

    // Detect platform - respect context if explicitly provided
    let platform: Platform = context?.platform || 'polymarket';
    if (!context?.platform) {
      // Only auto-detect if context doesn't specify platform
      if (input.includes('btc') || input.includes('eth') || input.includes('sol') ||
          input.includes('crypto') || input.includes('long') || input.includes('short')) {
        platform = 'crypto';
      }
    }

    // Extract numbers
    const dollarAmounts = input.match(/\$(\d+(?:\.\d+)?)/g)?.map(m => parseFloat(m.slice(1))) || [];
    const percentages = input.match(/(\d+(?:\.\d+)?)\s*%/g)?.map(m => parseFloat(m) / 100) || [];
    const centValues = input.match(/(\d+)\s*(?:cents?|¢)/gi)?.map(m => parseInt(m) / 100) || [];
    const decimalValues = input.match(/(?:below|above|at)\s+(?:0\.)?(\d+)/g)?.map(m => {
      const num = m.match(/(\d+(?:\.\d+)?)/)?.[1];
      return num ? (parseFloat(num) > 1 ? parseFloat(num) / 100 : parseFloat(num)) : 0.5;
    }) || [];

    // Determine side
    const side = platform === 'polymarket'
      ? (input.includes('no') && !input.includes('yes') ? 'no' : 'yes')
      : (input.includes('short') ? 'short' : 'long');

    // Check for DCA strategy first (doesn't require explicit "buy")
    if (input.includes('dca') || (input.includes('every') && (input.includes('hour') || input.includes('minute') || input.includes('day')))) {
      // DCA strategy
      let intervalMs = 3600000; // Default 1 hour
      if (input.includes('hour')) {
        const hours = input.match(/(\d+)\s*hour/)?.[1];
        intervalMs = (hours ? parseInt(hours) : 1) * 3600000;
      } else if (input.includes('minute')) {
        const minutes = input.match(/(\d+)\s*minute/)?.[1];
        intervalMs = (minutes ? parseInt(minutes) : 30) * 60000;
      } else if (input.includes('day')) {
        const days = input.match(/(\d+)\s*day/)?.[1];
        intervalMs = (days ? parseInt(days) : 1) * 86400000;
      }

      rules.push({
        action: 'buy',
        side,
        amount: dollarAmounts[0] || 50,
        condition: {
          type: 'time_interval',
          value: intervalMs,
        },
      });
    }
    // Parse buy condition
    else if (input.includes('buy')) {
      const threshold = centValues[0] || decimalValues[0] || (platform === 'polymarket' ? 0.40 : undefined);
      if (input.includes('below') || input.includes('drop')) {
        rules.push({
          action: 'buy',
          side,
          amount: dollarAmounts[0] || 100,
          condition: {
            type: 'price_below',
            value: threshold || 0.40,
          },
        });
      } else {
        // Simple buy
        rules.push({
          action: 'buy',
          side,
          amount: dollarAmounts[0] || 100,
          condition: {
            type: 'price_below',
            value: threshold || 0.50,
          },
        });
      }
    }

    // Parse sell conditions
    if (input.includes('sell') || input.includes('profit') || input.includes('take')) {
      const profitPercent = percentages.find(p => p > 0 && p < 1) || 0.20;
      rules.push({
        action: 'sell',
        side,
        amount: input.includes('all') ? 'all' : (input.includes('half') ? 'half' : 'all'),
        condition: {
          type: 'profit_percent',
          value: profitPercent,
        },
      });
    }

    // Parse stop loss
    if (input.includes('stop') || input.includes('loss')) {
      const lossPercent = percentages.find(p => p > 0 && p < 1) || 0.10;
      rules.push({
        action: 'sell',
        side,
        amount: 'all',
        condition: {
          type: 'loss_percent',
          value: lossPercent,
        },
      });
    }

    // Default rule if none parsed
    if (rules.length === 0) {
      rules.push({
        action: 'buy',
        side,
        amount: dollarAmounts[0] || 100,
        condition: {
          type: 'price_below',
          value: centValues[0] || 0.50,
        },
      });
    }

    // Generate name
    const name = this.generateStrategyName(rules, platform);

    return {
      name,
      description: userInput,
      platform,
      marketId: context?.marketId,
      symbol: context?.symbol || (platform === 'crypto' ? this.detectSymbol(input) : undefined),
      rules,
      capital: context?.capital || dollarAmounts.reduce((sum, a) => sum + a, 0) || 500,
      active: true,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Validate and normalize parsed strategy
   */
  private validateStrategy(
    parsed: Record<string, unknown>,
    context?: { platform?: Platform; marketId?: string; symbol?: string; capital?: number }
  ): ParsedStrategy {
    const platform = (parsed.platform as Platform) || context?.platform || 'polymarket';
    const rules = this.validateRules(parsed.rules as StrategyRule[], platform);

    return {
      name: (parsed.name as string) || this.generateStrategyName(rules, platform),
      description: (parsed.description as string) || '',
      platform,
      marketId: (parsed.marketId as string) || context?.marketId,
      symbol: (parsed.symbol as string) || context?.symbol,
      rules,
      capital: (parsed.capital as number) || context?.capital || 500,
      maxPositionSize: parsed.maxPositionSize as number | undefined,
      active: parsed.active !== false,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Validate strategy rules
   */
  private validateRules(rules: unknown, platform: Platform): StrategyRule[] {
    if (!Array.isArray(rules)) return [];

    return rules.filter((rule): rule is StrategyRule => {
      if (!rule || typeof rule !== 'object') return false;
      const r = rule as Record<string, unknown>;

      // Validate action
      if (!['buy', 'sell', 'hold'].includes(r.action as string)) return false;

      // Validate condition
      const condition = r.condition as Record<string, unknown>;
      if (!condition || typeof condition.type !== 'string') return false;

      // Normalize values
      if (typeof condition.value !== 'number' || condition.value < 0) {
        condition.value = platform === 'polymarket' ? 0.50 : 1000;
      }

      // Validate side for platform
      if (platform === 'polymarket' && r.side && !['yes', 'no'].includes(r.side as string)) {
        r.side = 'yes';
      }
      if (platform === 'crypto' && r.side && !['long', 'short'].includes(r.side as string)) {
        r.side = 'long';
      }

      return true;
    });
  }

  /**
   * Generate strategy name from rules
   */
  private generateStrategyName(rules: StrategyRule[], platform: Platform): string {
    const actions = rules.map(r => r.action);
    const conditions = rules.map(r => r.condition.type);

    if (conditions.includes('time_interval')) return `${platform === 'crypto' ? 'Crypto' : 'Poly'} DCA`;
    if (actions.includes('buy') && conditions.includes('price_below')) return `${platform === 'crypto' ? 'Crypto' : 'Poly'} Dip Buy`;
    if (conditions.includes('profit_percent')) return `${platform === 'crypto' ? 'Crypto' : 'Poly'} Take Profit`;

    return `${platform === 'crypto' ? 'Crypto' : 'Poly'} Strategy`;
  }

  /**
   * Detect crypto symbol from text
   */
  private detectSymbol(input: string): string {
    const symbols: Record<string, string> = {
      'btc': 'BTC/USDT',
      'bitcoin': 'BTC/USDT',
      'eth': 'ETH/USDT',
      'ethereum': 'ETH/USDT',
      'sol': 'SOL/USDT',
      'solana': 'SOL/USDT',
      'bnb': 'BNB/USDT',
      'doge': 'DOGE/USDT',
      'xrp': 'XRP/USDT',
    };

    for (const [key, value] of Object.entries(symbols)) {
      if (input.includes(key)) return value;
    }

    return 'BTC/USDT';
  }

  /**
   * Get example strategies for a platform
   */
  getExamples(platform: Platform): Array<{ description: string; name: string }> {
    if (platform === 'polymarket') {
      return [
        { description: 'Buy YES if odds drop below 40 cents', name: 'Dip Buy' },
        { description: 'Sell when I\'m up 25%', name: 'Take Profit' },
        { description: 'DCA $20 every hour into YES', name: 'Hourly DCA' },
        { description: 'Buy NO if NO drops below 30 cents, stop loss at 15%', name: 'NO Contrarian' },
        { description: 'Buy YES below 45 cents, sell half at 20% profit, sell all at 35%', name: 'Staged Exit' },
      ];
    } else {
      return [
        { description: 'Buy BTC if it drops 5%, sell at 10% profit', name: 'BTC Dip Buy' },
        { description: 'DCA $50 into ETH every 4 hours', name: 'ETH DCA' },
        { description: 'Stop loss at -10%, take profit at 20%', name: 'Risk Management' },
        { description: 'Short SOL if it rises 15%, cover at -8%', name: 'SOL Short' },
        { description: 'Long BTC with 3x leverage, stop at -5%', name: 'Leveraged Long' },
      ];
    }
  }
}

// Singleton instance
let strategyParserInstance: StrategyParser | null = null;

/**
 * Get the singleton StrategyParser instance
 */
export function getStrategyParser(): StrategyParser {
  if (!strategyParserInstance) {
    strategyParserInstance = new StrategyParser();
  }
  return strategyParserInstance;
}

/**
 * Create a new StrategyParser instance
 */
export function createStrategyParser(config?: StrategyParserConfig): StrategyParser {
  return new StrategyParser(config);
}
