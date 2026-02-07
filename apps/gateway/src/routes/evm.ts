import { Router, Request, Response } from 'express';
import * as evmOps from '../db/operations/evm';

const router = Router();

// ========== Chains ==========

// Get supported chains
router.get('/chains', (req: Request, res: Response) => {
  try {
    const chains = evmOps.getSupportedChains();
    res.json({ success: true, data: chains });
  } catch (error) {
    console.error('Error fetching chains:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch chains' });
  }
});

// ========== Wallets ==========

// Get EVM wallets for user
router.get('/wallets', (req: Request, res: Response) => {
  try {
    const { wallet, chain } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const wallets = evmOps.getEVMWallets(wallet as string, chain as evmOps.EVMChain);
    res.json({ success: true, data: wallets });
  } catch (error) {
    console.error('Error fetching wallets:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch wallets' });
  }
});

// Add EVM wallet
router.post('/wallets', (req: Request, res: Response) => {
  try {
    const { userWallet, evmAddress, chain, label, isPrimary } = req.body;

    if (!userWallet || !evmAddress || !chain) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const wallet = evmOps.addEVMWallet({
      userWallet,
      evmAddress,
      chain,
      label,
      isPrimary: isPrimary || false,
    });

    res.status(201).json({ success: true, data: wallet });
  } catch (error) {
    console.error('Error adding wallet:', error);
    res.status(500).json({ success: false, error: 'Failed to add wallet' });
  }
});

// Remove EVM wallet
router.delete('/wallets/:id', (req: Request, res: Response) => {
  try {
    const removed = evmOps.removeEVMWallet(req.params.id);

    if (!removed) {
      return res.status(404).json({ success: false, error: 'Wallet not found' });
    }

    res.json({ success: true, message: 'Wallet removed' });
  } catch (error) {
    console.error('Error removing wallet:', error);
    res.status(500).json({ success: false, error: 'Failed to remove wallet' });
  }
});

// ========== Balances ==========

// Get balances
router.get('/balances', (req: Request, res: Response) => {
  try {
    const { wallet, chain, evmAddress } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const balances = evmOps.getEVMBalances(wallet as string, {
      chain: chain as evmOps.EVMChain,
      evmAddress: evmAddress as string,
    });

    res.json({ success: true, data: balances });
  } catch (error) {
    console.error('Error fetching balances:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch balances' });
  }
});

// Update balance
router.post('/balances', (req: Request, res: Response) => {
  try {
    const { userWallet, evmAddress, chain, tokenAddress, tokenSymbol, tokenDecimals, balance, balanceUsd } = req.body;

    if (!userWallet || !evmAddress || !chain || !tokenAddress) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const updated = evmOps.updateEVMBalance({
      userWallet,
      evmAddress,
      chain,
      tokenAddress,
      tokenSymbol: tokenSymbol || 'UNKNOWN',
      tokenDecimals: tokenDecimals || 18,
      balance: balance || '0',
      balanceUsd: balanceUsd || 0,
      lastUpdated: Date.now(),
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating balance:', error);
    res.status(500).json({ success: false, error: 'Failed to update balance' });
  }
});

// ========== Transactions ==========

// Get transactions
router.get('/transactions', (req: Request, res: Response) => {
  try {
    const { wallet, chain, type, status, limit } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const transactions = evmOps.getEVMTransactions(wallet as string, {
      chain: chain as evmOps.EVMChain,
      type: type as string,
      status: status as string,
      limit: limit ? parseInt(limit as string) : 50,
    });

    res.json({ success: true, data: transactions });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch transactions' });
  }
});

// Get transaction by hash
router.get('/transactions/hash/:txHash', (req: Request, res: Response) => {
  try {
    const transaction = evmOps.getEVMTransactionByHash(req.params.txHash);

    if (!transaction) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    res.json({ success: true, data: transaction });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch transaction' });
  }
});

// Create transaction record
router.post('/transactions', (req: Request, res: Response) => {
  try {
    const {
      userWallet, evmAddress, chain, protocol, txHash, type,
      tokenIn, tokenOut, amountIn, amountOut, valueUsd, metadata
    } = req.body;

    if (!userWallet || !evmAddress || !chain || !txHash || !type) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const transaction = evmOps.createEVMTransaction({
      userWallet,
      evmAddress,
      chain,
      protocol: protocol || 'native',
      txHash,
      type,
      tokenIn: tokenIn || '',
      tokenOut,
      amountIn: amountIn || 0,
      amountOut,
      valueUsd: valueUsd || 0,
      status: 'pending',
    });

    res.status(201).json({ success: true, data: transaction });
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ success: false, error: 'Failed to create transaction' });
  }
});

// Update transaction
router.patch('/transactions/:id', (req: Request, res: Response) => {
  try {
    const { status, blockNumber, gasUsed, gasCostUsd, error: txError, amountOut } = req.body;

    const transaction = evmOps.updateEVMTransaction(req.params.id, {
      status,
      blockNumber,
      gasUsed,
      gasCostUsd,
      error: txError,
      amountOut,
    });

    if (!transaction) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    res.json({ success: true, data: transaction });
  } catch (error) {
    console.error('Error updating transaction:', error);
    res.status(500).json({ success: false, error: 'Failed to update transaction' });
  }
});

// ========== Bridge ==========

// Get bridge transactions
router.get('/bridge', (req: Request, res: Response) => {
  try {
    const { wallet, status, limit } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const bridges = evmOps.getBridgeTransactions(wallet as string, {
      status: status as string,
      limit: limit ? parseInt(limit as string) : 20,
    });

    res.json({ success: true, data: bridges });
  } catch (error) {
    console.error('Error fetching bridge transactions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch bridge transactions' });
  }
});

// Get bridge by ID
router.get('/bridge/:id', (req: Request, res: Response) => {
  try {
    const bridge = evmOps.getBridgeTransactionById(req.params.id);

    if (!bridge) {
      return res.status(404).json({ success: false, error: 'Bridge transaction not found' });
    }

    res.json({ success: true, data: bridge });
  } catch (error) {
    console.error('Error fetching bridge:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch bridge transaction' });
  }
});

// Initiate bridge
router.post('/bridge', (req: Request, res: Response) => {
  try {
    const {
      userWallet, sourceChain, targetChain, sourceAddress, targetAddress,
      tokenSymbol, amount, amountUsd, bridgeProtocol, estimatedArrival
    } = req.body;

    if (!userWallet || !sourceChain || !targetChain || !sourceAddress || !targetAddress || !tokenSymbol || !amount) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const bridge = evmOps.createBridgeTransaction({
      userWallet,
      sourceChain,
      targetChain,
      sourceAddress,
      targetAddress,
      tokenSymbol,
      amount,
      amountUsd: amountUsd || amount,
      bridgeProtocol: bridgeProtocol || 'wormhole',
      status: 'initiated',
      estimatedArrival: estimatedArrival || Date.now() + 15 * 60 * 1000, // 15 min default
      fee: 0,
      feeUsd: 0,
    });

    res.status(201).json({ success: true, data: bridge });
  } catch (error) {
    console.error('Error initiating bridge:', error);
    res.status(500).json({ success: false, error: 'Failed to initiate bridge' });
  }
});

// Update bridge status
router.patch('/bridge/:id', (req: Request, res: Response) => {
  try {
    const { status, targetTxHash, actualArrival, error: bridgeError } = req.body;

    const bridge = evmOps.updateBridgeTransaction(req.params.id, {
      status,
      targetTxHash,
      actualArrival,
      error: bridgeError,
    });

    if (!bridge) {
      return res.status(404).json({ success: false, error: 'Bridge transaction not found' });
    }

    res.json({ success: true, data: bridge });
  } catch (error) {
    console.error('Error updating bridge:', error);
    res.status(500).json({ success: false, error: 'Failed to update bridge' });
  }
});

// ========== Swap (placeholder for DEX integrations) ==========

// Get swap quote
router.post('/swap/quote', (req: Request, res: Response) => {
  try {
    const { chain, tokenIn, tokenOut, amountIn, protocol } = req.body;

    if (!chain || !tokenIn || !tokenOut || !amountIn) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Mock quote - in real implementation, would call DEX aggregator
    const mockQuote = {
      tokenIn,
      tokenOut,
      amountIn,
      amountOut: amountIn * 0.98, // Mock 2% slippage
      priceImpact: 0.5,
      route: [`${tokenIn} -> ${tokenOut}`],
      estimatedGas: 150000,
      protocol: protocol || '1inch',
    };

    res.json({ success: true, data: mockQuote });
  } catch (error) {
    console.error('Error getting quote:', error);
    res.status(500).json({ success: false, error: 'Failed to get quote' });
  }
});

// Execute swap
router.post('/swap', (req: Request, res: Response) => {
  try {
    const { userWallet, evmAddress, chain, tokenIn, tokenOut, amountIn, slippage, protocol } = req.body;

    if (!userWallet || !evmAddress || !chain || !tokenIn || !tokenOut || !amountIn) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // In real implementation, would execute swap via DEX
    // For now, create pending transaction record
    const transaction = evmOps.createEVMTransaction({
      userWallet,
      evmAddress,
      chain,
      protocol: protocol || '1inch',
      txHash: `0x${Math.random().toString(16).slice(2)}`, // Mock tx hash
      type: 'swap',
      tokenIn,
      tokenOut,
      amountIn,
      amountOut: amountIn * 0.98,
      valueUsd: amountIn,
      status: 'pending',
    });

    res.status(201).json({
      success: true,
      data: {
        transaction,
        message: 'Swap initiated (mock)',
      }
    });
  } catch (error) {
    console.error('Error executing swap:', error);
    res.status(500).json({ success: false, error: 'Failed to execute swap' });
  }
});

// ========== Stats ==========

router.get('/stats/:wallet', (req: Request, res: Response) => {
  try {
    const stats = evmOps.getEVMStats(req.params.wallet);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

export default router;
