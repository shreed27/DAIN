/**
 * Bounty System Routes
 *
 * Endpoints:
 * - POST /api/v1/bounties - Create bounty
 * - GET /api/v1/bounties - List bounties
 * - GET /api/v1/bounties/:id - Get bounty details
 * - POST /api/v1/bounties/:id/claim - Claim bounty
 * - POST /api/v1/bounties/:id/submit - Submit solution
 * - POST /api/v1/bounties/:id/resolve - Resolve submission
 */

import { Router, Request, Response } from 'express';
import { processDeposit, processPayout, processRefund, FEE_STRUCTURE } from '../services/escrow.js';
import { ESCROW_WALLET } from '../services/solana.js';
import * as bountyOps from '../db/operations/bounties.js';

const router = Router();

// Supported tokens
const SUPPORTED_TOKENS = ['SOL', 'USDC'];

// Types
export type BountyStatus = 'open' | 'claimed' | 'submitted' | 'completed' | 'expired' | 'cancelled';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface Reward {
  amount: number;
  token: 'SOL' | 'USDC';
}

export interface Bounty {
  id: string;
  question: string;
  description?: string;
  reward: Reward;
  poster_wallet: string;
  status: BountyStatus;
  difficulty: Difficulty;
  tags: string[];
  deadline: string;
  escrow_tx?: string;
  created_at: string;
  updated_at: string;
}

export interface Claim {
  id: string;
  bounty_id: string;
  hunter_wallet: string;
  claimed_at: string;
  expires_at: string;
}

export interface Submission {
  id: string;
  bounty_id: string;
  hunter_wallet: string;
  solution: string;
  confidence: number;
  submitted_at: string;
  status: 'pending' | 'approved' | 'rejected';
}

// Helper to generate IDs
function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

// Sanitize input to prevent XSS
function sanitize(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * GET /api/v1/bounties - List bounties
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status = 'open', difficulty, tags, page = '1', per_page = '20' } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const perPage = parseInt(per_page as string) || 20;

    const tagList = tags ? (tags as string).split(',').map(t => t.trim().toLowerCase()) : undefined;

    const result = bountyOps.getAllBounties({
      status: status !== 'all' ? status as BountyStatus : undefined,
      difficulty: difficulty as Difficulty | undefined,
      tags: tagList,
      page: pageNum,
      perPage,
    });

    res.json({
      bounties: result.bounties,
      total: result.total,
      page: pageNum,
      per_page: perPage,
    });
  } catch (error) {
    console.error('[Bounties] List error:', error);
    res.status(500).json({ error: 'Failed to list bounties' });
  }
});

/**
 * POST /api/v1/bounties - Create bounty
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { question, description, reward, difficulty, tags, deadline, escrow_tx, poster_wallet } = req.body;

    // Validate required fields
    if (!question || question.trim().length < 10) {
      return res.status(400).json({
        error: 'Question is required and must be at least 10 characters'
      });
    }

    if (!reward || !reward.amount || !reward.token) {
      return res.status(400).json({
        error: 'Reward is required with amount and token (e.g., {"amount": 0.5, "token": "SOL"})'
      });
    }

    // Validate token type
    if (!SUPPORTED_TOKENS.includes(reward.token)) {
      return res.status(400).json({
        error: `Unsupported token: ${reward.token}. Supported tokens: ${SUPPORTED_TOKENS.join(', ')}`
      });
    }

    // Validate minimum bounty (0.1 SOL)
    if (reward.token === 'SOL' && reward.amount < FEE_STRUCTURE.minimumSol) {
      return res.status(400).json({
        error: `Minimum bounty is ${FEE_STRUCTURE.minimumSol} SOL`
      });
    }

    // Get poster wallet from header or body
    const walletAddress = req.headers['x-wallet-address'] as string || poster_wallet;

    if (!walletAddress) {
      return res.status(400).json({
        error: 'Missing x-wallet-address header or poster_wallet in body'
      });
    }

    // Apply defaults
    const bountyDeadline = deadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const bountyDifficulty = difficulty || 'medium';
    const now = new Date().toISOString();

    // Create bounty
    const bounty: Bounty = {
      id: generateId(),
      question: sanitize(question),
      description: description ? sanitize(description) : undefined,
      reward,
      poster_wallet: walletAddress,
      status: 'open',
      difficulty: bountyDifficulty,
      tags: (tags || []).map((t: string) => sanitize(t)),
      deadline: bountyDeadline,
      created_at: now,
      updated_at: now,
    };

    // If escrow_tx provided, verify the deposit
    if (escrow_tx) {
      const depositResult = await processDeposit(bounty.id, reward, walletAddress, escrow_tx);

      if (!depositResult.success) {
        return res.status(400).json({
          created: false,
          error: 'Deposit verification failed. Bounty was not created.',
          escrow_error: depositResult.error,
          deposit_instructions: {
            recipient: ESCROW_WALLET.toBase58(),
            amount: reward.amount,
            token: reward.token,
            fee: `${FEE_STRUCTURE.creation}% creation fee`,
            note: 'Please send the deposit first, then create the bounty with the transaction signature.',
          },
        });
      }

      bounty.escrow_tx = escrow_tx;
      bountyOps.createBounty(bounty);

      return res.status(201).json({
        created: true,
        bounty_id: bounty.id,
        bounty,
        escrow_status: 'confirmed',
        escrow_tx,
        net_amount: depositResult.netAmount,
        fee_amount: depositResult.feeAmount,
      });
    }

    // No escrow_tx - save bounty and return deposit instructions
    bountyOps.createBounty(bounty);

    res.status(201).json({
      created: true,
      bounty_id: bounty.id,
      bounty,
      escrow_status: 'pending',
      deposit_instructions: {
        recipient: ESCROW_WALLET.toBase58(),
        amount: reward.amount,
        token: reward.token,
        fee: `${FEE_STRUCTURE.creation}% creation fee (${reward.amount * FEE_STRUCTURE.creation / 100} ${reward.token})`,
        note: 'Send deposit to recipient address, then call PUT /api/v1/bounties/{id}/confirm with the transaction signature',
      },
    });
  } catch (error) {
    console.error('[Bounties] Create error:', error);
    res.status(500).json({ error: 'Failed to create bounty' });
  }
});

/**
 * GET /api/v1/bounties/:id - Get bounty details
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const bounty = bountyOps.getBountyById(id);

    if (!bounty) {
      return res.status(404).json({ error: 'Bounty not found' });
    }

    // Get related claim and submission
    const claims = bountyOps.getClaimsByBountyId(id);
    const submissions = bountyOps.getSubmissionsByBountyId(id);

    res.json({
      bounty,
      claim: claims[0] || null,
      submission: submissions[0] || null,
    });
  } catch (error) {
    console.error('[Bounties] Get error:', error);
    res.status(500).json({ error: 'Failed to get bounty' });
  }
});

/**
 * POST /api/v1/bounties/:id/claim - Claim bounty
 */
router.post('/:id/claim', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const bounty = bountyOps.getBountyById(id);

    if (!bounty) {
      return res.status(404).json({ error: 'Bounty not found' });
    }

    if (bounty.status !== 'open') {
      return res.status(400).json({ error: `Bounty is ${bounty.status}, cannot be claimed` });
    }

    const hunterWallet = req.headers['x-wallet-address'] as string || req.body.hunter_wallet;

    if (!hunterWallet) {
      return res.status(400).json({ error: 'Missing x-wallet-address header or hunter_wallet in body' });
    }

    if (hunterWallet === bounty.poster_wallet) {
      return res.status(400).json({ error: 'Cannot claim your own bounty' });
    }

    // Create claim (expires in 24 hours)
    const now = new Date();
    const claim: Claim = {
      id: generateId(),
      bounty_id: id,
      hunter_wallet: hunterWallet,
      claimed_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    };

    bountyOps.createClaim(claim);

    // Update bounty status
    bountyOps.updateBountyStatus(id, 'claimed');

    res.json({
      success: true,
      claim,
      message: 'Bounty claimed successfully. You have 24 hours to submit a solution.',
    });
  } catch (error) {
    console.error('[Bounties] Claim error:', error);
    res.status(500).json({ error: 'Failed to claim bounty' });
  }
});

/**
 * POST /api/v1/bounties/:id/submit - Submit solution
 */
router.post('/:id/submit', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { solution, confidence } = req.body;
    const bounty = bountyOps.getBountyById(id);

    if (!bounty) {
      return res.status(404).json({ error: 'Bounty not found' });
    }

    if (bounty.status !== 'claimed') {
      return res.status(400).json({ error: `Bounty is ${bounty.status}, cannot submit solution` });
    }

    const hunterWallet = req.headers['x-wallet-address'] as string || req.body.hunter_wallet;

    if (!hunterWallet) {
      return res.status(400).json({ error: 'Missing x-wallet-address header or hunter_wallet in body' });
    }

    // Verify claim exists and matches
    const claim = bountyOps.getClaimByBountyAndHunter(id, hunterWallet);

    if (!claim) {
      return res.status(403).json({ error: 'You have not claimed this bounty' });
    }

    // Check claim expiry
    if (new Date(claim.expires_at) < new Date()) {
      bountyOps.updateBountyStatus(id, 'open');
      return res.status(400).json({ error: 'Claim has expired. Bounty is open again.' });
    }

    if (!solution || solution.trim().length < 10) {
      return res.status(400).json({ error: 'Solution is required and must be at least 10 characters' });
    }

    // Create submission
    const submission: Submission = {
      id: generateId(),
      bounty_id: id,
      hunter_wallet: hunterWallet,
      solution: sanitize(solution),
      confidence: confidence || 80,
      submitted_at: new Date().toISOString(),
      status: 'pending',
    };

    bountyOps.createSubmission(submission);

    // Update bounty status
    bountyOps.updateBountyStatus(id, 'submitted');

    res.json({
      success: true,
      submission,
      message: 'Solution submitted successfully. Waiting for poster review.',
    });
  } catch (error) {
    console.error('[Bounties] Submit error:', error);
    res.status(500).json({ error: 'Failed to submit solution' });
  }
});

/**
 * POST /api/v1/bounties/:id/resolve - Resolve submission (approve/reject)
 */
router.post('/:id/resolve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { approved } = req.body;
    const bounty = bountyOps.getBountyById(id);

    if (!bounty) {
      return res.status(404).json({ error: 'Bounty not found' });
    }

    if (bounty.status !== 'submitted') {
      return res.status(400).json({ error: `Bounty is ${bounty.status}, cannot resolve` });
    }

    const posterWallet = req.headers['x-wallet-address'] as string || req.body.poster_wallet;

    if (!posterWallet) {
      return res.status(400).json({ error: 'Missing x-wallet-address header or poster_wallet in body' });
    }

    if (posterWallet !== bounty.poster_wallet) {
      return res.status(403).json({ error: 'Only the bounty poster can resolve submissions' });
    }

    // Get submission
    const submissions = bountyOps.getSubmissionsByBountyId(id);
    const submission = submissions[0];

    if (!submission) {
      return res.status(400).json({ error: 'No submission found for this bounty' });
    }

    if (approved) {
      // Process payout to hunter
      const payoutResult = await processPayout(bounty, submission.hunter_wallet);

      if (!payoutResult.success) {
        return res.status(500).json({
          error: 'Payout failed',
          details: payoutResult.error,
        });
      }

      bountyOps.updateSubmissionStatus(submission.id, 'approved');
      bountyOps.updateBountyStatus(id, 'completed');

      return res.json({
        success: true,
        status: 'approved',
        payout_tx: payoutResult.payoutTx,
        net_amount: payoutResult.netAmount,
        fee_amount: payoutResult.feeAmount,
        message: 'Bounty completed! Payment sent to hunter.',
      });
    } else {
      // Rejected - bounty goes back to open
      bountyOps.updateSubmissionStatus(submission.id, 'rejected');
      bountyOps.updateBountyStatus(id, 'open');

      return res.json({
        success: true,
        status: 'rejected',
        message: 'Submission rejected. Bounty is open again.',
      });
    }
  } catch (error) {
    console.error('[Bounties] Resolve error:', error);
    res.status(500).json({ error: 'Failed to resolve bounty' });
  }
});

/**
 * POST /api/v1/bounties/:id/cancel - Cancel bounty (refund)
 */
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const bounty = bountyOps.getBountyById(id);

    if (!bounty) {
      return res.status(404).json({ error: 'Bounty not found' });
    }

    if (!['open', 'expired'].includes(bounty.status)) {
      return res.status(400).json({ error: `Bounty is ${bounty.status}, cannot be cancelled` });
    }

    const posterWallet = req.headers['x-wallet-address'] as string || req.body.poster_wallet;

    if (!posterWallet || posterWallet !== bounty.poster_wallet) {
      return res.status(403).json({ error: 'Only the bounty poster can cancel' });
    }

    // Process refund
    const refundResult = await processRefund(bounty);

    if (!refundResult.success) {
      return res.status(500).json({
        error: 'Refund failed',
        details: refundResult.error,
      });
    }

    bountyOps.updateBountyStatus(id, 'cancelled');

    res.json({
      success: true,
      refund_tx: refundResult.payoutTx,
      net_amount: refundResult.netAmount,
      message: 'Bounty cancelled. Escrow refunded (minus creation fee).',
    });
  } catch (error) {
    console.error('[Bounties] Cancel error:', error);
    res.status(500).json({ error: 'Failed to cancel bounty' });
  }
});

export default router;
