/**
 * PriceService - Real-time price feed from Binance WebSocket
 *
 * Features:
 * - Connects to Binance WebSocket for live prices
 * - Auto-reconnection with exponential backoff
 * - Price caching and change calculations
 * - Event emission for real-time updates
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';

export interface PriceData {
  symbol: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  timestamp: number;
}

export interface PriceServiceConfig {
  symbols?: string[];
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

// Default symbols to track (Binance format)
const DEFAULT_SYMBOLS = [
  'btcusdt', 'ethusdt', 'solusdt', 'bnbusdt', 'xrpusdt',
  'dogeusdt', 'adausdt', 'avaxusdt', 'linkusdt', 'dotusdt',
  'maticusdt', 'ltcusdt', 'atomusdt', 'uniusdt', 'aptusdt'
];

// Map Binance symbols to display format
const SYMBOL_MAP: Record<string, string> = {
  'btcusdt': 'BTC/USDT',
  'ethusdt': 'ETH/USDT',
  'solusdt': 'SOL/USDT',
  'bnbusdt': 'BNB/USDT',
  'xrpusdt': 'XRP/USDT',
  'dogeusdt': 'DOGE/USDT',
  'adausdt': 'ADA/USDT',
  'avaxusdt': 'AVAX/USDT',
  'linkusdt': 'LINK/USDT',
  'dotusdt': 'DOT/USDT',
  'maticusdt': 'MATIC/USDT',
  'ltcusdt': 'LTC/USDT',
  'atomusdt': 'ATOM/USDT',
  'uniusdt': 'UNI/USDT',
  'aptusdt': 'APT/USDT',
};

export class PriceService extends EventEmitter {
  private ws: WebSocket | null = null;
  private prices: Map<string, PriceData> = new Map();
  private symbols: string[];
  private reconnectInterval: number;
  private maxReconnectAttempts: number;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;
  private shouldReconnect: boolean = true;

  constructor(config: PriceServiceConfig = {}) {
    super();
    this.symbols = config.symbols || DEFAULT_SYMBOLS;
    this.reconnectInterval = config.reconnectInterval || 5000;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 10;

    // Initialize with default prices
    this.initializeDefaultPrices();
  }

  /**
   * Initialize with realistic default prices
   */
  private initializeDefaultPrices(): void {
    const defaults: Record<string, Partial<PriceData>> = {
      'BTC/USDT': { price: 95000, high24h: 96000, low24h: 93000, volume24h: 15000000000 },
      'ETH/USDT': { price: 3200, high24h: 3300, low24h: 3100, volume24h: 8000000000 },
      'SOL/USDT': { price: 180, high24h: 185, low24h: 175, volume24h: 2500000000 },
      'BNB/USDT': { price: 680, high24h: 700, low24h: 660, volume24h: 1500000000 },
      'XRP/USDT': { price: 2.4, high24h: 2.5, low24h: 2.3, volume24h: 3000000000 },
      'DOGE/USDT': { price: 0.32, high24h: 0.34, low24h: 0.30, volume24h: 1000000000 },
      'ADA/USDT': { price: 0.95, high24h: 1.0, low24h: 0.90, volume24h: 800000000 },
      'AVAX/USDT': { price: 35, high24h: 37, low24h: 33, volume24h: 600000000 },
      'LINK/USDT': { price: 22, high24h: 23, low24h: 21, volume24h: 500000000 },
      'DOT/USDT': { price: 7.5, high24h: 8.0, low24h: 7.0, volume24h: 400000000 },
      'MATIC/USDT': { price: 0.55, high24h: 0.58, low24h: 0.52, volume24h: 350000000 },
      'LTC/USDT': { price: 95, high24h: 100, low24h: 90, volume24h: 300000000 },
      'ATOM/USDT': { price: 9.5, high24h: 10, low24h: 9, volume24h: 250000000 },
      'UNI/USDT': { price: 12, high24h: 13, low24h: 11, volume24h: 200000000 },
      'APT/USDT': { price: 8.5, high24h: 9, low24h: 8, volume24h: 180000000 },
    };

    for (const [symbol, data] of Object.entries(defaults)) {
      this.prices.set(symbol, {
        symbol,
        price: data.price!,
        change24h: 0,
        changePercent24h: 0,
        high24h: data.high24h!,
        low24h: data.low24h!,
        volume24h: data.volume24h!,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Connect to Binance WebSocket
   */
  connect(): void {
    if (this.ws && this.isConnected) {
      console.log('[PriceService] Already connected');
      return;
    }

    this.shouldReconnect = true;

    // Build combined stream URL
    const streams = this.symbols.map(s => `${s}@ticker`).join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    console.log(`[PriceService] Connecting to Binance WebSocket...`);

    try {
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        console.log('[PriceService] Connected to Binance WebSocket');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.emit('connected');

        // Start ping/pong to keep connection alive
        this.startPingInterval();
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleTickerMessage(message);
        } catch (error) {
          console.error('[PriceService] Error parsing message:', error);
        }
      });

      this.ws.on('error', (error) => {
        console.error('[PriceService] WebSocket error:', error.message);
        this.emit('error', error);
      });

      this.ws.on('close', (code, reason) => {
        console.log(`[PriceService] WebSocket closed: ${code} - ${reason}`);
        this.isConnected = false;
        this.stopPingInterval();
        this.emit('disconnected');

        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('pong', () => {
        // Connection is healthy
      });
    } catch (error) {
      console.error('[PriceService] Failed to create WebSocket:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Handle incoming ticker message from Binance
   */
  private handleTickerMessage(message: { stream: string; data: BinanceTickerData }): void {
    const { data } = message;
    if (!data || !data.s) return;

    const binanceSymbol = data.s.toLowerCase();
    const displaySymbol = SYMBOL_MAP[binanceSymbol];

    if (!displaySymbol) return;

    const priceData: PriceData = {
      symbol: displaySymbol,
      price: parseFloat(data.c),
      change24h: parseFloat(data.p),
      changePercent24h: parseFloat(data.P),
      high24h: parseFloat(data.h),
      low24h: parseFloat(data.l),
      volume24h: parseFloat(data.v) * parseFloat(data.c), // Volume in quote currency
      timestamp: Date.now(),
    };

    const previousPrice = this.prices.get(displaySymbol);
    this.prices.set(displaySymbol, priceData);

    // Emit price update event
    this.emit('price', priceData);

    // Emit significant price change (>0.1% from last known price)
    if (previousPrice && Math.abs((priceData.price - previousPrice.price) / previousPrice.price) > 0.001) {
      this.emit('priceChange', {
        symbol: displaySymbol,
        oldPrice: previousPrice.price,
        newPrice: priceData.price,
        changePercent: ((priceData.price - previousPrice.price) / previousPrice.price) * 100,
      });
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[PriceService] Max reconnect attempts reached or reconnection disabled');
      this.emit('reconnectFailed');
      return;
    }

    const delay = this.reconnectInterval * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    console.log(`[PriceService] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.isConnected) {
        this.ws.ping();
      }
    }, 30000);
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    this.shouldReconnect = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopPingInterval();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    console.log('[PriceService] Disconnected');
  }

  /**
   * Get current price for a symbol
   */
  getPrice(symbol: string): PriceData | null {
    return this.prices.get(symbol) || null;
  }

  /**
   * Get all current prices
   */
  getAllPrices(): Record<string, PriceData> {
    const result: Record<string, PriceData> = {};
    for (const [symbol, data] of this.prices) {
      result[symbol] = data;
    }
    return result;
  }

  /**
   * Get prices as array
   */
  getPricesArray(): PriceData[] {
    return Array.from(this.prices.values());
  }

  /**
   * Check if service is connected
   */
  isServiceConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get service status
   */
  getStatus(): { connected: boolean; priceCount: number; reconnectAttempts: number } {
    return {
      connected: this.isConnected,
      priceCount: this.prices.size,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}

// Binance ticker data structure
interface BinanceTickerData {
  e: string;  // Event type
  E: number;  // Event time
  s: string;  // Symbol
  p: string;  // Price change
  P: string;  // Price change percent
  w: string;  // Weighted average price
  x: string;  // Previous close price
  c: string;  // Current price
  Q: string;  // Last quantity
  b: string;  // Best bid price
  B: string;  // Best bid quantity
  a: string;  // Best ask price
  A: string;  // Best ask quantity
  o: string;  // Open price
  h: string;  // High price
  l: string;  // Low price
  v: string;  // Total traded volume (base asset)
  q: string;  // Total traded volume (quote asset)
  O: number;  // Statistics open time
  C: number;  // Statistics close time
  F: number;  // First trade ID
  L: number;  // Last trade ID
  n: number;  // Total number of trades
}

// Singleton instance
let priceServiceInstance: PriceService | null = null;

/**
 * Get the singleton PriceService instance
 */
export function getPriceService(): PriceService {
  if (!priceServiceInstance) {
    priceServiceInstance = new PriceService();
  }
  return priceServiceInstance;
}

/**
 * Create a new PriceService instance (for custom configurations)
 */
export function createPriceService(config?: PriceServiceConfig): PriceService {
  return new PriceService(config);
}
