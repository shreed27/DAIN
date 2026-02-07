/**
 * Token Migration Detection Routes
 *
 * Endpoints:
 * - GET /api/v1/migrations - List recent migrations
 * - GET /api/v1/migrations/top - Get top ranked migrations
 * - GET /api/v1/migrations/god-wallet-activity - Get migrations by god wallet activity
 * - GET /api/v1/migrations/:id - Get migration by ID
 * - GET /api/v1/migrations/lookup - Lookup migration by mint
 * - GET /api/v1/migrations/stats - Get migration statistics
 * - POST /api/v1/migrations - Record a migration (internal)
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as migrationsOps from '../db/operations/migrations.js';
import type { TokenMigration, MigrationType } from '../db/operations/migrations.js';

export const migrationsRouter = Router();

const VALID_MIGRATION_TYPES: MigrationType[] = ['pump_to_raydium', 'bonding_curve', 'upgrade', 'rebrand', 'other'];

/**
 * GET /api/v1/migrations - List recent migrations
 */
migrationsRouter.get('/', (req: Request, res: Response) => {
  try {
    const migrationType = req.query.type as MigrationType | undefined;
    const minRankingScore = req.query.minRankingScore ? parseFloat(req.query.minRankingScore as string) : undefined;
    const minGodWalletCount = req.query.minGodWalletCount ? parseInt(req.query.minGodWalletCount as string) : undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    if (migrationType && !VALID_MIGRATION_TYPES.includes(migrationType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid migration type. Must be one of: ${VALID_MIGRATION_TYPES.join(', ')}`,
      });
    }

    const { migrations, total } = migrationsOps.getRecentMigrations({
      migrationType,
      minRankingScore,
      minGodWalletCount,
      limit,
      offset,
    });

    res.json({
      success: true,
      data: {
        migrations,
        total,
        page: Math.floor(offset / limit) + 1,
        perPage: limit,
      },
    });
  } catch (error) {
    console.error('[Migrations] List error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list migrations',
    });
  }
});

/**
 * GET /api/v1/migrations/top - Get top ranked migrations (last 24h)
 */
migrationsRouter.get('/top', (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    const migrations = migrationsOps.getTopRankedMigrations(limit);

    res.json({
      success: true,
      data: migrations,
      total: migrations.length,
    });
  } catch (error) {
    console.error('[Migrations] Top ranked error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get top ranked migrations',
    });
  }
});

/**
 * GET /api/v1/migrations/god-wallet-activity - Get migrations by god wallet activity
 */
migrationsRouter.get('/god-wallet-activity', (req: Request, res: Response) => {
  try {
    const minWalletCount = parseInt(req.query.minWalletCount as string) || 3;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    const migrations = migrationsOps.getMigrationsByGodWalletActivity(minWalletCount, limit);

    res.json({
      success: true,
      data: migrations,
      total: migrations.length,
      filters: {
        minWalletCount,
      },
    });
  } catch (error) {
    console.error('[Migrations] God wallet activity error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get migrations by god wallet activity',
    });
  }
});

/**
 * GET /api/v1/migrations/lookup - Lookup migration by mint
 */
migrationsRouter.get('/lookup', (req: Request, res: Response) => {
  try {
    const oldMint = req.query.oldMint as string | undefined;
    const newMint = req.query.newMint as string | undefined;

    if (!oldMint && !newMint) {
      return res.status(400).json({
        success: false,
        error: 'Must provide oldMint or newMint query param',
      });
    }

    const migration = migrationsOps.getTokenMigrationByMints(oldMint, newMint);

    if (!migration) {
      return res.status(404).json({
        success: false,
        error: 'Migration not found',
      });
    }

    res.json({
      success: true,
      data: migration,
    });
  } catch (error) {
    console.error('[Migrations] Lookup error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to lookup migration',
    });
  }
});

/**
 * GET /api/v1/migrations/stats - Get migration statistics
 */
migrationsRouter.get('/stats', (req: Request, res: Response) => {
  try {
    const stats = migrationsOps.getMigrationStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[Migrations] Stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get migration stats',
    });
  }
});

/**
 * GET /api/v1/migrations/:id - Get migration by ID
 */
migrationsRouter.get('/:id', (req: Request, res: Response) => {
  try {
    const migration = migrationsOps.getTokenMigrationById(req.params.id);

    if (!migration) {
      return res.status(404).json({
        success: false,
        error: 'Migration not found',
      });
    }

    res.json({
      success: true,
      data: migration,
    });
  } catch (error) {
    console.error('[Migrations] Get error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get migration',
    });
  }
});

/**
 * POST /api/v1/migrations - Record a migration (internal use)
 */
migrationsRouter.post('/', (req: Request, res: Response) => {
  try {
    const {
      oldMint,
      newMint,
      oldSymbol,
      newSymbol,
      migrationType,
      rankingScore,
      godWalletCount,
      volume24h,
      marketCap,
      metadata,
    } = req.body;

    if (!oldMint || !newMint || !migrationType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: oldMint, newMint, migrationType',
      });
    }

    if (!VALID_MIGRATION_TYPES.includes(migrationType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid migrationType. Must be one of: ${VALID_MIGRATION_TYPES.join(', ')}`,
      });
    }

    // Check if migration already exists
    const existing = migrationsOps.getTokenMigrationByMints(oldMint, newMint);
    if (existing) {
      // Update existing migration
      const updated = migrationsOps.updateMigrationMetrics(existing.id, {
        rankingScore,
        godWalletCount,
        volume24h,
        marketCap,
        metadata,
      });

      return res.json({
        success: true,
        data: updated,
        updated: true,
      });
    }

    const now = Date.now();
    const migration: TokenMigration = {
      id: uuidv4(),
      oldMint,
      newMint,
      oldSymbol,
      newSymbol,
      migrationType,
      detectedAt: now,
      rankingScore: rankingScore || 0,
      godWalletCount: godWalletCount || 0,
      volume24h: volume24h || 0,
      marketCap: marketCap || 0,
      metadata,
      createdAt: now,
    };

    const created = migrationsOps.createTokenMigration(migration);

    // Emit WebSocket event
    const io = req.app.locals.io;
    io?.emit('migration_detected', {
      type: 'migration_detected',
      timestamp: now,
      data: created,
    });

    res.status(201).json({
      success: true,
      data: created,
      created: true,
    });
  } catch (error) {
    console.error('[Migrations] Create error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record migration',
    });
  }
});

/**
 * PUT /api/v1/migrations/:id - Update migration metrics (internal use)
 */
migrationsRouter.put('/:id', (req: Request, res: Response) => {
  try {
    const { rankingScore, godWalletCount, volume24h, marketCap, metadata } = req.body;

    const migration = migrationsOps.getTokenMigrationById(req.params.id);

    if (!migration) {
      return res.status(404).json({
        success: false,
        error: 'Migration not found',
      });
    }

    const updated = migrationsOps.updateMigrationMetrics(req.params.id, {
      rankingScore,
      godWalletCount,
      volume24h,
      marketCap,
      metadata,
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('[Migrations] Update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update migration',
    });
  }
});

/**
 * POST /api/v1/migrations/cleanup - Cleanup old migrations (internal use)
 */
migrationsRouter.post('/cleanup', (req: Request, res: Response) => {
  try {
    const olderThanDays = parseInt(req.body.olderThanDays as string) || 30;

    const deletedCount = migrationsOps.cleanupOldMigrations(olderThanDays);

    res.json({
      success: true,
      data: {
        deleted: deletedCount,
        olderThanDays,
      },
    });
  } catch (error) {
    console.error('[Migrations] Cleanup error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup old migrations',
    });
  }
});
