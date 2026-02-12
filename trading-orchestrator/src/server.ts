/**
 * Trading Orchestrator HTTP Server
 *
 * Exposes REST APIs for:
 * - Agent management (list, register, kill)
 * - Signal processing
 * - Health checks for all adapters
 * - Trade execution routing
 * - Survival mode status
 */

import express, { Request, Response, NextFunction } from 'express';
import { createServer, Server } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import { orchestrator, permissionManager, strategyRegistry } from './index.js';
import type {
    TradeIntent,
    Signal,
    AgentStatus,
    WalletPermission,
    Action,
} from './types/index.js';
import { MarketType } from './types/index.js';
import { SidexAdapter, Platform } from './adapters/SidexAdapter.js';
import { AgentDexAdapter } from './adapters/AgentDexAdapter.js';
import { OpenClawAdapter } from './adapters/OpenClawAdapter.js';
import { ClawdnetAdapter } from './adapters/ClawdnetAdapter.js';
import { getPriceService } from './services/PriceService.js';
import { getPolymarketService } from './services/PolymarketService.js';

// Initialize Sidex adapter (token from env)
const sidexAdapter = new SidexAdapter({
    baseUrl: 'wss://devs.sidex.fun',
    token: process.env.SIDEX_TOKEN || 'demo_token',
    simulationMode: true,
});

// Initialize AgentDex adapter (Solana DEX via Jupiter)
const agentDexAdapter = new AgentDexAdapter({
    baseUrl: process.env.AGENT_DEX_URL || 'http://localhost:3001',
    agentApiKey: process.env.AGENT_DEX_API_KEY,
});

// Initialize OpenClaw adapter (Multi-exchange + Survival Mode)
const openClawAdapter = new OpenClawAdapter({
    baseUrl: process.env.OPENCLAW_URL || 'http://localhost:3003',
    survivalEnabled: true,
    startBalance: parseFloat(process.env.SURVIVAL_START_BALANCE || '1000'),
});

// Initialize ClawdNet adapter (A2A Protocol + X402 Payments)
const clawdnetAdapter = new ClawdnetAdapter({
    baseUrl: process.env.CLAWDNET_URL || 'http://localhost:5000',
    privateKey: process.env.EVM_PRIVATE_KEY,
    rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
});

// Register adapters with the orchestrator
orchestrator.setAdapters({
    agentDex: agentDexAdapter,
    openClaw: openClawAdapter,
    clawdnet: clawdnetAdapter,
});

console.log('[Server] Adapters registered:');
console.log('  - AgentDex (Solana DEX):', process.env.AGENT_DEX_URL || 'http://localhost:3001');
console.log('  - OpenClaw (Futures + Survival):', process.env.OPENCLAW_URL || 'http://localhost:3003');
console.log('  - ClawdNet (A2A Protocol):', process.env.CLAWDNET_URL || 'http://localhost:5000');

// Initialize price service
const priceService = getPriceService();

// Initialize Polymarket service
const polymarketService = getPolymarketService();

// CORS middleware
const corsMiddleware = cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Wallet-Address'],
});

// Error handler middleware
const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(`[Server] Error: ${err.message}`);
    res.status(500).json({
        success: false,
        error: err.message || 'Internal server error',
    });
};

// Request logger middleware
const requestLogger = (req: Request, res: Response, next: NextFunction) => {
    console.log(`[Server] ${req.method} ${req.path}`);
    next();
};

export function createOrchestratorServer(port: number = 4000): {
    app: express.Application;
    server: Server;
    io: SocketServer;
    start: () => Promise<void>;
    stop: () => Promise<void>;
} {
    const app = express();
    const server = createServer(app);
    const io = new SocketServer(server, {
        cors: {
            origin: process.env.CORS_ORIGIN || '*',
            methods: ['GET', 'POST'],
        },
    });

    // Middleware
    app.use(corsMiddleware);
    app.use(express.json());
    app.use(requestLogger);

    // ==================== Health Endpoints ====================

    /**
     * GET /health - Overall orchestrator health (also available at /api/v1/health)
     */
    const healthHandler = async (req: Request, res: Response) => {
        try {
            const health = await orchestrator.healthCheckAll();
            res.json({
                status: health.healthy ? 'healthy' : 'degraded',
                timestamp: new Date().toISOString(),
                adapters: health.adapters,
                services: Object.entries(health.adapters).map(([name, info]) => ({
                    name,
                    healthy: info?.healthy ?? false,
                    latencyMs: info?.latency,
                })),
            });
        } catch (error) {
            res.status(503).json({
                status: 'unhealthy',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    };
    app.get('/health', healthHandler);
    app.get('/api/v1/health', healthHandler);

    /**
     * GET /health/adapters - Individual adapter health
     */
    app.get('/health/adapters', async (req: Request, res: Response) => {
        try {
            const status = orchestrator.getAdapterStatus();
            res.json({
                success: true,
                adapters: status,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    // ==================== Agent Management ====================

    /**
     * GET /api/v1/agents - List all agents
     */
    app.get('/api/v1/agents', async (req: Request, res: Response) => {
        try {
            const agents = orchestrator.getAgents();
            res.json({
                success: true,
                count: agents.length,
                agents,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/agents/register - Register a new agent
     */
    app.post('/api/v1/agents/register', async (req: Request, res: Response) => {
        try {
            const { walletAddress, userId, strategyId, permissions } = req.body;

            if (!walletAddress || !strategyId) {
                res.status(400).json({
                    success: false,
                    error: 'walletAddress and strategyId are required',
                });
                return;
            }

            const agent = await orchestrator.createAgent({
                walletAddress,
                userId: userId || 'default_user',
                strategyId,
                permissions: permissions || {
                    id: `perm_${Date.now()}`,
                    walletAddress,
                    agentId: '',
                    allowedActions: [],
                    limits: {
                        maxTransactionValue: 1000,
                        dailyLimit: 10000,
                        weeklyLimit: 50000,
                        requiresApproval: false,
                    },
                    expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
                    isActive: true,
                },
            });

            res.status(201).json({
                success: true,
                agentId: agent.id,
                agent,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/agents/:agentId - Get agent details
     */
    app.get('/api/v1/agents/:agentId', async (req: Request, res: Response) => {
        try {
            const { agentId } = req.params;
            const agent = orchestrator.getAgent(agentId);

            if (!agent) {
                res.status(404).json({
                    success: false,
                    error: 'Agent not found',
                });
                return;
            }

            res.json({
                success: true,
                agent,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/agents/:agentId/kill - Kill switch
     */
    app.post('/api/v1/agents/:agentId/kill', async (req: Request, res: Response) => {
        try {
            const { agentId } = req.params;
            const result = await orchestrator.killAgent(agentId);

            // Emit WebSocket event
            io.emit('agent_killed', { agentId, result });

            res.json({
                success: true,
                result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * PUT /api/v1/agents/:agentId/status - Update agent status
     */
    app.put('/api/v1/agents/:agentId/status', async (req: Request, res: Response) => {
        try {
            const { agentId } = req.params;
            const { status } = req.body as { status: AgentStatus };

            if (!status || !['active', 'paused', 'stopped', 'error'].includes(status)) {
                res.status(400).json({
                    success: false,
                    error: 'Valid status required: active, paused, stopped, or error',
                });
                return;
            }

            orchestrator.setAgentStatus(agentId, status);

            res.json({
                success: true,
                agentId,
                status,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    // ==================== Trade Execution ====================

    /**
     * POST /api/v1/trade/execute - Execute a trade intent
     */
    app.post('/api/v1/trade/execute', async (req: Request, res: Response) => {
        try {
            const intent: TradeIntent = req.body;

            if (!intent.agentId || !intent.action || !intent.asset) {
                res.status(400).json({
                    success: false,
                    error: 'agentId, action, and asset are required',
                });
                return;
            }

            const result = await orchestrator.executeTradeIntent(intent.agentId!, intent);

            // Emit WebSocket event
            io.emit('trade_executed', { intent, result });

            res.json({
                success: true,
                result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/trade/validate - Validate a trade intent without executing
     */
    app.post('/api/v1/trade/validate', async (req: Request, res: Response) => {
        try {
            const intent: TradeIntent = req.body;
            const market = intent.market || 'solana';
            const validation = orchestrator.validateAdaptersForOperation(
                market === 'solana' ? 'solana_swap' :
                market === 'futures' ? 'futures' :
                market === 'prediction' ? 'prediction' : 'solana_swap'
            );

            res.json({
                success: true,
                validation,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    // ==================== Execution Endpoints (Frontend Compatible) ====================

    /**
     * POST /api/v1/execution/intent - Create and execute a trade intent
     */
    app.post('/api/v1/execution/intent', async (req: Request, res: Response) => {
        try {
            const { agentId, action, chain, asset, amount, constraints } = req.body;

            if (!agentId || !action || !asset) {
                res.status(400).json({
                    success: false,
                    error: 'agentId, action, and asset are required',
                });
                return;
            }

            // Map chain to MarketType
            const market = (chain === 'hyperliquid' || chain === 'binance' || chain === 'bybit')
                ? MarketType.Futures
                : chain === 'polymarket'
                    ? MarketType.PredictionMarket
                    : MarketType.DEX;

            const intent: TradeIntent = {
                agentId,
                action,
                token: asset,
                side: action === 'buy' ? 'buy' : 'sell',
                size: amount || 0,
                price: 0,
                market,
                constraints: constraints || {},
            };

            const result = await orchestrator.executeTradeIntent(agentId, intent);

            io.emit('trade_executed', { intent, result });

            res.json({
                ...result,
                id: result.intentId || `intent_${Date.now()}`,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/execution/quote - Get a swap quote
     */
    app.post('/api/v1/execution/quote', async (req: Request, res: Response) => {
        try {
            const { inputMint, outputMint, amount, chain } = req.body;

            if (!inputMint || !outputMint || !amount) {
                res.status(400).json({
                    success: false,
                    error: 'inputMint, outputMint, and amount are required',
                });
                return;
            }

            // Route to AgentDex for Solana quotes
            const agentDexAdapter = orchestrator.getAdapter('agentDex') as any;
            if (!agentDexAdapter || typeof agentDexAdapter.getQuote !== 'function') {
                res.status(503).json({
                    success: false,
                    error: 'AgentDex adapter not available for quotes',
                });
                return;
            }

            const quote = await agentDexAdapter.getQuote({
                inputMint,
                outputMint,
                amount: parseFloat(amount),
            });

            res.json({
                success: true,
                data: {
                    inputAmount: amount,
                    outputAmount: quote.outAmount?.toString() || '0',
                    priceImpact: quote.priceImpactPct?.toString() || '0',
                    routePlan: quote.routePlan || [],
                },
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/execution/swap-transaction - Get unsigned swap transaction for frontend signing
     * Frontend signs this and submits via wallet
     */
    app.post('/api/v1/execution/swap-transaction', async (req: Request, res: Response) => {
        try {
            const { inputMint, outputMint, amount, slippageBps, userPublicKey } = req.body;

            if (!inputMint || !outputMint || !amount || !userPublicKey) {
                res.status(400).json({
                    success: false,
                    error: 'inputMint, outputMint, amount, and userPublicKey are required',
                });
                return;
            }

            const agentDexAdapter = orchestrator.getAdapter('agentDex') as any;
            if (!agentDexAdapter) {
                res.status(503).json({
                    success: false,
                    error: 'AgentDex adapter not available',
                });
                return;
            }

            // Get quote first
            const quote = await agentDexAdapter.getQuote({
                inputMint,
                outputMint,
                amount: amount.toString(),
                slippageBps: slippageBps || 50,
            });

            // Get swap transaction from Jupiter
            let swapTransaction = null;
            if (typeof agentDexAdapter.getSwapTransaction === 'function') {
                swapTransaction = await agentDexAdapter.getSwapTransaction({
                    quote,
                    userPublicKey,
                    slippageBps: slippageBps || 50,
                });
            }

            res.json({
                success: true,
                data: {
                    quote,
                    swapTransaction,
                    inputMint,
                    outputMint,
                    inputAmount: amount,
                    outputAmount: quote.outAmount?.toString() || '0',
                    priceImpact: quote.priceImpactPct?.toString() || '0',
                    userPublicKey,
                },
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/execution/submit-transaction - Submit signed transaction
     */
    app.post('/api/v1/execution/submit-transaction', async (req: Request, res: Response) => {
        try {
            const { signedTransaction, walletAddress } = req.body;

            if (!signedTransaction) {
                res.status(400).json({
                    success: false,
                    error: 'signedTransaction is required',
                });
                return;
            }

            // Transaction submission happens on frontend via Solana connection
            // This endpoint is for tracking/logging purposes
            res.json({
                success: true,
                data: {
                    message: 'Transaction logged. Submission happens via frontend Solana connection.',
                    walletAddress,
                    timestamp: Date.now(),
                },
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/execution/swap - Execute a swap
     */
    app.post('/api/v1/execution/swap', async (req: Request, res: Response) => {
        try {
            const { inputMint, outputMint, amount, walletPrivateKey, chain } = req.body;

            if (!inputMint || !outputMint || !amount) {
                res.status(400).json({
                    success: false,
                    error: 'inputMint, outputMint, and amount are required',
                });
                return;
            }

            // Route to AgentDex for Solana swaps
            const agentDexAdapter = orchestrator.getAdapter('agentDex') as any;
            if (!agentDexAdapter || typeof agentDexAdapter.executeSwap !== 'function') {
                res.status(503).json({
                    success: false,
                    error: 'AgentDex adapter not available for swaps',
                });
                return;
            }

            const result = await agentDexAdapter.executeSwap({
                inputMint,
                outputMint,
                amount: parseFloat(amount),
                privateKey: walletPrivateKey,
            });

            io.emit('swap_executed', { inputMint, outputMint, amount, result });

            res.json({
                success: result.success,
                data: {
                    txHash: result.txHash,
                    executedAmount: result.executedAmount,
                    outputAmount: result.outputAmount,
                },
                error: result.error,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    // ==================== Signal Processing ====================

    /**
     * POST /api/v1/signals/process - Process incoming signals
     */
    app.post('/api/v1/signals/process', async (req: Request, res: Response) => {
        try {
            const { agentId, signals } = req.body as { agentId: string; signals: Signal[] };

            if (!agentId || !signals || !Array.isArray(signals)) {
                res.status(400).json({
                    success: false,
                    error: 'agentId and signals array are required',
                });
                return;
            }

            const result = await orchestrator.processSignals(agentId, signals);

            // Emit WebSocket event
            if (result) {
                io.emit('signal_processed', { signals, result });
            }

            res.json({
                success: true,
                intent: result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    // ==================== Permissions ====================

    /**
     * GET /api/v1/permissions/:walletAddress - Get wallet permissions
     */
    app.get('/api/v1/permissions/:walletAddress', async (req: Request, res: Response) => {
        try {
            const { walletAddress } = req.params;
            const permissions = permissionManager.getPermissions(walletAddress);

            res.json({
                success: true,
                walletAddress,
                permissions,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * PUT /api/v1/permissions/:walletAddress - Update wallet permissions
     */
    app.put('/api/v1/permissions/:walletAddress', async (req: Request, res: Response) => {
        try {
            const { walletAddress } = req.params;
            const permissions: WalletPermission = req.body;

            permissionManager.setPermissions(walletAddress, permissions);

            res.json({
                success: true,
                walletAddress,
                permissions,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/permissions/:walletAddress/check - Check if action is allowed
     */
    app.post('/api/v1/permissions/:walletAddress/check', async (req: Request, res: Response) => {
        try {
            const { walletAddress } = req.params;
            const { action, value } = req.body as { action: Action; value: number };

            const allowed = permissionManager.checkPermission(walletAddress, { type: action, value });

            res.json({
                success: true,
                allowed,
                walletAddress,
                action,
                value,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    // ==================== Pairing (Telegram/Discord) ====================

    // In-memory pairing codes (in production, use Redis or database)
    const pairingCodes = new Map<string, { walletAddress: string; createdAt: number }>();

    /**
     * POST /api/v1/pairing/code - Generate a pairing code for wallet
     */
    app.post('/api/v1/pairing/code', async (req: Request, res: Response) => {
        try {
            const walletAddress = req.headers['x-wallet-address'] as string;

            if (!walletAddress) {
                res.status(401).json({
                    success: false,
                    error: 'Wallet address required. Please connect your wallet.',
                });
                return;
            }

            // Generate 8-character alphanumeric code
            const code = Math.random().toString(36).substring(2, 10).toUpperCase();

            // Store pairing code (expires in 10 minutes)
            pairingCodes.set(code, {
                walletAddress,
                createdAt: Date.now(),
            });

            // Clean up expired codes (older than 10 minutes)
            const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
            for (const [key, value] of pairingCodes.entries()) {
                if (value.createdAt < tenMinutesAgo) {
                    pairingCodes.delete(key);
                }
            }

            res.json({
                success: true,
                code,
                expiresIn: '10 minutes',
                instructions: `Send this code to our Telegram bot to link your wallet: ${code}`,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/pairing/verify/:code - Verify a pairing code
     */
    app.get('/api/v1/pairing/verify/:code', async (req: Request, res: Response) => {
        try {
            const { code } = req.params;
            const pairingData = pairingCodes.get(code.toUpperCase());

            if (!pairingData) {
                res.status(404).json({
                    success: false,
                    error: 'Invalid or expired pairing code',
                });
                return;
            }

            // Check if code is expired (10 minutes)
            const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
            if (pairingData.createdAt < tenMinutesAgo) {
                pairingCodes.delete(code.toUpperCase());
                res.status(410).json({
                    success: false,
                    error: 'Pairing code has expired',
                });
                return;
            }

            res.json({
                success: true,
                walletAddress: pairingData.walletAddress,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/pairing/complete/:code - Complete pairing (called by bot)
     */
    app.post('/api/v1/pairing/complete/:code', async (req: Request, res: Response) => {
        try {
            const { code } = req.params;
            const { platform, platformUserId, platformUsername } = req.body;

            const pairingData = pairingCodes.get(code.toUpperCase());

            if (!pairingData) {
                res.status(404).json({
                    success: false,
                    error: 'Invalid or expired pairing code',
                });
                return;
            }

            // In production, save this pairing to database
            console.log(`[Pairing] Wallet ${pairingData.walletAddress} paired with ${platform} user ${platformUserId} (${platformUsername})`);

            // Remove used code
            pairingCodes.delete(code.toUpperCase());

            // Emit WebSocket event for pairing completion
            io.emit('pairing_completed', {
                walletAddress: pairingData.walletAddress,
                platform,
                platformUserId,
                platformUsername,
            });

            res.json({
                success: true,
                walletAddress: pairingData.walletAddress,
                platform,
                platformUserId,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    // ==================== Strategies ====================

    /**
     * GET /api/v1/strategies - List all strategies
     */
    app.get('/api/v1/strategies', async (req: Request, res: Response) => {
        try {
            const strategies = strategyRegistry.getAll();
            res.json({
                success: true,
                count: strategies.length,
                strategies,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/strategies/:strategyId - Get strategy details
     */
    app.get('/api/v1/strategies/:strategyId', async (req: Request, res: Response) => {
        try {
            const { strategyId } = req.params;
            const strategy = strategyRegistry.get(strategyId);

            if (!strategy) {
                res.status(404).json({
                    success: false,
                    error: 'Strategy not found',
                });
                return;
            }

            res.json({
                success: true,
                strategy,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    // ==================== Survival Mode (via OpenClaw) ====================

    /**
     * GET /api/v1/survival/status - Get Survival Mode status
     */
    app.get('/api/v1/survival/status', async (req: Request, res: Response) => {
        try {
            const openclawAdapter = orchestrator.getAdapter('openclaw') as any;
            if (!openclawAdapter || typeof openclawAdapter.fetchSurvivalStatus !== 'function') {
                res.status(503).json({
                    success: false,
                    error: 'OpenClaw adapter not available',
                });
                return;
            }

            const status = await openclawAdapter.fetchSurvivalStatus();
            res.json({
                success: true,
                ...status,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/survival/update - Update Survival Mode balance
     */
    app.post('/api/v1/survival/update', async (req: Request, res: Response) => {
        try {
            const { balance, pnl } = req.body;
            const openclawAdapter = orchestrator.getAdapter('openclaw') as any;

            if (!openclawAdapter || typeof openclawAdapter.updateSurvivalStatus !== 'function') {
                res.status(503).json({
                    success: false,
                    error: 'OpenClaw adapter not available',
                });
                return;
            }

            const status = await openclawAdapter.updateSurvivalStatus(balance, pnl);

            // Emit WebSocket event for survival state changes
            io.emit('survival_update', status);

            res.json({
                success: true,
                ...status,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/survival-mode/dashboard - Get survival mode dashboard data
     * This is the endpoint the frontend calls via api.getSurvivalDashboard()
     */
    app.get('/api/v1/survival-mode/dashboard', async (req: Request, res: Response) => {
        try {
            const { wallet } = req.query;
            const openclawAdapter = orchestrator.getAdapter('openclaw') as any;

            // Get survival status (with local fallback)
            let status;
            if (openclawAdapter?.getSurvivalStatus) {
                status = openclawAdapter.getSurvivalStatus();
            } else {
                // Local fallback with simulated data
                status = {
                    mode: 'survival',
                    state: 'SURVIVAL',
                    pnlPercent: 0,
                    startBalance: 1000,
                    currentBalance: 1000,
                    x402BudgetUnlocked: false,
                };
            }

            // Map internal state to frontend expected format
            let currentState: string;
            const pnlPercent = status.pnlPercent || 0;
            if (pnlPercent >= 20) currentState = 'growth';
            else if (pnlPercent <= -75) currentState = 'hibernation';
            else if (pnlPercent <= -50) currentState = 'critical';
            else if (pnlPercent <= -15) currentState = 'defensive';
            else currentState = 'normal';

            res.json({
                success: true,
                data: {
                    currentState,
                    enabled: true,
                    portfolioChange: pnlPercent,
                    wallet: wallet || null,
                    stateConfig: {
                        maxAllocation: currentState === 'growth' ? 100 :
                            currentState === 'normal' ? 80 :
                            currentState === 'defensive' ? 50 :
                            currentState === 'critical' ? 25 : 0,
                        riskMultiplier: currentState === 'growth' ? 1.5 :
                            currentState === 'normal' ? 1.0 :
                            currentState === 'defensive' ? 0.5 :
                            currentState === 'critical' ? 0.25 : 0,
                        description: status.mode === 'growth' ? 'Aggressive mode unlocked' :
                            status.mode === 'defensive' ? 'Positions reduced 50%' :
                            status.mode === 'critical' ? 'Capital preservation mode' :
                            status.mode === 'hibernation' ? 'All trading halted' :
                            'Standard trading operations',
                    },
                    riskParams: {
                        maxPositionSize: status.mode === 'growth' ? 1000 : status.mode === 'defensive' ? 100 : 500,
                        maxLeverage: status.mode === 'growth' ? 20 : status.mode === 'defensive' ? 2 : 10,
                        canOpenPosition: status.mode !== 'critical' && status.mode !== 'hibernation',
                    },
                    lastUpdated: Date.now(),
                },
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/survival-mode/status - Alias for survival status (frontend compatibility)
     */
    app.get('/api/v1/survival-mode/status', async (req: Request, res: Response) => {
        try {
            const { wallet } = req.query;
            const openclawAdapter = orchestrator.getAdapter('openclaw') as any;

            let status;
            if (openclawAdapter?.getSurvivalStatus) {
                status = openclawAdapter.getSurvivalStatus();
            } else {
                status = {
                    mode: 'survival',
                    state: 'SURVIVAL',
                    pnlPercent: 0,
                    startBalance: 1000,
                    currentBalance: 1000,
                    x402BudgetUnlocked: false,
                };
            }

            // Map to frontend format
            let currentState: string;
            const pnlPercent = status.pnlPercent || 0;
            if (pnlPercent >= 20) currentState = 'growth';
            else if (pnlPercent <= -75) currentState = 'hibernation';
            else if (pnlPercent <= -50) currentState = 'critical';
            else if (pnlPercent <= -15) currentState = 'defensive';
            else currentState = 'normal';

            res.json({
                success: true,
                data: {
                    currentState,
                    enabled: true,
                    portfolioChange: pnlPercent,
                    wallet: wallet || null,
                },
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/survival/simulate - Simulate balance change (for demos)
     */
    app.post('/api/v1/survival/simulate', async (req: Request, res: Response) => {
        try {
            const { balanceChange, newBalance } = req.body;
            const openclawAdapter = orchestrator.getAdapter('openclaw') as any;

            // Calculate the new balance
            let targetBalance: number;
            if (newBalance !== undefined) {
                targetBalance = parseFloat(newBalance);
            } else if (balanceChange !== undefined) {
                // Get current status to calculate new balance
                const currentStatus = openclawAdapter?.getSurvivalStatus?.() || { currentBalance: 1000 };
                targetBalance = currentStatus.currentBalance + parseFloat(balanceChange);
            } else {
                res.status(400).json({
                    success: false,
                    error: 'Either balanceChange or newBalance is required',
                });
                return;
            }

            // Update via adapter if available
            let status;
            if (openclawAdapter && typeof openclawAdapter.updateSurvivalStatus === 'function') {
                status = await openclawAdapter.updateSurvivalStatus(targetBalance);
            } else {
                // Local fallback simulation
                const startBalance = 1000;
                const pnlPercent = ((targetBalance - startBalance) / startBalance) * 100;
                let mode: string;

                if (pnlPercent >= 20) mode = 'growth';
                else if (pnlPercent <= -50) mode = 'critical';
                else if (pnlPercent <= -15) mode = 'defensive';
                else mode = 'survival';

                status = {
                    mode,
                    state: mode.toUpperCase(),
                    pnlPercent,
                    startBalance,
                    currentBalance: targetBalance,
                    x402BudgetUnlocked: mode === 'growth',
                    riskParams: {
                        maxPositionSize: mode === 'growth' ? 1000 : mode === 'defensive' ? 100 : 500,
                        maxLeverage: mode === 'growth' ? 20 : mode === 'defensive' ? 2 : 10,
                    },
                    canOpenPosition: mode !== 'critical',
                };
            }

            // Emit WebSocket event for survival state changes
            io.emit('survival_update', status);
            io.emit('survival_state_changed', {
                newState: status.mode || status.state,
                healthRatio: (status.currentBalance / status.startBalance) * 100,
                timestamp: Date.now(),
            });

            res.json({
                success: true,
                simulated: true,
                previousBalance: status.startBalance,
                newBalance: targetBalance,
                triggered: true,
                ...status,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    // ==================== A2A Network (via ClawdNet) ====================

    /**
     * GET /api/v1/a2a/agents - Discover A2A agents
     */
    app.get('/api/v1/a2a/agents', async (req: Request, res: Response) => {
        try {
            const clawdnetAdapter = orchestrator.getAdapter('clawdnet') as any;
            if (!clawdnetAdapter || typeof clawdnetAdapter.discoverAgents !== 'function') {
                res.status(503).json({
                    success: false,
                    error: 'ClawdNet adapter not available',
                });
                return;
            }

            const { capability, skill, maxPrice, minReputation } = req.query;
            const agents = await clawdnetAdapter.discoverAgents({
                capability: capability as string,
                skill: skill as string,
                maxPrice: maxPrice as string,
                minReputation: minReputation ? parseFloat(minReputation as string) : undefined,
            });

            res.json({
                success: true,
                count: agents.length,
                agents,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/a2a/invoke - Invoke A2A skill
     */
    app.post('/api/v1/a2a/invoke', async (req: Request, res: Response) => {
        try {
            const { agentHandle, skillId, payload, maxPayment } = req.body;
            const clawdnetAdapter = orchestrator.getAdapter('clawdnet') as any;

            if (!clawdnetAdapter || typeof clawdnetAdapter.invokeSkill !== 'function') {
                res.status(503).json({
                    success: false,
                    error: 'ClawdNet adapter not available',
                });
                return;
            }

            if (!agentHandle || !skillId) {
                res.status(400).json({
                    success: false,
                    error: 'agentHandle and skillId are required',
                });
                return;
            }

            const result = await clawdnetAdapter.invokeSkill(agentHandle, skillId, payload || {}, maxPayment);

            res.json({
                success: true,
                result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    // ==================== Sidex Trading ====================

    /**
     * POST /api/v1/sidex/trade - Open a Sidex position
     */
    app.post('/api/v1/sidex/trade', async (req: Request, res: Response) => {
        try {
            const { symbol, side, amount, leverage } = req.body;

            if (!symbol || !side || !amount || !leverage) {
                res.status(400).json({
                    success: false,
                    error: 'symbol, side, amount, and leverage are required',
                });
                return;
            }

            const result = await sidexAdapter.openPosition({
                platform: 'crypto',
                symbol,
                side,
                amount: parseFloat(amount),
                leverage: parseFloat(leverage),
            });

            if (result.success) {
                io.emit('sidex_trade', { type: 'open', ...result });
            }

            res.json({
                success: result.success,
                data: result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/sidex/close - Close a Sidex position
     */
    app.post('/api/v1/sidex/close', async (req: Request, res: Response) => {
        try {
            const { symbol, direction } = req.body;

            if (!symbol || !direction) {
                res.status(400).json({
                    success: false,
                    error: 'symbol and direction are required',
                });
                return;
            }

            const result = await sidexAdapter.closePosition({ platform: 'crypto', symbol, direction });

            if (result.success) {
                io.emit('sidex_trade', { type: 'close', ...result });
            }

            res.json({
                success: result.success,
                data: result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/sidex/positions - Get open Sidex positions
     */
    app.get('/api/v1/sidex/positions', async (req: Request, res: Response) => {
        try {
            const positions = await sidexAdapter.getPositions();
            res.json({
                success: true,
                count: positions.length,
                data: positions,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/sidex/balance - Get Sidex account balance
     */
    app.get('/api/v1/sidex/balance', async (req: Request, res: Response) => {
        try {
            const balance = await sidexAdapter.getBalance();
            res.json({
                success: true,
                data: balance,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/sidex/simulation - Toggle simulation mode
     */
    app.post('/api/v1/sidex/simulation', async (req: Request, res: Response) => {
        try {
            const { enabled } = req.body;
            const result = await sidexAdapter.setSimulationMode(enabled !== false);
            res.json({
                success: true,
                data: result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/sidex/simulation - Get simulation mode status
     */
    app.get('/api/v1/sidex/simulation', async (req: Request, res: Response) => {
        try {
            const status = sidexAdapter.getSimulationStatus();
            res.json({
                success: true,
                data: status,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/sidex/reset - Reset Sidex account (simulation only)
     */
    app.post('/api/v1/sidex/reset', async (req: Request, res: Response) => {
        try {
            const result = await sidexAdapter.resetAccount();
            res.json({
                success: true,
                data: result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/sidex/health - Sidex adapter health check
     */
    app.get('/api/v1/sidex/health', async (req: Request, res: Response) => {
        try {
            const health = await sidexAdapter.checkHealth();
            res.json({
                success: health.healthy,
                data: health,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    // ==================== Real-Time Prices ====================

    /**
     * GET /api/v1/sidex/prices - Get all real-time prices
     */
    app.get('/api/v1/sidex/prices', async (req: Request, res: Response) => {
        try {
            const prices = priceService.getAllPrices();
            const status = priceService.getStatus();
            res.json({
                success: true,
                data: {
                    prices,
                    connected: status.connected,
                    priceCount: status.priceCount,
                },
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/sidex/prices/:symbol - Get price for specific symbol
     */
    app.get('/api/v1/sidex/prices/:symbol', async (req: Request, res: Response) => {
        try {
            const { symbol } = req.params;
            // Convert URL-safe format (BTC-USDT) to standard (BTC/USDT)
            const normalizedSymbol = symbol.replace('-', '/').toUpperCase();
            const price = priceService.getPrice(normalizedSymbol);

            if (!price) {
                res.status(404).json({
                    success: false,
                    error: `Price not found for ${normalizedSymbol}`,
                });
                return;
            }

            res.json({
                success: true,
                data: price,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/sidex/prices/connect - Connect price service
     */
    app.post('/api/v1/sidex/prices/connect', async (req: Request, res: Response) => {
        try {
            priceService.connect();
            res.json({
                success: true,
                message: 'Price service connection initiated',
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/sidex/prices/disconnect - Disconnect price service
     */
    app.post('/api/v1/sidex/prices/disconnect', async (req: Request, res: Response) => {
        try {
            priceService.disconnect();
            res.json({
                success: true,
                message: 'Price service disconnected',
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    // ==================== AI Agent Sandbox ====================

    /**
     * GET /api/v1/sidex/agents - List all sandbox agents
     */
    app.get('/api/v1/sidex/agents', async (req: Request, res: Response) => {
        try {
            const agents = sidexAdapter.getAgents();
            res.json({
                success: true,
                data: agents,
                count: agents.length,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/sidex/agents - Create a new sandbox agent
     */
    app.post('/api/v1/sidex/agents', async (req: Request, res: Response) => {
        try {
            const { name, strategy, capital, riskLevel, maxPositionSize, stopLossPercent, takeProfitPercent, symbols, customPrompt } = req.body;

            if (!name || !strategy || !capital || !riskLevel) {
                res.status(400).json({
                    success: false,
                    error: 'name, strategy, capital, and riskLevel are required',
                });
                return;
            }

            const agent = await sidexAdapter.createAgent({
                name,
                strategy,
                capital: parseFloat(capital),
                riskLevel,
                maxPositionSize: maxPositionSize ? parseFloat(maxPositionSize) : undefined,
                stopLossPercent: stopLossPercent ? parseFloat(stopLossPercent) : undefined,
                takeProfitPercent: takeProfitPercent ? parseFloat(takeProfitPercent) : undefined,
                symbols,
                customPrompt,
            });

            io.emit('sidex_agent_created', agent);

            res.status(201).json({
                success: true,
                data: agent,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/sidex/agents/:agentId - Get agent details
     */
    app.get('/api/v1/sidex/agents/:agentId', async (req: Request, res: Response) => {
        try {
            const { agentId } = req.params;
            const agent = sidexAdapter.getAgent(agentId);

            if (!agent) {
                res.status(404).json({
                    success: false,
                    error: 'Agent not found',
                });
                return;
            }

            res.json({
                success: true,
                data: agent,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/sidex/agents/:agentId/start - Start an agent
     */
    app.post('/api/v1/sidex/agents/:agentId/start', async (req: Request, res: Response) => {
        try {
            const { agentId } = req.params;
            const result = await sidexAdapter.startAgent(agentId);

            if (result.success) {
                io.emit('sidex_agent_started', { agentId });
            }

            res.json({
                success: result.success,
                error: result.error,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/sidex/agents/:agentId/stop - Stop an agent
     */
    app.post('/api/v1/sidex/agents/:agentId/stop', async (req: Request, res: Response) => {
        try {
            const { agentId } = req.params;
            const result = await sidexAdapter.stopAgent(agentId);

            if (result.success) {
                io.emit('sidex_agent_stopped', { agentId });
            }

            res.json({
                success: result.success,
                error: result.error,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/sidex/agents/:agentId/pause - Pause an agent
     */
    app.post('/api/v1/sidex/agents/:agentId/pause', async (req: Request, res: Response) => {
        try {
            const { agentId } = req.params;
            const result = await sidexAdapter.pauseAgent(agentId);

            if (result.success) {
                io.emit('sidex_agent_paused', { agentId });
            }

            res.json({
                success: result.success,
                error: result.error,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * DELETE /api/v1/sidex/agents/:agentId - Delete an agent
     */
    app.delete('/api/v1/sidex/agents/:agentId', async (req: Request, res: Response) => {
        try {
            const { agentId } = req.params;
            const result = await sidexAdapter.deleteAgent(agentId);

            if (result.success) {
                io.emit('sidex_agent_deleted', { agentId });
            }

            res.json({
                success: result.success,
                error: result.error,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/sidex/agents/:agentId/stats - Get agent stats
     */
    app.get('/api/v1/sidex/agents/:agentId/stats', async (req: Request, res: Response) => {
        try {
            const { agentId } = req.params;
            const stats = sidexAdapter.getAgentStats(agentId);

            if (!stats) {
                res.status(404).json({
                    success: false,
                    error: 'Agent not found',
                });
                return;
            }

            res.json({
                success: true,
                data: stats,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/sidex/agent-trades - Get all agent trades
     */
    app.get('/api/v1/sidex/agent-trades', async (req: Request, res: Response) => {
        try {
            const { agentId } = req.query;
            const trades = sidexAdapter.getAgentTrades(agentId as string | undefined);
            res.json({
                success: true,
                data: trades,
                count: trades.length,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    // ==================== Copy Trading Sandbox ====================

    /**
     * GET /api/v1/sidex/copy-configs - List all copy trading configs
     */
    app.get('/api/v1/sidex/copy-configs', async (req: Request, res: Response) => {
        try {
            const configs = sidexAdapter.getCopyConfigs();
            res.json({
                success: true,
                data: configs,
                count: configs.length,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/sidex/copy-configs - Create a new copy trading config
     */
    app.post('/api/v1/sidex/copy-configs', async (req: Request, res: Response) => {
        try {
            const {
                platform,
                targetWallet,
                targetLabel,
                sizingMode,
                fixedSize,
                proportionMultiplier,
                portfolioPercentage,
                maxPositionSize,
                minTradeSize,
                stopLossPercent,
                takeProfitPercent,
            } = req.body;

            if (!targetWallet || !sizingMode) {
                res.status(400).json({
                    success: false,
                    error: 'targetWallet and sizingMode are required',
                });
                return;
            }

            const config = await sidexAdapter.createCopyConfig({
                platform: platform || 'crypto',
                targetWallet,
                targetLabel,
                sizingMode,
                fixedSize: fixedSize ? parseFloat(fixedSize) : undefined,
                proportionMultiplier: proportionMultiplier ? parseFloat(proportionMultiplier) : undefined,
                portfolioPercentage: portfolioPercentage ? parseFloat(portfolioPercentage) : undefined,
                maxPositionSize: maxPositionSize ? parseFloat(maxPositionSize) : undefined,
                minTradeSize: minTradeSize ? parseFloat(minTradeSize) : undefined,
                stopLossPercent: stopLossPercent ? parseFloat(stopLossPercent) : undefined,
                takeProfitPercent: takeProfitPercent ? parseFloat(takeProfitPercent) : undefined,
            });

            io.emit('sidex_copy_config_created', config);

            res.status(201).json({
                success: true,
                data: config,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/sidex/copy-configs/polymarket - Get Polymarket copy configs
     * (must be defined before :configId route)
     */
    app.get('/api/v1/sidex/copy-configs/polymarket', async (req: Request, res: Response) => {
        try {
            const configs = sidexAdapter.getCopyConfigs('polymarket');
            res.json({
                success: true,
                data: configs,
                count: configs.length,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/sidex/copy-configs/crypto - Get Crypto copy configs
     * (must be defined before :configId route)
     */
    app.get('/api/v1/sidex/copy-configs/crypto', async (req: Request, res: Response) => {
        try {
            const configs = sidexAdapter.getCopyConfigs('crypto');
            res.json({
                success: true,
                data: configs,
                count: configs.length,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/sidex/copy-configs/:configId - Get copy config details
     */
    app.get('/api/v1/sidex/copy-configs/:configId', async (req: Request, res: Response) => {
        try {
            const { configId } = req.params;
            const config = sidexAdapter.getCopyConfig(configId);

            if (!config) {
                res.status(404).json({
                    success: false,
                    error: 'Copy config not found',
                });
                return;
            }

            res.json({
                success: true,
                data: config,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/sidex/copy-configs/:configId/toggle - Toggle copy config
     */
    app.post('/api/v1/sidex/copy-configs/:configId/toggle', async (req: Request, res: Response) => {
        try {
            const { configId } = req.params;
            const { enabled } = req.body;

            const result = await sidexAdapter.toggleCopyConfig(configId, enabled !== false);

            if (result.success) {
                io.emit('sidex_copy_config_toggled', { configId, enabled });
            }

            res.json({
                success: result.success,
                enabled: enabled !== false,
                error: result.error,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * DELETE /api/v1/sidex/copy-configs/:configId - Delete copy config
     */
    app.delete('/api/v1/sidex/copy-configs/:configId', async (req: Request, res: Response) => {
        try {
            const { configId } = req.params;
            const result = await sidexAdapter.deleteCopyConfig(configId);

            if (result.success) {
                io.emit('sidex_copy_config_deleted', { configId });
            }

            res.json({
                success: result.success,
                error: result.error,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/sidex/copy-trades - Get all copy trades
     */
    app.get('/api/v1/sidex/copy-trades', async (req: Request, res: Response) => {
        try {
            const { configId } = req.query;
            const trades = sidexAdapter.getCopyTrades(configId as string | undefined);
            res.json({
                success: true,
                data: trades,
                count: trades.length,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    // ==================== Polymarket Markets ====================

    /**
     * GET /api/v1/sidex/polymarket/markets - List active Polymarket markets
     */
    app.get('/api/v1/sidex/polymarket/markets', async (req: Request, res: Response) => {
        try {
            const { active, limit } = req.query;
            const markets = await polymarketService.getMarkets({
                active: active !== 'false',
                limit: limit ? parseInt(limit as string, 10) : 50,
            });
            res.json({
                success: true,
                data: markets,
                count: markets.length,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/sidex/polymarket/markets/search - Search Polymarket markets
     */
    app.get('/api/v1/sidex/polymarket/markets/search', async (req: Request, res: Response) => {
        try {
            const { q, limit } = req.query;
            if (!q) {
                res.status(400).json({
                    success: false,
                    error: 'Search query (q) is required',
                });
                return;
            }
            const markets = await polymarketService.searchMarkets(
                q as string,
                limit ? parseInt(limit as string, 10) : 20
            );
            res.json({
                success: true,
                data: markets,
                count: markets.length,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/sidex/polymarket/markets/:marketId - Get market details
     */
    app.get('/api/v1/sidex/polymarket/markets/:marketId', async (req: Request, res: Response) => {
        try {
            const { marketId } = req.params;
            const market = await polymarketService.getMarket(marketId);
            if (!market) {
                res.status(404).json({
                    success: false,
                    error: 'Market not found',
                });
                return;
            }
            res.json({
                success: true,
                data: market,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/sidex/polymarket/user/:wallet/trades - Get user's trade history
     */
    app.get('/api/v1/sidex/polymarket/user/:wallet/trades', async (req: Request, res: Response) => {
        try {
            const { wallet } = req.params;
            const { limit } = req.query;
            const trades = await polymarketService.getUserTrades(
                wallet,
                limit ? parseInt(limit as string, 10) : 100
            );
            res.json({
                success: true,
                data: trades,
                count: trades.length,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    // ==================== Multi-Platform Trading ====================

    /**
     * POST /api/v1/sidex/trade/polymarket - Open a Polymarket position
     */
    app.post('/api/v1/sidex/trade/polymarket', async (req: Request, res: Response) => {
        try {
            const { marketId, side, shares } = req.body;

            if (!marketId || !side || !shares) {
                res.status(400).json({
                    success: false,
                    error: 'marketId, side (yes/no), and shares are required',
                });
                return;
            }

            if (!['yes', 'no'].includes(side.toLowerCase())) {
                res.status(400).json({
                    success: false,
                    error: 'side must be "yes" or "no"',
                });
                return;
            }

            const result = await sidexAdapter.openPosition({
                platform: 'polymarket',
                marketId,
                outcome: side.toLowerCase() as 'yes' | 'no',
                shares: parseFloat(shares),
                amount: parseFloat(shares),
            });

            if (result.success) {
                io.emit('sidex_trade', { type: 'open', platform: 'polymarket', ...result });
            }

            res.json({
                success: result.success,
                data: result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/sidex/close/polymarket - Close a Polymarket position
     */
    app.post('/api/v1/sidex/close/polymarket', async (req: Request, res: Response) => {
        try {
            const { positionId } = req.body;

            if (!positionId) {
                res.status(400).json({
                    success: false,
                    error: 'positionId is required',
                });
                return;
            }

            const result = await sidexAdapter.closePosition({ platform: 'polymarket', positionId });

            if (result.success) {
                io.emit('sidex_trade', { type: 'close', platform: 'polymarket', ...result });
            }

            res.json({
                success: result.success,
                data: result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/sidex/positions/polymarket - Get Polymarket positions
     */
    app.get('/api/v1/sidex/positions/polymarket', async (req: Request, res: Response) => {
        try {
            const positions = await sidexAdapter.getPositions('polymarket');
            res.json({
                success: true,
                data: positions,
                count: positions.length,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/sidex/positions/crypto - Get Crypto positions
     */
    app.get('/api/v1/sidex/positions/crypto', async (req: Request, res: Response) => {
        try {
            const positions = await sidexAdapter.getPositions('crypto');
            res.json({
                success: true,
                data: positions,
                count: positions.length,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    // ==================== NL Strategies (Multi-Platform) ====================

    /**
     * POST /api/v1/sidex/strategies - Create NL strategy (Claude parses)
     */
    app.post('/api/v1/sidex/strategies', async (req: Request, res: Response) => {
        try {
            const { platform, marketId, symbol, description, capital } = req.body;

            if (!platform || !description || !capital) {
                res.status(400).json({
                    success: false,
                    error: 'platform, description, and capital are required',
                });
                return;
            }

            if (!['polymarket', 'crypto'].includes(platform)) {
                res.status(400).json({
                    success: false,
                    error: 'platform must be "polymarket" or "crypto"',
                });
                return;
            }

            // Polymarket requires marketId, Crypto requires symbol
            if (platform === 'polymarket' && !marketId) {
                res.status(400).json({
                    success: false,
                    error: 'marketId is required for Polymarket strategies',
                });
                return;
            }

            if (platform === 'crypto' && !symbol) {
                res.status(400).json({
                    success: false,
                    error: 'symbol is required for Crypto strategies',
                });
                return;
            }

            const strategy = await sidexAdapter.createStrategy({
                platform: platform as Platform,
                marketId,
                symbol,
                description,
                capital: parseFloat(capital),
            });

            io.emit('sidex_strategy_created', strategy);

            res.status(201).json({
                success: true,
                data: strategy,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/sidex/strategies - List all NL strategies
     */
    app.get('/api/v1/sidex/nl-strategies', async (req: Request, res: Response) => {
        try {
            const { platform } = req.query;
            let strategies = sidexAdapter.getStrategies();
            if (platform) {
                strategies = strategies.filter(s => s.platform === platform);
            }
            res.json({
                success: true,
                data: strategies,
                count: strategies.length,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/sidex/nl-strategies/:strategyId - Get strategy details
     */
    app.get('/api/v1/sidex/nl-strategies/:strategyId', async (req: Request, res: Response) => {
        try {
            const { strategyId } = req.params;
            const strategies = sidexAdapter.getStrategies();
            const strategy = strategies.find(s => s.id === strategyId);

            if (!strategy) {
                res.status(404).json({
                    success: false,
                    error: 'Strategy not found',
                });
                return;
            }

            res.json({
                success: true,
                data: strategy,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/sidex/nl-strategies/:strategyId/start - Start strategy
     */
    app.post('/api/v1/sidex/nl-strategies/:strategyId/start', async (req: Request, res: Response) => {
        try {
            const { strategyId } = req.params;
            const result = await sidexAdapter.startStrategy(strategyId);

            if (result.success) {
                io.emit('sidex_strategy_started', { strategyId });
            }

            res.json({
                success: result.success,
                error: result.error,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * POST /api/v1/sidex/nl-strategies/:strategyId/stop - Stop strategy
     */
    app.post('/api/v1/sidex/nl-strategies/:strategyId/stop', async (req: Request, res: Response) => {
        try {
            const { strategyId } = req.params;
            const result = await sidexAdapter.stopStrategy(strategyId);

            if (result.success) {
                io.emit('sidex_strategy_stopped', { strategyId });
            }

            res.json({
                success: result.success,
                error: result.error,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * DELETE /api/v1/sidex/nl-strategies/:strategyId - Delete strategy
     */
    app.delete('/api/v1/sidex/nl-strategies/:strategyId', async (req: Request, res: Response) => {
        try {
            const { strategyId } = req.params;
            const result = await sidexAdapter.deleteStrategy(strategyId);

            if (result.success) {
                io.emit('sidex_strategy_deleted', { strategyId });
            }

            res.json({
                success: result.success,
                error: result.error,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * GET /api/v1/sidex/strategy-trades - Get strategy execution history
     */
    app.get('/api/v1/sidex/strategy-trades', async (req: Request, res: Response) => {
        try {
            const { strategyId } = req.query;
            const trades = sidexAdapter.getStrategyTrades(strategyId as string | undefined);
            res.json({
                success: true,
                data: trades,
                count: trades.length,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    // ==================== Multi-Platform Copy Trading ====================

    /**
     * POST /api/v1/sidex/copy-configs/polymarket - Create Polymarket copy config
     */
    app.post('/api/v1/sidex/copy-configs/polymarket', async (req: Request, res: Response) => {
        try {
            const {
                targetWallet,
                targetLabel,
                sizingMode,
                fixedSize,
                proportionMultiplier,
                portfolioPercentage,
                maxPositionSize,
                minTradeSize,
                stopLossPercent,
                takeProfitPercent,
            } = req.body;

            if (!targetWallet || !sizingMode) {
                res.status(400).json({
                    success: false,
                    error: 'targetWallet and sizingMode are required',
                });
                return;
            }

            const config = await sidexAdapter.createCopyConfig({
                platform: 'polymarket',
                targetWallet,
                targetLabel,
                sizingMode,
                fixedSize: fixedSize ? parseFloat(fixedSize) : undefined,
                proportionMultiplier: proportionMultiplier ? parseFloat(proportionMultiplier) : undefined,
                portfolioPercentage: portfolioPercentage ? parseFloat(portfolioPercentage) : undefined,
                maxPositionSize: maxPositionSize ? parseFloat(maxPositionSize) : undefined,
                minTradeSize: minTradeSize ? parseFloat(minTradeSize) : undefined,
                stopLossPercent: stopLossPercent ? parseFloat(stopLossPercent) : undefined,
                takeProfitPercent: takeProfitPercent ? parseFloat(takeProfitPercent) : undefined,
            });

            io.emit('sidex_copy_config_created', config);

            res.status(201).json({
                success: true,
                data: config,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    // ==================== WebSocket Events ====================

    // Setup price service event forwarding to WebSocket
    priceService.on('price', (data) => {
        io.to('prices').emit('price_update', data);
    });

    priceService.on('priceChange', (data) => {
        io.to('prices').emit('price_change', data);
    });

    priceService.on('connected', () => {
        io.emit('price_service_connected');
    });

    priceService.on('disconnected', () => {
        io.emit('price_service_disconnected');
    });

    // Setup Sidex adapter event forwarding
    sidexAdapter.on('position_opened', (data) => {
        io.emit('sidex_position_opened', data);
    });

    sidexAdapter.on('position_closed', (data) => {
        io.emit('sidex_position_closed', data);
    });

    sidexAdapter.on('agent_trade', (data) => {
        io.emit('sidex_agent_trade', data);
    });

    sidexAdapter.on('copy_trade', (data) => {
        io.emit('sidex_copy_trade', data);
    });

    sidexAdapter.on('strategy_trade', (data) => {
        io.emit('sidex_strategy_trade', data);
    });

    // Forward Polymarket service events
    polymarketService.on('price', (data) => {
        io.to('polymarket').emit('polymarket_price', data);
    });

    io.on('connection', (socket) => {
        console.log(`[Server] WebSocket client connected: ${socket.id}`);

        socket.on('subscribe', (channel: string) => {
            socket.join(channel);
            console.log(`[Server] Client ${socket.id} subscribed to ${channel}`);

            // If subscribing to prices and service not connected, connect it
            if (channel === 'prices' && !priceService.isServiceConnected()) {
                priceService.connect();
            }
        });

        socket.on('unsubscribe', (channel: string) => {
            socket.leave(channel);
            console.log(`[Server] Client ${socket.id} unsubscribed from ${channel}`);
        });

        socket.on('disconnect', () => {
            console.log(`[Server] WebSocket client disconnected: ${socket.id}`);
        });
    });

    // ==================== Copy Trading (Non-Sidex) ====================

    // In-memory storage for copy trading (production would use database)
    const copyTradingConfigs: Map<string, any> = new Map();
    const copyTradingHistory: any[] = [];

    /**
     * GET /api/v1/copy-trading/configs - List copy trading configs
     */
    app.get('/api/v1/copy-trading/configs', async (req: Request, res: Response) => {
        const walletAddress = req.headers['x-wallet-address'] as string;
        const configs = Array.from(copyTradingConfigs.values())
            .filter(c => !walletAddress || c.userWallet === walletAddress);
        res.json({ success: true, data: configs });
    });

    /**
     * POST /api/v1/copy-trading/configs - Create copy trading config
     */
    app.post('/api/v1/copy-trading/configs', async (req: Request, res: Response) => {
        const walletAddress = req.headers['x-wallet-address'] as string;
        const { targetWallet, targetLabel, allocationPercent, maxPositionSize, stopLossPercent, takeProfitPercent } = req.body;

        const config = {
            id: `copy_${Date.now()}`,
            userWallet: walletAddress || 'anonymous',
            targetWallet,
            targetLabel,
            enabled: true,
            dryRun: false,
            sizingMode: 'percentage',
            fixedSize: 100,
            allocationPercent: allocationPercent || 10,
            maxPositionSize,
            stopLossPercent,
            takeProfitPercent,
            totalTrades: 0,
            totalPnl: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        copyTradingConfigs.set(config.id, config);
        res.status(201).json({ success: true, data: config });
    });

    /**
     * PATCH /api/v1/copy-trading/configs/:configId - Update config
     */
    app.patch('/api/v1/copy-trading/configs/:configId', async (req: Request, res: Response) => {
        const { configId } = req.params;
        const config = copyTradingConfigs.get(configId);
        if (!config) {
            res.status(404).json({ success: false, error: 'Config not found' });
            return;
        }
        Object.assign(config, req.body, { updatedAt: new Date().toISOString() });
        res.json({ success: true, data: config });
    });

    /**
     * DELETE /api/v1/copy-trading/configs/:configId - Delete config
     */
    app.delete('/api/v1/copy-trading/configs/:configId', async (req: Request, res: Response) => {
        const { configId } = req.params;
        copyTradingConfigs.delete(configId);
        res.json({ success: true });
    });

    /**
     * POST /api/v1/copy-trading/configs/:configId/toggle - Toggle config
     */
    app.post('/api/v1/copy-trading/configs/:configId/toggle', async (req: Request, res: Response) => {
        const { configId } = req.params;
        const { enabled } = req.body;
        const config = copyTradingConfigs.get(configId);
        if (config) {
            config.enabled = enabled;
            config.updatedAt = new Date().toISOString();
        }
        res.json({ success: true, enabled });
    });

    /**
     * GET /api/v1/copy-trading/history - Get copy trading history
     */
    app.get('/api/v1/copy-trading/history', async (req: Request, res: Response) => {
        const { configId, limit } = req.query;
        let history = copyTradingHistory;
        if (configId) history = history.filter(h => h.configId === configId);
        if (limit) history = history.slice(0, parseInt(limit as string, 10));
        res.json({ success: true, data: history });
    });

    /**
     * GET /api/v1/copy-trading/stats - Get copy trading stats
     */
    app.get('/api/v1/copy-trading/stats', async (req: Request, res: Response) => {
        const configs = Array.from(copyTradingConfigs.values());
        res.json({
            success: true,
            data: {
                totalConfigs: configs.length,
                activeConfigs: configs.filter(c => c.enabled).length,
                totalCopiedTrades: copyTradingHistory.length,
                successfulTrades: copyTradingHistory.filter(h => h.status === 'executed').length,
                totalPnl: configs.reduce((sum, c) => sum + (c.totalPnl || 0), 0),
                successRate: copyTradingHistory.length > 0
                    ? (copyTradingHistory.filter(h => h.pnl > 0).length / copyTradingHistory.length) * 100
                    : 0,
            }
        });
    });

    /**
     * GET /api/v1/copy-trading/status - Get copy trading status
     */
    app.get('/api/v1/copy-trading/status', async (req: Request, res: Response) => {
        const configs = Array.from(copyTradingConfigs.values());
        res.json({
            success: true,
            data: {
                active: configs.some(c => c.enabled),
                totalCopied: copyTradingHistory.length,
                totalSkipped: 0,
                totalPnl: configs.reduce((sum, c) => sum + (c.totalPnl || 0), 0),
                winRate: 65,
                avgReturn: 2.5,
                openPositions: 0,
                followedAddresses: configs.length,
            }
        });
    });

    // ==================== Bounties / OSINT ====================

    const bounties: Map<string, any> = new Map();
    const bountySubmissions: Map<string, any> = new Map();

    /**
     * GET /api/v1/bounties - List bounties
     */
    app.get('/api/v1/bounties', async (req: Request, res: Response) => {
        const { status, difficulty, page = '1', per_page = '20' } = req.query;
        let bountiesList = Array.from(bounties.values());
        if (status) bountiesList = bountiesList.filter(b => b.status === status);
        if (difficulty) bountiesList = bountiesList.filter(b => b.difficulty === difficulty);
        const start = (parseInt(page as string, 10) - 1) * parseInt(per_page as string, 10);
        res.json({
            success: true,
            data: {
                bounties: bountiesList.slice(start, start + parseInt(per_page as string, 10)),
                total: bountiesList.length,
                page: parseInt(page as string, 10),
                per_page: parseInt(per_page as string, 10),
            }
        });
    });

    /**
     * GET /api/v1/bounties/:id - Get bounty details
     */
    app.get('/api/v1/bounties/:id', async (req: Request, res: Response) => {
        const bounty = bounties.get(req.params.id);
        if (!bounty) {
            res.status(404).json({ success: false, error: 'Bounty not found' });
            return;
        }
        res.json({ success: true, data: { bounty, claim: null, submission: bountySubmissions.get(req.params.id) || null } });
    });

    /**
     * POST /api/v1/bounties - Create bounty
     */
    app.post('/api/v1/bounties', async (req: Request, res: Response) => {
        const { question, description, reward, difficulty, tags, deadline, poster_wallet } = req.body;
        const bounty = {
            id: `bounty_${Date.now()}`,
            question,
            description,
            reward: reward || { amount: 100, token: 'USDC' },
            poster_wallet,
            status: 'open',
            difficulty: difficulty || 'medium',
            tags: tags || [],
            deadline: deadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: new Date().toISOString(),
        };
        bounties.set(bounty.id, bounty);
        res.status(201).json({ success: true, data: { created: true, bounty_id: bounty.id, bounty } });
    });

    /**
     * POST /api/v1/bounties/:id/claim - Claim bounty
     */
    app.post('/api/v1/bounties/:id/claim', async (req: Request, res: Response) => {
        const { hunter_wallet } = req.body;
        const bounty = bounties.get(req.params.id);
        if (!bounty) {
            res.status(404).json({ success: false, error: 'Bounty not found' });
            return;
        }
        bounty.claimed_by = hunter_wallet;
        bounty.claimed_at = new Date().toISOString();
        res.json({ success: true, data: { claim: { id: `claim_${Date.now()}`, bounty_id: req.params.id, hunter_wallet, claimed_at: bounty.claimed_at } } });
    });

    /**
     * POST /api/v1/bounties/:id/submit - Submit solution
     */
    app.post('/api/v1/bounties/:id/submit', async (req: Request, res: Response) => {
        const { solution, confidence, hunter_wallet } = req.body;
        const submission = {
            id: `sub_${Date.now()}`,
            bounty_id: req.params.id,
            hunter_wallet,
            solution,
            confidence: confidence || 80,
            status: 'pending',
            submitted_at: new Date().toISOString(),
        };
        bountySubmissions.set(req.params.id, submission);
        res.json({ success: true, data: { submission } });
    });

    /**
     * POST /api/v1/bounties/:id/resolve - Resolve bounty
     */
    app.post('/api/v1/bounties/:id/resolve', async (req: Request, res: Response) => {
        const { approved } = req.body;
        const bounty = bounties.get(req.params.id);
        if (bounty) {
            bounty.status = approved ? 'resolved' : 'rejected';
            bounty.resolved_at = new Date().toISOString();
        }
        res.json({ success: true, data: { status: bounty?.status, message: approved ? 'Bounty resolved and paid' : 'Submission rejected' } });
    });

    // ==================== Limit Orders ====================

    const limitOrders: Map<string, any> = new Map();

    /**
     * GET /api/v1/limit-orders - Get limit orders
     */
    app.get('/api/v1/limit-orders', async (req: Request, res: Response) => {
        const { walletAddress, status } = req.query;
        let orders = Array.from(limitOrders.values());
        if (walletAddress) orders = orders.filter(o => o.walletAddress === walletAddress);
        if (status) orders = orders.filter(o => o.status === status);
        res.json({ success: true, data: { data: orders, total: orders.length } });
    });

    /**
     * POST /api/v1/limit-orders - Create limit order
     */
    app.post('/api/v1/limit-orders', async (req: Request, res: Response) => {
        const { walletAddress, inputMint, outputMint, inputAmount, targetPrice, direction, expiresAt, slippageBps } = req.body;
        const order = {
            id: `order_${Date.now()}`,
            walletAddress,
            inputMint,
            outputMint,
            inputAmount,
            targetPrice,
            direction: direction || 'below',
            status: 'active',
            expiresAt,
            createdAt: Date.now(),
            slippageBps: slippageBps || 50,
        };
        limitOrders.set(order.id, order);
        res.status(201).json({ success: true, data: { data: order } });
    });

    /**
     * DELETE /api/v1/limit-orders/:orderId - Cancel limit order
     */
    app.delete('/api/v1/limit-orders/:orderId', async (req: Request, res: Response) => {
        const order = limitOrders.get(req.params.orderId);
        if (order) order.status = 'cancelled';
        limitOrders.delete(req.params.orderId);
        res.json({ success: true, data: { message: 'Order cancelled' } });
    });

    /**
     * GET /api/v1/limit-orders/stats - Get limit order stats
     */
    app.get('/api/v1/limit-orders/stats', async (req: Request, res: Response) => {
        const { walletAddress } = req.query;
        const orders = Array.from(limitOrders.values()).filter(o => !walletAddress || o.walletAddress === walletAddress);
        res.json({
            success: true,
            data: {
                data: {
                    active: orders.filter(o => o.status === 'active').length,
                    executed: orders.filter(o => o.status === 'executed').length,
                    cancelled: orders.filter(o => o.status === 'cancelled').length,
                    expired: orders.filter(o => o.status === 'expired').length,
                    totalVolume: orders.reduce((sum, o) => sum + (o.inputAmount || 0), 0),
                }
            }
        });
    });

    // ==================== Risk Management ====================

    const circuitBreakerConfigs: Map<string, any> = new Map();
    const circuitBreakerHistory: any[] = [];
    const stressTestResults: any[] = [];
    const killSwitchHistory: any[] = [];

    /**
     * GET /api/v1/risk/metrics - Get risk metrics
     */
    app.get('/api/v1/risk/metrics', async (req: Request, res: Response) => {
        const { wallet } = req.query;
        res.json({
            success: true,
            data: {
                wallet,
                var95: 2500,
                var99: 4200,
                sharpeRatio: 1.8,
                maxDrawdown: 12.5,
                currentDrawdown: 3.2,
                beta: 1.1,
                alpha: 0.05,
                volatility: 18.5,
                correlationBTC: 0.75,
                lastUpdated: Date.now(),
            }
        });
    });

    /**
     * GET /api/v1/risk/metrics/history - Get risk metrics history
     */
    app.get('/api/v1/risk/metrics/history', async (req: Request, res: Response) => {
        res.json({ success: true, data: [] });
    });

    /**
     * GET /api/v1/risk/circuit-breaker - Get circuit breaker config
     */
    app.get('/api/v1/risk/circuit-breaker', async (req: Request, res: Response) => {
        const { wallet } = req.query;
        const config = circuitBreakerConfigs.get(wallet as string) || {
            enabled: true,
            maxDailyLoss: 1000,
            maxDrawdown: 20,
            maxPositionSize: 5000,
            cooldownMinutes: 60,
            triggered: false,
        };
        res.json({ success: true, data: config });
    });

    /**
     * POST /api/v1/risk/circuit-breaker - Save circuit breaker config
     */
    app.post('/api/v1/risk/circuit-breaker', async (req: Request, res: Response) => {
        const { wallet, ...config } = req.body;
        circuitBreakerConfigs.set(wallet, config);
        res.json({ success: true, data: config });
    });

    /**
     * POST /api/v1/risk/circuit-breaker/trigger - Trigger circuit breaker
     */
    app.post('/api/v1/risk/circuit-breaker/trigger', async (req: Request, res: Response) => {
        const { wallet, reason } = req.body;
        const event = { wallet, reason, triggeredAt: Date.now() };
        circuitBreakerHistory.push(event);
        io.emit('circuit_breaker_triggered', event);
        res.json({ success: true, data: { message: 'Circuit breaker triggered', event } });
    });

    /**
     * POST /api/v1/risk/circuit-breaker/reset - Reset circuit breaker
     */
    app.post('/api/v1/risk/circuit-breaker/reset', async (req: Request, res: Response) => {
        const { wallet } = req.body;
        res.json({ success: true, data: { message: 'Circuit breaker reset', wallet } });
    });

    /**
     * GET /api/v1/risk/stress-tests/scenarios - Get stress test scenarios
     */
    app.get('/api/v1/risk/stress-tests/scenarios', async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: [
                { id: 'market_crash', name: 'Market Crash', description: '30% market decline', severity: 'high' },
                { id: 'flash_crash', name: 'Flash Crash', description: 'Sudden 50% drop and recovery', severity: 'extreme' },
                { id: 'volatility_spike', name: 'Volatility Spike', description: '3x normal volatility', severity: 'medium' },
                { id: 'liquidity_crisis', name: 'Liquidity Crisis', description: '80% liquidity reduction', severity: 'high' },
            ]
        });
    });

    /**
     * POST /api/v1/risk/stress-tests - Run stress test
     */
    app.post('/api/v1/risk/stress-tests', async (req: Request, res: Response) => {
        const { userWallet, scenario } = req.body;
        const result = {
            id: `stress_${Date.now()}`,
            wallet: userWallet,
            scenario,
            estimatedLoss: Math.random() * 5000,
            portfolioImpact: -Math.random() * 25,
            riskScore: Math.floor(Math.random() * 100),
            recommendations: ['Reduce leverage', 'Diversify positions'],
            createdAt: Date.now(),
        };
        stressTestResults.push(result);
        res.json({ success: true, data: result });
    });

    /**
     * GET /api/v1/risk/stress-tests - Get stress test results
     */
    app.get('/api/v1/risk/stress-tests', async (req: Request, res: Response) => {
        const { wallet, limit } = req.query;
        let results = stressTestResults;
        if (wallet) results = results.filter(r => r.wallet === wallet);
        if (limit) results = results.slice(0, parseInt(limit as string, 10));
        res.json({ success: true, data: results });
    });

    /**
     * POST /api/v1/risk/kill-switch - Trigger kill switch
     */
    app.post('/api/v1/risk/kill-switch', async (req: Request, res: Response) => {
        const { userWallet, reason } = req.body;
        const event = { wallet: userWallet, reason, triggeredAt: Date.now(), positionsClosed: 0 };
        killSwitchHistory.push(event);
        io.emit('kill_switch_triggered', event);
        res.json({ success: true, data: { message: 'Kill switch activated - all positions closed', event } });
    });

    /**
     * GET /api/v1/risk/kill-switch/history - Get kill switch history
     */
    app.get('/api/v1/risk/kill-switch/history', async (req: Request, res: Response) => {
        const { wallet, limit } = req.query;
        let history = killSwitchHistory;
        if (wallet) history = history.filter(h => h.wallet === wallet);
        if (limit) history = history.slice(0, parseInt(limit as string, 10));
        res.json({ success: true, data: history });
    });

    /**
     * GET /api/v1/risk/dashboard - Get risk dashboard
     */
    app.get('/api/v1/risk/dashboard', async (req: Request, res: Response) => {
        const { wallet } = req.query;
        res.json({
            success: true,
            data: {
                wallet,
                overallRiskScore: 65,
                portfolioValue: 50000,
                totalExposure: 35000,
                leverage: 1.5,
                marginUsed: 70,
                alerts: [],
                recommendations: ['Consider reducing position sizes', 'Set stop-loss orders'],
            }
        });
    });

    // ==================== Integrations / Platform Management ====================

    const platformConnections: Map<string, any> = new Map();
    const notificationSettings: Map<string, any> = new Map();

    /**
     * GET /api/v1/integrations - Get available platforms
     */
    app.get('/api/v1/integrations', async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: {
                messaging: [
                    { id: 'telegram', name: 'Telegram', icon: '/icons/telegram.svg', category: 'messaging', description: 'Get alerts via Telegram', connected: false, status: 'available' },
                    { id: 'discord', name: 'Discord', icon: '/icons/discord.svg', category: 'messaging', description: 'Discord notifications', connected: false, status: 'available' },
                ],
                exchange: [
                    { id: 'binance', name: 'Binance', icon: '/icons/binance.svg', category: 'exchange', description: 'Binance Futures trading', connected: false, status: 'available' },
                    { id: 'hyperliquid', name: 'Hyperliquid', icon: '/icons/hyperliquid.svg', category: 'exchange', description: 'Hyperliquid DEX', connected: false, status: 'available' },
                ],
                prediction: [
                    { id: 'polymarket', name: 'Polymarket', icon: '/icons/polymarket.svg', category: 'prediction', description: 'Prediction market trading', connected: false, status: 'available' },
                    { id: 'kalshi', name: 'Kalshi', icon: '/icons/kalshi.svg', category: 'prediction', description: 'Event contracts', connected: false, status: 'available' },
                ],
                notificationEvents: [
                    { id: 'trade_executed', name: 'Trade Executed', description: 'When a trade is executed' },
                    { id: 'price_alert', name: 'Price Alert', description: 'When price targets are hit' },
                    { id: 'whale_activity', name: 'Whale Activity', description: 'Large wallet movements' },
                ],
            }
        });
    });

    /**
     * GET /api/v1/integrations/connected - Get connected platforms
     */
    app.get('/api/v1/integrations/connected', async (req: Request, res: Response) => {
        res.json({ success: true, data: Array.from(platformConnections.values()) });
    });

    /**
     * POST /api/v1/integrations/:platform/connect - Connect platform
     */
    app.post('/api/v1/integrations/:platform/connect', async (req: Request, res: Response) => {
        const { platform } = req.params;
        const { credentials, config } = req.body;
        const connection = {
            id: `conn_${Date.now()}`,
            platform,
            status: 'connected',
            lastConnectedAt: Date.now(),
            config,
        };
        platformConnections.set(platform, connection);
        res.json({ success: true, data: connection });
    });

    /**
     * POST /api/v1/integrations/:platform/disconnect - Disconnect platform
     */
    app.post('/api/v1/integrations/:platform/disconnect', async (req: Request, res: Response) => {
        platformConnections.delete(req.params.platform);
        res.json({ success: true, data: { message: 'Platform disconnected' } });
    });

    /**
     * POST /api/v1/integrations/:platform/test - Test platform connection
     */
    app.post('/api/v1/integrations/:platform/test', async (req: Request, res: Response) => {
        res.json({ success: true, data: { platform: req.params.platform, testResult: 'passed', message: 'Connection successful', latencyMs: 45 } });
    });

    /**
     * GET /api/v1/integrations/:platform/status - Get platform status
     */
    app.get('/api/v1/integrations/:platform/status', async (req: Request, res: Response) => {
        const connection = platformConnections.get(req.params.platform);
        res.json({
            success: true,
            data: {
                platform: req.params.platform,
                connected: !!connection,
                status: connection ? 'connected' : 'disconnected',
                health: 'healthy',
                latencyMs: 42,
            }
        });
    });

    /**
     * GET /api/v1/integrations/polymarket/challenge - Get Polymarket auth challenge
     */
    app.get('/api/v1/integrations/polymarket/challenge', async (req: Request, res: Response) => {
        res.json({ success: true, data: { challenge: `Sign this message to connect: ${Date.now()}`, expiresAt: Date.now() + 300000 } });
    });

    /**
     * POST /api/v1/integrations/polymarket/connect-wallet - Connect Polymarket wallet
     */
    app.post('/api/v1/integrations/polymarket/connect-wallet', async (req: Request, res: Response) => {
        const { signature, address } = req.body;
        platformConnections.set('polymarket', { platform: 'polymarket', address, status: 'connected', connectedAt: Date.now() });
        res.json({ success: true, data: { message: 'Polymarket wallet connected' } });
    });

    /**
     * GET /api/v1/integrations/notifications/settings - Get notification settings
     */
    app.get('/api/v1/integrations/notifications/settings', async (req: Request, res: Response) => {
        const walletAddress = req.headers['x-wallet-address'] as string;
        res.json({ success: true, data: notificationSettings.get(walletAddress) || {} });
    });

    /**
     * PUT /api/v1/integrations/notifications/settings - Update notification settings
     */
    app.put('/api/v1/integrations/notifications/settings', async (req: Request, res: Response) => {
        const walletAddress = req.headers['x-wallet-address'] as string;
        const { settings } = req.body;
        notificationSettings.set(walletAddress, settings);
        res.json({ success: true, data: { message: 'Settings updated' } });
    });

    // ==================== Leaderboard ====================

    /**
     * GET /api/v1/leaderboard - Get leaderboard
     */
    app.get('/api/v1/leaderboard', async (req: Request, res: Response) => {
        const { limit = '50' } = req.query;
        const hunters = Array.from({ length: Math.min(parseInt(limit as string, 10), 50) }, (_, i) => ({
            position: i + 1,
            walletAddress: `0x${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 6)}`,
            rankTitle: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'][Math.floor(i / 10)] || 'Bronze',
            totalEarnings: Math.floor(Math.random() * 50000) + 1000,
            bountiesCompleted: Math.floor(Math.random() * 50) + 5,
            successRate: Math.floor(Math.random() * 30) + 70,
            reputationScore: Math.floor(Math.random() * 500) + 100,
            badges: [],
        }));
        res.json({ success: true, data: { data: { hunters, total: hunters.length } } });
    });

    /**
     * GET /api/v1/leaderboard/reputation/:walletAddress - Get hunter reputation
     */
    app.get('/api/v1/leaderboard/reputation/:walletAddress', async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: {
                data: {
                    walletAddress: req.params.walletAddress,
                    rank: 'Gold',
                    totalEarnings: 12500,
                    bountiesCompleted: 25,
                    bountiesAttempted: 30,
                    successRate: 83,
                    specializations: ['crypto', 'defi', 'nft'],
                    badges: [{ id: 'first_bounty', name: 'First Blood', icon: '🏆', rarity: 'common', earnedAt: Date.now() }],
                    streakCurrent: 5,
                    streakBest: 12,
                    reputationScore: 850,
                }
            }
        });
    });

    /**
     * GET /api/v1/leaderboard/badges - Get available badges
     */
    app.get('/api/v1/leaderboard/badges', async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: {
                data: [
                    { id: 'first_bounty', name: 'First Blood', description: 'Complete your first bounty', icon: '🏆', rarity: 'common' },
                    { id: 'speed_demon', name: 'Speed Demon', description: 'Complete bounty in under 1 hour', icon: '⚡', rarity: 'rare' },
                    { id: 'whale_hunter', name: 'Whale Hunter', description: 'Track 10 whale wallets', icon: '🐋', rarity: 'epic' },
                ]
            }
        });
    });

    /**
     * GET /api/v1/leaderboard/ranks - Get rank tiers
     */
    app.get('/api/v1/leaderboard/ranks', async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: {
                data: [
                    { name: 'Bronze', minScore: 0, icon: '🥉' },
                    { name: 'Silver', minScore: 100, icon: '🥈' },
                    { name: 'Gold', minScore: 500, icon: '🥇' },
                    { name: 'Platinum', minScore: 1000, icon: '💎' },
                    { name: 'Diamond', minScore: 5000, icon: '👑' },
                ]
            }
        });
    });

    // ==================== Market Data ====================

    /**
     * GET /api/v1/market/trending - Get trending tokens
     */
    app.get('/api/v1/market/trending', async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: [
                { symbol: 'SOL', name: 'Solana', price: 148.50, change24h: 5.2 },
                { symbol: 'JUP', name: 'Jupiter', price: 0.85, change24h: 12.3 },
                { symbol: 'BONK', name: 'Bonk', price: 0.000023, change24h: -3.5 },
                { symbol: 'WIF', name: 'Dogwifhat', price: 2.45, change24h: 8.7 },
                { symbol: 'PYTH', name: 'Pyth Network', price: 0.42, change24h: 2.1 },
            ]
        });
    });

    /**
     * GET /api/v1/market/prediction-markets - Get prediction markets
     */
    app.get('/api/v1/market/prediction-markets', async (req: Request, res: Response) => {
        try {
            const markets = await polymarketService.getMarkets({ active: true, limit: 20 });
            res.json({ success: true, data: markets });
        } catch {
            res.json({ success: true, data: [] });
        }
    });

    /**
     * GET /api/v1/market/arbitrage - Get arbitrage opportunities
     */
    app.get('/api/v1/market/arbitrage', async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: [
                { id: 'arb_1', token: 'SOL', buyPlatform: 'Jupiter', buyPrice: 148.20, sellPlatform: 'Raydium', sellPrice: 148.80, profitPercent: 0.4, confidence: 0.85 },
                { id: 'arb_2', token: 'JUP', buyPlatform: 'Orca', buyPrice: 0.84, sellPlatform: 'Jupiter', sellPrice: 0.86, profitPercent: 2.3, confidence: 0.72 },
            ]
        });
    });

    /**
     * GET /api/v1/market/osint/bounties - Get OSINT bounties
     */
    app.get('/api/v1/market/osint/bounties', async (req: Request, res: Response) => {
        const bountiesList = Array.from(bounties.values()).filter(b => b.status === 'open');
        res.json({ success: true, data: bountiesList });
    });

    /**
     * GET /api/v1/market/stats - Get market stats
     */
    app.get('/api/v1/market/stats', async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: {
                totalVolume24h: 2500000000,
                totalTrades24h: 150000,
                activePredictionMarkets: 450,
                activeArbitrageOpportunities: 12,
                topGainers: [{ symbol: 'JUP', change: 12.3 }, { symbol: 'WIF', change: 8.7 }],
                topLosers: [{ symbol: 'BONK', change: -3.5 }, { symbol: 'RAY', change: -2.1 }],
                sentiment: 'bullish',
                fearGreedIndex: 72,
            }
        });
    });

    // ==================== Signals / God Wallets ====================

    /**
     * GET /api/v1/signals/god-wallets - Get god wallets
     */
    app.get('/api/v1/signals/god-wallets', async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: [
                { address: '0x1234...abcd', label: 'Smart Money Alpha', trustScore: 92, totalTrades: 1250, winRate: 78, recentBuys: [] },
                { address: '0x5678...efgh', label: 'DeFi Whale', trustScore: 88, totalTrades: 890, winRate: 72, recentBuys: [] },
                { address: 'GwBr...mnop', label: 'Solana Whale', trustScore: 85, totalTrades: 2100, winRate: 68, recentBuys: [] },
            ]
        });
    });

    // ==================== Portfolio ====================

    /**
     * GET /api/v1/portfolio/holdings - Get holdings
     */
    app.get('/api/v1/portfolio/holdings', async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: [
                { token: 'SOL', symbol: 'SOL', amount: 10.5, value: 1559.25, pnl: 125.50 },
                { token: 'USDC', symbol: 'USDC', amount: 500, value: 500, pnl: 0 },
                { token: 'JUP', symbol: 'JUP', amount: 1000, value: 850, pnl: 45.20 },
            ]
        });
    });

    // ==================== Automation ====================

    const automationRules: Map<string, any> = new Map();
    const automationHistory: any[] = [];

    /**
     * GET /api/v1/automation/rules - Get automation rules
     */
    app.get('/api/v1/automation/rules', async (req: Request, res: Response) => {
        const { userWallet } = req.query;
        const rules = Array.from(automationRules.values()).filter(r => !userWallet || r.userWallet === userWallet);
        res.json({ success: true, data: { data: rules } });
    });

    /**
     * POST /api/v1/automation/rules - Create automation rule
     */
    app.post('/api/v1/automation/rules', async (req: Request, res: Response) => {
        const { userWallet, name, description, ruleType, triggerConfig, actionConfig } = req.body;
        const rule = {
            id: `rule_${Date.now()}`,
            userWallet,
            name,
            description,
            ruleType,
            triggerConfig,
            actionConfig,
            enabled: true,
            triggerCount: 0,
            createdAt: Date.now(),
        };
        automationRules.set(rule.id, rule);
        res.status(201).json({ success: true, data: { data: rule } });
    });

    /**
     * PUT /api/v1/automation/rules/:ruleId - Update automation rule
     */
    app.put('/api/v1/automation/rules/:ruleId', async (req: Request, res: Response) => {
        const rule = automationRules.get(req.params.ruleId);
        if (!rule) {
            res.status(404).json({ success: false, error: 'Rule not found' });
            return;
        }
        Object.assign(rule, req.body);
        res.json({ success: true, data: { data: rule } });
    });

    /**
     * DELETE /api/v1/automation/rules/:ruleId - Delete automation rule
     */
    app.delete('/api/v1/automation/rules/:ruleId', async (req: Request, res: Response) => {
        automationRules.delete(req.params.ruleId);
        res.json({ success: true, data: { message: 'Rule deleted' } });
    });

    /**
     * POST /api/v1/automation/rules/:ruleId/toggle - Toggle automation rule
     */
    app.post('/api/v1/automation/rules/:ruleId/toggle', async (req: Request, res: Response) => {
        const { enabled } = req.body;
        const rule = automationRules.get(req.params.ruleId);
        if (rule) rule.enabled = enabled;
        res.json({ success: true, data: { data: rule } });
    });

    /**
     * GET /api/v1/automation/history - Get automation history
     */
    app.get('/api/v1/automation/history', async (req: Request, res: Response) => {
        const { ruleId, limit } = req.query;
        let history = automationHistory;
        if (ruleId) history = history.filter(h => h.ruleId === ruleId);
        if (limit) history = history.slice(0, parseInt(limit as string, 10));
        res.json({ success: true, data: { data: history } });
    });

    /**
     * GET /api/v1/automation/stats - Get automation stats
     */
    app.get('/api/v1/automation/stats', async (req: Request, res: Response) => {
        const rules = Array.from(automationRules.values());
        res.json({
            success: true,
            data: {
                data: {
                    totalRules: rules.length,
                    activeRules: rules.filter(r => r.enabled).length,
                    totalTriggers: automationHistory.length,
                    successfulTriggers: automationHistory.filter(h => h.result === 'success').length,
                    failedTriggers: automationHistory.filter(h => h.result === 'failed').length,
                    byType: {},
                }
            }
        });
    });

    // ==================== Backtest ====================

    const backtestRuns: Map<string, any> = new Map();

    /**
     * GET /api/v1/backtest/strategies - Get backtest strategies
     */
    app.get('/api/v1/backtest/strategies', async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: [
                { id: 'momentum', name: 'Momentum', description: 'Follow price momentum', parameters: ['period', 'threshold'] },
                { id: 'mean_reversion', name: 'Mean Reversion', description: 'Trade price reversions', parameters: ['period', 'deviation'] },
                { id: 'dca', name: 'Dollar Cost Average', description: 'Regular interval buying', parameters: ['interval', 'amount'] },
                { id: 'whale_follow', name: 'Whale Following', description: 'Copy whale trades', parameters: ['minAmount', 'delay'] },
            ]
        });
    });

    /**
     * GET /api/v1/backtest/runs - Get backtest runs
     */
    app.get('/api/v1/backtest/runs', async (req: Request, res: Response) => {
        const { wallet, strategy, limit } = req.query;
        let runs = Array.from(backtestRuns.values());
        if (wallet) runs = runs.filter(r => r.wallet === wallet);
        if (strategy) runs = runs.filter(r => r.strategy === strategy);
        if (limit) runs = runs.slice(0, parseInt(limit as string, 10));
        res.json({ success: true, data: runs });
    });

    /**
     * POST /api/v1/backtest/runs - Create backtest run
     */
    app.post('/api/v1/backtest/runs', async (req: Request, res: Response) => {
        const { userWallet, name, strategy, symbol, startDate, endDate, initialCapital, parameters } = req.body;
        const run = {
            id: `bt_${Date.now()}`,
            wallet: userWallet,
            name,
            strategy,
            symbol,
            startDate,
            endDate,
            initialCapital: initialCapital || 10000,
            parameters,
            status: 'completed',
            results: {
                totalReturn: (Math.random() * 40 - 10).toFixed(2),
                sharpeRatio: (Math.random() * 2).toFixed(2),
                maxDrawdown: (Math.random() * 20).toFixed(2),
                winRate: (Math.random() * 30 + 50).toFixed(1),
                totalTrades: Math.floor(Math.random() * 100) + 20,
            },
            createdAt: Date.now(),
        };
        backtestRuns.set(run.id, run);
        res.status(201).json({ success: true, data: run });
    });

    /**
     * GET /api/v1/backtest/runs/:runId/results - Get backtest results
     */
    app.get('/api/v1/backtest/runs/:runId/results', async (req: Request, res: Response) => {
        const run = backtestRuns.get(req.params.runId);
        if (!run) {
            res.status(404).json({ success: false, error: 'Backtest not found' });
            return;
        }
        res.json({ success: true, data: run.results });
    });

    /**
     * POST /api/v1/backtest/compare - Compare backtests
     */
    app.post('/api/v1/backtest/compare', async (req: Request, res: Response) => {
        const { backtestIds } = req.body;
        const runs = backtestIds.map((id: string) => backtestRuns.get(id)).filter(Boolean);
        res.json({ success: true, data: { runs, comparison: {} } });
    });

    /**
     * POST /api/v1/backtest/simulate - Simulate backtest
     */
    app.post('/api/v1/backtest/simulate', async (req: Request, res: Response) => {
        const { strategy, symbol, startDate, endDate, parameters, initialCapital } = req.body;
        res.json({
            success: true,
            data: {
                strategy,
                symbol,
                period: { startDate, endDate },
                initialCapital: initialCapital || 10000,
                results: {
                    totalReturn: (Math.random() * 40 - 10).toFixed(2),
                    sharpeRatio: (Math.random() * 2).toFixed(2),
                    maxDrawdown: (Math.random() * 20).toFixed(2),
                    winRate: (Math.random() * 30 + 50).toFixed(1),
                    totalTrades: Math.floor(Math.random() * 100) + 20,
                }
            }
        });
    });

    // ==================== Futures Trading ====================

    const futuresPositions: Map<string, any> = new Map();
    const futuresOrders: Map<string, any> = new Map();

    /**
     * GET /api/v1/futures/positions - Get futures positions
     */
    app.get('/api/v1/futures/positions', async (req: Request, res: Response) => {
        const { wallet, exchange, status } = req.query;
        let positions = Array.from(futuresPositions.values());
        if (wallet) positions = positions.filter(p => p.userWallet === wallet);
        if (exchange) positions = positions.filter(p => p.exchange === exchange);
        if (status) positions = positions.filter(p => p.status === status);
        res.json({ success: true, data: positions });
    });

    /**
     * GET /api/v1/futures/positions/open - Get open futures positions
     */
    app.get('/api/v1/futures/positions/open', async (req: Request, res: Response) => {
        const { wallet } = req.query;
        const positions = Array.from(futuresPositions.values()).filter(p => p.status === 'open' && (!wallet || p.userWallet === wallet));
        res.json({ success: true, data: positions });
    });

    /**
     * POST /api/v1/futures/positions - Create futures position
     */
    app.post('/api/v1/futures/positions', async (req: Request, res: Response) => {
        const { userWallet, exchange, symbol, side, leverage, size, entryPrice, margin, marginType, stopLoss, takeProfit } = req.body;
        const position = {
            id: `pos_${Date.now()}`,
            userWallet,
            exchange,
            symbol,
            side,
            leverage,
            size,
            entryPrice,
            currentPrice: entryPrice,
            margin,
            marginType,
            stopLoss,
            takeProfit,
            pnl: 0,
            pnlPercent: 0,
            status: 'open',
            openedAt: Date.now(),
        };
        futuresPositions.set(position.id, position);
        io.emit('futures_position_opened', position);
        res.status(201).json({ success: true, data: position });
    });

    /**
     * POST /api/v1/futures/positions/:id/close - Close futures position
     */
    app.post('/api/v1/futures/positions/:id/close', async (req: Request, res: Response) => {
        const { exitPrice } = req.body;
        const position = futuresPositions.get(req.params.id);
        if (!position) {
            res.status(404).json({ success: false, error: 'Position not found' });
            return;
        }
        position.status = 'closed';
        position.exitPrice = exitPrice;
        position.closedAt = Date.now();
        position.pnl = (exitPrice - position.entryPrice) * position.size * (position.side === 'long' ? 1 : -1);
        io.emit('futures_position_closed', position);
        res.json({ success: true, data: position });
    });

    /**
     * GET /api/v1/futures/orders - Get futures orders
     */
    app.get('/api/v1/futures/orders', async (req: Request, res: Response) => {
        const { wallet, exchange, status } = req.query;
        let orders = Array.from(futuresOrders.values());
        if (wallet) orders = orders.filter(o => o.userWallet === wallet);
        if (exchange) orders = orders.filter(o => o.exchange === exchange);
        if (status) orders = orders.filter(o => o.status === status);
        res.json({ success: true, data: orders });
    });

    /**
     * POST /api/v1/futures/orders - Create futures order
     */
    app.post('/api/v1/futures/orders', async (req: Request, res: Response) => {
        const { userWallet, exchange, symbol, side, orderType, quantity, price, leverage } = req.body;
        const order = {
            id: `ord_${Date.now()}`,
            userWallet,
            exchange,
            symbol,
            side,
            orderType,
            quantity,
            price,
            leverage,
            status: 'open',
            createdAt: Date.now(),
        };
        futuresOrders.set(order.id, order);
        res.status(201).json({ success: true, data: order });
    });

    /**
     * POST /api/v1/futures/orders/:id/cancel - Cancel futures order
     */
    app.post('/api/v1/futures/orders/:id/cancel', async (req: Request, res: Response) => {
        const order = futuresOrders.get(req.params.id);
        if (order) order.status = 'cancelled';
        res.json({ success: true, data: order });
    });

    /**
     * GET /api/v1/futures/exchanges - Get connected exchanges
     */
    app.get('/api/v1/futures/exchanges', async (req: Request, res: Response) => {
        res.json({ success: true, data: ['hyperliquid', 'binance', 'bybit'] });
    });

    /**
     * GET /api/v1/futures/markets - Get futures markets
     */
    app.get('/api/v1/futures/markets', async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: [
                { symbol: 'BTC/USDT', exchange: 'binance', maxLeverage: 125 },
                { symbol: 'ETH/USDT', exchange: 'binance', maxLeverage: 100 },
                { symbol: 'SOL/USDT', exchange: 'binance', maxLeverage: 75 },
                { symbol: 'BTC-PERP', exchange: 'hyperliquid', maxLeverage: 50 },
            ]
        });
    });

    /**
     * GET /api/v1/futures/stats - Get futures stats
     */
    app.get('/api/v1/futures/stats', async (req: Request, res: Response) => {
        const positions = Array.from(futuresPositions.values());
        res.json({
            success: true,
            data: {
                openPositions: positions.filter(p => p.status === 'open').length,
                totalPnl: positions.reduce((sum, p) => sum + (p.pnl || 0), 0),
                winRate: 65,
                totalTrades: positions.length,
            }
        });
    });

    // ==================== EVM Integration ====================

    const evmWallets: Map<string, any> = new Map();

    /**
     * GET /api/v1/evm/chains - Get supported chains
     */
    app.get('/api/v1/evm/chains', async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: [
                { id: 'ethereum', name: 'Ethereum', chainId: 1, rpcUrl: 'https://eth.llamarpc.com' },
                { id: 'base', name: 'Base', chainId: 8453, rpcUrl: 'https://mainnet.base.org' },
                { id: 'arbitrum', name: 'Arbitrum', chainId: 42161, rpcUrl: 'https://arb1.arbitrum.io/rpc' },
                { id: 'polygon', name: 'Polygon', chainId: 137, rpcUrl: 'https://polygon-rpc.com' },
            ]
        });
    });

    /**
     * GET /api/v1/evm/wallets - Get EVM wallets
     */
    app.get('/api/v1/evm/wallets', async (req: Request, res: Response) => {
        const { wallet, chain } = req.query;
        let wallets = Array.from(evmWallets.values());
        if (wallet) wallets = wallets.filter(w => w.userWallet === wallet);
        if (chain) wallets = wallets.filter(w => w.chain === chain);
        res.json({ success: true, data: wallets });
    });

    /**
     * POST /api/v1/evm/wallets - Add EVM wallet
     */
    app.post('/api/v1/evm/wallets', async (req: Request, res: Response) => {
        const { userWallet, evmAddress, chain, label, isPrimary } = req.body;
        const wallet = { id: `evm_${Date.now()}`, userWallet, evmAddress, chain, label, isPrimary, createdAt: Date.now() };
        evmWallets.set(wallet.id, wallet);
        res.status(201).json({ success: true, data: wallet });
    });

    /**
     * DELETE /api/v1/evm/wallets/:id - Remove EVM wallet
     */
    app.delete('/api/v1/evm/wallets/:id', async (req: Request, res: Response) => {
        evmWallets.delete(req.params.id);
        res.json({ success: true, data: { message: 'Wallet removed' } });
    });

    /**
     * GET /api/v1/evm/balances - Get EVM balances
     */
    app.get('/api/v1/evm/balances', async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: [
                { token: 'ETH', balance: 1.5, usdValue: 3750 },
                { token: 'USDC', balance: 1000, usdValue: 1000 },
            ]
        });
    });

    /**
     * GET /api/v1/evm/transactions - Get EVM transactions
     */
    app.get('/api/v1/evm/transactions', async (req: Request, res: Response) => {
        res.json({ success: true, data: [] });
    });

    /**
     * POST /api/v1/evm/swap/quote - Get EVM swap quote
     */
    app.post('/api/v1/evm/swap/quote', async (req: Request, res: Response) => {
        const { chain, tokenIn, tokenOut, amountIn } = req.body;
        res.json({
            success: true,
            data: {
                chain,
                tokenIn,
                tokenOut,
                amountIn,
                amountOut: amountIn * 0.998,
                priceImpact: 0.1,
                route: ['Uniswap V3'],
            }
        });
    });

    /**
     * POST /api/v1/evm/swap - Execute EVM swap
     */
    app.post('/api/v1/evm/swap', async (req: Request, res: Response) => {
        res.json({ success: true, data: { txHash: `0x${Math.random().toString(16).slice(2)}`, status: 'pending' } });
    });

    /**
     * GET /api/v1/evm/bridge - Get bridge transactions
     */
    app.get('/api/v1/evm/bridge', async (req: Request, res: Response) => {
        res.json({ success: true, data: [] });
    });

    /**
     * POST /api/v1/evm/bridge - Initiate bridge
     */
    app.post('/api/v1/evm/bridge', async (req: Request, res: Response) => {
        res.json({ success: true, data: { bridgeId: `bridge_${Date.now()}`, status: 'pending' } });
    });

    /**
     * GET /api/v1/evm/stats/:wallet - Get EVM stats
     */
    app.get('/api/v1/evm/stats/:wallet', async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: {
                totalValue: 5000,
                totalTransactions: 45,
                chainsUsed: ['ethereum', 'base'],
            }
        });
    });

    // ==================== Execution Routes ====================

    /**
     * POST /api/v1/execution/routes - Get execution routes
     */
    app.post('/api/v1/execution/routes', async (req: Request, res: Response) => {
        const { inputMint, outputMint, amount, chain } = req.body;
        res.json({
            success: true,
            data: {
                routes: [
                    { executor: 'jupiter', platform: 'Jupiter', estimatedPrice: 148.5, estimatedSlippage: 0.1, score: 95 },
                    { executor: 'raydium', platform: 'Raydium', estimatedPrice: 148.3, estimatedSlippage: 0.15, score: 88 },
                ],
                recommended: { executor: 'jupiter', platform: 'Jupiter' },
            }
        });
    });

    // ==================== Swarm Trading ====================

    const swarms: Map<string, any> = new Map();

    /**
     * GET /api/v1/swarm - Get swarms
     */
    app.get('/api/v1/swarm', async (req: Request, res: Response) => {
        const { wallet, status, strategy } = req.query;
        let swarmsList = Array.from(swarms.values());
        if (wallet) swarmsList = swarmsList.filter(s => s.userWallet === wallet);
        if (status) swarmsList = swarmsList.filter(s => s.status === status);
        if (strategy) swarmsList = swarmsList.filter(s => s.strategy === strategy);
        res.json({ success: true, data: swarmsList });
    });

    /**
     * POST /api/v1/swarm - Create swarm
     */
    app.post('/api/v1/swarm', async (req: Request, res: Response) => {
        const { userWallet, name, strategy, walletCount, wallets, maxSlippage, useJitoBundle } = req.body;
        const swarm = {
            id: `swarm_${Date.now()}`,
            userWallet,
            name,
            strategy,
            walletCount: walletCount || 5,
            wallets: wallets || [],
            maxSlippage: maxSlippage || 1,
            useJitoBundle: useJitoBundle || false,
            status: 'active',
            createdAt: Date.now(),
        };
        swarms.set(swarm.id, swarm);
        res.status(201).json({ success: true, data: swarm });
    });

    /**
     * GET /api/v1/swarm/:id - Get swarm
     */
    app.get('/api/v1/swarm/:id', async (req: Request, res: Response) => {
        const swarm = swarms.get(req.params.id);
        if (!swarm) {
            res.status(404).json({ success: false, error: 'Swarm not found' });
            return;
        }
        res.json({ success: true, data: swarm });
    });

    /**
     * PATCH /api/v1/swarm/:id - Update swarm
     */
    app.patch('/api/v1/swarm/:id', async (req: Request, res: Response) => {
        const swarm = swarms.get(req.params.id);
        if (swarm) Object.assign(swarm, req.body);
        res.json({ success: true, data: swarm });
    });

    /**
     * DELETE /api/v1/swarm/:id - Dissolve swarm
     */
    app.delete('/api/v1/swarm/:id', async (req: Request, res: Response) => {
        swarms.delete(req.params.id);
        res.json({ success: true, data: { message: 'Swarm dissolved' } });
    });

    /**
     * GET /api/v1/swarm/:id/wallets - Get swarm wallets
     */
    app.get('/api/v1/swarm/:id/wallets', async (req: Request, res: Response) => {
        const swarm = swarms.get(req.params.id);
        res.json({ success: true, data: swarm?.wallets || [] });
    });

    /**
     * POST /api/v1/swarm/:id/execute - Execute swarm trade
     */
    app.post('/api/v1/swarm/:id/execute', async (req: Request, res: Response) => {
        const { symbol, side, totalAmount } = req.body;
        res.json({ success: true, data: { executionId: `exec_${Date.now()}`, symbol, side, totalAmount, status: 'executing' } });
    });

    /**
     * GET /api/v1/swarm/:id/executions - Get swarm executions
     */
    app.get('/api/v1/swarm/:id/executions', async (req: Request, res: Response) => {
        res.json({ success: true, data: [] });
    });

    /**
     * GET /api/v1/swarm/stats/:wallet - Get swarm stats
     */
    app.get('/api/v1/swarm/stats/:wallet', async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: {
                totalSwarms: Array.from(swarms.values()).filter(s => s.userWallet === req.params.wallet).length,
                totalExecutions: 0,
                successRate: 85,
            }
        });
    });

    // ==================== Skills ====================

    /**
     * GET /api/v1/skills - Get skills
     */
    app.get('/api/v1/skills', async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: [
                { id: 'trading', name: 'Trading', category: 'execution', description: 'Execute trades', enabled: true },
                { id: 'analytics', name: 'Analytics', category: 'data', description: 'Market analytics', enabled: true },
                { id: 'alerts', name: 'Alerts', category: 'automation', description: 'Price alerts', enabled: true },
            ]
        });
    });

    /**
     * GET /api/v1/skills/by-category - Get skills by category
     */
    app.get('/api/v1/skills/by-category', async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: {
                execution: [{ id: 'trading', name: 'Trading' }],
                data: [{ id: 'analytics', name: 'Analytics' }],
                automation: [{ id: 'alerts', name: 'Alerts' }],
            }
        });
    });

    /**
     * GET /api/v1/skills/:id - Get skill details
     */
    app.get('/api/v1/skills/:id', async (req: Request, res: Response) => {
        res.json({ success: true, data: { id: req.params.id, name: req.params.id, description: 'Skill description', enabled: true } });
    });

    /**
     * POST /api/v1/skills/:id/execute - Execute skill
     */
    app.post('/api/v1/skills/:id/execute', async (req: Request, res: Response) => {
        res.json({ success: true, data: { executionId: `skill_exec_${Date.now()}`, status: 'completed' } });
    });

    /**
     * GET /api/v1/skills/executions/wallet/:wallet - Get skill executions
     */
    app.get('/api/v1/skills/executions/wallet/:wallet', async (req: Request, res: Response) => {
        res.json({ success: true, data: [] });
    });

    /**
     * GET /api/v1/skills/favorites/:wallet - Get favorite skills
     */
    app.get('/api/v1/skills/favorites/:wallet', async (req: Request, res: Response) => {
        res.json({ success: true, data: [] });
    });

    /**
     * POST /api/v1/skills/favorites - Add favorite skill
     */
    app.post('/api/v1/skills/favorites', async (req: Request, res: Response) => {
        res.json({ success: true, data: { message: 'Skill added to favorites' } });
    });

    /**
     * DELETE /api/v1/skills/favorites/:wallet/:skillId - Remove favorite skill
     */
    app.delete('/api/v1/skills/favorites/:wallet/:skillId', async (req: Request, res: Response) => {
        res.json({ success: true, data: { message: 'Skill removed from favorites' } });
    });

    /**
     * GET /api/v1/skills/stats/:wallet - Get skill stats
     */
    app.get('/api/v1/skills/stats/:wallet', async (req: Request, res: Response) => {
        res.json({ success: true, data: { totalExecutions: 0, favoriteSkills: 0 } });
    });

    /**
     * GET /api/v1/skills/categories/list - Get skill categories
     */
    app.get('/api/v1/skills/categories/list', async (req: Request, res: Response) => {
        res.json({ success: true, data: ['execution', 'data', 'automation', 'analysis'] });
    });

    // ==================== Survival Mode (Additional) ====================

    /**
     * POST /api/v1/survival-mode/toggle - Toggle survival mode
     */
    app.post('/api/v1/survival-mode/toggle', async (req: Request, res: Response) => {
        const { wallet, enabled } = req.body;
        res.json({ success: true, data: { wallet, enabled, message: `Survival mode ${enabled ? 'enabled' : 'disabled'}` } });
    });

    /**
     * POST /api/v1/survival-mode/transition - Transition survival state
     */
    app.post('/api/v1/survival-mode/transition', async (req: Request, res: Response) => {
        const { wallet, newState, portfolioValue, portfolioChange, reason, actions } = req.body;
        res.json({ success: true, data: { wallet, previousState: 'normal', newState, reason, actions, transitionedAt: Date.now() } });
    });

    /**
     * POST /api/v1/survival-mode/calculate - Calculate survival state
     */
    app.post('/api/v1/survival-mode/calculate', async (req: Request, res: Response) => {
        const { wallet, portfolioChange } = req.body;
        let state = 'normal';
        if (portfolioChange >= 20) state = 'growth';
        else if (portfolioChange <= -75) state = 'hibernation';
        else if (portfolioChange <= -50) state = 'critical';
        else if (portfolioChange <= -15) state = 'defensive';
        res.json({ success: true, data: { wallet, portfolioChange, calculatedState: state } });
    });

    /**
     * GET /api/v1/survival-mode/states - Get survival states
     */
    app.get('/api/v1/survival-mode/states', async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: [
                { name: 'growth', description: 'Aggressive trading', threshold: 20, riskMultiplier: 1.5 },
                { name: 'normal', description: 'Standard operations', threshold: 0, riskMultiplier: 1.0 },
                { name: 'defensive', description: 'Reduced exposure', threshold: -15, riskMultiplier: 0.5 },
                { name: 'critical', description: 'Capital preservation', threshold: -50, riskMultiplier: 0.25 },
                { name: 'hibernation', description: 'Trading halted', threshold: -75, riskMultiplier: 0 },
            ]
        });
    });

    // ==================== Pairing ====================

    const pairingCodes: Map<string, any> = new Map();
    const linkedAccounts: Map<string, any[]> = new Map();

    /**
     * POST /api/v1/pairing/code - Generate pairing code
     */
    app.post('/api/v1/pairing/code', async (req: Request, res: Response) => {
        const code = Math.random().toString(36).substring(2, 10).toUpperCase();
        pairingCodes.set(code, { code, status: 'pending', createdAt: Date.now(), expiresAt: Date.now() + 300000 });
        res.json({ success: true, data: { code, expiresIn: '5 minutes', instructions: 'Enter this code in Telegram bot' } });
    });

    /**
     * GET /api/v1/pairing/status/:code - Check pairing status
     */
    app.get('/api/v1/pairing/status/:code', async (req: Request, res: Response) => {
        const pairing = pairingCodes.get(req.params.code);
        if (!pairing) {
            res.status(404).json({ success: false, error: 'Code not found or expired' });
            return;
        }
        res.json({ success: true, data: pairing });
    });

    /**
     * GET /api/v1/pairing/linked - Get linked accounts
     */
    app.get('/api/v1/pairing/linked', async (req: Request, res: Response) => {
        const walletAddress = req.headers['x-wallet-address'] as string;
        const accounts = linkedAccounts.get(walletAddress) || [];
        res.json({ success: true, data: { walletAddress, linkedAccounts: accounts, count: accounts.length } });
    });

    /**
     * DELETE /api/v1/pairing/linked/:channel/:userId - Unlink account
     */
    app.delete('/api/v1/pairing/linked/:channel/:userId', async (req: Request, res: Response) => {
        const walletAddress = req.headers['x-wallet-address'] as string;
        const accounts = linkedAccounts.get(walletAddress) || [];
        linkedAccounts.set(walletAddress, accounts.filter(a => !(a.channel === req.params.channel && a.userId === req.params.userId)));
        res.json({ success: true, data: { message: 'Account unlinked' } });
    });

    // ==================== Trade Ledger ====================

    const tradeLedger: any[] = [];

    /**
     * GET /api/v1/trade-ledger - Get trade ledger
     */
    app.get('/api/v1/trade-ledger', async (req: Request, res: Response) => {
        const { walletAddress, agentId, token, action, limit, offset } = req.query;
        let entries = tradeLedger;
        if (walletAddress) entries = entries.filter(e => e.walletAddress === walletAddress);
        if (agentId) entries = entries.filter(e => e.agentId === agentId);
        if (token) entries = entries.filter(e => e.token === token);
        if (action) entries = entries.filter(e => e.action === action);
        const start = parseInt(offset as string, 10) || 0;
        const end = start + (parseInt(limit as string, 10) || 50);
        res.json({ success: true, data: { data: { entries: entries.slice(start, end), total: entries.length } } });
    });

    /**
     * GET /api/v1/trade-ledger/stats - Get trade ledger stats
     */
    app.get('/api/v1/trade-ledger/stats', async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: {
                data: {
                    totalTrades: tradeLedger.length,
                    totalVolume: 0,
                    totalFees: 0,
                    totalPnl: 0,
                    winCount: 0,
                    lossCount: 0,
                    winRate: 0,
                    avgTradeSize: 0,
                    bySource: {},
                    byAction: {},
                }
            }
        });
    });

    /**
     * GET /api/v1/trade-ledger/decisions - Get recent decisions
     */
    app.get('/api/v1/trade-ledger/decisions', async (req: Request, res: Response) => {
        res.json({ success: true, data: { data: [] } });
    });

    /**
     * GET /api/v1/trade-ledger/calibration - Get confidence calibration
     */
    app.get('/api/v1/trade-ledger/calibration', async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: {
                data: {
                    ranges: [],
                    avgConfidence: 0,
                    calibrationScore: 0,
                }
            }
        });
    });

    // ==================== Migrations ====================

    /**
     * GET /api/v1/migrations/stats - Get migration stats
     */
    app.get('/api/v1/migrations/stats', async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: {
                data: {
                    total: 0,
                    last24h: 0,
                    last7d: 0,
                    byType: {},
                    avgRankingScore: 0,
                    avgGodWalletCount: 0,
                }
            }
        });
    });

    // ==================== Arbitrage (Additional) ====================

    const arbitrageConfigs: Map<string, any> = new Map();
    const arbitrageExecutions: any[] = [];

    /**
     * GET /api/v1/arbitrage/opportunities - Get arbitrage opportunities
     */
    app.get('/api/v1/arbitrage/opportunities', async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: [
                { id: 'arb_1', type: 'dex', status: 'active', token: 'SOL', buyPlatform: 'Jupiter', buyPrice: 148.20, sellPlatform: 'Raydium', sellPrice: 148.80, spread: 0.4, confidence: 0.85 },
                { id: 'arb_2', type: 'dex', status: 'active', token: 'JUP', buyPlatform: 'Orca', buyPrice: 0.84, sellPlatform: 'Jupiter', sellPrice: 0.86, spread: 2.3, confidence: 0.72 },
            ]
        });
    });

    /**
     * POST /api/v1/arbitrage/execute - Execute arbitrage
     */
    app.post('/api/v1/arbitrage/execute', async (req: Request, res: Response) => {
        const { opportunityId, userWallet, amount } = req.body;
        const execution = {
            id: `arb_exec_${Date.now()}`,
            opportunityId,
            userWallet,
            amount,
            status: 'executing',
            createdAt: Date.now(),
        };
        arbitrageExecutions.push(execution);
        res.json({ success: true, data: execution });
    });

    /**
     * GET /api/v1/arbitrage/executions - Get arbitrage executions
     */
    app.get('/api/v1/arbitrage/executions', async (req: Request, res: Response) => {
        const { wallet, limit } = req.query;
        let execs = arbitrageExecutions;
        if (wallet) execs = execs.filter(e => e.userWallet === wallet);
        if (limit) execs = execs.slice(0, parseInt(limit as string, 10));
        res.json({ success: true, data: execs });
    });

    /**
     * GET /api/v1/arbitrage/config - Get arbitrage config
     */
    app.get('/api/v1/arbitrage/config', async (req: Request, res: Response) => {
        const { wallet } = req.query;
        res.json({
            success: true,
            data: arbitrageConfigs.get(wallet as string) || {
                autoExecute: false,
                minSpread: 0.5,
                maxAmount: 1000,
                platforms: ['jupiter', 'raydium', 'orca'],
            }
        });
    });

    /**
     * POST /api/v1/arbitrage/config - Save arbitrage config
     */
    app.post('/api/v1/arbitrage/config', async (req: Request, res: Response) => {
        const { userWallet, ...config } = req.body;
        arbitrageConfigs.set(userWallet, config);
        res.json({ success: true, data: config });
    });

    /**
     * GET /api/v1/arbitrage/stats - Get arbitrage stats
     */
    app.get('/api/v1/arbitrage/stats', async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: {
                totalOpportunities: 12,
                totalExecutions: arbitrageExecutions.length,
                totalProfit: 150.5,
                successRate: 85,
            }
        });
    });

    // ==================== Agent Network (ClawdNet) ====================

    const registeredAgents: Map<string, any> = new Map();
    const agentSubscriptions: any[] = [];
    const agentJobs: any[] = [];

    /**
     * GET /api/v1/agent-network/discover - Discover agents
     */
    app.get('/api/v1/agent-network/discover', async (req: Request, res: Response) => {
        const agents = Array.from(registeredAgents.values());
        res.json({ success: true, data: agents });
    });

    /**
     * GET /api/v1/agent-network/agents/:agentId - Get agent details
     */
    app.get('/api/v1/agent-network/agents/:agentId', async (req: Request, res: Response) => {
        const agent = registeredAgents.get(req.params.agentId);
        if (!agent) {
            res.status(404).json({ success: false, error: 'Agent not found' });
            return;
        }
        res.json({ success: true, data: agent });
    });

    /**
     * POST /api/v1/agent-network/agents - Register agent
     */
    app.post('/api/v1/agent-network/agents', async (req: Request, res: Response) => {
        const { agentId, name, description, ownerWallet, capabilities, endpoint, pricePerCall } = req.body;
        const agent = {
            id: agentId || `agent_${Date.now()}`,
            name,
            description,
            ownerWallet,
            capabilities,
            endpoint,
            pricePerCall: pricePerCall || 0,
            status: 'active',
            reputation: 5.0,
            totalCalls: 0,
            registeredAt: Date.now(),
        };
        registeredAgents.set(agent.id, agent);
        res.status(201).json({ success: true, data: agent });
    });

    /**
     * GET /api/v1/agent-network/subscriptions - Get subscriptions
     */
    app.get('/api/v1/agent-network/subscriptions', async (req: Request, res: Response) => {
        const { wallet } = req.query;
        const subs = wallet ? agentSubscriptions.filter(s => s.subscriberWallet === wallet) : agentSubscriptions;
        res.json({ success: true, data: subs });
    });

    /**
     * POST /api/v1/agent-network/subscriptions - Subscribe to agent
     */
    app.post('/api/v1/agent-network/subscriptions', async (req: Request, res: Response) => {
        const { agentId, subscriberWallet, tier } = req.body;
        const sub = { id: `sub_${Date.now()}`, agentId, subscriberWallet, tier: tier || 'basic', createdAt: Date.now() };
        agentSubscriptions.push(sub);
        res.status(201).json({ success: true, data: sub });
    });

    /**
     * POST /api/v1/agent-network/jobs - Hire agent
     */
    app.post('/api/v1/agent-network/jobs', async (req: Request, res: Response) => {
        const { agentId, callerWallet, description, input } = req.body;
        const job = {
            id: `job_${Date.now()}`,
            agentId,
            callerWallet,
            description,
            input,
            status: 'pending',
            createdAt: Date.now(),
        };
        agentJobs.push(job);
        res.status(201).json({ success: true, data: job });
    });

    /**
     * GET /api/v1/agent-network/jobs - Get jobs
     */
    app.get('/api/v1/agent-network/jobs', async (req: Request, res: Response) => {
        const { wallet, agentId, status, limit } = req.query;
        let jobs = agentJobs;
        if (wallet) jobs = jobs.filter(j => j.callerWallet === wallet);
        if (agentId) jobs = jobs.filter(j => j.agentId === agentId);
        if (status) jobs = jobs.filter(j => j.status === status);
        if (limit) jobs = jobs.slice(0, parseInt(limit as string, 10));
        res.json({ success: true, data: jobs });
    });

    /**
     * GET /api/v1/agent-network/stats - Get network stats
     */
    app.get('/api/v1/agent-network/stats', async (req: Request, res: Response) => {
        res.json({
            success: true,
            data: {
                totalAgents: registeredAgents.size,
                activeAgents: Array.from(registeredAgents.values()).filter(a => a.status === 'active').length,
                totalJobs: agentJobs.length,
                totalSubscriptions: agentSubscriptions.length,
            }
        });
    });

    // ==================== Demo Mode: Mock Whale Signals ====================

    // Enable demo signals with ENABLE_DEMO_SIGNALS=true environment variable
    if (process.env.ENABLE_DEMO_SIGNALS === 'true') {
        const MOCK_WALLETS = [
            { address: '0x1234...abcd', label: 'Smart Money Alpha', confidence: 0.92 },
            { address: '0x5678...efgh', label: 'DeFi Whale', confidence: 0.88 },
            { address: '0x9abc...ijkl', label: 'VC Fund', confidence: 0.95 },
            { address: 'GwBr...mnop', label: 'Solana Whale', confidence: 0.85 },
        ];

        const MOCK_TOKENS = ['SOL', 'ETH', 'BTC', 'BONK', 'JUP', 'PYTH', 'WIF', 'RENDER'];
        const MOCK_ACTIONS = ['BUY', 'SELL'];

        setInterval(() => {
            const wallet = MOCK_WALLETS[Math.floor(Math.random() * MOCK_WALLETS.length)];
            const token = MOCK_TOKENS[Math.floor(Math.random() * MOCK_TOKENS.length)];
            const action = MOCK_ACTIONS[Math.floor(Math.random() * MOCK_ACTIONS.length)];
            const amount = Math.floor(Math.random() * 500 + 100) * 1000; // $100K - $600K

            const signal = {
                id: `whale_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                type: 'whale',
                source: 'demo',
                wallet: wallet.address,
                walletLabel: wallet.label,
                action,
                token,
                amount: `$${(amount / 1000).toFixed(0)}K`,
                amountUsd: amount,
                confidence: wallet.confidence,
                timestamp: Date.now(),
            };

            io.emit('signal', signal);
            io.to('signals').emit('whale_signal', signal);

            console.log(`[Demo] Emitted whale signal: ${wallet.label} ${action} ${token} ${signal.amount}`);
        }, 30000); // Every 30 seconds

        console.log('[Server] Demo mode enabled - emitting mock whale signals every 30s');
    }

    // Error handler (must be last)
    app.use(errorHandler);

    // Start/stop functions
    const start = (): Promise<void> => {
        return new Promise((resolve) => {
            server.listen(port, () => {
                console.log(`[Server] Trading Orchestrator running on port ${port}`);
                console.log(`[Server] WebSocket available on ws://localhost:${port}`);
                resolve();
            });
        });
    };

    const stop = (): Promise<void> => {
        return new Promise((resolve, reject) => {
            io.close();
            server.close((err) => {
                if (err) reject(err);
                else {
                    console.log('[Server] Trading Orchestrator stopped');
                    resolve();
                }
            });
        });
    };

    return { app, server, io, start, stop };
}

// Auto-start if run directly
const isMainModule = process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');
if (isMainModule) {
    const port = parseInt(process.env.PORT || '4000', 10);
    const { start } = createOrchestratorServer(port);
    start().catch(console.error);
}
