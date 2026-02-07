/**
 * Leaderboard & Reputation Routes
 *
 * Endpoints:
 * - GET /api/v1/leaderboard - Get hunter leaderboard
 * - GET /api/v1/leaderboard/reputation/:wallet - Get hunter reputation
 * - GET /api/v1/leaderboard/badges - Get available badges
 * - GET /api/v1/leaderboard/ranks - Get rank thresholds
 * - GET /api/v1/leaderboard/specialists/:tag - Get top hunters by specialization
 */

import { Router, Request, Response } from 'express';
import * as reputationOps from '../db/operations/reputation.js';
import { BADGE_DEFINITIONS, RANK_THRESHOLDS } from '../db/operations/reputation.js';

export const leaderboardRouter = Router();

/**
 * GET /api/v1/leaderboard - Get hunter leaderboard
 */
leaderboardRouter.get('/', (req: Request, res: Response) => {
  try {
    const sortBy = req.query.sortBy as 'earnings' | 'bounties' | 'score' | 'success_rate' || 'score';
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const { hunters, total } = reputationOps.getLeaderboard({
      sortBy,
      limit,
      offset,
    });

    // Add rank position to each hunter
    const rankedHunters = hunters.map((hunter, index) => ({
      rank: offset + index + 1,
      ...hunter,
    }));

    res.json({
      success: true,
      data: {
        hunters: rankedHunters,
        total,
        page: Math.floor(offset / limit) + 1,
        perPage: limit,
      },
    });
  } catch (error) {
    console.error('[Leaderboard] List error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get leaderboard',
    });
  }
});

/**
 * GET /api/v1/leaderboard/reputation/:wallet - Get hunter reputation
 */
leaderboardRouter.get('/reputation/:wallet', (req: Request, res: Response) => {
  try {
    const { wallet } = req.params;

    const reputation = reputationOps.getHunterReputation(wallet);

    if (!reputation) {
      // Return default reputation for new hunters
      return res.json({
        success: true,
        data: {
          walletAddress: wallet,
          rank: 'Novice',
          totalEarnings: 0,
          bountiesCompleted: 0,
          bountiesAttempted: 0,
          successRate: 0,
          specializations: [],
          badges: [],
          streakCurrent: 0,
          streakBest: 0,
          reputationScore: 0,
          isNew: true,
        },
      });
    }

    // Calculate next rank info
    const currentScore = reputation.reputationScore;
    const ranks = Object.entries(RANK_THRESHOLDS).sort((a, b) => a[1] - b[1]);
    const currentRankIndex = ranks.findIndex(([rank]) => rank === reputation.rank);
    const nextRank = currentRankIndex < ranks.length - 1 ? ranks[currentRankIndex + 1] : null;

    res.json({
      success: true,
      data: {
        ...reputation,
        nextRank: nextRank ? {
          name: nextRank[0],
          requiredScore: nextRank[1],
          pointsNeeded: nextRank[1] - currentScore,
          progress: (currentScore / nextRank[1]) * 100,
        } : null,
        isNew: false,
      },
    });
  } catch (error) {
    console.error('[Leaderboard] Reputation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get hunter reputation',
    });
  }
});

/**
 * GET /api/v1/leaderboard/badges - Get all available badges
 */
leaderboardRouter.get('/badges', (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: BADGE_DEFINITIONS.map(badge => ({
        ...badge,
        earnedAt: undefined, // Template doesn't have earnedAt
      })),
    });
  } catch (error) {
    console.error('[Leaderboard] Badges error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get badges',
    });
  }
});

/**
 * GET /api/v1/leaderboard/ranks - Get rank thresholds
 */
leaderboardRouter.get('/ranks', (req: Request, res: Response) => {
  try {
    const ranks = Object.entries(RANK_THRESHOLDS).map(([name, threshold]) => ({
      name,
      minScore: threshold,
      icon: getRankIcon(name as reputationOps.HunterRank),
    }));

    res.json({
      success: true,
      data: ranks,
    });
  } catch (error) {
    console.error('[Leaderboard] Ranks error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get ranks',
    });
  }
});

/**
 * GET /api/v1/leaderboard/specialists/:tag - Get top hunters by specialization
 */
leaderboardRouter.get('/specialists/:tag', (req: Request, res: Response) => {
  try {
    const { tag } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    const specialists = reputationOps.getTopHuntersBySpecialization(tag, limit);

    res.json({
      success: true,
      data: {
        tag,
        hunters: specialists.map((hunter, index) => ({
          rank: index + 1,
          ...hunter,
        })),
      },
    });
  } catch (error) {
    console.error('[Leaderboard] Specialists error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get specialists',
    });
  }
});

/**
 * POST /api/v1/leaderboard/record-completion - Record bounty completion (internal)
 */
leaderboardRouter.post('/record-completion', (req: Request, res: Response) => {
  try {
    const { walletAddress, rewardAmount, completionTimeHours, tags } = req.body;

    if (!walletAddress || rewardAmount === undefined || completionTimeHours === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: walletAddress, rewardAmount, completionTimeHours',
      });
    }

    const reputation = reputationOps.recordBountyCompletion(
      walletAddress,
      rewardAmount,
      completionTimeHours,
      tags || []
    );

    // Emit WebSocket event for reputation update
    const io = req.app.locals.io;
    io?.emit('reputation_updated', {
      type: 'reputation_updated',
      timestamp: Date.now(),
      data: reputation,
    });

    res.json({
      success: true,
      data: reputation,
    });
  } catch (error) {
    console.error('[Leaderboard] Record completion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record bounty completion',
    });
  }
});

/**
 * POST /api/v1/leaderboard/record-rejection - Record bounty rejection (internal)
 */
leaderboardRouter.post('/record-rejection', (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: walletAddress',
      });
    }

    const reputation = reputationOps.recordBountyRejection(walletAddress);

    res.json({
      success: true,
      data: reputation,
    });
  } catch (error) {
    console.error('[Leaderboard] Record rejection error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record bounty rejection',
    });
  }
});

// Helper function to get rank icons
function getRankIcon(rank: reputationOps.HunterRank): string {
  const icons: Record<reputationOps.HunterRank, string> = {
    'Novice': '🌱',
    'Apprentice': '📚',
    'Investigator': '🔍',
    'Detective': '🕵️',
    'Expert': '🎯',
    'Master': '🏅',
    'Legend': '👑',
  };
  return icons[rank] || '🌱';
}
