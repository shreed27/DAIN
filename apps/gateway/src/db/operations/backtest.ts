import { getDb } from '../index';
import { randomUUID } from 'crypto';

// Types
export interface BacktestRun {
  id: string;
  userWallet: string;
  name: string;
  strategy: string;
  symbol: string;
  startDate: number;
  endDate: number;
  initialCapital: number;
  parameters: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BacktestResult {
  id: string;
  backtestId: string;
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  avgHoldingPeriod: number;
  equityCurve: string; // JSON array of {timestamp, equity}
  drawdownCurve: string; // JSON array of {timestamp, drawdown}
  trades: string; // JSON array of trades
  createdAt: number;
}

export interface BacktestStrategy {
  id: string;
  name: string;
  description: string;
  category: string;
  parameters: string; // JSON schema for parameters
  defaultParams: string; // JSON default values
  createdAt: number;
}

// Row mappers
function rowToBacktestRun(row: Record<string, unknown>): BacktestRun {
  return {
    id: row.id as string,
    userWallet: row.user_wallet as string,
    name: row.name as string,
    strategy: row.strategy as string,
    symbol: row.symbol as string,
    startDate: row.start_date as number,
    endDate: row.end_date as number,
    initialCapital: row.initial_capital as number,
    parameters: JSON.parse(row.parameters as string || '{}'),
    status: row.status as BacktestRun['status'],
    progress: row.progress as number,
    error: row.error as string | undefined,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function rowToBacktestResult(row: Record<string, unknown>): BacktestResult {
  return {
    id: row.id as string,
    backtestId: row.backtest_id as string,
    totalReturn: row.total_return as number,
    annualizedReturn: row.annualized_return as number,
    maxDrawdown: row.max_drawdown as number,
    sharpeRatio: row.sharpe_ratio as number,
    sortinoRatio: row.sortino_ratio as number,
    winRate: row.win_rate as number,
    profitFactor: row.profit_factor as number,
    totalTrades: row.total_trades as number,
    winningTrades: row.winning_trades as number,
    losingTrades: row.losing_trades as number,
    avgWin: row.avg_win as number,
    avgLoss: row.avg_loss as number,
    largestWin: row.largest_win as number,
    largestLoss: row.largest_loss as number,
    avgHoldingPeriod: row.avg_holding_period as number,
    equityCurve: row.equity_curve as string,
    drawdownCurve: row.drawdown_curve as string,
    trades: row.trades as string,
    createdAt: row.created_at as number,
  };
}

// Backtest run operations
export function createBacktestRun(
  run: Omit<BacktestRun, 'id' | 'status' | 'progress' | 'createdAt' | 'updatedAt'>
): BacktestRun {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO backtest_runs (
      id, user_wallet, name, strategy, symbol, start_date, end_date,
      initial_capital, parameters, status, progress, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)
  `);

  stmt.run(
    id, run.userWallet, run.name, run.strategy, run.symbol,
    run.startDate, run.endDate, run.initialCapital,
    JSON.stringify(run.parameters), now, now
  );

  return {
    ...run,
    id,
    status: 'pending',
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function getBacktestRunById(id: string): BacktestRun | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM backtest_runs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToBacktestRun(row) : null;
}

export function getBacktestRunsByWallet(
  userWallet: string,
  options?: { strategy?: string; status?: string; limit?: number }
): BacktestRun[] {
  const db = getDb();
  let query = 'SELECT * FROM backtest_runs WHERE user_wallet = ?';
  const params: (string | number)[] = [userWallet];

  if (options?.strategy) {
    query += ' AND strategy = ?';
    params.push(options.strategy);
  }
  if (options?.status) {
    query += ' AND status = ?';
    params.push(options.status);
  }

  query += ' ORDER BY created_at DESC';

  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
  return rows.map(rowToBacktestRun);
}

export function updateBacktestRun(
  id: string,
  updates: Partial<Pick<BacktestRun, 'status' | 'progress' | 'error'>>
): BacktestRun | null {
  const db = getDb();
  const now = Date.now();
  const setClauses: string[] = ['updated_at = ?'];
  const params: (string | number | null)[] = [now];

  if (updates.status !== undefined) {
    setClauses.push('status = ?');
    params.push(updates.status);
  }
  if (updates.progress !== undefined) {
    setClauses.push('progress = ?');
    params.push(updates.progress);
  }
  if (updates.error !== undefined) {
    setClauses.push('error = ?');
    params.push(updates.error);
  }

  params.push(id);
  db.prepare(`UPDATE backtest_runs SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

  return getBacktestRunById(id);
}

export function deleteBacktestRun(id: string): boolean {
  const db = getDb();
  // Delete results first
  db.prepare('DELETE FROM backtest_results WHERE backtest_id = ?').run(id);
  const result = db.prepare('DELETE FROM backtest_runs WHERE id = ?').run(id);
  return result.changes > 0;
}

// Result operations
export function saveBacktestResult(
  result: Omit<BacktestResult, 'id' | 'createdAt'>
): BacktestResult {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO backtest_results (
      id, backtest_id, total_return, annualized_return, max_drawdown,
      sharpe_ratio, sortino_ratio, win_rate, profit_factor, total_trades,
      winning_trades, losing_trades, avg_win, avg_loss, largest_win,
      largest_loss, avg_holding_period, equity_curve, drawdown_curve,
      trades, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, result.backtestId, result.totalReturn, result.annualizedReturn,
    result.maxDrawdown, result.sharpeRatio, result.sortinoRatio, result.winRate,
    result.profitFactor, result.totalTrades, result.winningTrades,
    result.losingTrades, result.avgWin, result.avgLoss, result.largestWin,
    result.largestLoss, result.avgHoldingPeriod, result.equityCurve,
    result.drawdownCurve, result.trades, now
  );

  // Update run status to completed
  updateBacktestRun(result.backtestId, { status: 'completed', progress: 100 });

  return { ...result, id, createdAt: now };
}

export function getBacktestResult(backtestId: string): BacktestResult | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM backtest_results WHERE backtest_id = ?').get(backtestId) as Record<string, unknown> | undefined;
  return row ? rowToBacktestResult(row) : null;
}

// Strategy operations
export function getAvailableStrategies(): BacktestStrategy[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM backtest_strategies ORDER BY category, name').all() as Record<string, unknown>[];

  return rows.map(row => ({
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    category: row.category as string,
    parameters: row.parameters as string,
    defaultParams: row.default_params as string,
    createdAt: row.created_at as number,
  }));
}

export function createStrategy(
  strategy: Omit<BacktestStrategy, 'id' | 'createdAt'>
): BacktestStrategy {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO backtest_strategies (
      id, name, description, category, parameters, default_params, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, strategy.name, strategy.description, strategy.category,
    strategy.parameters, strategy.defaultParams, now
  );

  return { ...strategy, id, createdAt: now };
}

// Seed default strategies
export function seedDefaultStrategies(): void {
  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) as count FROM backtest_strategies').get() as { count: number };

  if (existing.count > 0) return;

  const strategies = [
    {
      name: 'SMA Crossover',
      description: 'Classic moving average crossover strategy using fast and slow SMAs',
      category: 'trend_following',
      parameters: JSON.stringify({
        fastPeriod: { type: 'number', min: 5, max: 50, default: 10 },
        slowPeriod: { type: 'number', min: 20, max: 200, default: 50 },
      }),
      defaultParams: JSON.stringify({ fastPeriod: 10, slowPeriod: 50 }),
    },
    {
      name: 'RSI Mean Reversion',
      description: 'Buy oversold (RSI < 30), sell overbought (RSI > 70)',
      category: 'mean_reversion',
      parameters: JSON.stringify({
        period: { type: 'number', min: 7, max: 21, default: 14 },
        oversold: { type: 'number', min: 20, max: 40, default: 30 },
        overbought: { type: 'number', min: 60, max: 80, default: 70 },
      }),
      defaultParams: JSON.stringify({ period: 14, oversold: 30, overbought: 70 }),
    },
    {
      name: 'Bollinger Bands',
      description: 'Trade bounces off Bollinger Bands with configurable deviation',
      category: 'mean_reversion',
      parameters: JSON.stringify({
        period: { type: 'number', min: 10, max: 50, default: 20 },
        stdDev: { type: 'number', min: 1, max: 3, default: 2 },
      }),
      defaultParams: JSON.stringify({ period: 20, stdDev: 2 }),
    },
    {
      name: 'MACD Strategy',
      description: 'Trade MACD crossovers and histogram divergences',
      category: 'trend_following',
      parameters: JSON.stringify({
        fastPeriod: { type: 'number', min: 8, max: 16, default: 12 },
        slowPeriod: { type: 'number', min: 20, max: 30, default: 26 },
        signalPeriod: { type: 'number', min: 7, max: 12, default: 9 },
      }),
      defaultParams: JSON.stringify({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }),
    },
    {
      name: 'Momentum Breakout',
      description: 'Enter on breakouts above N-period highs with volume confirmation',
      category: 'breakout',
      parameters: JSON.stringify({
        lookbackPeriod: { type: 'number', min: 10, max: 50, default: 20 },
        volumeMultiplier: { type: 'number', min: 1.5, max: 3, default: 2 },
      }),
      defaultParams: JSON.stringify({ lookbackPeriod: 20, volumeMultiplier: 2 }),
    },
    {
      name: 'Grid Trading',
      description: 'Place orders at fixed intervals around current price',
      category: 'market_making',
      parameters: JSON.stringify({
        gridLevels: { type: 'number', min: 3, max: 20, default: 10 },
        gridSpacing: { type: 'number', min: 0.5, max: 5, default: 1 },
      }),
      defaultParams: JSON.stringify({ gridLevels: 10, gridSpacing: 1 }),
    },
  ];

  for (const strategy of strategies) {
    createStrategy(strategy);
  }
}

// Comparison
export function compareBacktests(backtestIds: string[]): {
  runs: BacktestRun[];
  results: BacktestResult[];
} {
  const db = getDb();
  const placeholders = backtestIds.map(() => '?').join(',');

  const runs = db.prepare(`SELECT * FROM backtest_runs WHERE id IN (${placeholders})`).all(...backtestIds) as Record<string, unknown>[];
  const results = db.prepare(`SELECT * FROM backtest_results WHERE backtest_id IN (${placeholders})`).all(...backtestIds) as Record<string, unknown>[];

  return {
    runs: runs.map(rowToBacktestRun),
    results: results.map(rowToBacktestResult),
  };
}
