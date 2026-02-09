/**
 * HTTP + WebSocket server
 */

import express, { Request } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createHttpServer, Server, IncomingMessage } from 'http';
import { logger } from '../utils/logger';
import type { Config } from '../types';
import type { WebhookManager } from '../automation/webhooks';
import { createWebhookMiddleware } from '../automation/webhooks';
import { createX402Server, type X402Middleware } from '../payments/x402';
import {
  runHealthCheck,
  getErrorStats,
  getRequestMetrics,
  type HealthStatus,
} from '../utils/production';
import type { TickStreamer } from '../services/tick-streamer';
import type { FeatureEngineering } from '../services/feature-engineering';
import type { CredentialsManager } from '../credentials/index';
import type { PairingService } from '../pairing/index';
import type { CopyTradingOrchestrator } from '../trading/copy-trading-orchestrator';
import type { Platform } from '../types';

export interface GatewayServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  getWebSocketServer(): WebSocketServer | null;
  setChannelWebhookHandler(handler: ChannelWebhookHandler | null): void;
  setMarketIndexHandler(handler: MarketIndexHandler | null): void;
  setMarketIndexStatsHandler(handler: MarketIndexStatsHandler | null): void;
  setMarketIndexSyncHandler(handler: MarketIndexSyncHandler | null): void;
  setPerformanceDashboardHandler(handler: PerformanceDashboardHandler | null): void;
  setBacktestHandler(handler: BacktestHandler | null): void;
  setTicksHandler(handler: TicksHandler | null): void;
  setOHLCHandler(handler: OHLCHandler | null): void;
  setOrderbookHistoryHandler(handler: OrderbookHistoryHandler | null): void;
  setTickRecorderStatsHandler(handler: TickRecorderStatsHandler | null): void;
  setTickStreamer(streamer: TickStreamer | null): void;
  setFeatureEngineering(service: FeatureEngineering | null): void;
  setCredentialsManager(manager: CredentialsManager | null): void;
  setPairingService(service: PairingService | null): void;
  setCopyTradingOrchestrator(orchestrator: CopyTradingOrchestrator | null): void;
}

export type ChannelWebhookHandler = (
  platform: string,
  event: unknown,
  req: Request
) => Promise<unknown>;

export type MarketIndexHandler = (
  req: Request
) => Promise<{ results: unknown[] } | { error: string; status?: number }>;

export type MarketIndexStatsHandler = (
  req: Request
) => Promise<{ stats: unknown } | { error: string; status?: number }>;

export type MarketIndexSyncHandler = (
  req: Request
) => Promise<{ result: unknown } | { error: string; status?: number }>;

export type BacktestHandler = (
  req: Request
) => Promise<{
  result: {
    strategyId: string;
    metrics: {
      totalReturnPct: number;
      annualizedReturnPct: number;
      totalTrades: number;
      winRate: number;
      sharpeRatio: number;
      sortinoRatio: number;
      maxDrawdownPct: number;
      profitFactor: number;
    };
    trades: unknown[];
    equityCurve: Array<{ timestamp: string; equity: number }>;
    dailyReturns: Array<{ date: string; return: number }>;
  };
} | { error: string; status?: number }>;

export type PerformanceDashboardHandler = (
  req: Request
) => Promise<{
  stats: {
    totalTrades: number;
    winRate: number;
    totalPnl: number;
    avgPnlPct: number;
    sharpeRatio: number;
    maxDrawdown: number;
  };
  recentTrades: Array<{
    id: string;
    timestamp: string;
    market: string;
    side: string;
    size: number;
    entryPrice: number;
    exitPrice?: number;
    pnl?: number;
    pnlPct?: number;
    status: string;
  }>;
  dailyPnl: Array<{ date: string; pnl: number; cumulative: number }>;
  byStrategy: Array<{ strategy: string; trades: number; winRate: number; pnl: number }>;
} | { error: string; status?: number }>;

export type TicksHandler = (
  req: Request
) => Promise<{
  ticks: Array<{
    time: string;
    platform: string;
    marketId: string;
    outcomeId: string;
    price: number;
    prevPrice: number | null;
  }>;
} | { error: string; status?: number }>;

export type OHLCHandler = (
  req: Request
) => Promise<{
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    tickCount: number;
  }>;
} | { error: string; status?: number }>;

export type OrderbookHistoryHandler = (
  req: Request
) => Promise<{
  snapshots: Array<{
    time: string;
    platform: string;
    marketId: string;
    outcomeId: string;
    bids: Array<[number, number]>;
    asks: Array<[number, number]>;
    spread: number | null;
    midPrice: number | null;
  }>;
} | { error: string; status?: number }>;

export type TickRecorderStatsHandler = (
  req: Request
) => Promise<{
  stats: {
    ticksRecorded: number;
    orderbooksRecorded: number;
    ticksInBuffer: number;
    orderbooksInBuffer: number;
    lastFlushTime: number | null;
    dbConnected: boolean;
    platforms: string[];
  };
} | { error: string; status?: number }>;

export function createServer(
  config: Config['gateway'] & { x402?: Config['x402'] },
  webhooks?: WebhookManager,
  db?: { query: <T>(sql: string) => T[] }
): GatewayServer {
  const app = express();
  let httpServer: Server | null = null;
  let wss: WebSocketServer | null = null;
  let channelWebhookHandler: ChannelWebhookHandler | null = null;
  let marketIndexHandler: MarketIndexHandler | null = null;
  let marketIndexStatsHandler: MarketIndexStatsHandler | null = null;
  let marketIndexSyncHandler: MarketIndexSyncHandler | null = null;
  let performanceDashboardHandler: PerformanceDashboardHandler | null = null;
  let backtestHandler: BacktestHandler | null = null;
  let ticksHandler: TicksHandler | null = null;
  let ohlcHandler: OHLCHandler | null = null;
  let orderbookHistoryHandler: OrderbookHistoryHandler | null = null;
  let tickRecorderStatsHandler: TickRecorderStatsHandler | null = null;
  let tickStreamer: TickStreamer | null = null;
  let featureEngineering: FeatureEngineering | null = null;
  let credentialsManager: CredentialsManager | null = null;
  let pairingService: PairingService | null = null;
  let copyTradingOrchestrator: CopyTradingOrchestrator | null = null;

  // Auth middleware for sensitive endpoints
  const authToken = process.env.CLODDS_TOKEN;
  const requireAuth = (req: Request, res: express.Response, next: express.NextFunction) => {
    if (!authToken) {
      // No token configured - allow access (for development)
      return next();
    }
    const providedToken = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
    if (providedToken !== authToken) {
      res.status(401).json({ error: 'Unauthorized - provide valid token via Authorization header or ?token= param' });
      return;
    }
    next();
  };

  const corsConfig = config.cors ?? false;
  app.use((req, res, next) => {
    if (!corsConfig) {
      return next();
    }

    const originHeader = req.headers.origin;
    let origin = '';
    let allowCredentials = false;

    if (Array.isArray(corsConfig)) {
      // Security: Only allow specific origins from allowlist
      if (originHeader && corsConfig.includes(originHeader)) {
        origin = originHeader;
        allowCredentials = true; // Safe to allow credentials with specific origin
      }
    } else if (corsConfig === true) {
      // Security: Wildcard origin - do NOT allow credentials
      origin = '*';
      allowCredentials = false;
    }

    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      // Security: Only allow credentials with specific origins, never with wildcard
      if (allowCredentials) {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  });

  // IP-based rate limiting
  const ipRequestCounts = new Map<string, { count: number; resetAt: number }>();
  const IP_RATE_LIMIT = parseInt(process.env.CLODDS_IP_RATE_LIMIT || '100', 10); // requests per minute
  const IP_RATE_WINDOW_MS = 60 * 1000; // 1 minute

  app.use((req, res, next) => {
    // Skip rate limiting for health checks
    if (req.path === '/health') return next();

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let record = ipRequestCounts.get(ip);

    if (!record || now > record.resetAt) {
      record = { count: 0, resetAt: now + IP_RATE_WINDOW_MS };
      ipRequestCounts.set(ip, record);
    }

    record.count++;

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', IP_RATE_LIMIT);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, IP_RATE_LIMIT - record.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetAt / 1000));

    if (record.count > IP_RATE_LIMIT) {
      logger.warn({ ip, count: record.count }, 'Rate limit exceeded');
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((record.resetAt - now) / 1000),
      });
      return;
    }

    next();
  });

  // Cleanup old IP records every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of ipRequestCounts) {
      if (now > record.resetAt + IP_RATE_WINDOW_MS) {
        ipRequestCounts.delete(ip);
      }
    }
  }, 5 * 60 * 1000);

  // HTTPS enforcement & security headers
  app.use((req, res, next) => {
    // HSTS header (only send over HTTPS or if explicitly enabled)
    const hstsEnabled = process.env.CLODDS_HSTS_ENABLED === 'true';
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';

    if (hstsEnabled || isSecure) {
      // 1 year HSTS with includeSubDomains
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    // Additional security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Redirect HTTP to HTTPS if forced
    const forceHttps = process.env.CLODDS_FORCE_HTTPS === 'true';
    if (forceHttps && !isSecure) {
      const host = req.headers.host || 'localhost';
      res.redirect(301, `https://${host}${req.url}`);
      return;
    }

    next();
  });

  app.use(express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      // Capture raw body for webhook signature verification
      (req as any).rawBody = buf.toString();
    },
  }));

  // x402 payment middleware for premium endpoints
  let x402: X402Middleware | null = null;
  if (config.x402?.server?.payToAddress) {
    x402 = createX402Server(
      {
        payToAddress: config.x402.server.payToAddress,
        network: config.x402.server.network || 'solana',
        facilitatorUrl: config.x402.facilitatorUrl,
      },
      {
        'POST /api/compute': { priceUsd: 0.01, description: 'Compute request' },
        'POST /api/backtest': { priceUsd: 0.05, description: 'Strategy backtest' },
        'GET /api/features': { priceUsd: 0.002, description: 'Feature snapshot' },
      }
    );
    logger.info({ network: config.x402.server.network || 'solana' }, 'x402 payment middleware enabled');

    // Apply x402 middleware to premium routes
    app.use(['/api/compute', '/api/backtest', '/api/features'], x402.middleware);
  }

  // Health check endpoint (enhanced for production)
  app.get('/health', async (req, res) => {
    const deep = req.query.deep === 'true';

    if (!db) {
      // Simple health check if no DB provided
      res.json({ status: 'healthy', timestamp: Date.now() });
      return;
    }

    try {
      const health: HealthStatus = await runHealthCheck(db, {
        checkExternalApis: deep,
      });

      const httpStatus = health.status === 'healthy' ? 200 :
                         health.status === 'degraded' ? 200 : 503;

      res.status(httpStatus).json(health);
    } catch (err) {
      logger.error({ err }, 'Health check failed');
      res.status(503).json({
        status: 'unhealthy',
        timestamp: Date.now(),
        error: 'Health check failed',
      });
    }
  });

  // Metrics endpoint (for monitoring) - requires auth if CLODDS_TOKEN is set
  app.get('/metrics', requireAuth, (_req, res) => {
    const requestMetrics = getRequestMetrics();
    const errorStats = getErrorStats();
    const memUsage = process.memoryUsage();

    res.json({
      timestamp: Date.now(),
      requests: requestMetrics,
      errors: {
        recentCount: errorStats.recentCount,
        topErrors: errorStats.topErrors,
      },
      memory: {
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
        rssMB: Math.round(memUsage.rss / 1024 / 1024),
      },
    });
  });

  // x402 payment stats endpoint
  app.get('/api/x402/stats', requireAuth, (_req, res) => {
    if (!x402) {
      res.json({ enabled: false });
      return;
    }
    res.json({ enabled: true, ...x402.getStats() });
  });

  // API info endpoint
  app.get('/', (_req, res) => {
    res.json({
      name: 'clodds',
      version: process.env.npm_package_version || '0.1.0',
      description: 'AI assistant for prediction markets',
      endpoints: {
        websocket: '/ws',
        webchat: '/chat',
        tickStream: '/api/ticks/stream',
        health: '/health',
        healthDeep: '/health?deep=true',
        metrics: '/metrics',
        dashboard: '/dashboard',
        tickStreamerStats: '/api/tick-streamer/stats',
        features: '/api/features/:platform/:marketId',
        featuresAll: '/api/features',
        featuresStats: '/api/features/stats',
        integrations: {
          connect: 'POST /api/v1/integrations/:platform/connect',
          disconnect: 'POST /api/v1/integrations/:platform/disconnect',
          test: 'POST /api/v1/integrations/:platform/test',
          status: 'GET /api/v1/integrations/:platform/status',
          connected: 'GET /api/v1/integrations/connected',
        },
        pairing: {
          generateCode: 'POST /api/v1/pairing/code',
          linkedAccounts: 'GET /api/v1/pairing/linked',
          unlinkAccount: 'DELETE /api/v1/pairing/linked/:channel/:userId',
        },
        copyTrading: {
          configs: 'GET /api/v1/copy-trading/configs',
          createConfig: 'POST /api/v1/copy-trading/configs',
          getConfig: 'GET /api/v1/copy-trading/configs/:id',
          updateConfig: 'PATCH /api/v1/copy-trading/configs/:id',
          toggleConfig: 'POST /api/v1/copy-trading/configs/:id/toggle',
          deleteConfig: 'DELETE /api/v1/copy-trading/configs/:id',
          stats: 'GET /api/v1/copy-trading/stats',
          history: 'GET /api/v1/copy-trading/history',
          status: 'GET /api/v1/copy-trading/status',
        },
      },
    });
  });

  // Serve simple WebChat HTML client
  app.get('/webchat', (_req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Clodds WebChat</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 650px;
      margin: 0 auto;
      padding: 20px;
      background: linear-gradient(180deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
      min-height: 100vh;
      color: #e2e8f0;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
      padding: 16px;
      background: rgba(0,0,0,0.3);
      border-radius: 12px;
      border: 1px solid #334155;
    }
    .header img { width: 44px; height: 44px; border-radius: 10px; }
    .header h1 {
      margin: 0;
      font-size: 22px;
      background: linear-gradient(180deg, #fff 0%, #22d3ee 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    #messages {
      height: 420px;
      overflow-y: auto;
      border: 1px solid #334155;
      padding: 12px;
      margin-bottom: 12px;
      background: rgba(30, 41, 59, 0.5);
      border-radius: 12px;
    }
    #messages::-webkit-scrollbar { width: 6px; }
    #messages::-webkit-scrollbar-track { background: transparent; }
    #messages::-webkit-scrollbar-thumb { background: #475569; border-radius: 3px; }
    .msg { margin: 10px 0; padding: 12px 16px; border-radius: 12px; line-height: 1.5; }
    .user {
      background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%);
      color: #0f172a;
      text-align: right;
      margin-left: 20%;
      font-weight: 500;
    }
    .bot {
      background: #334155;
      color: #e2e8f0;
      margin-right: 10%;
      border: 1px solid #475569;
    }
    .bot pre {
      margin: 8px 0 0 0;
      font-family: 'SF Mono', Monaco, 'Consolas', monospace;
      font-size: 12px;
      white-space: pre-wrap;
      line-height: 1.5;
      color: #94a3b8;
    }
    .system {
      background: rgba(34, 211, 238, 0.1);
      border: 1px solid rgba(34, 211, 238, 0.3);
      color: #22d3ee;
      font-size: 0.85em;
      text-align: center;
    }
    #input-area { display: flex; gap: 10px; }
    #input {
      flex: 1;
      padding: 14px 18px;
      border: 1px solid #334155;
      border-radius: 12px;
      font-size: 14px;
      background: #1e293b;
      color: #e2e8f0;
      outline: none;
      transition: border-color 0.2s;
    }
    #input:focus { border-color: #22d3ee; }
    #input::placeholder { color: #64748b; }
    button {
      padding: 14px 28px;
      background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
      color: #0f172a;
      border: none;
      border-radius: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.1s, box-shadow 0.2s;
    }
    button:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 20px rgba(34, 211, 238, 0.3);
    }
    button:active { transform: translateY(0); }
  </style>
</head>
<body>
  <div class="header">
    <img src="https://cloddsbot.com/logo.png" alt="Clodds" onerror="this.style.display='none'" />
    <h1>Clodds WebChat</h1>
  </div>
  <div id="messages"></div>
  <div id="input-area">
    <input type="text" id="input" placeholder="Ask about prediction markets..." />
    <button onclick="send()">Send</button>
  </div>
  <script>
    const port = window.location.port || 80;
    const ws = new WebSocket('ws://' + window.location.hostname + ':' + port + '/chat');
    const messages = document.getElementById('messages');
    const input = document.getElementById('input');

    function addMsg(text, cls, messageId) {
      const div = document.createElement('div');
      div.className = 'msg ' + cls;
      if (messageId) {
        div.dataset.messageId = messageId;
      }
      div.textContent = text;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }

    function getToken() {
      const params = new URLSearchParams(window.location.search);
      const queryToken = params.get('token');
      if (queryToken) {
        localStorage.setItem('webchat_token', queryToken);
        return queryToken;
      }
      const saved = localStorage.getItem('webchat_token');
      if (saved) return saved;
      const promptToken = window.prompt('Enter WebChat token (leave blank for none):');
      if (promptToken) {
        localStorage.setItem('webchat_token', promptToken);
        return promptToken;
      }
      return '';
    }

    ws.onopen = () => {
      addMsg('Connected. Authenticating...', 'system');
      const token = getToken();
      ws.send(JSON.stringify({ type: 'auth', token, userId: 'web-' + Date.now() }));
    };

    function renderAttachments(attachments) {
      if (!Array.isArray(attachments) || attachments.length === 0) return [];
      const nodes = [];
      for (const attachment of attachments) {
        const resolvedUrl = attachment.url || (attachment.data && attachment.mimeType
          ? 'data:' + attachment.mimeType + ';base64,' + attachment.data
          : null);
        if (attachment.type === 'image' && resolvedUrl) {
          const img = document.createElement('img');
          img.src = resolvedUrl || '';
          img.style.maxWidth = '100%';
          img.style.display = 'block';
          img.style.marginTop = '6px';
          nodes.push(img);
          continue;
        }
        if ((attachment.type === 'video' || attachment.type === 'audio') && resolvedUrl) {
          const media = document.createElement(attachment.type === 'video' ? 'video' : 'audio');
          media.src = resolvedUrl;
          media.controls = true;
          media.style.width = '100%';
          media.style.marginTop = '6px';
          nodes.push(media);
          continue;
        }
        const link = document.createElement('a');
        link.href = resolvedUrl || '#';
        link.textContent = attachment.filename || attachment.mimeType || 'attachment';
        link.style.display = 'block';
        link.style.marginTop = '6px';
        link.target = '_blank';
        nodes.push(link);
      }
      return nodes;
    }

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'authenticated') {
        addMsg('Ready! Ask me about prediction markets.', 'system');
      } else if (msg.type === 'message') {
        const wrapper = document.createElement('div');
        wrapper.className = 'msg bot';
        if (msg.messageId) {
          wrapper.dataset.messageId = msg.messageId;
        }
        const textNode = document.createElement('div');
        textNode.textContent = msg.text || '';
        wrapper.appendChild(textNode);
        const nodes = renderAttachments(msg.attachments || []);
        for (const node of nodes) wrapper.appendChild(node);
        messages.appendChild(wrapper);
        messages.scrollTop = messages.scrollHeight;
      } else if (msg.type === 'edit') {
        const node = Array.from(messages.children)
          .find((child) => child.dataset && child.dataset.messageId === msg.messageId);
        if (node) {
          node.textContent = msg.text || '';
        }
      } else if (msg.type === 'delete') {
        const node = Array.from(messages.children)
          .find((child) => child.dataset && child.dataset.messageId === msg.messageId);
        if (node) {
          node.remove();
        }
      } else if (msg.type === 'error') {
        addMsg('Error: ' + msg.message, 'system');
      }
    };

    ws.onclose = () => addMsg('Disconnected', 'system');

    function send() {
      const text = input.value.trim();
      if (text) {
        addMsg(text, 'user');
        ws.send(JSON.stringify({ type: 'message', text }));
        input.value = '';
      }
    }

    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') send(); });
  </script>
</body>
</html>
    `);
  });

  if (webhooks) {
    const webhookMiddleware = createWebhookMiddleware(webhooks);
    app.post('/webhook/*', webhookMiddleware);
    app.post('/webhook', webhookMiddleware);
  }

  // Channel webhooks (Teams, Google Chat, etc.)
  app.post('/channels/:platform', async (req, res) => {
    if (!channelWebhookHandler) {
      res.status(404).json({ error: 'Channel webhooks not configured' });
      return;
    }

    const platform = req.params.platform;
    try {
      const result = await channelWebhookHandler(platform, req.body, req);

      if (result === null || result === undefined) {
        res.status(200).send();
        return;
      }

      if (typeof result === 'string') {
        res.json({ text: result });
        return;
      }

      res.json(result);
    } catch (error) {
      logger.error({ error, platform }, 'Channel webhook handler failed');
      res.status(500).json({ error: 'Channel webhook error' });
    }
  });

  // Market index search endpoint
  app.get('/market-index/search', async (req, res) => {
    if (!marketIndexHandler) {
      res.status(404).json({ error: 'Market index handler not configured' });
      return;
    }

    try {
      const result = await marketIndexHandler(req);
      if ('error' in result) {
        res.status(result.status ?? 400).json({ error: result.error });
        return;
      }
      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Market index handler failed');
      res.status(500).json({ error: 'Market index error' });
    }
  });

  app.get('/market-index/stats', async (req, res) => {
    if (!marketIndexStatsHandler) {
      res.status(404).json({ error: 'Market index handler not configured' });
      return;
    }

    try {
      const result = await marketIndexStatsHandler(req);
      if ('error' in result) {
        res.status(result.status ?? 400).json({ error: result.error });
        return;
      }
      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Market index stats handler failed');
      res.status(500).json({ error: 'Market index error' });
    }
  });

  app.post('/market-index/sync', async (req, res) => {
    if (!marketIndexSyncHandler) {
      res.status(404).json({ error: 'Market index handler not configured' });
      return;
    }

    try {
      const result = await marketIndexSyncHandler(req);
      if ('error' in result) {
        res.status(result.status ?? 400).json({ error: result.error });
        return;
      }
      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Market index sync handler failed');
      res.status(500).json({ error: 'Market index error' });
    }
  });

  // Backtest API endpoint
  app.post('/api/backtest', async (req, res) => {
    if (!backtestHandler) {
      res.status(404).json({ error: 'Backtest handler not configured' });
      return;
    }

    try {
      const result = await backtestHandler(req);
      if ('error' in result) {
        res.status(result.status ?? 400).json({ error: result.error });
        return;
      }
      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Backtest handler failed');
      res.status(500).json({ error: 'Backtest error' });
    }
  });

  // Performance dashboard API endpoint
  app.get('/api/performance', async (req, res) => {
    if (!performanceDashboardHandler) {
      res.status(404).json({ error: 'Performance dashboard not configured' });
      return;
    }

    try {
      const result = await performanceDashboardHandler(req);
      if ('error' in result) {
        res.status(result.status ?? 400).json({ error: result.error });
        return;
      }
      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Performance dashboard handler failed');
      res.status(500).json({ error: 'Performance dashboard error' });
    }
  });

  // Tick recorder endpoints
  app.get('/api/ticks/:platform/:marketId', async (req, res) => {
    if (!ticksHandler) {
      res.status(404).json({ error: 'Tick recorder not enabled' });
      return;
    }

    try {
      const result = await ticksHandler(req);
      if ('error' in result) {
        res.status(result.status ?? 400).json({ error: result.error });
        return;
      }
      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Ticks handler failed');
      res.status(500).json({ error: 'Ticks query error' });
    }
  });

  app.get('/api/ohlc/:platform/:marketId', async (req, res) => {
    if (!ohlcHandler) {
      res.status(404).json({ error: 'Tick recorder not enabled' });
      return;
    }

    try {
      const result = await ohlcHandler(req);
      if ('error' in result) {
        res.status(result.status ?? 400).json({ error: result.error });
        return;
      }
      res.json(result);
    } catch (error) {
      logger.error({ error }, 'OHLC handler failed');
      res.status(500).json({ error: 'OHLC query error' });
    }
  });

  app.get('/api/orderbook-history/:platform/:marketId', async (req, res) => {
    if (!orderbookHistoryHandler) {
      res.status(404).json({ error: 'Tick recorder not enabled' });
      return;
    }

    try {
      const result = await orderbookHistoryHandler(req);
      if ('error' in result) {
        res.status(result.status ?? 400).json({ error: result.error });
        return;
      }
      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Orderbook history handler failed');
      res.status(500).json({ error: 'Orderbook history query error' });
    }
  });

  app.get('/api/tick-recorder/stats', async (req, res) => {
    if (!tickRecorderStatsHandler) {
      res.status(404).json({ error: 'Tick recorder not enabled' });
      return;
    }

    try {
      const result = await tickRecorderStatsHandler(req);
      if ('error' in result) {
        res.status(result.status ?? 400).json({ error: result.error });
        return;
      }
      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Tick recorder stats handler failed');
      res.status(500).json({ error: 'Tick recorder stats error' });
    }
  });

  // Tick streamer stats endpoint
  app.get('/api/tick-streamer/stats', (_req, res) => {
    if (!tickStreamer) {
      res.status(404).json({ error: 'Tick streamer not enabled' });
      return;
    }

    const stats = tickStreamer.getStats();
    res.json({ stats });
  });

  // Feature engineering endpoints
  app.get('/api/features/:platform/:marketId', (req, res) => {
    if (!featureEngineering) {
      res.status(404).json({ error: 'Feature engineering not enabled' });
      return;
    }

    const { platform, marketId } = req.params;
    const outcomeId = typeof req.query.outcomeId === 'string' ? req.query.outcomeId : undefined;

    const features = featureEngineering.getFeatures(platform, marketId, outcomeId);
    if (!features) {
      res.status(404).json({ error: 'No features available for this market' });
      return;
    }

    res.json({ features });
  });

  app.get('/api/features', (_req, res) => {
    if (!featureEngineering) {
      res.status(404).json({ error: 'Feature engineering not enabled' });
      return;
    }

    const snapshots = featureEngineering.getAllFeatures();
    res.json({ snapshots, count: snapshots.length });
  });

  app.get('/api/features/stats', (_req, res) => {
    if (!featureEngineering) {
      res.status(404).json({ error: 'Feature engineering not enabled' });
      return;
    }

    const stats = featureEngineering.getStats();
    res.json({ stats });
  });

  // =============================================================================
  // INTEGRATIONS API - Platform credential management for web frontend
  // =============================================================================

  // Helper to extract wallet address from request
  const getWalletAddress = (req: Request): string | null => {
    return (req.headers['x-wallet-address'] as string) || null;
  };

  // Supported platforms for integrations
  const SUPPORTED_PLATFORMS: Platform[] = ['polymarket', 'kalshi', 'manifold'];

  // POST /api/v1/integrations/:platform/connect - Store credentials for a platform
  app.post('/api/v1/integrations/:platform/connect', async (req, res) => {
    if (!credentialsManager) {
      res.status(503).json({ error: 'Credentials manager not configured' });
      return;
    }

    const { platform } = req.params;
    const walletAddress = getWalletAddress(req);

    if (!walletAddress) {
      res.status(401).json({ error: 'Missing x-wallet-address header' });
      return;
    }

    if (!SUPPORTED_PLATFORMS.includes(platform as Platform)) {
      res.status(400).json({ error: `Unsupported platform: ${platform}. Supported: ${SUPPORTED_PLATFORMS.join(', ')}` });
      return;
    }

    const { credentials } = req.body;
    if (!credentials || typeof credentials !== 'object') {
      res.status(400).json({ error: 'Missing credentials in request body' });
      return;
    }

    try {
      // Store credentials keyed by wallet address
      await credentialsManager.setCredentials(walletAddress, platform as Platform, credentials);

      logger.info({ platform, walletAddress: walletAddress.slice(0, 8) + '...' }, 'Platform credentials stored');

      res.json({
        success: true,
        platform,
        message: `${platform} credentials stored successfully`,
      });
    } catch (error) {
      logger.error({ error, platform, walletAddress }, 'Failed to store credentials');
      res.status(500).json({ error: 'Failed to store credentials' });
    }
  });

  // POST /api/v1/integrations/:platform/disconnect - Remove credentials for a platform
  app.post('/api/v1/integrations/:platform/disconnect', async (req, res) => {
    if (!credentialsManager) {
      res.status(503).json({ error: 'Credentials manager not configured' });
      return;
    }

    const { platform } = req.params;
    const walletAddress = getWalletAddress(req);

    if (!walletAddress) {
      res.status(401).json({ error: 'Missing x-wallet-address header' });
      return;
    }

    if (!SUPPORTED_PLATFORMS.includes(platform as Platform)) {
      res.status(400).json({ error: `Unsupported platform: ${platform}` });
      return;
    }

    try {
      await credentialsManager.deleteCredentials(walletAddress, platform as Platform);

      logger.info({ platform, walletAddress: walletAddress.slice(0, 8) + '...' }, 'Platform credentials deleted');

      res.json({
        success: true,
        platform,
        message: `${platform} credentials removed`,
      });
    } catch (error) {
      logger.error({ error, platform, walletAddress }, 'Failed to delete credentials');
      res.status(500).json({ error: 'Failed to delete credentials' });
    }
  });

  // POST /api/v1/integrations/:platform/test - Test credentials for a platform
  app.post('/api/v1/integrations/:platform/test', async (req, res) => {
    if (!credentialsManager) {
      res.status(503).json({ error: 'Credentials manager not configured' });
      return;
    }

    const { platform } = req.params;
    const walletAddress = getWalletAddress(req);

    if (!walletAddress) {
      res.status(401).json({ error: 'Missing x-wallet-address header' });
      return;
    }

    if (!SUPPORTED_PLATFORMS.includes(platform as Platform)) {
      res.status(400).json({ error: `Unsupported platform: ${platform}` });
      return;
    }

    try {
      const startTime = Date.now();
      const creds = await credentialsManager.getCredentials(walletAddress, platform as Platform);

      if (!creds) {
        res.json({
          success: false,
          testResult: 'failed',
          message: 'No credentials found for this platform',
        });
        return;
      }

      // Platform-specific credential validation
      let isValid = false;
      let message = 'Credentials are stored and decryptable';

      if (platform === 'polymarket') {
        const polyCreds = creds as { apiKey?: string; apiSecret?: string; apiPassphrase?: string };
        isValid = Boolean(polyCreds.apiKey && polyCreds.apiSecret && polyCreds.apiPassphrase);
        if (!isValid) {
          message = 'Missing required Polymarket fields: apiKey, apiSecret, or apiPassphrase';
        } else {
          // Try to make a test API call
          try {
            const { getPolymarketBalance } = await import('../execution/index');
            const auth = {
              apiKey: polyCreds.apiKey!,
              apiSecret: polyCreds.apiSecret!,
              apiPassphrase: polyCreds.apiPassphrase!,
              address: (creds as any).funderAddress || walletAddress,
            };
            await getPolymarketBalance(auth, auth.address);
            await credentialsManager.markSuccess(walletAddress, platform as Platform);
            message = 'API connection verified successfully';
          } catch (apiErr) {
            await credentialsManager.markFailure(walletAddress, platform as Platform);
            isValid = false;
            message = `API connection failed: ${apiErr instanceof Error ? apiErr.message : String(apiErr)}`;
          }
        }
      } else if (platform === 'kalshi') {
        const kalshiCreds = creds as { apiKeyId?: string; privateKeyPem?: string; email?: string };
        isValid = Boolean((kalshiCreds.apiKeyId && kalshiCreds.privateKeyPem) || kalshiCreds.email);
        if (!isValid) {
          message = 'Missing Kalshi credentials (apiKeyId+privateKeyPem or email)';
        }
      } else if (platform === 'manifold') {
        const manifoldCreds = creds as { apiKey?: string };
        isValid = Boolean(manifoldCreds.apiKey);
        if (!isValid) {
          message = 'Missing Manifold API key';
        }
      }

      const latencyMs = Date.now() - startTime;

      res.json({
        success: true,
        testResult: isValid ? 'passed' : 'failed',
        message,
        latencyMs,
      });
    } catch (error) {
      logger.error({ error, platform, walletAddress }, 'Failed to test credentials');
      res.status(500).json({
        success: false,
        testResult: 'failed',
        message: 'Internal error testing credentials',
      });
    }
  });

  // GET /api/v1/integrations/:platform/status - Get status for a specific platform
  app.get('/api/v1/integrations/:platform/status', async (req, res) => {
    if (!credentialsManager) {
      res.status(503).json({ error: 'Credentials manager not configured' });
      return;
    }

    const { platform } = req.params;
    const walletAddress = getWalletAddress(req);

    if (!walletAddress) {
      res.status(401).json({ error: 'Missing x-wallet-address header' });
      return;
    }

    if (!SUPPORTED_PLATFORMS.includes(platform as Platform)) {
      res.status(400).json({ error: `Unsupported platform: ${platform}` });
      return;
    }

    try {
      const hasCredentials = await credentialsManager.hasCredentials(walletAddress, platform as Platform);
      const isInCooldown = await credentialsManager.isInCooldown(walletAddress, platform as Platform);

      res.json({
        platform,
        connected: hasCredentials,
        isInCooldown,
        status: hasCredentials ? (isInCooldown ? 'cooldown' : 'connected') : 'disconnected',
      });
    } catch (error) {
      logger.error({ error, platform, walletAddress }, 'Failed to get platform status');
      res.status(500).json({ error: 'Failed to get platform status' });
    }
  });

  // GET /api/v1/integrations/connected - List all connected platforms for a wallet
  app.get('/api/v1/integrations/connected', async (req, res) => {
    if (!credentialsManager) {
      res.status(503).json({ error: 'Credentials manager not configured' });
      return;
    }

    const walletAddress = getWalletAddress(req);

    if (!walletAddress) {
      res.status(401).json({ error: 'Missing x-wallet-address header' });
      return;
    }

    try {
      const connectedPlatforms = await credentialsManager.listUserPlatforms(walletAddress);

      const platforms = await Promise.all(
        SUPPORTED_PLATFORMS.map(async (platform) => {
          const connected = connectedPlatforms.includes(platform);
          const isInCooldown = connected ? await credentialsManager!.isInCooldown(walletAddress, platform) : false;
          return {
            platform,
            connected,
            status: connected ? (isInCooldown ? 'cooldown' : 'connected') : 'disconnected',
          };
        })
      );

      res.json({
        walletAddress,
        platforms,
        connectedCount: connectedPlatforms.length,
      });
    } catch (error) {
      logger.error({ error, walletAddress }, 'Failed to list connected platforms');
      res.status(500).json({ error: 'Failed to list connected platforms' });
    }
  });

  // =============================================================================
  // WALLET PAIRING API - Link Telegram/Discord to web wallet
  // =============================================================================

  // POST /api/v1/pairing/code - Generate a pairing code for wallet linking
  app.post('/api/v1/pairing/code', async (req, res) => {
    if (!pairingService) {
      res.status(503).json({ error: 'Pairing service not configured' });
      return;
    }

    const walletAddress = getWalletAddress(req);
    if (!walletAddress) {
      res.status(401).json({ error: 'Missing x-wallet-address header' });
      return;
    }

    try {
      const code = await pairingService.createWalletPairingCode(walletAddress);

      res.json({
        success: true,
        code,
        expiresIn: '1 hour',
        instructions: `To link your Telegram/Discord account, send this code to the bot:\n/pair ${code}`,
      });
    } catch (error) {
      logger.error({ error, walletAddress }, 'Failed to generate pairing code');
      res.status(500).json({ error: 'Failed to generate pairing code' });
    }
  });

  // GET /api/v1/pairing/linked - Get all chat accounts linked to a wallet
  app.get('/api/v1/pairing/linked', async (req, res) => {
    if (!pairingService) {
      res.status(503).json({ error: 'Pairing service not configured' });
      return;
    }

    const walletAddress = getWalletAddress(req);
    if (!walletAddress) {
      res.status(401).json({ error: 'Missing x-wallet-address header' });
      return;
    }

    try {
      const links = await pairingService.getChatUsersForWallet(walletAddress);

      res.json({
        walletAddress,
        linkedAccounts: links.map((l) => ({
          channel: l.channel,
          userId: l.chatUserId,
          linkedAt: l.linkedAt.toISOString(),
          linkedBy: l.linkedBy,
        })),
        count: links.length,
      });
    } catch (error) {
      logger.error({ error, walletAddress }, 'Failed to get linked accounts');
      res.status(500).json({ error: 'Failed to get linked accounts' });
    }
  });

  // DELETE /api/v1/pairing/linked/:channel/:userId - Unlink a chat account
  app.delete('/api/v1/pairing/linked/:channel/:userId', async (req, res) => {
    if (!pairingService) {
      res.status(503).json({ error: 'Pairing service not configured' });
      return;
    }

    const walletAddress = getWalletAddress(req);
    if (!walletAddress) {
      res.status(401).json({ error: 'Missing x-wallet-address header' });
      return;
    }

    const { channel, userId } = req.params;

    try {
      // Verify this link belongs to the requesting wallet
      const existingWallet = await pairingService.getWalletForChatUser(channel, userId);
      if (existingWallet !== walletAddress) {
        res.status(403).json({ error: 'This link does not belong to your wallet' });
        return;
      }

      const success = await pairingService.unlinkChatUser(channel, userId);

      res.json({
        success,
        message: success ? 'Account unlinked successfully' : 'Account was not linked',
      });
    } catch (error) {
      logger.error({ error, walletAddress, channel, userId }, 'Failed to unlink account');
      res.status(500).json({ error: 'Failed to unlink account' });
    }
  });

  // GET /api/v1/pairing/status/:code - Check if pairing code has been used
  app.get('/api/v1/pairing/status/:code', async (req, res) => {
    if (!pairingService) {
      res.status(503).json({ error: 'Pairing service not configured' });
      return;
    }

    const walletAddress = getWalletAddress(req);
    if (!walletAddress) {
      res.status(401).json({ error: 'Missing x-wallet-address header' });
      return;
    }

    const { code } = req.params;

    try {
      // Check if code has been used to link an account
      const links = await pairingService.getChatUsersForWallet(walletAddress);
      const linkedAccount = links.length > 0 ? links[links.length - 1] : null;

      // A code is "completed" if the wallet has at least one linked account
      // In a real implementation, you'd track code -> wallet association
      res.json({
        success: true,
        code,
        status: linkedAccount ? 'completed' : 'pending',
        linkedAccount: linkedAccount ? {
          channel: linkedAccount.channel,
          userId: linkedAccount.chatUserId,
          linkedAt: linkedAccount.linkedAt.toISOString(),
        } : undefined,
      });
    } catch (error) {
      logger.error({ error, code }, 'Failed to check pairing status');
      res.status(500).json({ error: 'Failed to check pairing status' });
    }
  });

  // =============================================================================
  // COPY TRADING API - Manage copy trading configurations
  // =============================================================================

  // GET /api/v1/copy-trading/configs - Get all copy trading configs for wallet
  app.get('/api/v1/copy-trading/configs', async (req, res) => {
    if (!copyTradingOrchestrator) {
      res.status(503).json({ error: 'Copy trading service not configured' });
      return;
    }

    const walletAddress = getWalletAddress(req);
    if (!walletAddress) {
      res.status(401).json({ error: 'Missing x-wallet-address header' });
      return;
    }

    try {
      const configs = await copyTradingOrchestrator.getConfigsForWallet(walletAddress);
      res.json({ success: true, data: configs });
    } catch (error) {
      logger.error({ error, walletAddress }, 'Failed to get copy trading configs');
      res.status(500).json({ error: 'Failed to get configs' });
    }
  });

  // POST /api/v1/copy-trading/configs - Create a new copy trading config
  app.post('/api/v1/copy-trading/configs', async (req, res) => {
    if (!copyTradingOrchestrator || !credentialsManager) {
      res.status(503).json({ error: 'Copy trading service not configured' });
      return;
    }

    const walletAddress = getWalletAddress(req);
    if (!walletAddress) {
      res.status(401).json({ error: 'Missing x-wallet-address header' });
      return;
    }

    try {
      // Verify Polymarket credentials exist
      const hasCreds = await credentialsManager.hasCredentials(walletAddress, 'polymarket');
      if (!hasCreds) {
        res.status(400).json({
          error: 'Connect Polymarket first in Settings > Integrations',
          code: 'CREDENTIALS_REQUIRED',
        });
        return;
      }

      const config = await copyTradingOrchestrator.createConfig(walletAddress, req.body);
      res.json({ success: true, data: config });
    } catch (error) {
      logger.error({ error, walletAddress }, 'Failed to create copy trading config');
      res.status(500).json({ error: 'Failed to create config' });
    }
  });

  // GET /api/v1/copy-trading/configs/:id - Get a specific config
  app.get('/api/v1/copy-trading/configs/:id', async (req, res) => {
    if (!copyTradingOrchestrator) {
      res.status(503).json({ error: 'Copy trading service not configured' });
      return;
    }

    const walletAddress = getWalletAddress(req);
    if (!walletAddress) {
      res.status(401).json({ error: 'Missing x-wallet-address header' });
      return;
    }

    try {
      const config = await copyTradingOrchestrator.getConfig(req.params.id);
      if (!config || config.userWallet !== walletAddress) {
        res.status(404).json({ error: 'Config not found' });
        return;
      }
      res.json({ success: true, data: config });
    } catch (error) {
      logger.error({ error, configId: req.params.id }, 'Failed to get copy trading config');
      res.status(500).json({ error: 'Failed to get config' });
    }
  });

  // PATCH /api/v1/copy-trading/configs/:id - Update a config
  app.patch('/api/v1/copy-trading/configs/:id', async (req, res) => {
    if (!copyTradingOrchestrator) {
      res.status(503).json({ error: 'Copy trading service not configured' });
      return;
    }

    const walletAddress = getWalletAddress(req);
    if (!walletAddress) {
      res.status(401).json({ error: 'Missing x-wallet-address header' });
      return;
    }

    try {
      const existingConfig = await copyTradingOrchestrator.getConfig(req.params.id);
      if (!existingConfig || existingConfig.userWallet !== walletAddress) {
        res.status(404).json({ error: 'Config not found' });
        return;
      }

      const updatedConfig = await copyTradingOrchestrator.updateConfig(req.params.id, req.body);
      res.json({ success: true, data: updatedConfig });
    } catch (error) {
      logger.error({ error, configId: req.params.id }, 'Failed to update copy trading config');
      res.status(500).json({ error: 'Failed to update config' });
    }
  });

  // POST /api/v1/copy-trading/configs/:id/toggle - Toggle config enabled state
  app.post('/api/v1/copy-trading/configs/:id/toggle', async (req, res) => {
    if (!copyTradingOrchestrator) {
      res.status(503).json({ error: 'Copy trading service not configured' });
      return;
    }

    const walletAddress = getWalletAddress(req);
    if (!walletAddress) {
      res.status(401).json({ error: 'Missing x-wallet-address header' });
      return;
    }

    try {
      const existingConfig = await copyTradingOrchestrator.getConfig(req.params.id);
      if (!existingConfig || existingConfig.userWallet !== walletAddress) {
        res.status(404).json({ error: 'Config not found' });
        return;
      }

      const { enabled } = req.body;
      await copyTradingOrchestrator.toggleConfig(req.params.id, enabled);
      res.json({ success: true, enabled });
    } catch (error) {
      logger.error({ error, configId: req.params.id }, 'Failed to toggle copy trading config');
      res.status(500).json({ error: 'Failed to toggle config' });
    }
  });

  // DELETE /api/v1/copy-trading/configs/:id - Delete a config
  app.delete('/api/v1/copy-trading/configs/:id', async (req, res) => {
    if (!copyTradingOrchestrator) {
      res.status(503).json({ error: 'Copy trading service not configured' });
      return;
    }

    const walletAddress = getWalletAddress(req);
    if (!walletAddress) {
      res.status(401).json({ error: 'Missing x-wallet-address header' });
      return;
    }

    try {
      const existingConfig = await copyTradingOrchestrator.getConfig(req.params.id);
      if (!existingConfig || existingConfig.userWallet !== walletAddress) {
        res.status(404).json({ error: 'Config not found' });
        return;
      }

      await copyTradingOrchestrator.deleteConfig(req.params.id);
      res.json({ success: true });
    } catch (error) {
      logger.error({ error, configId: req.params.id }, 'Failed to delete copy trading config');
      res.status(500).json({ error: 'Failed to delete config' });
    }
  });

  // GET /api/v1/copy-trading/stats - Get aggregated copy trading stats
  app.get('/api/v1/copy-trading/stats', async (req, res) => {
    if (!copyTradingOrchestrator) {
      res.status(503).json({ error: 'Copy trading service not configured' });
      return;
    }

    const walletAddress = getWalletAddress(req);
    if (!walletAddress) {
      res.status(401).json({ error: 'Missing x-wallet-address header' });
      return;
    }

    try {
      const stats = await copyTradingOrchestrator.getAggregatedStats(walletAddress);
      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error({ error, walletAddress }, 'Failed to get copy trading stats');
      res.status(500).json({ error: 'Failed to get stats' });
    }
  });

  // GET /api/v1/copy-trading/history - Get copy trading history
  app.get('/api/v1/copy-trading/history', async (req, res) => {
    if (!copyTradingOrchestrator) {
      res.status(503).json({ error: 'Copy trading service not configured' });
      return;
    }

    const walletAddress = getWalletAddress(req);
    if (!walletAddress) {
      res.status(401).json({ error: 'Missing x-wallet-address header' });
      return;
    }

    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const configId = req.query.configId as string | undefined;
      const history = await copyTradingOrchestrator.getHistory(walletAddress, { limit, configId });
      res.json({ success: true, data: history });
    } catch (error) {
      logger.error({ error, walletAddress }, 'Failed to get copy trading history');
      res.status(500).json({ error: 'Failed to get history' });
    }
  });

  // GET /api/v1/copy-trading/status - Check if copy trading session is active
  app.get('/api/v1/copy-trading/status', async (req, res) => {
    if (!copyTradingOrchestrator) {
      res.status(503).json({ error: 'Copy trading service not configured' });
      return;
    }

    const walletAddress = getWalletAddress(req);
    if (!walletAddress) {
      res.status(401).json({ error: 'Missing x-wallet-address header' });
      return;
    }

    try {
      const hasSession = copyTradingOrchestrator.hasActiveSession(walletAddress);
      const stats = await copyTradingOrchestrator.getStats(walletAddress);
      res.json({
        success: true,
        data: {
          active: hasSession,
          ...stats,
        },
      });
    } catch (error) {
      logger.error({ error, walletAddress }, 'Failed to get copy trading status');
      res.status(500).json({ error: 'Failed to get status' });
    }
  });

  // =============================================================================
  // POLYMARKET WALLET AUTH - Connect Polymarket via wallet signing
  // =============================================================================

  // In-memory challenge storage (in production, use Redis/DB with expiry)
  const polymarketChallenges = new Map<string, { challenge: string; expiresAt: number }>();

  // GET /api/v1/integrations/polymarket/challenge - Get message to sign
  app.get('/api/v1/integrations/polymarket/challenge', (req, res) => {
    const walletAddress = getWalletAddress(req);
    if (!walletAddress) {
      res.status(401).json({ error: 'Missing x-wallet-address header' });
      return;
    }

    // Generate a unique challenge message
    const timestamp = Date.now();
    const nonce = Math.random().toString(36).substring(2, 15);
    const challenge = `Sign this message to connect your Polymarket account.\n\nWallet: ${walletAddress}\nTimestamp: ${timestamp}\nNonce: ${nonce}`;

    // Store challenge with 5 minute expiry
    const expiresAt = timestamp + 5 * 60 * 1000;
    polymarketChallenges.set(walletAddress, { challenge, expiresAt });

    // Cleanup old challenges
    const now = Date.now();
    for (const [key, value] of polymarketChallenges) {
      if (now > value.expiresAt) {
        polymarketChallenges.delete(key);
      }
    }

    res.json({
      success: true,
      challenge,
      expiresAt,
    });
  });

  // POST /api/v1/integrations/polymarket/connect-wallet - Verify signature and derive credentials
  app.post('/api/v1/integrations/polymarket/connect-wallet', async (req, res) => {
    if (!credentialsManager) {
      res.status(503).json({ error: 'Credentials manager not configured' });
      return;
    }

    const walletAddress = getWalletAddress(req);
    if (!walletAddress) {
      res.status(401).json({ error: 'Missing x-wallet-address header' });
      return;
    }

    const { signature, address, challenge } = req.body;

    if (!signature || !address || !challenge) {
      res.status(400).json({ error: 'Missing signature, address, or challenge' });
      return;
    }

    try {
      // Verify the challenge exists and hasn't expired
      const storedChallenge = polymarketChallenges.get(walletAddress);
      if (!storedChallenge || Date.now() > storedChallenge.expiresAt) {
        res.status(400).json({ error: 'Challenge expired or not found. Please request a new challenge.' });
        return;
      }

      if (storedChallenge.challenge !== challenge) {
        res.status(400).json({ error: 'Challenge mismatch' });
        return;
      }

      // Clear the used challenge
      polymarketChallenges.delete(walletAddress);

      // For Polymarket, we need to derive API credentials from the wallet
      // In a real implementation, this would call Polymarket's derive_api_key endpoint
      // For now, we'll store a placeholder that indicates wallet-based auth
      const walletAuthCredentials = {
        authMethod: 'wallet',
        walletAddress: address,
        connectedAt: new Date().toISOString(),
        // In production: call Polymarket API to derive real credentials
        // const apiCreds = await derivePolymarketCredentials(address, signature);
      };

      await credentialsManager.setCredentials(walletAddress, 'polymarket' as Platform, walletAuthCredentials);

      logger.info({ walletAddress: walletAddress.slice(0, 8) + '...' }, 'Polymarket wallet connected');

      res.json({
        success: true,
        message: 'Polymarket account connected via wallet',
      });
    } catch (error) {
      logger.error({ error, walletAddress }, 'Failed to connect Polymarket wallet');
      res.status(500).json({ error: 'Failed to connect wallet' });
    }
  });

  // Telegram Mini App
  app.get('/miniapp', (_req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Clodds</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--tg-theme-bg-color, #0f1419);
      color: var(--tg-theme-text-color, #e7e9ea);
      min-height: 100vh;
      padding: 16px;
    }
    .header { text-align: center; margin-bottom: 24px; }
    .header h1 { font-size: 24px; font-weight: 600; }
    .header p { color: var(--tg-theme-hint-color, #71767b); margin-top: 4px; }
    .tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      padding: 4px;
      background: var(--tg-theme-secondary-bg-color, #16202a);
      border-radius: 12px;
    }
    .tab {
      flex: 1;
      padding: 10px;
      text-align: center;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s;
    }
    .tab.active {
      background: var(--tg-theme-button-color, #1d9bf0);
      color: var(--tg-theme-button-text-color, #fff);
    }
    .section { display: none; }
    .section.active { display: block; }
    .card {
      background: var(--tg-theme-secondary-bg-color, #16202a);
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .card-title { font-size: 14px; color: var(--tg-theme-hint-color, #71767b); margin-bottom: 8px; }
    .card-value { font-size: 28px; font-weight: 700; }
    .card-value.positive { color: #00ba7c; }
    .card-value.negative { color: #f91880; }
    .list-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid var(--tg-theme-secondary-bg-color, #2f3336);
    }
    .list-item:last-child { border-bottom: none; }
    .list-item .name { font-weight: 500; }
    .list-item .value { font-size: 14px; }
    .badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
    }
    .badge.buy { background: rgba(0, 186, 124, 0.2); color: #00ba7c; }
    .badge.sell { background: rgba(249, 24, 128, 0.2); color: #f91880; }
    .badge.arb { background: rgba(29, 155, 240, 0.2); color: #1d9bf0; }
    .btn {
      width: 100%;
      padding: 14px;
      border-radius: 12px;
      border: none;
      background: var(--tg-theme-button-color, #1d9bf0);
      color: var(--tg-theme-button-text-color, #fff);
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 16px;
    }
    .btn:hover { opacity: 0.9; }
    .loading { text-align: center; padding: 40px; color: var(--tg-theme-hint-color, #71767b); }
    .empty { text-align: center; padding: 40px; }
    .empty-icon { font-size: 48px; margin-bottom: 12px; }
    .empty-text { color: var(--tg-theme-hint-color, #71767b); }
    .search { width: 100%; padding: 12px 16px; border-radius: 12px; border: none; background: var(--tg-theme-secondary-bg-color, #16202a); color: var(--tg-theme-text-color, #e7e9ea); font-size: 16px; margin-bottom: 16px; }
    .search::placeholder { color: var(--tg-theme-hint-color, #71767b); }
  </style>
</head>
<body>
  <div class="header">
    <h1>Clodds</h1>
    <p>Prediction Markets AI</p>
  </div>

  <div class="tabs">
    <div class="tab active" data-tab="portfolio">Portfolio</div>
    <div class="tab" data-tab="markets">Markets</div>
    <div class="tab" data-tab="arb">Arbitrage</div>
  </div>

  <div id="portfolio" class="section active">
    <div class="card">
      <div class="card-title">Total Value</div>
      <div class="card-value" id="total-value">$0.00</div>
    </div>
    <div class="card">
      <div class="card-title">P&L</div>
      <div class="card-value" id="pnl">$0.00</div>
    </div>
    <div class="card">
      <div class="card-title">Positions</div>
      <div id="positions"><div class="loading">Loading...</div></div>
    </div>
  </div>

  <div id="markets" class="section">
    <input type="text" class="search" placeholder="Search markets..." id="market-search">
    <div id="market-list"><div class="loading">Loading...</div></div>
  </div>

  <div id="arb" class="section">
    <div class="card">
      <div class="card-title">Active Opportunities</div>
      <div id="arb-list"><div class="loading">Loading...</div></div>
    </div>
    <button class="btn" onclick="scanArb()">Scan Now</button>
  </div>

  <script>
    const Telegram = window.Telegram.WebApp;
    Telegram.ready();
    Telegram.expand();

    const baseUrl = window.location.origin;

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
      });
    });

    // Format helpers
    function formatUSD(val) {
      const sign = val >= 0 ? '' : '-';
      return sign + '$' + Math.abs(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatPct(val) {
      const sign = val >= 0 ? '+' : '';
      return sign + val.toFixed(1) + '%';
    }

    // Load portfolio
    async function loadPortfolio() {
      try {
        const res = await fetch(baseUrl + '/api/performance');
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();

        document.getElementById('total-value').textContent = formatUSD(data.stats.totalPnl + 10000);
        const pnlEl = document.getElementById('pnl');
        pnlEl.textContent = formatUSD(data.stats.totalPnl) + ' (' + formatPct(data.stats.avgPnlPct) + ')';
        pnlEl.className = 'card-value ' + (data.stats.totalPnl >= 0 ? 'positive' : 'negative');

        if (data.recentTrades.length === 0) {
          document.getElementById('positions').innerHTML = '<div class="empty"><div class="empty-icon">📊</div><div class="empty-text">No positions yet</div></div>';
        } else {
          document.getElementById('positions').innerHTML = data.recentTrades.slice(0, 5).map(t => \`
            <div class="list-item">
              <div>
                <div class="name">\${t.market.slice(0, 30)}\${t.market.length > 30 ? '...' : ''}</div>
                <div class="value">\${formatUSD(t.size)} @ \${(t.entryPrice * 100).toFixed(0)}%</div>
              </div>
              <span class="badge \${t.side.toLowerCase()}">\${t.side}</span>
            </div>
          \`).join('');
        }
      } catch (err) {
        document.getElementById('positions').innerHTML = '<div class="empty"><div class="empty-text">Failed to load portfolio</div></div>';
      }
    }

    // Load markets
    async function loadMarkets(query = '') {
      try {
        const url = baseUrl + '/market-index/search?q=' + encodeURIComponent(query || 'election');
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();

        if (!data.results || data.results.length === 0) {
          document.getElementById('market-list').innerHTML = '<div class="empty"><div class="empty-icon">🔍</div><div class="empty-text">No markets found</div></div>';
          return;
        }

        document.getElementById('market-list').innerHTML = data.results.slice(0, 10).map(m => \`
          <div class="list-item">
            <div>
              <div class="name">\${m.question?.slice(0, 40) || m.title?.slice(0, 40) || 'Market'}\${(m.question || m.title || '').length > 40 ? '...' : ''}</div>
              <div class="value">\${m.platform}</div>
            </div>
            <div>\${m.yesPrice ? ((m.yesPrice * 100).toFixed(0) + '%') : '-'}</div>
          </div>
        \`).join('');
      } catch (err) {
        document.getElementById('market-list').innerHTML = '<div class="empty"><div class="empty-text">Failed to load markets</div></div>';
      }
    }

    // Load arbitrage opportunities
    async function loadArb() {
      document.getElementById('arb-list').innerHTML = '<div class="empty"><div class="empty-icon">⚡</div><div class="empty-text">Use the Scan button to find opportunities</div></div>';
    }

    async function scanArb() {
      document.getElementById('arb-list').innerHTML = '<div class="loading">Scanning...</div>';
      Telegram.HapticFeedback.impactOccurred('medium');

      // Simulate scan (would call real API)
      setTimeout(() => {
        document.getElementById('arb-list').innerHTML = '<div class="empty"><div class="empty-icon">✅</div><div class="empty-text">No opportunities found above 1% edge</div></div>';
      }, 1500);
    }

    // Search handler
    let searchTimeout;
    document.getElementById('market-search').addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => loadMarkets(e.target.value), 500);
    });

    // Initialize
    loadPortfolio();
    loadMarkets();
    loadArb();
  </script>
</body>
</html>`);
  });

  // Performance dashboard HTML UI
  app.get('/dashboard', (_req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Clodds Performance Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f1419; color: #e7e9ea; }
    .header { background: #16202a; padding: 20px 30px; border-bottom: 1px solid #2f3336; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { font-size: 24px; font-weight: 600; }
    .header .refresh { background: #1d9bf0; color: white; border: none; padding: 10px 20px; border-radius: 20px; cursor: pointer; font-weight: 600; }
    .header .refresh:hover { background: #1a8cd8; }
    .container { max-width: 1400px; margin: 0 auto; padding: 30px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .stat-card { background: #16202a; border-radius: 16px; padding: 24px; border: 1px solid #2f3336; }
    .stat-card .label { color: #71767b; font-size: 14px; margin-bottom: 8px; }
    .stat-card .value { font-size: 32px; font-weight: 700; }
    .stat-card .value.positive { color: #00ba7c; }
    .stat-card .value.negative { color: #f91880; }
    .charts-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-bottom: 30px; }
    .chart-card { background: #16202a; border-radius: 16px; padding: 24px; border: 1px solid #2f3336; }
    .chart-card h3 { margin-bottom: 20px; font-size: 18px; }
    .chart-container { position: relative; height: 300px; }
    .trades-table { width: 100%; border-collapse: collapse; }
    .trades-table th, .trades-table td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #2f3336; }
    .trades-table th { color: #71767b; font-weight: 500; font-size: 14px; }
    .trades-table tr:hover { background: #1c2732; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .badge.buy { background: rgba(0, 186, 124, 0.2); color: #00ba7c; }
    .badge.sell { background: rgba(249, 24, 128, 0.2); color: #f91880; }
    .badge.win { background: rgba(0, 186, 124, 0.2); color: #00ba7c; }
    .badge.loss { background: rgba(249, 24, 128, 0.2); color: #f91880; }
    .badge.open { background: rgba(29, 155, 240, 0.2); color: #1d9bf0; }
    .loading { text-align: center; padding: 60px; color: #71767b; }
    .error { text-align: center; padding: 60px; color: #f91880; }
    @media (max-width: 900px) { .charts-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Performance Dashboard</h1>
    <button class="refresh" onclick="loadData()">Refresh</button>
  </div>
  <div class="container">
    <div id="content" class="loading">Loading...</div>
  </div>

  <script>
    let pnlChart = null;
    let strategyChart = null;

    async function loadData() {
      const content = document.getElementById('content');
      content.innerHTML = '<div class="loading">Loading...</div>';

      try {
        const res = await fetch('/api/performance');
        if (!res.ok) throw new Error('Failed to load data');
        const data = await res.json();
        render(data);
      } catch (err) {
        content.innerHTML = '<div class="error">Failed to load performance data. Make sure trading is enabled.</div>';
      }
    }

    function formatCurrency(val) {
      const sign = val >= 0 ? '+' : '';
      return sign + '$' + Math.abs(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatPercent(val) {
      const sign = val >= 0 ? '+' : '';
      return sign + val.toFixed(2) + '%';
    }

    function render(data) {
      const { stats, recentTrades, dailyPnl, byStrategy } = data;

      const html = \`
        <div class="stats-grid">
          <div class="stat-card">
            <div class="label">Total Trades</div>
            <div class="value">\${stats.totalTrades}</div>
          </div>
          <div class="stat-card">
            <div class="label">Win Rate</div>
            <div class="value \${stats.winRate >= 50 ? 'positive' : 'negative'}">\${stats.winRate.toFixed(1)}%</div>
          </div>
          <div class="stat-card">
            <div class="label">Total P&L</div>
            <div class="value \${stats.totalPnl >= 0 ? 'positive' : 'negative'}">\${formatCurrency(stats.totalPnl)}</div>
          </div>
          <div class="stat-card">
            <div class="label">Avg P&L %</div>
            <div class="value \${stats.avgPnlPct >= 0 ? 'positive' : 'negative'}">\${formatPercent(stats.avgPnlPct)}</div>
          </div>
          <div class="stat-card">
            <div class="label">Sharpe Ratio</div>
            <div class="value \${stats.sharpeRatio >= 1 ? 'positive' : stats.sharpeRatio < 0 ? 'negative' : ''}">\${stats.sharpeRatio.toFixed(2)}</div>
          </div>
          <div class="stat-card">
            <div class="label">Max Drawdown</div>
            <div class="value negative">\${formatPercent(-stats.maxDrawdown)}</div>
          </div>
        </div>

        <div class="charts-grid">
          <div class="chart-card">
            <h3>Cumulative P&L</h3>
            <div class="chart-container"><canvas id="pnlChart"></canvas></div>
          </div>
          <div class="chart-card">
            <h3>By Strategy</h3>
            <div class="chart-container"><canvas id="strategyChart"></canvas></div>
          </div>
        </div>

        <div class="chart-card">
          <h3>Recent Trades</h3>
          <table class="trades-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Market</th>
                <th>Side</th>
                <th>Size</th>
                <th>Entry</th>
                <th>Exit</th>
                <th>P&L</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              \${recentTrades.map(t => \`
                <tr>
                  <td>\${new Date(t.timestamp).toLocaleString()}</td>
                  <td>\${t.market.slice(0, 40)}\${t.market.length > 40 ? '...' : ''}</td>
                  <td><span class="badge \${t.side.toLowerCase()}">\${t.side}</span></td>
                  <td>$\${t.size.toLocaleString()}</td>
                  <td>\${(t.entryPrice * 100).toFixed(1)}%</td>
                  <td>\${t.exitPrice ? (t.exitPrice * 100).toFixed(1) + '%' : '-'}</td>
                  <td class="\${(t.pnl || 0) >= 0 ? 'positive' : 'negative'}">\${t.pnl != null ? formatCurrency(t.pnl) : '-'}</td>
                  <td><span class="badge \${t.status === 'win' ? 'win' : t.status === 'loss' ? 'loss' : 'open'}">\${t.status}</span></td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        </div>
      \`;

      document.getElementById('content').innerHTML = html;

      // Cumulative P&L chart
      if (pnlChart) pnlChart.destroy();
      const pnlCtx = document.getElementById('pnlChart').getContext('2d');
      pnlChart = new Chart(pnlCtx, {
        type: 'line',
        data: {
          labels: dailyPnl.map(d => d.date),
          datasets: [{
            label: 'Cumulative P&L',
            data: dailyPnl.map(d => d.cumulative),
            borderColor: '#1d9bf0',
            backgroundColor: 'rgba(29, 155, 240, 0.1)',
            fill: true,
            tension: 0.3,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: '#2f3336' }, ticks: { color: '#71767b' } },
            y: { grid: { color: '#2f3336' }, ticks: { color: '#71767b', callback: v => '$' + v } }
          }
        }
      });

      // Strategy breakdown chart
      if (strategyChart) strategyChart.destroy();
      const stratCtx = document.getElementById('strategyChart').getContext('2d');
      strategyChart = new Chart(stratCtx, {
        type: 'doughnut',
        data: {
          labels: byStrategy.map(s => s.strategy),
          datasets: [{
            data: byStrategy.map(s => s.trades),
            backgroundColor: ['#1d9bf0', '#00ba7c', '#f91880', '#ffd400', '#7856ff'],
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: '#e7e9ea' } }
          }
        }
      });
    }

    loadData();
  </script>
</body>
</html>`);
  });

  return {
    async start() {
      return new Promise((resolve) => {
        httpServer = createHttpServer(app);

        // WebSocket server - handles both /ws and /chat
        wss = new WebSocketServer({ noServer: true });

        // Handle upgrade requests
        httpServer.on('upgrade', (request: IncomingMessage, socket, head) => {
          const pathname = request.url?.split('?')[0] || '';

          if (pathname === '/ws' || pathname === '/chat') {
            wss!.handleUpgrade(request, socket, head, (ws) => {
              wss!.emit('connection', ws, request);
            });
          } else if (pathname === '/api/ticks/stream') {
            // Tick streaming WebSocket endpoint
            if (!tickStreamer) {
              socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
              socket.destroy();
              return;
            }
            wss!.handleUpgrade(request, socket, head, (ws) => {
              tickStreamer!.handleConnection(ws);
            });
          } else {
            socket.destroy();
          }
        });

        // Default /ws handler (for API/control)
        wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
          // /chat connections are handled by WebChat channel via attachWebSocket
          if (request.url === '/chat') {
            return; // Let WebChat handle it
          }

          logger.info('WebSocket API client connected');

          ws.on('message', (data) => {
            try {
              const message = JSON.parse(data.toString());
              logger.debug({ message }, 'WS API message received');

              ws.send(
                JSON.stringify({
                  type: 'res',
                  id: message.id,
                  ok: true,
                  payload: { echo: message },
                })
              );
            } catch (err) {
              logger.error({ err }, 'Failed to parse WS message');
            }
          });

          ws.on('close', () => {
            logger.info('WebSocket API client disconnected');
          });
        });

        httpServer.listen(config.port, () => {
          resolve();
        });
      });
    },

    async stop() {
      return new Promise((resolve) => {
        wss?.close();
        httpServer?.close(() => resolve());
      });
    },

    getWebSocketServer(): WebSocketServer | null {
      return wss;
    },

    setChannelWebhookHandler(handler: ChannelWebhookHandler | null): void {
      channelWebhookHandler = handler;
    },

    setMarketIndexHandler(handler: MarketIndexHandler | null): void {
      marketIndexHandler = handler;
    },
    setMarketIndexStatsHandler(handler: MarketIndexStatsHandler | null): void {
      marketIndexStatsHandler = handler;
    },
    setMarketIndexSyncHandler(handler: MarketIndexSyncHandler | null): void {
      marketIndexSyncHandler = handler;
    },
    setPerformanceDashboardHandler(handler: PerformanceDashboardHandler | null): void {
      performanceDashboardHandler = handler;
    },
    setBacktestHandler(handler: BacktestHandler | null): void {
      backtestHandler = handler;
    },
    setTicksHandler(handler: TicksHandler | null): void {
      ticksHandler = handler;
    },
    setOHLCHandler(handler: OHLCHandler | null): void {
      ohlcHandler = handler;
    },
    setOrderbookHistoryHandler(handler: OrderbookHistoryHandler | null): void {
      orderbookHistoryHandler = handler;
    },
    setTickRecorderStatsHandler(handler: TickRecorderStatsHandler | null): void {
      tickRecorderStatsHandler = handler;
    },
    setTickStreamer(streamer: TickStreamer | null): void {
      tickStreamer = streamer;
    },
    setFeatureEngineering(service: FeatureEngineering | null): void {
      featureEngineering = service;
    },
    setCredentialsManager(manager: CredentialsManager | null): void {
      credentialsManager = manager;
    },
    setPairingService(service: PairingService | null): void {
      pairingService = service;
    },
    setCopyTradingOrchestrator(orchestrator: CopyTradingOrchestrator | null): void {
      copyTradingOrchestrator = orchestrator;
    },
  };
}
