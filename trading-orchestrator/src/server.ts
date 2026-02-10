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

// CORS middleware
const corsMiddleware = cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
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
                status: health.overall ? 'healthy' : 'degraded',
                timestamp: new Date().toISOString(),
                adapters: health.adapters,
                services: Object.entries(health.adapters).map(([name, info]) => ({
                    name,
                    healthy: info?.healthy ?? false,
                    latencyMs: info?.latencyMs,
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
            const { walletAddress, type, config } = req.body;

            if (!walletAddress || !type) {
                res.status(400).json({
                    success: false,
                    error: 'walletAddress and type are required',
                });
                return;
            }

            const agentId = await orchestrator.registerAgent({
                walletAddress,
                type,
                config,
            });

            res.status(201).json({
                success: true,
                agentId,
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

            const result = await orchestrator.executeTradeIntent(intent);

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
            const validation = orchestrator.validateAdaptersForOperation(
                intent.venue === 'solana' ? 'solana_swap' :
                intent.venue === 'hyperliquid' || intent.venue === 'binance' || intent.venue === 'bybit' ? 'futures' :
                intent.venue === 'polymarket' ? 'prediction' : 'solana_swap'
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
            const { agentId, action, marketType, chain, asset, amount, constraints } = req.body;

            if (!agentId || !action || !asset) {
                res.status(400).json({
                    success: false,
                    error: 'agentId, action, and asset are required',
                });
                return;
            }

            const intent: TradeIntent = {
                agentId,
                action,
                asset,
                amount,
                venue: chain === 'solana' ? 'solana' : chain,
                constraints: constraints || {},
            };

            const result = await orchestrator.executeTradeIntent(intent);

            io.emit('trade_executed', { intent, result });

            res.json({
                success: true,
                id: result.intentId || `intent_${Date.now()}`,
                ...result,
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
            const agentDexAdapter = orchestrator.getAdapter('agentDex');
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
            const agentDexAdapter = orchestrator.getAdapter('agentDex');
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
            const { signals } = req.body as { signals: Signal[] };

            if (!signals || !Array.isArray(signals)) {
                res.status(400).json({
                    success: false,
                    error: 'signals array is required',
                });
                return;
            }

            const results = await orchestrator.processSignals(signals);

            // Emit WebSocket event for each result
            results.forEach((result, idx) => {
                io.emit('signal_processed', { signal: signals[idx], result });
            });

            res.json({
                success: true,
                results,
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

            const allowed = permissionManager.checkPermission(walletAddress, action, value);

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

    // ==================== Strategies ====================

    /**
     * GET /api/v1/strategies - List all strategies
     */
    app.get('/api/v1/strategies', async (req: Request, res: Response) => {
        try {
            const strategies = strategyRegistry.listStrategies();
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
            const strategy = strategyRegistry.getStrategy(strategyId);

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
            const openclawAdapter = orchestrator.getAdapter('openclaw');
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
            const openclawAdapter = orchestrator.getAdapter('openclaw');

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

    // ==================== A2A Network (via ClawdNet) ====================

    /**
     * GET /api/v1/a2a/agents - Discover A2A agents
     */
    app.get('/api/v1/a2a/agents', async (req: Request, res: Response) => {
        try {
            const clawdnetAdapter = orchestrator.getAdapter('clawdnet');
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
            const clawdnetAdapter = orchestrator.getAdapter('clawdnet');

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

    // ==================== WebSocket Events ====================

    io.on('connection', (socket) => {
        console.log(`[Server] WebSocket client connected: ${socket.id}`);

        socket.on('subscribe', (channel: string) => {
            socket.join(channel);
            console.log(`[Server] Client ${socket.id} subscribed to ${channel}`);
        });

        socket.on('unsubscribe', (channel: string) => {
            socket.leave(channel);
            console.log(`[Server] Client ${socket.id} unsubscribed from ${channel}`);
        });

        socket.on('disconnect', () => {
            console.log(`[Server] WebSocket client disconnected: ${socket.id}`);
        });
    });

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
