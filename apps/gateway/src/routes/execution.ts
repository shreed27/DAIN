import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { ServiceRegistry } from '../services/registry.js';
import type { TradeIntent, ExecutionResult, ExecutionRoute } from '../types.js';
import * as intentOps from '../db/operations/intents.js';

export const executionRouter = Router();

// POST /api/v1/execution/intent - Create trade intent
executionRouter.post('/intent', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;

  try {
    const { agentId, action, marketType, chain, asset, amount, constraints, signalIds } = req.body;

    if (!agentId || !action || !marketType || !chain || !asset || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: agentId, action, marketType, chain, asset, amount',
      });
    }

    const intent: TradeIntent = {
      id: uuidv4(),
      agentId,
      action,
      marketType,
      chain,
      asset,
      amount,
      constraints,
      signalIds,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    intentOps.createIntent(intent);
    logger.info({ intentId: intent.id, action, asset }, 'Trade intent created');

    // Emit WebSocket event
    const io = req.app.locals.io;
    io?.emit('intent_generated', {
      type: 'intent_generated',
      timestamp: Date.now(),
      data: intent,
    });

    res.status(201).json({
      success: true,
      data: intent,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to create intent');
    res.status(500).json({
      success: false,
      error: 'Failed to create intent',
    });
  }
});

// GET /api/v1/execution/intent/:id - Get intent by ID
executionRouter.get('/intent/:id', (req: Request, res: Response) => {
  const intent = intentOps.getIntentById(req.params.id);
  if (!intent) {
    return res.status(404).json({
      success: false,
      error: 'Intent not found',
    });
  }
  res.json({
    success: true,
    data: intent,
  });
});

// POST /api/v1/execution/quote - Get execution quote
executionRouter.post('/quote', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const serviceRegistry: ServiceRegistry = req.app.locals.serviceRegistry;

  try {
    const { inputMint, outputMint, amount, chain } = req.body;

    if (!inputMint || !outputMint || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: inputMint, outputMint, amount',
      });
    }

    // Try agent-dex for Solana
    if (chain === 'solana' || !chain) {
      try {
        const client = serviceRegistry.getClient('agent-dex');
        const response = await client.get('/api/v1/quote', {
          params: { inputMint, outputMint, amount },
        });

        return res.json({
          success: true,
          source: 'agent-dex',
          data: response.data.data,
        });
      } catch (error) {
        logger.warn('agent-dex quote failed');
      }
    }

    // Return error if no service available
    res.status(503).json({
      success: false,
      error: 'Quote service unavailable',
      message: 'No execution service available for the requested quote',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get quote');
    res.status(500).json({
      success: false,
      error: 'Failed to get quote',
    });
  }
});

// POST /api/v1/execution/swap - Execute swap
executionRouter.post('/swap', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const serviceRegistry: ServiceRegistry = req.app.locals.serviceRegistry;
  const io = req.app.locals.io;

  try {
    const { intentId, inputMint, outputMint, amount, walletPrivateKey, chain } = req.body;

    // Update intent status if provided
    if (intentId) {
      intentOps.updateIntentStatus(intentId, 'executing');
    }

    io?.emit('execution_started', {
      type: 'execution_started',
      timestamp: Date.now(),
      data: { intentId, inputMint, outputMint, amount },
    });

    // Try agent-dex for Solana swaps
    if (chain === 'solana' || !chain) {
      try {
        const client = serviceRegistry.getClient('agent-dex');
        const response = await client.post('/api/v1/swap', {
          inputMint,
          outputMint,
          amount,
          walletPrivateKey,
          slippageBps: 50,
        });

        const resultId = uuidv4();
        const result: ExecutionResult = {
          intentId: intentId || uuidv4(),
          success: true,
          txHash: response.data.data.txSignature,
          executedAmount: Number(response.data.data.inputAmount),
          executedPrice: Number(response.data.data.outputAmount) / Number(response.data.data.inputAmount),
          fees: 0,
          slippage: Number(response.data.data.priceImpact || 0),
          executionTimeMs: 0,
          route: {
            executor: 'agent-dex',
            platform: 'Jupiter',
            path: [inputMint, outputMint],
            estimatedPrice: 0,
            estimatedSlippage: 0.5,
            estimatedFees: 0,
            estimatedTimeMs: 5000,
            score: 95,
          },
        };

        // Save execution result
        intentOps.createExecutionResult({ id: resultId, ...result });

        // Update intent
        if (intentId) {
          intentOps.updateIntentStatus(intentId, 'completed');
        }

        io?.emit('execution_completed', {
          type: 'execution_completed',
          timestamp: Date.now(),
          data: result,
        });

        logger.info({ intentId, txHash: result.txHash }, 'Swap executed successfully');

        return res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        logger.warn({ error }, 'agent-dex swap failed');

        // Update intent to failed
        if (intentId) {
          intentOps.updateIntentStatus(intentId, 'failed');
        }

        io?.emit('execution_failed', {
          type: 'execution_failed',
          timestamp: Date.now(),
          data: { intentId, error: 'Swap execution failed' },
        });

        return res.status(503).json({
          success: false,
          error: 'Swap execution failed',
          message: 'DEX service unavailable',
        });
      }
    }

    // No service available
    if (intentId) {
      intentOps.updateIntentStatus(intentId, 'failed');
    }

    res.status(503).json({
      success: false,
      error: 'No execution service available for the requested chain',
    });
  } catch (error) {
    const logger = req.app.locals.logger;
    logger.error({ error }, 'Swap execution failed');

    io?.emit('execution_failed', {
      type: 'execution_failed',
      timestamp: Date.now(),
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
    });

    res.status(500).json({
      success: false,
      error: 'Swap execution failed',
    });
  }
});

// POST /api/v1/execution/routes - Compare execution routes
executionRouter.post('/routes', async (req: Request, res: Response) => {
  const logger = req.app.locals.logger;
  const serviceRegistry: ServiceRegistry = req.app.locals.serviceRegistry;
  const { inputMint, outputMint, amount, chain } = req.body;

  const routes: ExecutionRoute[] = [];

  // Try to get real routes from services
  if (chain === 'solana' || !chain) {
    try {
      const client = serviceRegistry.getClient('agent-dex');
      const response = await client.get('/api/v1/routes', {
        params: { inputMint, outputMint, amount },
      });

      if (response.data.data) {
        routes.push(...response.data.data);
      }
    } catch (error) {
      logger.warn('Failed to get routes from agent-dex');
    }
  }

  if (routes.length === 0) {
    return res.json({
      success: true,
      data: {
        routes: [],
        recommended: null,
        message: 'No routes available',
      },
    });
  }

  res.json({
    success: true,
    data: {
      routes: routes.sort((a, b) => b.score - a.score),
      recommended: routes[0],
    },
  });
});

// GET /api/v1/execution/intents - List all intents
executionRouter.get('/intents', (req: Request, res: Response) => {
  const { status, agentId } = req.query;

  const intentList = intentOps.getAllIntents({
    status: status as TradeIntent['status'] | undefined,
    agentId: agentId as string | undefined,
  });

  res.json({
    success: true,
    data: intentList,
    count: intentList.length,
  });
});

// GET /api/v1/execution/results - Get execution results
executionRouter.get('/results', (req: Request, res: Response) => {
  const { intentId, success, limit } = req.query;

  const results = intentOps.getAllExecutionResults({
    intentId: intentId as string | undefined,
    success: success !== undefined ? success === 'true' : undefined,
    limit: limit ? Number(limit) : 50,
  });

  res.json({
    success: true,
    data: results,
    count: results.length,
  });
});

// GET /api/v1/execution/stats - Get execution statistics
executionRouter.get('/stats', (req: Request, res: Response) => {
  const stats = intentOps.getExecutionStats();

  res.json({
    success: true,
    data: stats,
  });
});
