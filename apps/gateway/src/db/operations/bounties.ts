/**
 * Database Operations for Bounties, Claims, and Submissions
 */

import { getDatabase, parseJSON, stringifyJSON } from '../index.js';
import type { Bounty, BountyStatus, Claim, Difficulty, Reward, Submission } from '../../routes/bounties.js';

interface BountyRow {
  id: string;
  question: string;
  description: string | null;
  reward_amount: number;
  reward_token: string;
  poster_wallet: string;
  status: string;
  difficulty: string;
  tags: string;
  deadline: string;
  escrow_tx: string | null;
  created_at: string;
  updated_at: string;
}

interface ClaimRow {
  id: string;
  bounty_id: string;
  hunter_wallet: string;
  claimed_at: string;
  expires_at: string;
}

interface SubmissionRow {
  id: string;
  bounty_id: string;
  hunter_wallet: string;
  solution: string;
  confidence: number;
  submitted_at: string;
  status: string;
}

function rowToBounty(row: BountyRow): Bounty {
  return {
    id: row.id,
    question: row.question,
    description: row.description || undefined,
    reward: {
      amount: row.reward_amount,
      token: row.reward_token as 'SOL' | 'USDC',
    },
    poster_wallet: row.poster_wallet,
    status: row.status as BountyStatus,
    difficulty: row.difficulty as Difficulty,
    tags: parseJSON<string[]>(row.tags, []),
    deadline: row.deadline,
    escrow_tx: row.escrow_tx || undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToClaim(row: ClaimRow): Claim {
  return {
    id: row.id,
    bounty_id: row.bounty_id,
    hunter_wallet: row.hunter_wallet,
    claimed_at: row.claimed_at,
    expires_at: row.expires_at,
  };
}

function rowToSubmission(row: SubmissionRow): Submission {
  return {
    id: row.id,
    bounty_id: row.bounty_id,
    hunter_wallet: row.hunter_wallet,
    solution: row.solution,
    confidence: row.confidence,
    submitted_at: row.submitted_at,
    status: row.status as 'pending' | 'approved' | 'rejected',
  };
}

// ============== Bounty Operations ==============

export function getAllBounties(filters?: {
  status?: BountyStatus;
  difficulty?: Difficulty;
  tags?: string[];
  page?: number;
  perPage?: number;
}): { bounties: Bounty[]; total: number } {
  const db = getDatabase();

  let query = 'SELECT * FROM bounties WHERE 1=1';
  const params: unknown[] = [];

  if (filters?.status && filters.status !== 'all' as unknown) {
    query += ' AND status = ?';
    params.push(filters.status);
  }

  if (filters?.difficulty) {
    query += ' AND difficulty = ?';
    params.push(filters.difficulty);
  }

  // For tags, we need to check if any tag matches
  if (filters?.tags && filters.tags.length > 0) {
    const tagConditions = filters.tags.map(() => 'tags LIKE ?').join(' OR ');
    query += ` AND (${tagConditions})`;
    params.push(...filters.tags.map(t => `%"${t}"%`));
  }

  // Get total count
  const countStmt = db.prepare(query.replace('SELECT *', 'SELECT COUNT(*) as count'));
  const countRow = countStmt.get(...params) as { count: number };
  const total = countRow.count;

  // Add ordering and pagination
  query += ' ORDER BY created_at DESC';

  if (filters?.page && filters?.perPage) {
    const offset = (filters.page - 1) * filters.perPage;
    query += ' LIMIT ? OFFSET ?';
    params.push(filters.perPage, offset);
  }

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as BountyRow[];

  return {
    bounties: rows.map(rowToBounty),
    total,
  };
}

export function getBountyById(id: string): Bounty | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM bounties WHERE id = ?');
  const row = stmt.get(id) as BountyRow | undefined;
  return row ? rowToBounty(row) : null;
}

export function createBounty(bounty: Bounty): Bounty {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO bounties (
      id, question, description, reward_amount, reward_token, poster_wallet,
      status, difficulty, tags, deadline, escrow_tx, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    bounty.id,
    bounty.question,
    bounty.description || null,
    bounty.reward.amount,
    bounty.reward.token,
    bounty.poster_wallet,
    bounty.status,
    bounty.difficulty,
    stringifyJSON(bounty.tags),
    bounty.deadline,
    bounty.escrow_tx || null,
    bounty.created_at,
    bounty.updated_at
  );

  return bounty;
}

export function updateBounty(bounty: Bounty): Bounty {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE bounties SET
      question = ?, description = ?, reward_amount = ?, reward_token = ?,
      status = ?, difficulty = ?, tags = ?, deadline = ?, escrow_tx = ?, updated_at = ?
    WHERE id = ?
  `);

  stmt.run(
    bounty.question,
    bounty.description || null,
    bounty.reward.amount,
    bounty.reward.token,
    bounty.status,
    bounty.difficulty,
    stringifyJSON(bounty.tags),
    bounty.deadline,
    bounty.escrow_tx || null,
    bounty.updated_at,
    bounty.id
  );

  return bounty;
}

export function updateBountyStatus(id: string, status: BountyStatus): Bounty | null {
  const db = getDatabase();
  const now = new Date().toISOString();

  const stmt = db.prepare('UPDATE bounties SET status = ?, updated_at = ? WHERE id = ?');
  stmt.run(status, now, id);

  return getBountyById(id);
}

export function deleteBounty(id: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM bounties WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// ============== Claim Operations ==============

export function getClaimsByBountyId(bountyId: string): Claim[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM bounty_claims WHERE bounty_id = ?');
  const rows = stmt.all(bountyId) as ClaimRow[];
  return rows.map(rowToClaim);
}

export function getClaimByBountyAndHunter(bountyId: string, hunterWallet: string): Claim | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM bounty_claims WHERE bounty_id = ? AND hunter_wallet = ?');
  const row = stmt.get(bountyId, hunterWallet) as ClaimRow | undefined;
  return row ? rowToClaim(row) : null;
}

export function createClaim(claim: Claim): Claim {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO bounty_claims (id, bounty_id, hunter_wallet, claimed_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(claim.id, claim.bounty_id, claim.hunter_wallet, claim.claimed_at, claim.expires_at);

  return claim;
}

export function deleteClaim(id: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM bounty_claims WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function deleteClaimsByBountyId(bountyId: string): number {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM bounty_claims WHERE bounty_id = ?');
  const result = stmt.run(bountyId);
  return result.changes;
}

// ============== Submission Operations ==============

export function getSubmissionsByBountyId(bountyId: string): Submission[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM bounty_submissions WHERE bounty_id = ?');
  const rows = stmt.all(bountyId) as SubmissionRow[];
  return rows.map(rowToSubmission);
}

export function getSubmissionById(id: string): Submission | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM bounty_submissions WHERE id = ?');
  const row = stmt.get(id) as SubmissionRow | undefined;
  return row ? rowToSubmission(row) : null;
}

export function createSubmission(submission: Submission): Submission {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO bounty_submissions (id, bounty_id, hunter_wallet, solution, confidence, submitted_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    submission.id,
    submission.bounty_id,
    submission.hunter_wallet,
    submission.solution,
    submission.confidence,
    submission.submitted_at,
    submission.status
  );

  return submission;
}

export function updateSubmissionStatus(id: string, status: 'pending' | 'approved' | 'rejected'): Submission | null {
  const db = getDatabase();
  const stmt = db.prepare('UPDATE bounty_submissions SET status = ? WHERE id = ?');
  stmt.run(status, id);

  return getSubmissionById(id);
}
