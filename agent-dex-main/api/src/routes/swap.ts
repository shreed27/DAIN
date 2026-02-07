import { Router, Request, Response } from 'express';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { getQuote, executeSwap } from '../services/jupiter';
import { authMiddleware } from '../middleware/auth';
import { swapRateLimit } from '../middleware/rateLimit';
import { getAgentKeypair, incrementTradeCount, recordTrade } from '../db';
import { isValidSolanaAddress, validateSlippageBps, validateAmount } from '../utils/validation';

const router = Router();

/**
 * POST /api/v1/swap
 * Execute a swap via Jupiter
 * Body: { inputMint, outputMint, amount, slippageBps?, walletPrivateKey? }
 * If authenticated with API key, uses agent's wallet. Otherwise requires walletPrivateKey.
 */
router.post('/', swapRateLimit, async (req: Request, res: Response) => {
  try {
    const { inputMint, outputMint, amount, slippageBps, walletPrivateKey } = req.body;

    // Validate required fields
    if (!inputMint || !outputMint || !amount) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Required: inputMint, outputMint, amount',
      });
      return;
    }

    // Validate mint addresses
    if (!isValidSolanaAddress(inputMint)) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid inputMint address' });
      return;
    }
    if (!isValidSolanaAddress(outputMint)) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid outputMint address' });
      return;
    }

    // Validate amount
    const amountValidation = validateAmount(amount);
    if (!amountValidation.valid) {
      res.status(400).json({ error: 'Bad Request', message: amountValidation.error });
      return;
    }

    // Validate slippage
    const slippageValidation = validateSlippageBps(slippageBps);
    if (!slippageValidation.valid) {
      res.status(400).json({ error: 'Bad Request', message: slippageValidation.error });
      return;
    }

    // Determine keypair to use
    let keypair: Keypair;

    // Check for API key auth first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ') && req.agent) {
      keypair = getAgentKeypair(req.agent);
    } else if (walletPrivateKey) {
      try {
        const secretKey = bs58.decode(walletPrivateKey);
        keypair = Keypair.fromSecretKey(secretKey);
      } catch {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid walletPrivateKey (expected base58-encoded secret key)',
        });
        return;
      }
    } else {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Provide either an API key (Authorization: Bearer <key>) or walletPrivateKey in body',
      });
      return;
    }

    // Get quote with validated parameters
    const quote = await getQuote({
      inputMint,
      outputMint,
      amount: amountValidation.value!.toString(),
      slippageBps: slippageValidation.value!,
    });

    // Execute swap
    const result = await executeSwap({ quoteResponse: quote, keypair });

    // Record the trade
    const trade = recordTrade({
      agentId: req.agent?.id,
      wallet: keypair.publicKey.toBase58(),
      inputMint,
      outputMint,
      inputAmount: result.inputAmount,
      outputAmount: result.outputAmount,
      txSignature: result.txSignature,
      priceImpact: quote.priceImpactPct,
    });

    // Increment trade count if agent
    if (req.agent) {
      incrementTradeCount(req.agent.id);
    }

    res.json({
      success: true,
      data: {
        txSignature: result.txSignature,
        inputMint,
        outputMint,
        inputAmount: result.inputAmount,
        outputAmount: result.outputAmount,
        priceImpact: quote.priceImpactPct,
        wallet: keypair.publicKey.toBase58(),
        explorerUrl: `https://solscan.io/tx/${result.txSignature}`,
        tradeId: trade.id,
      },
    });
  } catch (err: any) {
    console.error('Swap error:', err.message);
    res.status(502).json({
      error: 'Swap Failed',
      message: err.message,
    });
  }
});

export default router;
