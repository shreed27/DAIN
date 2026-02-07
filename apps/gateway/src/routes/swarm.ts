import { Router, Request, Response } from 'express';
import * as swarmOps from '../db/operations/swarm';

const router = Router();

// ========== Swarm Configs ==========

// Get all swarms for wallet
router.get('/', (req: Request, res: Response) => {
  try {
    const { wallet, status, strategy } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const swarms = swarmOps.getSwarmConfigsByWallet(wallet as string, {
      status: status as string,
      strategy: strategy as string,
    });

    res.json({ success: true, data: swarms });
  } catch (error) {
    console.error('Error fetching swarms:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch swarms' });
  }
});

// Get swarm by ID
router.get('/:id', (req: Request, res: Response) => {
  try {
    const swarm = swarmOps.getSwarmConfigById(req.params.id);

    if (!swarm) {
      return res.status(404).json({ success: false, error: 'Swarm not found' });
    }

    res.json({ success: true, data: swarm });
  } catch (error) {
    console.error('Error fetching swarm:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch swarm' });
  }
});

// Create new swarm
router.post('/', (req: Request, res: Response) => {
  try {
    const {
      userWallet, name, description, walletCount, wallets, strategy,
      distributionType, distribution, maxSlippage, delayBetweenTxMs,
      useJitoBundle, jitoTipLamports
    } = req.body;

    if (!userWallet || !name || !strategy) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const swarm = swarmOps.createSwarmConfig({
      userWallet,
      name,
      description,
      walletCount: walletCount || wallets?.length || 5,
      wallets: typeof wallets === 'string' ? wallets : JSON.stringify(wallets || []),
      strategy,
      distributionType: distributionType || 'equal',
      distribution: typeof distribution === 'string' ? distribution : JSON.stringify(distribution || {}),
      maxSlippage: maxSlippage || 1,
      delayBetweenTxMs: delayBetweenTxMs || 100,
      useJitoBundle: useJitoBundle || false,
      jitoTipLamports,
      status: 'active',
    });

    res.status(201).json({ success: true, data: swarm });
  } catch (error) {
    console.error('Error creating swarm:', error);
    res.status(500).json({ success: false, error: 'Failed to create swarm' });
  }
});

// Update swarm
router.patch('/:id', (req: Request, res: Response) => {
  try {
    const {
      name, description, strategy, distributionType, distribution,
      maxSlippage, delayBetweenTxMs, useJitoBundle, jitoTipLamports, status
    } = req.body;

    const swarm = swarmOps.updateSwarmConfig(req.params.id, {
      name,
      description,
      strategy,
      distributionType,
      distribution: distribution ? (typeof distribution === 'string' ? distribution : JSON.stringify(distribution)) : undefined,
      maxSlippage,
      delayBetweenTxMs,
      useJitoBundle,
      jitoTipLamports,
      status,
    });

    if (!swarm) {
      return res.status(404).json({ success: false, error: 'Swarm not found' });
    }

    res.json({ success: true, data: swarm });
  } catch (error) {
    console.error('Error updating swarm:', error);
    res.status(500).json({ success: false, error: 'Failed to update swarm' });
  }
});

// Dissolve swarm
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const dissolved = swarmOps.dissolveSwarm(req.params.id);

    if (!dissolved) {
      return res.status(404).json({ success: false, error: 'Swarm not found' });
    }

    res.json({ success: true, message: 'Swarm dissolved' });
  } catch (error) {
    console.error('Error dissolving swarm:', error);
    res.status(500).json({ success: false, error: 'Failed to dissolve swarm' });
  }
});

// ========== Swarm Wallets ==========

// Get wallets for a swarm
router.get('/:id/wallets', (req: Request, res: Response) => {
  try {
    const wallets = swarmOps.getSwarmWallets(req.params.id);

    // Don't expose private keys
    const safeWallets = wallets.map(w => ({
      id: w.id,
      address: w.address,
      weight: w.weight,
      balance: w.balance,
      lastUsedAt: w.lastUsedAt,
      status: w.status,
    }));

    res.json({ success: true, data: safeWallets });
  } catch (error) {
    console.error('Error fetching swarm wallets:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch swarm wallets' });
  }
});

// Add wallet to swarm
router.post('/:id/wallets', (req: Request, res: Response) => {
  try {
    const { address, privateKeyEncrypted, weight, balance } = req.body;

    if (!address || !privateKeyEncrypted) {
      return res.status(400).json({ success: false, error: 'address and privateKeyEncrypted are required' });
    }

    const wallet = swarmOps.addSwarmWallet({
      swarmId: req.params.id,
      address,
      privateKeyEncrypted,
      weight: weight || 1.0,
      balance: balance || 0,
      status: 'active',
    });

    // Don't return private key
    res.status(201).json({
      success: true,
      data: {
        id: wallet.id,
        address: wallet.address,
        weight: wallet.weight,
        balance: wallet.balance,
        status: wallet.status,
      }
    });
  } catch (error) {
    console.error('Error adding wallet:', error);
    res.status(500).json({ success: false, error: 'Failed to add wallet' });
  }
});

// Remove wallet from swarm
router.delete('/:id/wallets/:address', (req: Request, res: Response) => {
  try {
    const removed = swarmOps.removeSwarmWallet(req.params.id, req.params.address);

    if (!removed) {
      return res.status(404).json({ success: false, error: 'Wallet not found in swarm' });
    }

    res.json({ success: true, message: 'Wallet removed from swarm' });
  } catch (error) {
    console.error('Error removing wallet:', error);
    res.status(500).json({ success: false, error: 'Failed to remove wallet' });
  }
});

// Update wallet balance
router.patch('/:id/wallets/:address/balance', (req: Request, res: Response) => {
  try {
    const { balance } = req.body;

    if (balance === undefined) {
      return res.status(400).json({ success: false, error: 'balance is required' });
    }

    swarmOps.updateSwarmWalletBalance(req.params.address, balance);
    res.json({ success: true, message: 'Balance updated' });
  } catch (error) {
    console.error('Error updating balance:', error);
    res.status(500).json({ success: false, error: 'Failed to update balance' });
  }
});

// ========== Executions ==========

// Get executions for swarm
router.get('/:id/executions', (req: Request, res: Response) => {
  try {
    const { status, limit } = req.query;

    const executions = swarmOps.getSwarmExecutions(req.params.id, {
      status: status as string,
      limit: limit ? parseInt(limit as string) : 50,
    });

    res.json({ success: true, data: executions });
  } catch (error) {
    console.error('Error fetching executions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch executions' });
  }
});

// Get execution by ID
router.get('/executions/:execId', (req: Request, res: Response) => {
  try {
    const execution = swarmOps.getSwarmExecutionById(req.params.execId);

    if (!execution) {
      return res.status(404).json({ success: false, error: 'Execution not found' });
    }

    res.json({ success: true, data: execution });
  } catch (error) {
    console.error('Error fetching execution:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch execution' });
  }
});

// Execute swarm trade
router.post('/:id/execute', (req: Request, res: Response) => {
  try {
    const swarm = swarmOps.getSwarmConfigById(req.params.id);

    if (!swarm) {
      return res.status(404).json({ success: false, error: 'Swarm not found' });
    }

    const { symbol, side, totalAmount } = req.body;

    if (!symbol || !side || !totalAmount) {
      return res.status(400).json({ success: false, error: 'symbol, side, and totalAmount are required' });
    }

    const wallets = swarmOps.getSwarmWallets(req.params.id);
    const activeWallets = wallets.filter(w => w.status === 'active');

    const execution = swarmOps.createSwarmExecution({
      swarmId: req.params.id,
      userWallet: swarm.userWallet,
      symbol,
      side,
      totalAmount,
      executedAmount: 0,
      avgPrice: 0,
      walletsUsed: activeWallets.length,
      walletsSucceeded: 0,
      walletsFailed: 0,
      transactions: '[]',
      status: 'pending',
      startedAt: Date.now(),
    });

    // In a real implementation, this would trigger the swarm execution engine
    // For now, just return the created execution

    res.status(201).json({ success: true, data: execution });
  } catch (error) {
    console.error('Error executing swarm:', error);
    res.status(500).json({ success: false, error: 'Failed to execute swarm' });
  }
});

// Update execution
router.patch('/executions/:execId', (req: Request, res: Response) => {
  try {
    const {
      executedAmount, avgPrice, walletsSucceeded, walletsFailed,
      transactions, bundleId, status, error: execError, completedAt
    } = req.body;

    const execution = swarmOps.updateSwarmExecution(req.params.execId, {
      executedAmount,
      avgPrice,
      walletsSucceeded,
      walletsFailed,
      transactions: transactions ? (typeof transactions === 'string' ? transactions : JSON.stringify(transactions)) : undefined,
      bundleId,
      status,
      error: execError,
      completedAt,
    });

    if (!execution) {
      return res.status(404).json({ success: false, error: 'Execution not found' });
    }

    res.json({ success: true, data: execution });
  } catch (error) {
    console.error('Error updating execution:', error);
    res.status(500).json({ success: false, error: 'Failed to update execution' });
  }
});

// ========== Stats ==========

router.get('/stats/:wallet', (req: Request, res: Response) => {
  try {
    const stats = swarmOps.getSwarmStats(req.params.wallet);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

export default router;
