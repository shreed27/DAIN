/**
 * Database Operations for Hunter Reputation System
 */

import { getDatabase, parseJSON, stringifyJSON } from '../index.js';

export type HunterRank = 'Novice' | 'Apprentice' | 'Investigator' | 'Detective' | 'Expert' | 'Master' | 'Legend';

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
}

export interface HunterReputation {
  walletAddress: string;
  rank: HunterRank;
  totalEarnings: number;
  bountiesCompleted: number;
  bountiesAttempted: number;
  successRate: number;
  avgCompletionTimeHours?: number;
  specializations: string[];
  badges: Badge[];
  streakCurrent: number;
  streakBest: number;
  reputationScore: number;
  createdAt: number;
  updatedAt: number;
}

interface HunterReputationRow {
  wallet_address: string;
  rank: string;
  total_earnings: number;
  bounties_completed: number;
  bounties_attempted: number;
  success_rate: number;
  avg_completion_time_hours: number | null;
  specializations: string;
  badges: string;
  streak_current: number;
  streak_best: number;
  reputation_score: number;
  created_at: number;
  updated_at: number;
}

// Badge definitions
export const BADGE_DEFINITIONS: Omit<Badge, 'earnedAt'>[] = [
  { id: 'first_blood', name: 'First Blood', description: 'Complete your first bounty', icon: '🩸', rarity: 'common' },
  { id: 'speed_demon', name: 'Speed Demon', description: 'Complete a bounty in under 1 hour', icon: '⚡', rarity: 'uncommon' },
  { id: 'whale_hunter', name: 'Whale Hunter', description: 'Complete a bounty worth 10+ SOL', icon: '🐋', rarity: 'rare' },
  { id: 'perfect_ten', name: 'Perfect Ten', description: 'Complete 10 bounties with 100% acceptance rate', icon: '💯', rarity: 'rare' },
  { id: 'streak_5', name: 'On Fire', description: 'Complete 5 bounties in a row', icon: '🔥', rarity: 'uncommon' },
  { id: 'streak_10', name: 'Unstoppable', description: 'Complete 10 bounties in a row', icon: '💪', rarity: 'rare' },
  { id: 'streak_25', name: 'Legendary Streak', description: 'Complete 25 bounties in a row', icon: '🏆', rarity: 'epic' },
  { id: 'specialist', name: 'Specialist', description: 'Complete 10+ bounties in a single category', icon: '🎯', rarity: 'uncommon' },
  { id: 'polymath', name: 'Polymath', description: 'Complete bounties in 5+ different categories', icon: '🧠', rarity: 'rare' },
  { id: 'veteran', name: 'Veteran', description: 'Complete 50 bounties', icon: '🎖️', rarity: 'rare' },
  { id: 'elite', name: 'Elite Hunter', description: 'Complete 100 bounties', icon: '👑', rarity: 'epic' },
  { id: 'legend', name: 'Legend', description: 'Reach Legend rank', icon: '⭐', rarity: 'legendary' },
  { id: 'early_adopter', name: 'Early Adopter', description: 'Join during beta period', icon: '🚀', rarity: 'epic' },
  { id: 'big_earner', name: 'Big Earner', description: 'Earn 100+ SOL total', icon: '💰', rarity: 'epic' },
];

// Rank thresholds (reputation score required)
export const RANK_THRESHOLDS: Record<HunterRank, number> = {
  'Novice': 0,
  'Apprentice': 100,
  'Investigator': 300,
  'Detective': 600,
  'Expert': 1000,
  'Master': 2000,
  'Legend': 5000,
};

function rowToHunterReputation(row: HunterReputationRow): HunterReputation {
  return {
    walletAddress: row.wallet_address,
    rank: row.rank as HunterRank,
    totalEarnings: row.total_earnings,
    bountiesCompleted: row.bounties_completed,
    bountiesAttempted: row.bounties_attempted,
    successRate: row.success_rate,
    avgCompletionTimeHours: row.avg_completion_time_hours || undefined,
    specializations: parseJSON<string[]>(row.specializations, []),
    badges: parseJSON<Badge[]>(row.badges, []),
    streakCurrent: row.streak_current,
    streakBest: row.streak_best,
    reputationScore: row.reputation_score,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function calculateRank(score: number): HunterRank {
  if (score >= RANK_THRESHOLDS.Legend) return 'Legend';
  if (score >= RANK_THRESHOLDS.Master) return 'Master';
  if (score >= RANK_THRESHOLDS.Expert) return 'Expert';
  if (score >= RANK_THRESHOLDS.Detective) return 'Detective';
  if (score >= RANK_THRESHOLDS.Investigator) return 'Investigator';
  if (score >= RANK_THRESHOLDS.Apprentice) return 'Apprentice';
  return 'Novice';
}

export function getOrCreateHunterReputation(walletAddress: string): HunterReputation {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM hunter_reputation WHERE wallet_address = ?');
  const row = stmt.get(walletAddress) as HunterReputationRow | undefined;

  if (row) {
    return rowToHunterReputation(row);
  }

  // Create new reputation record
  const now = Date.now();
  const newReputation: HunterReputation = {
    walletAddress,
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
    createdAt: now,
    updatedAt: now,
  };

  const insertStmt = db.prepare(`
    INSERT INTO hunter_reputation (
      wallet_address, rank, total_earnings, bounties_completed, bounties_attempted,
      success_rate, avg_completion_time_hours, specializations, badges,
      streak_current, streak_best, reputation_score, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertStmt.run(
    newReputation.walletAddress,
    newReputation.rank,
    newReputation.totalEarnings,
    newReputation.bountiesCompleted,
    newReputation.bountiesAttempted,
    newReputation.successRate,
    null,
    stringifyJSON(newReputation.specializations),
    stringifyJSON(newReputation.badges),
    newReputation.streakCurrent,
    newReputation.streakBest,
    newReputation.reputationScore,
    newReputation.createdAt,
    newReputation.updatedAt
  );

  return newReputation;
}

export function getHunterReputation(walletAddress: string): HunterReputation | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM hunter_reputation WHERE wallet_address = ?');
  const row = stmt.get(walletAddress) as HunterReputationRow | undefined;
  return row ? rowToHunterReputation(row) : null;
}

export function updateHunterReputation(reputation: HunterReputation): HunterReputation {
  const db = getDatabase();

  // Recalculate rank based on score
  reputation.rank = calculateRank(reputation.reputationScore);
  reputation.updatedAt = Date.now();

  const stmt = db.prepare(`
    UPDATE hunter_reputation SET
      rank = ?, total_earnings = ?, bounties_completed = ?, bounties_attempted = ?,
      success_rate = ?, avg_completion_time_hours = ?, specializations = ?, badges = ?,
      streak_current = ?, streak_best = ?, reputation_score = ?, updated_at = ?
    WHERE wallet_address = ?
  `);

  stmt.run(
    reputation.rank,
    reputation.totalEarnings,
    reputation.bountiesCompleted,
    reputation.bountiesAttempted,
    reputation.successRate,
    reputation.avgCompletionTimeHours || null,
    stringifyJSON(reputation.specializations),
    stringifyJSON(reputation.badges),
    reputation.streakCurrent,
    reputation.streakBest,
    reputation.reputationScore,
    reputation.updatedAt,
    reputation.walletAddress
  );

  return reputation;
}

export function recordBountyCompletion(
  walletAddress: string,
  rewardAmount: number,
  completionTimeHours: number,
  tags: string[]
): HunterReputation {
  const reputation = getOrCreateHunterReputation(walletAddress);

  // Update stats
  reputation.bountiesCompleted += 1;
  reputation.bountiesAttempted += 1;
  reputation.totalEarnings += rewardAmount;
  reputation.successRate = (reputation.bountiesCompleted / reputation.bountiesAttempted) * 100;
  reputation.streakCurrent += 1;
  reputation.streakBest = Math.max(reputation.streakBest, reputation.streakCurrent);

  // Update avg completion time
  if (reputation.avgCompletionTimeHours) {
    const totalTime = reputation.avgCompletionTimeHours * (reputation.bountiesCompleted - 1);
    reputation.avgCompletionTimeHours = (totalTime + completionTimeHours) / reputation.bountiesCompleted;
  } else {
    reputation.avgCompletionTimeHours = completionTimeHours;
  }

  // Update specializations
  for (const tag of tags) {
    if (!reputation.specializations.includes(tag)) {
      reputation.specializations.push(tag);
    }
  }

  // Calculate reputation score
  // Base: 10 points per completed bounty + bonus for earnings + speed bonus
  const basePoints = 10;
  const earningsBonus = Math.min(rewardAmount * 5, 50); // Max 50 bonus from earnings
  const speedBonus = completionTimeHours < 1 ? 20 : completionTimeHours < 4 ? 10 : 0;
  const streakBonus = Math.min(reputation.streakCurrent * 2, 20); // Max 20 bonus from streak

  reputation.reputationScore += basePoints + earningsBonus + speedBonus + streakBonus;

  // Check for new badges
  checkAndAwardBadges(reputation, rewardAmount, completionTimeHours, tags);

  return updateHunterReputation(reputation);
}

export function recordBountyRejection(walletAddress: string): HunterReputation {
  const reputation = getOrCreateHunterReputation(walletAddress);

  reputation.bountiesAttempted += 1;
  reputation.successRate = (reputation.bountiesCompleted / reputation.bountiesAttempted) * 100;
  reputation.streakCurrent = 0; // Reset streak

  // Small penalty for rejection
  reputation.reputationScore = Math.max(0, reputation.reputationScore - 5);

  return updateHunterReputation(reputation);
}

function checkAndAwardBadges(
  reputation: HunterReputation,
  rewardAmount: number,
  completionTimeHours: number,
  tags: string[]
): void {
  const existingBadgeIds = new Set(reputation.badges.map(b => b.id));
  const now = Date.now();

  const awardBadge = (badgeId: string) => {
    if (existingBadgeIds.has(badgeId)) return;
    const badgeDef = BADGE_DEFINITIONS.find(b => b.id === badgeId);
    if (badgeDef) {
      reputation.badges.push({ ...badgeDef, earnedAt: now });
    }
  };

  // First Blood
  if (reputation.bountiesCompleted === 1) awardBadge('first_blood');

  // Speed Demon
  if (completionTimeHours < 1) awardBadge('speed_demon');

  // Whale Hunter
  if (rewardAmount >= 10) awardBadge('whale_hunter');

  // Streak badges
  if (reputation.streakCurrent >= 5) awardBadge('streak_5');
  if (reputation.streakCurrent >= 10) awardBadge('streak_10');
  if (reputation.streakCurrent >= 25) awardBadge('streak_25');

  // Perfect Ten
  if (reputation.bountiesCompleted >= 10 && reputation.successRate === 100) awardBadge('perfect_ten');

  // Veteran
  if (reputation.bountiesCompleted >= 50) awardBadge('veteran');

  // Elite
  if (reputation.bountiesCompleted >= 100) awardBadge('elite');

  // Legend rank
  if (reputation.rank === 'Legend') awardBadge('legend');

  // Big Earner
  if (reputation.totalEarnings >= 100) awardBadge('big_earner');

  // Polymath (5+ categories)
  if (reputation.specializations.length >= 5) awardBadge('polymath');
}

export function getLeaderboard(options?: {
  sortBy?: 'earnings' | 'bounties' | 'score' | 'success_rate';
  limit?: number;
  offset?: number;
}): { hunters: HunterReputation[]; total: number } {
  const db = getDatabase();
  const sortBy = options?.sortBy || 'score';
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  const sortColumn = {
    'earnings': 'total_earnings',
    'bounties': 'bounties_completed',
    'score': 'reputation_score',
    'success_rate': 'success_rate',
  }[sortBy];

  // Get total count
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM hunter_reputation WHERE bounties_completed > 0');
  const countRow = countStmt.get() as { count: number };

  const stmt = db.prepare(`
    SELECT * FROM hunter_reputation
    WHERE bounties_completed > 0
    ORDER BY ${sortColumn} DESC
    LIMIT ? OFFSET ?
  `);
  const rows = stmt.all(limit, offset) as HunterReputationRow[];

  return {
    hunters: rows.map(rowToHunterReputation),
    total: countRow.count,
  };
}

export function getTopHuntersBySpecialization(tag: string, limit: number = 10): HunterReputation[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM hunter_reputation
    WHERE specializations LIKE ?
    ORDER BY reputation_score DESC
    LIMIT ?
  `);
  const rows = stmt.all(`%"${tag}"%`, limit) as HunterReputationRow[];
  return rows.map(rowToHunterReputation);
}
