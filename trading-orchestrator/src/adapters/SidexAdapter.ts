/**
 * SidexAdapter - Multi-Platform Simulation Sandbox
 *
 * Features:
 * - Multi-platform paper trading (Polymarket + Crypto)
 * - AI Strategy sandbox with natural language parsing
 * - Copy Trading for both Polymarket wallets and Crypto whales
 * - Real-time price updates from Binance + Polymarket
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import type { AdapterConfig, AdapterHealth } from './types.js';
import { getPriceService, PriceData } from '../services/PriceService.js';
import { getPolymarketService, PolyMarket, PolyTrade } from '../services/PolymarketService.js';
import { getStrategyParser, ParsedStrategy, StrategyRule, Platform } from '../services/StrategyParser.js';

// ==================== Platform Types ====================

export type { Platform } from '../services/StrategyParser.js';

// ==================== Position Types ====================

export interface SidexPosition {
  id: string;
  platform: Platform;
  // Crypto fields
  symbol?: string;
  side?: 'long' | 'short';
  leverage?: number;
  // Polymarket fields
  marketId?: string;
  marketQuestion?: string;
  outcome?: 'yes' | 'no';
  shares?: number;
  // Common fields
  size: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  openedAt: string;
  source?: 'manual' | 'agent' | 'copy' | 'strategy';
  agentId?: string;
  strategyId?: string;
  copyConfigId?: string;
}

export interface SidexBalance {
  total: number;
  available: number;
  inPositions: number;
  pnl: number;
  pnlPercent: number;
}

export interface SidexTradeParams {
  platform: Platform;
  // Crypto params
  symbol?: string;
  side?: 'buy' | 'sell';
  leverage?: number;
  // Polymarket params
  marketId?: string;
  outcome?: 'yes' | 'no';
  shares?: number;
  // Common
  amount: number;
  source?: 'manual' | 'agent' | 'copy' | 'strategy';
  agentId?: string;
  strategyId?: string;
  copyConfigId?: string;
}

export interface SidexCloseParams {
  platform: Platform;
  positionId?: string;
  // Crypto close
  symbol?: string;
  direction?: 'long' | 'short';
  // Polymarket close
  marketId?: string;
  outcome?: 'yes' | 'no';
}

export interface SidexTradeResult {
  success: boolean;
  orderId?: string;
  symbol?: string;
  marketId?: string;
  side?: string;
  outcome?: string;
  amount?: number;
  shares?: number;
  price?: number;
  timestamp?: string;
  error?: string;
}

// ==================== AI Strategy Types (NL-based) ====================

export interface SidexStrategy {
  id: string;
  name: string;
  description: string;
  platform: Platform;
  marketId?: string;    // Polymarket
  symbol?: string;      // Crypto
  rules: StrategyRule[];
  capital: number;
  status: 'running' | 'paused' | 'stopped';
  createdAt: string;
  lastEvaluatedAt?: string;
  stats: StrategyStats;
}

export interface StrategyStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnl: number;
  winRate: number;
  rulesTriggered: number;
}

export interface StrategyTrade {
  id: string;
  strategyId: string;
  platform: Platform;
  marketId?: string;
  symbol?: string;
  action: 'buy' | 'sell';
  side?: string;
  outcome?: string;
  amount: number;
  price: number;
  pnl?: number;
  ruleTriggered: string;
  timestamp: string;
}

// ==================== AI Agent Types (Legacy - kept for compatibility) ====================

export type AgentStrategyType =
  | 'dca'
  | 'momentum'
  | 'mean_reversion'
  | 'whale_follow'
  | 'arbitrage'
  | 'custom';

export type AgentStatus = 'running' | 'paused' | 'stopped';

export interface AgentConfig {
  name: string;
  strategy: AgentStrategyType;
  capital: number;
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
  maxPositionSize?: number;
  stopLossPercent?: number;
  takeProfitPercent?: number;
  symbols?: string[];
  customPrompt?: string;
}

export interface SidexAgent {
  id: string;
  name: string;
  strategy: AgentStrategyType;
  status: AgentStatus;
  capital: number;
  currentCapital: number;
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
  config: AgentConfig;
  createdAt: string;
  lastTradeAt?: string;
  stats: AgentStats;
}

export interface AgentStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnl: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  currentDrawdown: number;
  maxDrawdown: number;
}

export interface AgentTrade {
  id: string;
  agentId: string;
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  pnl?: number;
  timestamp: string;
  reason?: string;
}

// ==================== Copy Trading Types ====================

export type CopySizingMode = 'fixed' | 'proportional' | 'percentage';

export interface CopyConfig {
  platform: Platform;
  targetWallet: string;
  targetLabel?: string;
  sizingMode: CopySizingMode;
  fixedSize?: number;
  proportionMultiplier?: number;
  portfolioPercentage?: number;
  maxPositionSize?: number;
  minTradeSize?: number;
  stopLossPercent?: number;
  takeProfitPercent?: number;
}

export interface SidexCopyConfig {
  id: string;
  platform: Platform;
  targetWallet: string;
  targetLabel?: string;
  enabled: boolean;
  sizingMode: CopySizingMode;
  fixedSize: number;
  proportionMultiplier: number;
  portfolioPercentage: number;
  maxPositionSize?: number;
  minTradeSize: number;
  stopLossPercent?: number;
  takeProfitPercent?: number;
  createdAt: string;
  stats: CopyStats;
}

export interface CopyStats {
  totalCopied: number;
  totalSkipped: number;
  totalPnl: number;
  winRate: number;
}

export interface CopyTrade {
  id: string;
  configId: string;
  platform: Platform;
  targetWallet: string;
  symbol?: string;
  marketId?: string;
  marketQuestion?: string;
  outcome?: string;
  side: 'buy' | 'sell';
  originalSize: number;
  copiedSize: number;
  price: number;
  pnl?: number;
  status: 'pending' | 'executed' | 'skipped';
  reason?: string;
  timestamp: string;
}

// ==================== Adapter Config ====================

export interface SidexAdapterConfig extends AdapterConfig {
  token: string;
  gatewayUrl?: string;
  simulationMode?: boolean;
  connectionTimeout?: number;
}

// ==================== Main Adapter Class ====================

export class SidexAdapter extends EventEmitter {
  private config: SidexAdapterConfig;
  private health: AdapterHealth = { healthy: false, lastChecked: 0 };

  // Paper Trading State
  private positions: Map<string, SidexPosition> = new Map();
  private balance: SidexBalance = {
    total: 10000,
    available: 10000,
    inPositions: 0,
    pnl: 0,
    pnlPercent: 0,
  };
  private simulationMode: boolean = true;
  private positionIdCounter: number = 1;

  // NL Strategy State
  private strategies: Map<string, SidexStrategy> = new Map();
  private strategyTrades: StrategyTrade[] = [];
  private strategyIdCounter: number = 1;
  private strategyIntervals: Map<string, NodeJS.Timeout> = new Map();

  // AI Agents State (legacy)
  private agents: Map<string, SidexAgent> = new Map();
  private agentTrades: AgentTrade[] = [];
  private agentIdCounter: number = 1;
  private agentIntervals: Map<string, NodeJS.Timeout> = new Map();

  // Copy Trading State
  private copyConfigs: Map<string, SidexCopyConfig> = new Map();
  private copyTrades: CopyTrade[] = [];
  private copyConfigIdCounter: number = 1;
  private copyPollingIntervals: Map<string, NodeJS.Timeout> = new Map();

  // Demo whale feed for copy trading sandbox
  private whaleSimInterval: NodeJS.Timeout | null = null;

  constructor(config: SidexAdapterConfig) {
    super();
    this.config = {
      timeout: 10000,
      connectionTimeout: 10000,
      gatewayUrl: 'wss://devs.sidex.fun/gateway',
      simulationMode: true,
      ...config,
    };
    this.simulationMode = config.simulationMode ?? true;

    // Connect price service for crypto
    const priceService = getPriceService();
    priceService.on('price', (data: PriceData) => {
      this.handleCryptoPriceUpdate(data);
    });

    // Connect Polymarket service
    const polyService = getPolymarketService();
    polyService.on('marketUpdate', (market: PolyMarket) => {
      this.handlePolymarketUpdate(market);
    });
  }

  /**
   * Get the gateway URL with token
   */
  private getGatewayUrl(): string {
    const base = this.config.gatewayUrl || 'wss://devs.sidex.fun/gateway';
    return `${base}?token=${this.config.token}`;
  }

  /**
   * Execute a WebSocket command and wait for response
   */
  private async executeWsCommand<T>(payload: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.getGatewayUrl());
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket connection timeout'));
      }, this.config.connectionTimeout || 10000);

      ws.on('open', () => {
        console.log('[SidexAdapter] Connected to gateway');
        ws.send(JSON.stringify(payload));
      });

      ws.on('message', (data) => {
        clearTimeout(timeout);
        try {
          const msg = JSON.parse(data.toString());
          console.log('[SidexAdapter] Response:', msg);
          ws.close();
          resolve(msg as T);
        } catch (err) {
          ws.close();
          reject(new Error('Failed to parse response'));
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        console.error('[SidexAdapter] WebSocket error:', err.message);
        reject(err);
      });
    });
  }

  /**
   * Handle crypto price updates from PriceService
   */
  private handleCryptoPriceUpdate(data: PriceData): void {
    // Update crypto position prices and P&L
    for (const position of this.positions.values()) {
      if (position.platform === 'crypto' && position.symbol === data.symbol) {
        position.currentPrice = data.price;
        position.pnl = this.calculateCryptoPnl(position, data.price);
        position.pnlPercent = (position.pnl / (position.size / (position.leverage || 1))) * 100;
      }
    }

    // Check strategy triggers
    this.checkStrategyTriggers('crypto', data.symbol, data.price);

    // Emit position updates
    this.emit('positionsUpdated', Array.from(this.positions.values()));
  }

  /**
   * Handle Polymarket market updates
   */
  private handlePolymarketUpdate(market: PolyMarket): void {
    // Update Polymarket position prices and P&L
    for (const position of this.positions.values()) {
      if (position.platform === 'polymarket' && position.marketId === market.id) {
        const outcome = market.outcomes.find(o => o.name.toLowerCase() === position.outcome);
        if (outcome) {
          position.currentPrice = outcome.price;
          position.pnl = this.calculatePolymarketPnl(position, outcome.price);
          position.pnlPercent = position.entryPrice > 0
            ? ((outcome.price - position.entryPrice) / position.entryPrice) * 100
            : 0;
        }
      }
    }

    // Check strategy triggers
    const yesOutcome = market.outcomes.find(o => o.name.toLowerCase() === 'yes');
    if (yesOutcome) {
      this.checkStrategyTriggers('polymarket', market.id, yesOutcome.price);
    }

    this.emit('positionsUpdated', Array.from(this.positions.values()));
  }

  /**
   * Get current price for a symbol/market
   */
  private getCurrentPrice(platform: Platform, identifier: string, outcome?: string): number {
    if (platform === 'crypto') {
      const priceService = getPriceService();
      const priceData = priceService.getPrice(identifier);
      return priceData?.price || this.getSimulatedCryptoPrice(identifier);
    } else {
      // For Polymarket, return simulated price
      return this.getSimulatedPolyPrice(outcome || 'yes');
    }
  }

  // ==================== Multi-Platform Trading Methods ====================

  /**
   * Open a position (multi-platform)
   */
  async openPosition(params: SidexTradeParams): Promise<SidexTradeResult> {
    if (params.platform === 'polymarket') {
      return this.openPolymarketPosition(params);
    } else {
      return this.openCryptoPosition(params);
    }
  }

  /**
   * Open a Polymarket position
   */
  private async openPolymarketPosition(params: SidexTradeParams): Promise<SidexTradeResult> {
    try {
      if (!params.marketId || !params.outcome) {
        return { success: false, error: 'marketId and outcome required for Polymarket' };
      }

      // Get market data
      const polyService = getPolymarketService();
      const market = await polyService.getMarket(params.marketId);
      const outcomeData = market?.outcomes.find(o => o.name.toLowerCase() === params.outcome);
      const price = outcomeData?.price || 0.50;

      // Calculate shares from amount
      const shares = params.shares || Math.floor(params.amount / price);
      const cost = shares * price;

      if (cost > this.balance.available) {
        return {
          success: false,
          error: `Insufficient balance. Required: $${cost.toFixed(2)}, Available: $${this.balance.available.toFixed(2)}`,
        };
      }

      const positionId = `poly_${this.positionIdCounter++}`;

      const position: SidexPosition = {
        id: positionId,
        platform: 'polymarket',
        marketId: params.marketId,
        marketQuestion: market?.question,
        outcome: params.outcome as 'yes' | 'no',
        shares,
        size: cost,
        entryPrice: price,
        currentPrice: price,
        pnl: 0,
        pnlPercent: 0,
        openedAt: new Date().toISOString(),
        source: params.source || 'manual',
        strategyId: params.strategyId,
        copyConfigId: params.copyConfigId,
      };

      this.positions.set(positionId, position);
      this.updateBalance(-cost);

      // Subscribe to market updates
      polyService.subscribeMarket(params.marketId);

      this.emit('position_opened', position);

      return {
        success: true,
        orderId: positionId,
        marketId: params.marketId,
        outcome: params.outcome,
        shares,
        amount: cost,
        price,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[SidexAdapter] Polymarket open error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Open a Crypto position (existing logic enhanced)
   */
  private async openCryptoPosition(params: SidexTradeParams): Promise<SidexTradeResult> {
    try {
      const leverage = params.leverage || 1;
      const requiredMargin = params.amount / leverage;

      if (requiredMargin > this.balance.available) {
        return {
          success: false,
          error: `Insufficient balance. Required: $${requiredMargin.toFixed(2)}, Available: $${this.balance.available.toFixed(2)}`,
        };
      }

      const symbol = params.symbol || 'BTC/USDT';
      const entryPrice = this.getCurrentPrice('crypto', symbol);
      const direction: 'long' | 'short' = params.side === 'sell' ? 'short' : 'long';
      const positionId = `crypto_${this.positionIdCounter++}`;

      const position: SidexPosition = {
        id: positionId,
        platform: 'crypto',
        symbol,
        side: direction,
        size: params.amount,
        entryPrice,
        currentPrice: entryPrice,
        pnl: 0,
        pnlPercent: 0,
        leverage,
        openedAt: new Date().toISOString(),
        source: params.source || 'manual',
        agentId: params.agentId,
        strategyId: params.strategyId,
        copyConfigId: params.copyConfigId,
      };

      this.positions.set(positionId, position);
      this.updateBalance(-requiredMargin);

      this.emit('position_opened', position);

      return {
        success: true,
        orderId: positionId,
        symbol,
        side: params.side,
        amount: params.amount,
        price: entryPrice,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[SidexAdapter] Crypto open error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Close a position (multi-platform)
   */
  async closePosition(params: SidexCloseParams): Promise<SidexTradeResult> {
    try {
      // Find position by ID or by market/symbol
      let position: SidexPosition | undefined;

      if (params.positionId) {
        position = this.positions.get(params.positionId);
      } else if (params.platform === 'polymarket' && params.marketId) {
        position = Array.from(this.positions.values()).find(
          p => p.platform === 'polymarket' && p.marketId === params.marketId && p.outcome === params.outcome
        );
      } else if (params.platform === 'crypto' && params.symbol) {
        position = Array.from(this.positions.values()).find(
          p => p.platform === 'crypto' && p.symbol === params.symbol && p.side === params.direction
        );
      }

      if (!position) {
        return { success: false, error: 'Position not found' };
      }

      const closePrice = position.currentPrice;
      let pnl: number;
      let returnAmount: number;

      if (position.platform === 'polymarket') {
        pnl = this.calculatePolymarketPnl(position, closePrice);
        returnAmount = (position.shares || 0) * closePrice;
      } else {
        pnl = this.calculateCryptoPnl(position, closePrice);
        const margin = position.size / (position.leverage || 1);
        returnAmount = margin + pnl;
      }

      this.updateBalance(returnAmount);
      this.positions.delete(position.id);

      this.emit('position_closed', { position, closePrice, pnl });

      return {
        success: true,
        orderId: position.id,
        symbol: position.symbol,
        marketId: position.marketId,
        outcome: position.outcome,
        amount: position.size,
        shares: position.shares,
        price: closePrice,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[SidexAdapter] Close position error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Get all open positions (optionally filtered by platform)
   */
  async getPositions(platform?: Platform): Promise<SidexPosition[]> {
    const positions = Array.from(this.positions.values())
      .filter(p => !platform || p.platform === platform)
      .map(pos => {
        let currentPrice: number;
        let pnl: number;

        if (pos.platform === 'crypto') {
          currentPrice = this.getCurrentPrice('crypto', pos.symbol!);
          pnl = this.calculateCryptoPnl(pos, currentPrice);
        } else {
          currentPrice = this.getCurrentPrice('polymarket', pos.marketId!, pos.outcome);
          pnl = this.calculatePolymarketPnl(pos, currentPrice);
        }

        const pnlPercent = pos.platform === 'polymarket'
          ? (pos.entryPrice > 0 ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100 : 0)
          : (pnl / (pos.size / (pos.leverage || 1))) * 100;

        return { ...pos, currentPrice, pnl, pnlPercent };
      });

    return positions;
  }

  /**
   * Get account balance
   */
  async getBalance(): Promise<SidexBalance> {
    const positions = await this.getPositions();
    const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0);
    const inPositions = positions.reduce((sum, p) => {
      if (p.platform === 'crypto') {
        return sum + p.size / (p.leverage || 1);
      }
      return sum + p.size;
    }, 0);

    this.balance.inPositions = inPositions;
    this.balance.pnl = totalPnl;
    this.balance.total = this.balance.available + inPositions + totalPnl;
    this.balance.pnlPercent = this.balance.total > 0
      ? (totalPnl / (this.balance.total - totalPnl)) * 100
      : 0;

    return { ...this.balance };
  }

  // ==================== Polymarket Market Data ====================

  /**
   * Get Polymarket markets
   */
  async getPolymarketMarkets(options?: {
    active?: boolean;
    limit?: number;
    sortBy?: 'volume' | 'liquidity' | 'newest';
  }): Promise<PolyMarket[]> {
    const polyService = getPolymarketService();
    return polyService.getMarkets(options);
  }

  /**
   * Search Polymarket markets
   */
  async searchPolymarketMarkets(query: string, limit?: number): Promise<PolyMarket[]> {
    const polyService = getPolymarketService();
    return polyService.searchMarkets(query, limit);
  }

  /**
   * Get single Polymarket market
   */
  async getPolymarketMarket(marketId: string): Promise<PolyMarket | null> {
    const polyService = getPolymarketService();
    return polyService.getMarket(marketId);
  }

  /**
   * Get user's Polymarket trades by wallet
   */
  async getPolymarketUserTrades(walletAddress: string, limit?: number): Promise<PolyTrade[]> {
    const polyService = getPolymarketService();
    return polyService.getUserTrades(walletAddress, limit);
  }

  // ==================== NL Strategy Methods ====================

  /**
   * Create strategy from natural language description
   */
  async createStrategy(params: {
    description: string;
    platform: Platform;
    marketId?: string;
    symbol?: string;
    capital: number;
  }): Promise<SidexStrategy> {
    const parser = getStrategyParser();

    // Parse natural language
    const parsed = await parser.parseStrategy(params.description, {
      platform: params.platform,
      marketId: params.marketId,
      symbol: params.symbol,
      capital: params.capital,
    });

    const strategyId = `strategy_${this.strategyIdCounter++}`;

    const strategy: SidexStrategy = {
      id: strategyId,
      name: parsed.name,
      description: params.description,
      platform: params.platform,
      marketId: params.marketId,
      symbol: params.symbol,
      rules: parsed.rules,
      capital: params.capital,
      status: 'paused',
      createdAt: new Date().toISOString(),
      stats: {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        totalPnl: 0,
        winRate: 0,
        rulesTriggered: 0,
      },
    };

    this.strategies.set(strategyId, strategy);
    this.emit('strategy_created', strategy);

    console.log(`[SidexAdapter] Created strategy: ${strategyId} - ${parsed.name}`);
    return strategy;
  }

  /**
   * Get all strategies
   */
  getStrategies(): SidexStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Get strategy by ID
   */
  getStrategy(strategyId: string): SidexStrategy | null {
    return this.strategies.get(strategyId) || null;
  }

  /**
   * Start a strategy
   */
  async startStrategy(strategyId: string): Promise<{ success: boolean; error?: string }> {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) {
      return { success: false, error: 'Strategy not found' };
    }

    if (strategy.status === 'running') {
      return { success: false, error: 'Strategy is already running' };
    }

    strategy.status = 'running';

    // Start evaluation loop (every 5 seconds)
    const interval = setInterval(() => {
      this.evaluateStrategy(strategyId);
    }, 5000);

    this.strategyIntervals.set(strategyId, interval);
    this.emit('strategy_started', strategy);

    console.log(`[SidexAdapter] Started strategy: ${strategyId}`);
    return { success: true };
  }

  /**
   * Stop a strategy
   */
  async stopStrategy(strategyId: string): Promise<{ success: boolean; error?: string }> {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) {
      return { success: false, error: 'Strategy not found' };
    }

    strategy.status = 'stopped';

    const interval = this.strategyIntervals.get(strategyId);
    if (interval) {
      clearInterval(interval);
      this.strategyIntervals.delete(strategyId);
    }

    this.emit('strategy_stopped', strategy);
    console.log(`[SidexAdapter] Stopped strategy: ${strategyId}`);
    return { success: true };
  }

  /**
   * Delete a strategy
   */
  async deleteStrategy(strategyId: string): Promise<{ success: boolean; error?: string }> {
    await this.stopStrategy(strategyId);
    this.strategies.delete(strategyId);
    this.emit('strategy_deleted', { strategyId });
    console.log(`[SidexAdapter] Deleted strategy: ${strategyId}`);
    return { success: true };
  }

  /**
   * Get strategy trades
   */
  getStrategyTrades(strategyId?: string): StrategyTrade[] {
    if (strategyId) {
      return this.strategyTrades.filter(t => t.strategyId === strategyId);
    }
    return this.strategyTrades;
  }

  /**
   * Get strategy examples
   */
  getStrategyExamples(platform: Platform): Array<{ description: string; name: string }> {
    const parser = getStrategyParser();
    return parser.getExamples(platform);
  }

  /**
   * Evaluate strategy rules and execute trades
   */
  private async evaluateStrategy(strategyId: string): Promise<void> {
    const strategy = this.strategies.get(strategyId);
    if (!strategy || strategy.status !== 'running') return;

    strategy.lastEvaluatedAt = new Date().toISOString();

    // Get current price
    const price = strategy.platform === 'crypto'
      ? this.getCurrentPrice('crypto', strategy.symbol!)
      : this.getCurrentPrice('polymarket', strategy.marketId!, 'yes');

    // Get current position
    const position = Array.from(this.positions.values()).find(p =>
      p.strategyId === strategyId
    );

    // Evaluate each rule
    for (const rule of strategy.rules) {
      const triggered = this.evaluateRule(rule, price, position);

      if (triggered) {
        await this.executeStrategyRule(strategy, rule, price, position);
        strategy.stats.rulesTriggered++;
        break; // Execute only one rule per tick
      }
    }
  }

  /**
   * Evaluate a single rule
   */
  private evaluateRule(
    rule: StrategyRule,
    currentPrice: number,
    position?: SidexPosition
  ): boolean {
    const { condition } = rule;

    switch (condition.type) {
      case 'price_below':
        return currentPrice < condition.value && rule.action === 'buy' && !position;

      case 'price_above':
        return currentPrice > condition.value && rule.action === 'buy' && !position;

      case 'profit_percent':
        if (!position || rule.action !== 'sell') return false;
        return position.pnlPercent >= condition.value * 100;

      case 'loss_percent':
        if (!position || rule.action !== 'sell') return false;
        return position.pnlPercent <= -condition.value * 100;

      case 'time_interval':
        // Check if enough time has passed for DCA
        // For simplicity, use random trigger based on interval
        return Math.random() < 0.1 && rule.action === 'buy';

      default:
        return false;
    }
  }

  /**
   * Execute a strategy rule
   */
  private async executeStrategyRule(
    strategy: SidexStrategy,
    rule: StrategyRule,
    price: number,
    position?: SidexPosition
  ): Promise<void> {
    const amount = typeof rule.amount === 'number'
      ? rule.amount
      : (rule.amount === 'all' ? (position?.size || strategy.capital * 0.1) : (position?.size || strategy.capital * 0.1) / 2);

    if (rule.action === 'buy') {
      const result = await this.openPosition({
        platform: strategy.platform,
        symbol: strategy.symbol,
        marketId: strategy.marketId,
        outcome: rule.side as 'yes' | 'no',
        side: 'buy',
        amount,
        source: 'strategy',
        strategyId: strategy.id,
      });

      if (result.success) {
        const trade: StrategyTrade = {
          id: `st_${Date.now()}`,
          strategyId: strategy.id,
          platform: strategy.platform,
          marketId: strategy.marketId,
          symbol: strategy.symbol,
          action: 'buy',
          side: rule.side,
          outcome: rule.side,
          amount,
          price,
          ruleTriggered: `${rule.condition.type}:${rule.condition.value}`,
          timestamp: new Date().toISOString(),
        };
        this.strategyTrades.push(trade);
        strategy.stats.totalTrades++;
        this.emit('strategy_trade', trade);
      }
    } else if (rule.action === 'sell' && position) {
      const result = await this.closePosition({
        platform: strategy.platform,
        positionId: position.id,
      });

      if (result.success) {
        const pnl = position.pnl;
        const trade: StrategyTrade = {
          id: `st_${Date.now()}`,
          strategyId: strategy.id,
          platform: strategy.platform,
          marketId: strategy.marketId,
          symbol: strategy.symbol,
          action: 'sell',
          side: position.side || position.outcome,
          outcome: position.outcome,
          amount: position.size,
          price,
          pnl,
          ruleTriggered: `${rule.condition.type}:${rule.condition.value}`,
          timestamp: new Date().toISOString(),
        };
        this.strategyTrades.push(trade);
        strategy.stats.totalTrades++;
        strategy.stats.totalPnl += pnl;

        if (pnl > 0) {
          strategy.stats.winningTrades++;
        } else {
          strategy.stats.losingTrades++;
        }
        strategy.stats.winRate = strategy.stats.totalTrades > 0
          ? strategy.stats.winningTrades / strategy.stats.totalTrades
          : 0;

        this.emit('strategy_trade', trade);
      }
    }
  }

  /**
   * Check strategy triggers on price update
   */
  private checkStrategyTriggers(platform: Platform, identifier: string, price: number): void {
    for (const strategy of this.strategies.values()) {
      if (strategy.status !== 'running') continue;
      if (strategy.platform !== platform) continue;
      if (platform === 'crypto' && strategy.symbol !== identifier) continue;
      if (platform === 'polymarket' && strategy.marketId !== identifier) continue;

      // Trigger evaluation
      this.evaluateStrategy(strategy.id);
    }
  }

  // ==================== Copy Trading Methods ====================

  /**
   * Create a copy trading config (multi-platform)
   */
  async createCopyConfig(config: CopyConfig): Promise<SidexCopyConfig> {
    const configId = `copy_${this.copyConfigIdCounter++}`;

    const copyConfig: SidexCopyConfig = {
      id: configId,
      platform: config.platform,
      targetWallet: config.targetWallet,
      targetLabel: config.targetLabel,
      enabled: false,
      sizingMode: config.sizingMode,
      fixedSize: config.fixedSize || 100,
      proportionMultiplier: config.proportionMultiplier || 0.1,
      portfolioPercentage: config.portfolioPercentage || 5,
      maxPositionSize: config.maxPositionSize,
      minTradeSize: config.minTradeSize || 10,
      stopLossPercent: config.stopLossPercent,
      takeProfitPercent: config.takeProfitPercent,
      createdAt: new Date().toISOString(),
      stats: {
        totalCopied: 0,
        totalSkipped: 0,
        totalPnl: 0,
        winRate: 0,
      },
    };

    this.copyConfigs.set(configId, copyConfig);
    this.emit('copy_config_created', copyConfig);

    console.log(`[SidexAdapter] Created copy config: ${configId} for ${config.targetWallet} (${config.platform})`);
    return copyConfig;
  }

  /**
   * Get all copy configs (optionally filtered by platform)
   */
  getCopyConfigs(platform?: Platform): SidexCopyConfig[] {
    return Array.from(this.copyConfigs.values())
      .filter(c => !platform || c.platform === platform);
  }

  /**
   * Get copy config by ID
   */
  getCopyConfig(configId: string): SidexCopyConfig | null {
    return this.copyConfigs.get(configId) || null;
  }

  /**
   * Toggle copy config
   */
  async toggleCopyConfig(configId: string, enabled: boolean): Promise<{ success: boolean; enabled: boolean; error?: string }> {
    const config = this.copyConfigs.get(configId);
    if (!config) {
      return { success: false, enabled: false, error: 'Copy config not found' };
    }

    config.enabled = enabled;

    if (enabled) {
      if (config.platform === 'polymarket') {
        this.startPolymktCopyPolling(configId);
      } else {
        // Start whale simulation for crypto
        if (!this.whaleSimInterval) {
          this.startWhaleSimulation();
        }
      }
    } else {
      if (config.platform === 'polymarket') {
        this.stopPolymktCopyPolling(configId);
      }
    }

    this.emit('copy_config_toggled', { configId, enabled });
    console.log(`[SidexAdapter] Copy config ${configId} ${enabled ? 'enabled' : 'disabled'}`);
    return { success: true, enabled };
  }

  /**
   * Delete copy config
   */
  async deleteCopyConfig(configId: string): Promise<{ success: boolean; error?: string }> {
    const config = this.copyConfigs.get(configId);
    if (config?.enabled) {
      await this.toggleCopyConfig(configId, false);
    }
    this.copyConfigs.delete(configId);
    this.emit('copy_config_deleted', { configId });
    console.log(`[SidexAdapter] Deleted copy config: ${configId}`);
    return { success: true };
  }

  /**
   * Get copy trades (optionally filtered)
   */
  getCopyTrades(configId?: string, platform?: Platform): CopyTrade[] {
    let trades = this.copyTrades;
    if (configId) {
      trades = trades.filter(t => t.configId === configId);
    }
    if (platform) {
      trades = trades.filter(t => t.platform === platform);
    }
    return trades;
  }

  /**
   * Start Polymarket wallet polling for copy trading
   */
  private startPolymktCopyPolling(configId: string): void {
    if (this.copyPollingIntervals.has(configId)) return;

    const config = this.copyConfigs.get(configId);
    if (!config) return;

    console.log(`[SidexAdapter] Starting Polymarket copy polling for ${config.targetWallet}`);

    let lastCheckedTrade: string | null = null;

    const interval = setInterval(async () => {
      try {
        const polyService = getPolymarketService();
        const trades = await polyService.getUserTrades(config.targetWallet, 10);

        // Check for new trades
        for (const trade of trades) {
          if (lastCheckedTrade && trade.id === lastCheckedTrade) break;
          if (!lastCheckedTrade) {
            lastCheckedTrade = trade.id;
            break; // First run, just mark the latest
          }

          // New trade detected - copy it
          await this.processPolymktCopyTrade(config, trade);
        }

        if (trades.length > 0) {
          lastCheckedTrade = trades[0].id;
        }
      } catch (error) {
        console.error(`[SidexAdapter] Copy polling error:`, error);
      }
    }, 30000); // Poll every 30 seconds

    this.copyPollingIntervals.set(configId, interval);
  }

  /**
   * Stop Polymarket wallet polling
   */
  private stopPolymktCopyPolling(configId: string): void {
    const interval = this.copyPollingIntervals.get(configId);
    if (interval) {
      clearInterval(interval);
      this.copyPollingIntervals.delete(configId);
    }
  }

  /**
   * Process a Polymarket copy trade
   */
  private async processPolymktCopyTrade(config: SidexCopyConfig, sourceTrade: PolyTrade): Promise<void> {
    // Calculate copy size
    let copySize: number;

    switch (config.sizingMode) {
      case 'fixed':
        copySize = config.fixedSize;
        break;
      case 'proportional':
        copySize = sourceTrade.size * sourceTrade.price * config.proportionMultiplier;
        break;
      case 'percentage':
        copySize = (this.balance.available * config.portfolioPercentage) / 100;
        break;
      default:
        copySize = config.fixedSize;
    }

    if (config.maxPositionSize) {
      copySize = Math.min(copySize, config.maxPositionSize);
    }

    if (copySize < config.minTradeSize) {
      const trade: CopyTrade = {
        id: `ct_${Date.now()}`,
        configId: config.id,
        platform: 'polymarket',
        targetWallet: config.targetWallet,
        marketId: sourceTrade.marketId,
        marketQuestion: sourceTrade.marketQuestion,
        outcome: sourceTrade.outcome,
        side: sourceTrade.side,
        originalSize: sourceTrade.size * sourceTrade.price,
        copiedSize: 0,
        price: sourceTrade.price,
        status: 'skipped',
        reason: `Below minimum size: $${copySize.toFixed(2)} < $${config.minTradeSize}`,
        timestamp: new Date().toISOString(),
      };
      this.copyTrades.push(trade);
      config.stats.totalSkipped++;
      this.emit('copy_trade_skipped', trade);
      return;
    }

    // Execute copy
    const result = await this.openPosition({
      platform: 'polymarket',
      marketId: sourceTrade.marketId,
      outcome: sourceTrade.outcome.toLowerCase() as 'yes' | 'no',
      amount: copySize,
      source: 'copy',
      copyConfigId: config.id,
    });

    const trade: CopyTrade = {
      id: `ct_${Date.now()}`,
      configId: config.id,
      platform: 'polymarket',
      targetWallet: config.targetWallet,
      marketId: sourceTrade.marketId,
      marketQuestion: sourceTrade.marketQuestion,
      outcome: sourceTrade.outcome,
      side: sourceTrade.side,
      originalSize: sourceTrade.size * sourceTrade.price,
      copiedSize: copySize,
      price: sourceTrade.price,
      status: result.success ? 'executed' : 'skipped',
      reason: result.success ? undefined : result.error,
      timestamp: new Date().toISOString(),
    };

    this.copyTrades.push(trade);
    if (result.success) {
      config.stats.totalCopied++;
    } else {
      config.stats.totalSkipped++;
    }

    this.emit('copy_trade', trade);
  }

  // ==================== Legacy AI Agent Methods ====================

  /**
   * Create a new test agent (legacy)
   */
  async createAgent(agentConfig: AgentConfig): Promise<SidexAgent> {
    const agentId = `agent_${this.agentIdCounter++}`;

    const agent: SidexAgent = {
      id: agentId,
      name: agentConfig.name,
      strategy: agentConfig.strategy,
      status: 'paused',
      capital: agentConfig.capital,
      currentCapital: agentConfig.capital,
      riskLevel: agentConfig.riskLevel,
      config: agentConfig,
      createdAt: new Date().toISOString(),
      stats: {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        totalPnl: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        largestWin: 0,
        largestLoss: 0,
        currentDrawdown: 0,
        maxDrawdown: 0,
      },
    };

    this.agents.set(agentId, agent);
    this.emit('agent_created', agent);

    console.log(`[SidexAdapter] Created agent: ${agentId} - ${agentConfig.name}`);
    return agent;
  }

  getAgents(): SidexAgent[] {
    return Array.from(this.agents.values());
  }

  getAgent(agentId: string): SidexAgent | null {
    return this.agents.get(agentId) || null;
  }

  async startAgent(agentId: string): Promise<{ success: boolean; error?: string }> {
    const agent = this.agents.get(agentId);
    if (!agent) return { success: false, error: 'Agent not found' };
    if (agent.status === 'running') return { success: false, error: 'Agent is already running' };

    agent.status = 'running';
    const interval = setInterval(() => this.runAgentTick(agentId), 5000 + Math.random() * 5000);
    this.agentIntervals.set(agentId, interval);
    this.emit('agent_started', agent);

    console.log(`[SidexAdapter] Started agent: ${agentId}`);
    return { success: true };
  }

  async stopAgent(agentId: string): Promise<{ success: boolean; error?: string }> {
    const agent = this.agents.get(agentId);
    if (!agent) return { success: false, error: 'Agent not found' };

    agent.status = 'stopped';
    const interval = this.agentIntervals.get(agentId);
    if (interval) {
      clearInterval(interval);
      this.agentIntervals.delete(agentId);
    }

    this.emit('agent_stopped', agent);
    console.log(`[SidexAdapter] Stopped agent: ${agentId}`);
    return { success: true };
  }

  async pauseAgent(agentId: string): Promise<{ success: boolean; error?: string }> {
    const agent = this.agents.get(agentId);
    if (!agent) return { success: false, error: 'Agent not found' };

    agent.status = 'paused';
    const interval = this.agentIntervals.get(agentId);
    if (interval) {
      clearInterval(interval);
      this.agentIntervals.delete(agentId);
    }

    this.emit('agent_paused', agent);
    return { success: true };
  }

  async deleteAgent(agentId: string): Promise<{ success: boolean; error?: string }> {
    await this.stopAgent(agentId);
    this.agents.delete(agentId);
    this.emit('agent_deleted', { agentId });
    return { success: true };
  }

  getAgentStats(agentId: string): AgentStats | null {
    return this.agents.get(agentId)?.stats || null;
  }

  getAgentTrades(agentId?: string): AgentTrade[] {
    if (agentId) return this.agentTrades.filter(t => t.agentId === agentId);
    return this.agentTrades;
  }

  private async runAgentTick(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent || agent.status !== 'running') return;

    const priceService = getPriceService();
    const prices = priceService.getAllPrices();
    const symbols = agent.config.symbols || ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'];

    for (const symbol of symbols) {
      const priceData = prices[symbol];
      if (!priceData) continue;

      const decision = this.makeAgentDecision(agent, symbol, priceData);
      if (decision.action !== 'hold') {
        await this.executeAgentTrade(agent, symbol, decision as { action: 'buy' | 'sell'; reason: string });
      }
    }
  }

  private makeAgentDecision(
    agent: SidexAgent,
    symbol: string,
    priceData: PriceData
  ): { action: 'buy' | 'sell' | 'hold'; reason: string } {
    const { strategy, riskLevel } = agent;
    const { changePercent24h } = priceData;

    const thresholds = {
      conservative: { buy: -3, sell: 3 },
      moderate: { buy: -2, sell: 2 },
      aggressive: { buy: -1, sell: 1 },
    }[riskLevel];

    const hasPosition = Array.from(this.positions.values()).some(
      p => p.platform === 'crypto' && p.symbol === symbol && p.agentId === agent.id
    );

    const random = Math.random();

    switch (strategy) {
      case 'dca':
        if (changePercent24h < thresholds.buy && !hasPosition && random > 0.5) {
          return { action: 'buy', reason: `DCA: Price down ${changePercent24h.toFixed(2)}%` };
        }
        break;
      case 'momentum':
        if (changePercent24h > Math.abs(thresholds.buy) && !hasPosition && random > 0.6) {
          return { action: 'buy', reason: `Momentum: Price up ${changePercent24h.toFixed(2)}%` };
        }
        if (changePercent24h < -Math.abs(thresholds.sell) && hasPosition) {
          return { action: 'sell', reason: `Momentum reversal` };
        }
        break;
      case 'mean_reversion':
        if (changePercent24h < thresholds.buy && !hasPosition && random > 0.4) {
          return { action: 'buy', reason: `Mean reversion: Oversold` };
        }
        if (changePercent24h > thresholds.sell && hasPosition) {
          return { action: 'sell', reason: `Mean reversion: Overbought` };
        }
        break;
      default:
        if (random > 0.95 && !hasPosition) return { action: 'buy', reason: 'Strategy signal' };
        if (random > 0.97 && hasPosition) return { action: 'sell', reason: 'Take profit' };
    }

    return { action: 'hold', reason: 'No signal' };
  }

  private async executeAgentTrade(
    agent: SidexAgent,
    symbol: string,
    decision: { action: 'buy' | 'sell'; reason: string }
  ): Promise<void> {
    const thresholds = { conservative: 0.05, moderate: 0.1, aggressive: 0.2 }[agent.riskLevel];
    const tradeSize = Math.min(agent.currentCapital * thresholds, agent.config.maxPositionSize || 500);

    if (tradeSize < 10) return;

    if (decision.action === 'buy') {
      const result = await this.openPosition({
        platform: 'crypto',
        symbol,
        side: 'buy',
        amount: tradeSize,
        leverage: agent.riskLevel === 'aggressive' ? 10 : agent.riskLevel === 'moderate' ? 5 : 2,
        source: 'agent',
        agentId: agent.id,
      });

      if (result.success) {
        const trade: AgentTrade = {
          id: `at_${Date.now()}`,
          agentId: agent.id,
          symbol,
          side: 'buy',
          amount: tradeSize,
          price: result.price!,
          timestamp: new Date().toISOString(),
          reason: decision.reason,
        };
        this.agentTrades.push(trade);
        agent.stats.totalTrades++;
        agent.lastTradeAt = new Date().toISOString();
        this.emit('agent_trade', trade);
      }
    } else {
      const position = Array.from(this.positions.values()).find(
        p => p.platform === 'crypto' && p.symbol === symbol && p.agentId === agent.id
      );

      if (position) {
        const result = await this.closePosition({
          platform: 'crypto',
          positionId: position.id,
        });

        if (result.success) {
          const pnl = position.pnl;
          const trade: AgentTrade = {
            id: `at_${Date.now()}`,
            agentId: agent.id,
            symbol,
            side: 'sell',
            amount: position.size,
            price: result.price!,
            pnl,
            timestamp: new Date().toISOString(),
            reason: decision.reason,
          };
          this.agentTrades.push(trade);

          agent.stats.totalTrades++;
          agent.stats.totalPnl += pnl;
          agent.currentCapital += pnl;

          if (pnl > 0) {
            agent.stats.winningTrades++;
            agent.stats.largestWin = Math.max(agent.stats.largestWin, pnl);
          } else {
            agent.stats.losingTrades++;
            agent.stats.largestLoss = Math.min(agent.stats.largestLoss, pnl);
          }

          agent.stats.winRate = agent.stats.winningTrades / agent.stats.totalTrades;
          agent.lastTradeAt = new Date().toISOString();
          this.emit('agent_trade', trade);
        }
      }
    }
  }

  // ==================== Whale Simulation (Crypto) ====================

  private startWhaleSimulation(): void {
    if (this.whaleSimInterval) return;

    console.log('[SidexAdapter] Starting whale simulation');

    this.whaleSimInterval = setInterval(() => {
      this.simulateWhaleTrade();
    }, 15000 + Math.random() * 15000);
  }

  private stopWhaleSimulation(): void {
    if (this.whaleSimInterval) {
      clearInterval(this.whaleSimInterval);
      this.whaleSimInterval = null;
    }
  }

  private async simulateWhaleTrade(): Promise<void> {
    const enabledConfigs = Array.from(this.copyConfigs.values())
      .filter(c => c.enabled && c.platform === 'crypto');

    if (enabledConfigs.length === 0) {
      this.stopWhaleSimulation();
      return;
    }

    const symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT'];
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    const side: 'buy' | 'sell' = Math.random() > 0.5 ? 'buy' : 'sell';
    const whaleSize = 50000 + Math.random() * 200000;
    const price = this.getCurrentPrice('crypto', symbol);

    for (const config of enabledConfigs) {
      await this.processCryptoCopyTrade(config, { symbol, side, originalSize: whaleSize, price });
    }
  }

  private async processCryptoCopyTrade(
    config: SidexCopyConfig,
    whaleTrade: { symbol: string; side: 'buy' | 'sell'; originalSize: number; price: number }
  ): Promise<void> {
    let copySize: number;

    switch (config.sizingMode) {
      case 'fixed':
        copySize = config.fixedSize;
        break;
      case 'proportional':
        copySize = whaleTrade.originalSize * config.proportionMultiplier;
        break;
      case 'percentage':
        copySize = (this.balance.available * config.portfolioPercentage) / 100;
        break;
      default:
        copySize = config.fixedSize;
    }

    if (config.maxPositionSize) copySize = Math.min(copySize, config.maxPositionSize);

    if (copySize < config.minTradeSize) {
      const trade: CopyTrade = {
        id: `ct_${Date.now()}`,
        configId: config.id,
        platform: 'crypto',
        targetWallet: config.targetWallet,
        symbol: whaleTrade.symbol,
        side: whaleTrade.side,
        originalSize: whaleTrade.originalSize,
        copiedSize: 0,
        price: whaleTrade.price,
        status: 'skipped',
        reason: `Below minimum: $${copySize.toFixed(2)} < $${config.minTradeSize}`,
        timestamp: new Date().toISOString(),
      };
      this.copyTrades.push(trade);
      config.stats.totalSkipped++;
      this.emit('copy_trade_skipped', trade);
      return;
    }

    const result = await this.openPosition({
      platform: 'crypto',
      symbol: whaleTrade.symbol,
      side: whaleTrade.side,
      amount: copySize,
      leverage: 5,
      source: 'copy',
      copyConfigId: config.id,
    });

    const trade: CopyTrade = {
      id: `ct_${Date.now()}`,
      configId: config.id,
      platform: 'crypto',
      targetWallet: config.targetWallet,
      symbol: whaleTrade.symbol,
      side: whaleTrade.side,
      originalSize: whaleTrade.originalSize,
      copiedSize: copySize,
      price: whaleTrade.price,
      status: result.success ? 'executed' : 'skipped',
      reason: result.success ? undefined : result.error,
      timestamp: new Date().toISOString(),
    };

    this.copyTrades.push(trade);
    if (result.success) {
      config.stats.totalCopied++;
    } else {
      config.stats.totalSkipped++;
    }

    this.emit('copy_trade', trade);
  }

  // ==================== Simulation Mode & Reset ====================

  async setSimulationMode(enabled: boolean): Promise<{ enabled: boolean }> {
    this.simulationMode = enabled;
    console.log(`[SidexAdapter] Simulation mode: ${enabled ? 'ON' : 'OFF'}`);
    return { enabled: this.simulationMode };
  }

  getSimulationStatus(): { enabled: boolean } {
    return { enabled: this.simulationMode };
  }

  async resetAccount(): Promise<{ success: boolean; balance: SidexBalance }> {
    // Stop all strategies
    for (const strategyId of this.strategies.keys()) {
      await this.stopStrategy(strategyId);
    }

    // Stop all agents
    for (const agentId of this.agents.keys()) {
      await this.stopAgent(agentId);
    }

    // Stop all copy configs
    for (const configId of this.copyConfigs.keys()) {
      await this.toggleCopyConfig(configId, false);
    }

    // Clear all state
    this.positions.clear();
    this.strategies.clear();
    this.strategyTrades = [];
    this.agents.clear();
    this.agentTrades = [];
    this.copyConfigs.clear();
    this.copyTrades = [];

    this.balance = { total: 10000, available: 10000, inPositions: 0, pnl: 0, pnlPercent: 0 };

    this.positionIdCounter = 1;
    this.strategyIdCounter = 1;
    this.agentIdCounter = 1;
    this.copyConfigIdCounter = 1;

    console.log('[SidexAdapter] Account reset');
    return { success: true, balance: this.balance };
  }

  // ==================== Health Check ====================

  async checkHealth(): Promise<AdapterHealth> {
    const startTime = Date.now();
    try {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(this.getGatewayUrl());
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('Connection timeout'));
        }, 5000);

        ws.on('open', () => {
          clearTimeout(timeout);
          ws.close();
          resolve();
        });

        ws.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      this.health = {
        healthy: true,
        latencyMs: Date.now() - startTime,
        lastChecked: Date.now(),
        metadata: {
          simulationMode: this.simulationMode,
          openPositions: this.positions.size,
          activeStrategies: Array.from(this.strategies.values()).filter(s => s.status === 'running').length,
          activeAgents: Array.from(this.agents.values()).filter(a => a.status === 'running').length,
          activeCopyConfigs: Array.from(this.copyConfigs.values()).filter(c => c.enabled).length,
        },
      };
    } catch (error) {
      this.health = {
        healthy: false,
        lastChecked: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
    return this.health;
  }

  isHealthy(): boolean {
    return this.health.healthy;
  }

  // ==================== Helpers ====================

  private updateBalance(delta: number): void {
    this.balance.available += delta;
  }

  private calculateCryptoPnl(position: SidexPosition, currentPrice: number): number {
    const priceDiff = currentPrice - position.entryPrice;
    const direction = position.side === 'long' ? 1 : -1;
    return (priceDiff / position.entryPrice) * position.size * direction;
  }

  private calculatePolymarketPnl(position: SidexPosition, currentPrice: number): number {
    // Polymarket P&L = (currentPrice - entryPrice) * shares
    const shares = position.shares || 0;
    return (currentPrice - position.entryPrice) * shares;
  }

  private getSimulatedCryptoPrice(symbol: string): number {
    const basePrices: Record<string, number> = {
      'BTC/USDT': 95000 + Math.random() * 1000 - 500,
      'ETH/USDT': 3200 + Math.random() * 100 - 50,
      'SOL/USDT': 180 + Math.random() * 10 - 5,
      'BNB/USDT': 680 + Math.random() * 20 - 10,
      'XRP/USDT': 2.4 + Math.random() * 0.1 - 0.05,
      'DOGE/USDT': 0.32 + Math.random() * 0.02 - 0.01,
    };
    return basePrices[symbol] || 100 + Math.random() * 10 - 5;
  }

  private getSimulatedPolyPrice(outcome: string): number {
    // Return a price between 0.20 and 0.80 with slight randomness
    const base = outcome === 'yes' ? 0.52 : 0.48;
    return Math.max(0.01, Math.min(0.99, base + Math.random() * 0.04 - 0.02));
  }
}
