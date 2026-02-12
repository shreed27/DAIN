/**
 * Hyperliquid Whale Tracker - Real-time whale trade detection for perpetuals
 *
 * Features:
 * - WebSocket trade subscriptions for major coins
 * - Filter trades by size and tracked wallets
 * - Auto-discover large traders (5x threshold)
 * - Fetch position context (leverage, margin, PnL)
 * - Emit unified WhaleTrade events
 */

import { EventEmitter } from 'eventemitter3';
import { Hyperliquid } from 'hyperliquid';
import { logger } from '../../utils/logger';
import {
  getUserState,
  getUserFills,
  getUserPortfolio,
  getActiveAssetData,
  getPerpMeta,
  getAllMids,
  type UserFills,
} from '../../exchanges/hyperliquid/index';
import type {
  WhaleTrade,
  WhalePosition,
  PlatformWhaleTracker,
  ConnectionState,
} from '../../trading/whale-tracker-unified';

// =============================================================================
// CONSTANTS
// =============================================================================

const WS_URL = 'wss://api.hyperliquid.xyz/ws';

/** Major perpetual coins to track by default */
const DEFAULT_TRACKED_COINS = [
  'BTC', 'ETH', 'SOL', 'DOGE', 'WIF', 'PEPE', 'ORDI', 'SUI',
  'ARB', 'OP', 'AVAX', 'LINK', 'MATIC', 'XRP', 'ADA', 'DOT',
  'ATOM', 'APT', 'SEI', 'INJ', 'TIA', 'NEAR', 'FTM', 'AAVE',
];

/** Minimum USD value to consider a trade for whale detection */
const DEFAULT_MIN_TRADE_SIZE = 10000; // $10k

/** Multiplier for auto-discovery (5x = $50k for $10k threshold) */
const DEFAULT_AUTO_DISCOVERY_MULTIPLIER = 5;

// =============================================================================
// TYPES
// =============================================================================

export interface HyperliquidWhaleTrackerConfig {
  /** Coins to track (default: major perps) */
  trackedCoins?: string[];
  /** Minimum trade size in USD */
  minTradeSize?: number;
  /** Specific wallet addresses to follow */
  trackedWallets?: string[];
  /** Auto-discover large traders */
  autoDiscovery?: boolean;
  /** Auto-discovery threshold multiplier */
  autoDiscoveryMultiplier?: number;
  /** Fetch position context for trades (adds latency ~50-200ms) */
  fetchPositionContext?: boolean;
  /** Private key for authenticated subscriptions (optional) */
  privateKey?: string;
  /** Wallet address for user-specific subscriptions (optional) */
  walletAddress?: string;
  /** Ultra-low latency mode - skip position context, emit immediately */
  ultraLowLatency?: boolean;
}

interface HlFillEvent {
  user: string;
  coin: string;
  startPosition?: string;
  closedPnl?: string;
  dir: string;
  hash: string;
  oid: number;
  px: string;
  side: string;
  sz: string;
  time: number;
  fee?: string;
}

interface HlTradeEvent {
  coin: string;
  side: string;
  px: string;
  sz: string;
  time: number;
  hash: string;
  tid?: number;
  crossed?: boolean;
}

// =============================================================================
// IMPLEMENTATION
// =============================================================================

export function createHyperliquidWhaleTracker(
  config: HyperliquidWhaleTrackerConfig = {}
): PlatformWhaleTracker {
  const emitter = new EventEmitter() as PlatformWhaleTracker;

  // Config
  const trackedCoins = new Set(config.trackedCoins || DEFAULT_TRACKED_COINS);
  const minTradeSize = config.minTradeSize || DEFAULT_MIN_TRADE_SIZE;
  const trackedWallets = new Set<string>(config.trackedWallets || []);
  const autoDiscovery = config.autoDiscovery ?? true;
  const autoDiscoveryMultiplier = config.autoDiscoveryMultiplier || DEFAULT_AUTO_DISCOVERY_MULTIPLIER;
  const ultraLowLatency = config.ultraLowLatency ?? true; // Default to low latency
  const fetchPositionContext = ultraLowLatency ? false : (config.fetchPositionContext ?? true);

  // State
  let running = false;
  let connectionState: ConnectionState = 'disconnected';
  let sdk: Hyperliquid | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let reconnectAttempts = 0;
  const recentTrades: WhaleTrade[] = [];
  const whalePositionCache = new Map<string, WhalePosition>();
  const processedHashes = new Set<string>(); // Dedupe trades

  // Price cache for USD value calculation
  let midPrices: Record<string, string> = {};

  // ==========================================================================
  // HELPER FUNCTIONS
  // ==========================================================================

  function getUsdValue(coin: string, size: number, price: number): number {
    // For perpetuals, USD value = size * price
    return Math.abs(size) * price;
  }

  async function fetchWhalePositionContext(
    address: string,
    coin: string
  ): Promise<Partial<WhaleTrade>> {
    try {
      const [userState, activeData] = await Promise.all([
        getUserState(address),
        getActiveAssetData(address, coin).catch(() => null),
      ]);

      // Find position for this coin
      const position = userState.assetPositions.find(
        (p) => p.position.coin === coin
      );

      if (!position) {
        return {};
      }

      const pos = position.position;
      const leverage = activeData?.leverage?.value || undefined;

      return {
        leverage,
        entryPrice: parseFloat(pos.entryPx),
        positionSize: parseFloat(pos.szi),
        unrealizedPnl: parseFloat(pos.unrealizedPnl),
        marginType: activeData?.leverage?.type === 'cross' ? 'cross' : 'isolated',
      };
    } catch (error) {
      logger.debug({ address, coin, error }, 'Failed to fetch position context');
      return {};
    }
  }

  async function processTradeEvent(
    trade: HlTradeEvent | HlFillEvent,
    user?: string
  ): Promise<void> {
    // Dedupe
    const hash = 'hash' in trade ? trade.hash : undefined;
    if (hash && processedHashes.has(hash)) {
      return;
    }
    if (hash) {
      processedHashes.add(hash);
      // Limit set size
      if (processedHashes.size > 10000) {
        const entries = Array.from(processedHashes);
        processedHashes.clear();
        for (const h of entries.slice(-5000)) {
          processedHashes.add(h);
        }
      }
    }

    const coin = trade.coin;
    const price = parseFloat(trade.px);
    const size = parseFloat(trade.sz);
    const usdValue = getUsdValue(coin, size, price);

    // Check if meets threshold
    if (usdValue < minTradeSize) {
      return;
    }

    // Get wallet address
    const walletAddress = user || (trade as HlFillEvent).user;

    // Check if from tracked wallet or should auto-discover
    const isTracked = walletAddress && trackedWallets.has(walletAddress);
    const shouldDiscover = autoDiscovery &&
      walletAddress &&
      usdValue >= minTradeSize * autoDiscoveryMultiplier;

    if (!isTracked && !shouldDiscover && walletAddress) {
      return;
    }

    // Auto-discover
    if (shouldDiscover && walletAddress && !trackedWallets.has(walletAddress)) {
      trackedWallets.add(walletAddress);
      logger.info({
        address: walletAddress,
        usdValue,
        coin,
      }, 'Hyperliquid: New whale discovered');
    }

    // Determine side
    // HL uses 'B'/'A' or 'Buy'/'Sell' or 'Long'/'Short'
    const sideStr = trade.side.toLowerCase();
    const side: 'buy' | 'sell' =
      sideStr === 'b' || sideStr === 'buy' || sideStr === 'long' ? 'buy' : 'sell';

    // Create base whale trade
    const whaleTrade: WhaleTrade = {
      id: hash || `hl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      platform: 'hyperliquid',
      walletAddress: walletAddress || null,
      timestamp: new Date(trade.time),
      symbol: coin,
      side,
      size,
      price,
      usdValue,
      isLiquidation: false,
    };

    // In ultra-low latency mode, emit immediately then fetch context async
    if (ultraLowLatency) {
      // Emit trade immediately - don't wait for position context
      logger.info({
        wallet: walletAddress?.slice(0, 8),
        coin,
        side,
        size,
        price,
        usdValue,
        latencyMode: 'ultra-low',
      }, 'Hyperliquid: Whale trade detected (instant)');

      emitter.emit('trade', whaleTrade);

      // Fetch context in background (non-blocking) for later updates
      if (fetchPositionContext && walletAddress) {
        fetchWhalePositionContext(walletAddress, coin).then(context => {
          Object.assign(whaleTrade, context);
          emitter.emit('tradeContextUpdated', whaleTrade);
        }).catch(() => {});
      }
      return; // Early return - skip redundant emit below
    }

    // Fetch position context if enabled (sync mode - adds latency)
    if (fetchPositionContext && walletAddress) {
      const context = await fetchWhalePositionContext(walletAddress, coin);
      Object.assign(whaleTrade, context);
    }

    // Check for position open/close
    const fillTrade = trade as HlFillEvent;
    if (fillTrade.startPosition !== undefined) {
      const startPos = parseFloat(fillTrade.startPosition);
      const closedPnl = parseFloat(fillTrade.closedPnl || '0');

      // Position opened if starting from 0
      if (Math.abs(startPos) < 0.0001) {
        const position: WhalePosition = {
          platform: 'hyperliquid',
          walletAddress: walletAddress || '',
          symbol: coin,
          side: side === 'buy' ? 'long' : 'short',
          size,
          entryPrice: price,
          markPrice: price,
          leverage: whaleTrade.leverage,
          unrealizedPnl: 0,
          lastUpdated: new Date(),
        };
        whalePositionCache.set(`${walletAddress}_${coin}`, position);
        emitter.emit('positionOpened', position);
      }

      // Position closed if closed PnL is significant
      if (Math.abs(closedPnl) > 0.01) {
        const cachedPos = whalePositionCache.get(`${walletAddress}_${coin}`);
        if (cachedPos) {
          whalePositionCache.delete(`${walletAddress}_${coin}`);
          emitter.emit('positionClosed', cachedPos, closedPnl);
        }
      }
    }

    // Store recent trade
    recentTrades.unshift(whaleTrade);
    if (recentTrades.length > 1000) {
      recentTrades.pop();
    }

    logger.info({
      wallet: walletAddress?.slice(0, 8),
      coin,
      side,
      size,
      price,
      usdValue,
      leverage: whaleTrade.leverage,
    }, 'Hyperliquid: Whale trade detected');

    emitter.emit('trade', whaleTrade);
  }

  async function connectWebSocket(): Promise<void> {
    try {
      sdk = new Hyperliquid({
        enableWs: true,
        privateKey: config.privateKey,
        walletAddress: config.walletAddress,
        testnet: false,
      });

      await sdk.connect();

      connectionState = 'connected';
      reconnectAttempts = 0;
      emitter.emit('connectionState', connectionState);

      logger.info({
        coins: Array.from(trackedCoins).length,
        trackedWallets: trackedWallets.size,
      }, 'Hyperliquid whale tracker connected');

      // Subscribe to mid prices for USD calculations
      sdk.subscriptions.subscribeToAllMids((data: Record<string, string>) => {
        midPrices = data;
      });

      // Subscribe to trades for each tracked coin
      for (const coin of trackedCoins) {
        await sdk.subscriptions.subscribeToTrades(coin, (trades) => {
          // HL SDK may send array of trades
          const tradeArray = Array.isArray(trades) ? trades : [trades];
          for (const trade of tradeArray) {
            processTradeEvent(trade as HlTradeEvent).catch((err) => {
              logger.error({ err, coin }, 'Error processing HL trade');
            });
          }
        });
      }

      // Subscribe to user fills for tracked wallets (if we have auth)
      if (config.walletAddress && config.privateKey) {
        await sdk.subscriptions.subscribeToUserFills(
          config.walletAddress,
          (fills) => {
            const fillArray = Array.isArray(fills) ? fills : [fills];
            for (const fill of fillArray) {
              processTradeEvent(fill as HlFillEvent, config.walletAddress).catch(
                (err) => {
                  logger.error({ err }, 'Error processing HL user fill');
                }
              );
            }
          }
        );
      }
    } catch (error) {
      logger.error({ error }, 'Hyperliquid WebSocket connection failed');
      connectionState = 'disconnected';
      emitter.emit('connectionState', connectionState);
      emitter.emit('error', error instanceof Error ? error : new Error(String(error)));
      scheduleReconnect();
    }
  }

  function scheduleReconnect(): void {
    if (!running || reconnectTimer) return;

    connectionState = 'reconnecting';
    emitter.emit('connectionState', connectionState);

    // Ultra-low latency: faster reconnect (100ms base, max 5s)
    const delay = ultraLowLatency
      ? Math.min(5000, 100 + reconnectAttempts * 500)
      : Math.min(30000, 2000 + reconnectAttempts * 2000);
    reconnectAttempts++;

    logger.info({ delay, attempt: reconnectAttempts }, 'Scheduling HL reconnect');

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (running) {
        connectWebSocket();
      }
    }, delay);
  }

  function disconnectWebSocket(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (sdk) {
      try {
        sdk.disconnect();
      } catch (err) {
        logger.debug({ err }, 'Error disconnecting HL SDK');
      }
      sdk = null;
    }

    connectionState = 'disconnected';
    emitter.emit('connectionState', connectionState);
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  Object.defineProperty(emitter, 'platform', {
    value: 'hyperliquid' as const,
    writable: false,
    enumerable: true,
  });

  Object.assign(emitter, {
    async start(): Promise<void> {
      if (running) return;
      running = true;

      logger.info({
        coins: Array.from(trackedCoins),
        wallets: Array.from(trackedWallets).slice(0, 5),
        minTradeSize,
      }, 'Starting Hyperliquid whale tracker');

      // Initial price fetch
      try {
        midPrices = await getAllMids();
      } catch (err) {
        logger.warn({ err }, 'Failed to fetch initial mid prices');
      }

      await connectWebSocket();
    },

    stop(): void {
      if (!running) return;
      running = false;

      logger.info('Stopping Hyperliquid whale tracker');
      disconnectWebSocket();
    },

    isRunning(): boolean {
      return running;
    },

    trackAddress(address: string): void {
      trackedWallets.add(address);
      logger.debug({ address }, 'Tracking Hyperliquid address');
    },

    untrackAddress(address: string): void {
      trackedWallets.delete(address);
      logger.debug({ address }, 'Untracked Hyperliquid address');
    },

    getConnectionState(): ConnectionState {
      return connectionState;
    },

    getRecentTrades(limit = 100): WhaleTrade[] {
      return recentTrades.slice(0, limit);
    },

    async getPositions(address: string): Promise<WhalePosition[]> {
      try {
        const userState = await getUserState(address);
        const positions: WhalePosition[] = [];

        for (const assetPos of userState.assetPositions) {
          const pos = assetPos.position;
          const size = parseFloat(pos.szi);
          if (Math.abs(size) < 0.0001) continue;

          // Try to get leverage
          let leverage: number | undefined;
          try {
            const activeData = await getActiveAssetData(address, pos.coin);
            leverage = activeData?.leverage?.value;
          } catch {
            // Ignore
          }

          positions.push({
            platform: 'hyperliquid',
            walletAddress: address,
            symbol: pos.coin,
            side: size > 0 ? 'long' : 'short',
            size: Math.abs(size),
            entryPrice: parseFloat(pos.entryPx),
            markPrice: parseFloat(midPrices[pos.coin] || pos.entryPx),
            leverage,
            unrealizedPnl: parseFloat(pos.unrealizedPnl),
            lastUpdated: new Date(),
          });
        }

        return positions;
      } catch (error) {
        logger.error({ address, error }, 'Failed to get HL positions');
        return [];
      }
    },

    /**
     * Subscribe to a specific coin
     */
    async trackCoin(coin: string): Promise<void> {
      if (trackedCoins.has(coin)) return;

      trackedCoins.add(coin);

      if (sdk && running) {
        await sdk.subscriptions.subscribeToTrades(coin, (trades) => {
          const tradeArray = Array.isArray(trades) ? trades : [trades];
          for (const trade of tradeArray) {
            processTradeEvent(trade as HlTradeEvent).catch((err) => {
              logger.error({ err, coin }, 'Error processing HL trade');
            });
          }
        });
      }

      logger.debug({ coin }, 'Now tracking Hyperliquid coin');
    },

    /**
     * Get tracked coins
     */
    getTrackedCoins(): string[] {
      return Array.from(trackedCoins);
    },

    /**
     * Get whale leaderboard (top traders by PnL)
     */
    async getTopWhales(timeframe: 'day' | 'week' | 'month' = 'day'): Promise<Array<{
      address: string;
      pnl: number;
      volume: number;
      roi: number;
    }>> {
      const { getLeaderboard } = await import('../../exchanges/hyperliquid/index');
      return getLeaderboard(timeframe);
    },

    /**
     * Get historical fills for a whale
     */
    async getWhaleHistory(
      address: string,
      startTime?: number
    ): Promise<WhaleTrade[]> {
      try {
        const fills = await getUserFills(address);
        const start = startTime || Date.now() - 7 * 24 * 60 * 60 * 1000;

        return fills
          .filter((f) => f.time >= start)
          .map((f): WhaleTrade => {
            const price = parseFloat(f.px);
            const size = parseFloat(f.sz);
            return {
              id: f.hash,
              platform: 'hyperliquid',
              walletAddress: address,
              timestamp: new Date(f.time),
              symbol: f.coin,
              side: f.side.toLowerCase() === 'b' || f.side.toLowerCase() === 'buy'
                ? 'buy' : 'sell',
              size,
              price,
              usdValue: price * size,
              isLiquidation: false,
            };
          });
      } catch (error) {
        logger.error({ address, error }, 'Failed to get whale history');
        return [];
      }
    },
  } as Partial<PlatformWhaleTracker>);

  return emitter;
}

// =============================================================================
// EXPORTS
// =============================================================================

export { DEFAULT_TRACKED_COINS as HYPERLIQUID_DEFAULT_COINS };
