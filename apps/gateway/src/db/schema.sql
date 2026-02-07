-- Super Trading Platform Gateway Database Schema
-- SQLite with WAL mode for better concurrency

-- Agents table - stores agent configurations and performance metrics
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('main', 'trading', 'research', 'alerts')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'stopped', 'error')),
  strategy_id TEXT,
  wallet_address TEXT,
  config TEXT NOT NULL, -- JSON blob for AgentConfig
  performance TEXT NOT NULL, -- JSON blob for AgentPerformance
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(type);

-- Bounties table - bounty records with escrow information
CREATE TABLE IF NOT EXISTS bounties (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  description TEXT,
  reward_amount REAL NOT NULL,
  reward_token TEXT NOT NULL CHECK (reward_token IN ('SOL', 'USDC')),
  poster_wallet TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'submitted', 'completed', 'expired', 'cancelled')),
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard', 'expert')),
  tags TEXT NOT NULL DEFAULT '[]', -- JSON array
  deadline TEXT NOT NULL,
  escrow_tx TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bounties_status ON bounties(status);
CREATE INDEX IF NOT EXISTS idx_bounties_poster ON bounties(poster_wallet);
CREATE INDEX IF NOT EXISTS idx_bounties_difficulty ON bounties(difficulty);

-- Bounty claims - active claims on bounties
CREATE TABLE IF NOT EXISTS bounty_claims (
  id TEXT PRIMARY KEY,
  bounty_id TEXT NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
  hunter_wallet TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE(bounty_id, hunter_wallet)
);

CREATE INDEX IF NOT EXISTS idx_claims_bounty ON bounty_claims(bounty_id);
CREATE INDEX IF NOT EXISTS idx_claims_hunter ON bounty_claims(hunter_wallet);

-- Bounty submissions - submitted solutions
CREATE TABLE IF NOT EXISTS bounty_submissions (
  id TEXT PRIMARY KEY,
  bounty_id TEXT NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
  hunter_wallet TEXT NOT NULL,
  solution TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 80,
  submitted_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_submissions_bounty ON bounty_submissions(bounty_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON bounty_submissions(status);

-- Signals table - signal history with TTL support
CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('osint', 'whale', 'ai', 'arbitrage', 'social', 'onchain', 'god_wallet')),
  type TEXT NOT NULL,
  data TEXT NOT NULL, -- JSON blob
  confidence REAL NOT NULL DEFAULT 50,
  timestamp INTEGER NOT NULL,
  expires_at INTEGER,
  metadata TEXT -- JSON blob
);

CREATE INDEX IF NOT EXISTS idx_signals_source ON signals(source);
CREATE INDEX IF NOT EXISTS idx_signals_type ON signals(type);
CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON signals(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_signals_expires ON signals(expires_at) WHERE expires_at IS NOT NULL;

-- Positions table - open trading positions
CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  token TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN ('solana', 'base', 'ethereum', 'arbitrum', 'polygon')),
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  amount REAL NOT NULL,
  entry_price REAL NOT NULL,
  current_price REAL NOT NULL,
  unrealized_pnl REAL NOT NULL DEFAULT 0,
  unrealized_pnl_percent REAL NOT NULL DEFAULT 0,
  stop_loss REAL,
  take_profit REAL,
  take_profit_levels TEXT, -- JSON array
  opened_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_positions_agent ON positions(agent_id);
CREATE INDEX IF NOT EXISTS idx_positions_token ON positions(token);
CREATE INDEX IF NOT EXISTS idx_positions_chain ON positions(chain);

-- Trade intents - execution intents
CREATE TABLE IF NOT EXISTS trade_intents (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  strategy_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('buy', 'sell', 'close')),
  market_type TEXT NOT NULL CHECK (market_type IN ('dex', 'prediction_market', 'futures')),
  chain TEXT NOT NULL,
  asset TEXT NOT NULL,
  amount REAL NOT NULL,
  constraints TEXT, -- JSON blob for TradeConstraints
  signal_ids TEXT, -- JSON array
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'routing', 'executing', 'completed', 'failed', 'cancelled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_intents_agent ON trade_intents(agent_id);
CREATE INDEX IF NOT EXISTS idx_intents_status ON trade_intents(status);
CREATE INDEX IF NOT EXISTS idx_intents_created ON trade_intents(created_at DESC);

-- Execution results - trade history
CREATE TABLE IF NOT EXISTS execution_results (
  id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0,
  tx_hash TEXT,
  order_id TEXT,
  executed_amount REAL NOT NULL,
  executed_price REAL NOT NULL,
  fees REAL NOT NULL DEFAULT 0,
  slippage REAL NOT NULL DEFAULT 0,
  execution_time_ms INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  route TEXT NOT NULL, -- JSON blob for ExecutionRoute
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_results_intent ON execution_results(intent_id);
CREATE INDEX IF NOT EXISTS idx_results_success ON execution_results(success);
CREATE INDEX IF NOT EXISTS idx_results_created ON execution_results(created_at DESC);

-- Escrow transactions - for bounty escrow tracking
CREATE TABLE IF NOT EXISTS escrow_transactions (
  id TEXT PRIMARY KEY,
  bounty_id TEXT REFERENCES bounties(id),
  type TEXT NOT NULL CHECK (type IN ('deposit', 'payout', 'refund')),
  from_wallet TEXT NOT NULL,
  to_wallet TEXT NOT NULL,
  amount REAL NOT NULL,
  token TEXT NOT NULL,
  fee_amount REAL NOT NULL DEFAULT 0,
  net_amount REAL NOT NULL,
  tx_signature TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_escrow_bounty ON escrow_transactions(bounty_id);
CREATE INDEX IF NOT EXISTS idx_escrow_type ON escrow_transactions(type);

-- User integrations table - stores connected platforms and credentials
CREATE TABLE IF NOT EXISTS user_integrations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('messaging', 'exchange', 'prediction')),
  credentials_encrypted TEXT,
  config TEXT, -- JSON blob for platform-specific settings
  status TEXT DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error')),
  last_connected_at INTEGER,
  last_error TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  UNIQUE(user_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_integrations_user ON user_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_integrations_platform ON user_integrations(platform);
CREATE INDEX IF NOT EXISTS idx_integrations_status ON user_integrations(status);

-- Integration notification settings - per-platform notification preferences
CREATE TABLE IF NOT EXISTS integration_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('trade_executed', 'signal_received', 'whale_alert', 'price_alert', 'agent_status', 'bounty_update')),
  enabled INTEGER DEFAULT 1,
  config TEXT, -- JSON blob for event-specific settings (e.g., quiet hours)
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  UNIQUE(user_id, platform, event_type)
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON integration_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_platform ON integration_notifications(platform);
CREATE INDEX IF NOT EXISTS idx_notifications_event ON integration_notifications(event_type);

-- ==================== New Feature Tables ====================

-- Limit Orders table - for automated order execution
CREATE TABLE IF NOT EXISTS limit_orders (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  wallet_address TEXT NOT NULL,
  input_mint TEXT NOT NULL,
  output_mint TEXT NOT NULL,
  input_amount REAL NOT NULL,
  target_price REAL NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('above', 'below')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'triggered', 'executed', 'cancelled', 'expired')),
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  triggered_at INTEGER,
  executed_at INTEGER,
  tx_signature TEXT,
  slippage_bps INTEGER DEFAULT 100
);

CREATE INDEX IF NOT EXISTS idx_limit_orders_wallet ON limit_orders(wallet_address);
CREATE INDEX IF NOT EXISTS idx_limit_orders_status ON limit_orders(status);
CREATE INDEX IF NOT EXISTS idx_limit_orders_expires ON limit_orders(expires_at) WHERE expires_at IS NOT NULL;

-- Hunter Reputation table - track hunter performance and achievements
CREATE TABLE IF NOT EXISTS hunter_reputation (
  wallet_address TEXT PRIMARY KEY,
  rank TEXT NOT NULL DEFAULT 'Novice' CHECK (rank IN ('Novice', 'Apprentice', 'Investigator', 'Detective', 'Expert', 'Master', 'Legend')),
  total_earnings REAL NOT NULL DEFAULT 0,
  bounties_completed INTEGER NOT NULL DEFAULT 0,
  bounties_attempted INTEGER NOT NULL DEFAULT 0,
  success_rate REAL NOT NULL DEFAULT 0,
  avg_completion_time_hours REAL,
  specializations TEXT DEFAULT '[]', -- JSON array of tags
  badges TEXT DEFAULT '[]', -- JSON array of badge objects
  streak_current INTEGER DEFAULT 0,
  streak_best INTEGER DEFAULT 0,
  reputation_score REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hunter_reputation_rank ON hunter_reputation(rank);
CREATE INDEX IF NOT EXISTS idx_hunter_reputation_score ON hunter_reputation(reputation_score DESC);
CREATE INDEX IF NOT EXISTS idx_hunter_reputation_earnings ON hunter_reputation(total_earnings DESC);

-- Trade Ledger table - immutable decision audit trail
CREATE TABLE IF NOT EXISTS trade_ledger (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  wallet_address TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('buy', 'sell', 'close', 'open_position', 'close_position', 'adjust_sl', 'adjust_tp')),
  token TEXT NOT NULL,
  token_symbol TEXT,
  chain TEXT NOT NULL,
  amount REAL NOT NULL,
  price REAL NOT NULL,
  decision_source TEXT NOT NULL CHECK (decision_source IN ('manual', 'ai', 'signal', 'copy_trade', 'automation', 'limit_order')),
  reasoning TEXT, -- AI reasoning or decision rationale
  confidence REAL, -- 0-100
  signal_ids TEXT, -- JSON array of contributing signal IDs
  position_id TEXT,
  tx_signature TEXT,
  fees REAL DEFAULT 0,
  slippage REAL DEFAULT 0,
  pnl REAL, -- realized PnL if closing
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_wallet ON trade_ledger(wallet_address);
CREATE INDEX IF NOT EXISTS idx_ledger_agent ON trade_ledger(agent_id);
CREATE INDEX IF NOT EXISTS idx_ledger_token ON trade_ledger(token);
CREATE INDEX IF NOT EXISTS idx_ledger_created ON trade_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_source ON trade_ledger(decision_source);

-- Copy Trading Configurations table
CREATE TABLE IF NOT EXISTS copy_trading_configs (
  id TEXT PRIMARY KEY,
  user_wallet TEXT NOT NULL,
  target_wallet TEXT NOT NULL,
  target_label TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  allocation_percent REAL NOT NULL DEFAULT 10, -- percentage of portfolio to allocate
  max_position_size REAL, -- max USD per trade
  min_position_size REAL DEFAULT 10, -- min USD per trade
  follow_sells INTEGER DEFAULT 1,
  follow_buys INTEGER DEFAULT 1,
  delay_seconds INTEGER DEFAULT 0, -- delay before copying
  stop_loss_percent REAL, -- auto SL
  take_profit_percent REAL, -- auto TP
  max_daily_trades INTEGER DEFAULT 20,
  trades_today INTEGER DEFAULT 0,
  last_trade_at INTEGER,
  total_trades INTEGER DEFAULT 0,
  total_pnl REAL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_wallet, target_wallet)
);

CREATE INDEX IF NOT EXISTS idx_copy_trading_user ON copy_trading_configs(user_wallet);
CREATE INDEX IF NOT EXISTS idx_copy_trading_target ON copy_trading_configs(target_wallet);
CREATE INDEX IF NOT EXISTS idx_copy_trading_enabled ON copy_trading_configs(enabled);

-- Copy Trading History table
CREATE TABLE IF NOT EXISTS copy_trading_history (
  id TEXT PRIMARY KEY,
  config_id TEXT NOT NULL REFERENCES copy_trading_configs(id),
  original_tx TEXT NOT NULL,
  copied_tx TEXT,
  target_wallet TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('buy', 'sell')),
  token TEXT NOT NULL,
  original_amount REAL NOT NULL,
  copied_amount REAL,
  original_price REAL NOT NULL,
  copied_price REAL,
  slippage REAL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'failed', 'skipped')),
  skip_reason TEXT,
  pnl REAL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_copy_history_config ON copy_trading_history(config_id);
CREATE INDEX IF NOT EXISTS idx_copy_history_status ON copy_trading_history(status);

-- Automation Rules table (Cron-like scheduling)
CREATE TABLE IF NOT EXISTS automation_rules (
  id TEXT PRIMARY KEY,
  user_wallet TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('scheduled', 'price_trigger', 'condition', 'recurring')),
  trigger_config TEXT NOT NULL, -- JSON: cron expression, price conditions, etc.
  action_config TEXT NOT NULL, -- JSON: what to do when triggered
  enabled INTEGER NOT NULL DEFAULT 1,
  last_triggered_at INTEGER,
  next_trigger_at INTEGER,
  trigger_count INTEGER DEFAULT 0,
  max_triggers INTEGER, -- null = unlimited
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_automation_user ON automation_rules(user_wallet);
CREATE INDEX IF NOT EXISTS idx_automation_enabled ON automation_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_automation_type ON automation_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_automation_next ON automation_rules(next_trigger_at) WHERE enabled = 1;

-- Automation History table
CREATE TABLE IF NOT EXISTS automation_history (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES automation_rules(id),
  triggered_at INTEGER NOT NULL,
  trigger_reason TEXT,
  action_taken TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('success', 'failed', 'skipped')),
  result_data TEXT, -- JSON: execution details
  error TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_automation_history_rule ON automation_history(rule_id);
CREATE INDEX IF NOT EXISTS idx_automation_history_triggered ON automation_history(triggered_at DESC);

-- Price History table (OHLCV data)
CREATE TABLE IF NOT EXISTS price_history (
  id TEXT PRIMARY KEY,
  token_mint TEXT NOT NULL,
  interval TEXT NOT NULL CHECK (interval IN ('1m', '5m', '15m', '1h', '4h', '1d')),
  timestamp INTEGER NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL DEFAULT 0,
  UNIQUE(token_mint, interval, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_price_history_token ON price_history(token_mint);
CREATE INDEX IF NOT EXISTS idx_price_history_interval ON price_history(interval);
CREATE INDEX IF NOT EXISTS idx_price_history_timestamp ON price_history(timestamp DESC);

-- Migration Detection table
CREATE TABLE IF NOT EXISTS token_migrations (
  id TEXT PRIMARY KEY,
  old_mint TEXT NOT NULL,
  new_mint TEXT NOT NULL,
  old_symbol TEXT,
  new_symbol TEXT,
  migration_type TEXT NOT NULL CHECK (migration_type IN ('pump_to_raydium', 'bonding_curve', 'upgrade', 'rebrand', 'other')),
  detected_at INTEGER NOT NULL,
  ranking_score REAL DEFAULT 0,
  god_wallet_count INTEGER DEFAULT 0,
  volume_24h REAL DEFAULT 0,
  market_cap REAL DEFAULT 0,
  metadata TEXT, -- JSON for additional data
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_migrations_detected ON token_migrations(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_migrations_ranking ON token_migrations(ranking_score DESC);
CREATE INDEX IF NOT EXISTS idx_migrations_old_mint ON token_migrations(old_mint);
CREATE INDEX IF NOT EXISTS idx_migrations_new_mint ON token_migrations(new_mint);

-- ==================== Phase 2: Advanced Feature Tables ====================

-- Futures Positions table - leveraged trading positions
CREATE TABLE IF NOT EXISTS futures_positions (
  id TEXT PRIMARY KEY,
  user_wallet TEXT NOT NULL,
  exchange TEXT NOT NULL CHECK (exchange IN ('binance', 'bybit', 'hyperliquid', 'mexc')),
  symbol TEXT NOT NULL, -- e.g., 'BTCUSDT'
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  leverage INTEGER NOT NULL DEFAULT 10,
  size REAL NOT NULL, -- position size in base currency
  entry_price REAL NOT NULL,
  mark_price REAL,
  liquidation_price REAL,
  unrealized_pnl REAL DEFAULT 0,
  realized_pnl REAL DEFAULT 0,
  margin REAL NOT NULL, -- collateral used
  margin_type TEXT DEFAULT 'isolated' CHECK (margin_type IN ('isolated', 'cross')),
  stop_loss REAL,
  take_profit REAL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'liquidated')),
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_futures_positions_wallet ON futures_positions(user_wallet);
CREATE INDEX IF NOT EXISTS idx_futures_positions_exchange ON futures_positions(exchange);
CREATE INDEX IF NOT EXISTS idx_futures_positions_status ON futures_positions(status);
CREATE INDEX IF NOT EXISTS idx_futures_positions_symbol ON futures_positions(symbol);

-- Futures Orders table
CREATE TABLE IF NOT EXISTS futures_orders (
  id TEXT PRIMARY KEY,
  user_wallet TEXT NOT NULL,
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  order_type TEXT NOT NULL CHECK (order_type IN ('market', 'limit', 'stop_market', 'stop_limit', 'take_profit', 'take_profit_limit')),
  quantity REAL NOT NULL,
  price REAL, -- null for market orders
  stop_price REAL, -- for stop orders
  leverage INTEGER NOT NULL DEFAULT 10,
  reduce_only INTEGER DEFAULT 0,
  time_in_force TEXT DEFAULT 'GTC' CHECK (time_in_force IN ('GTC', 'IOC', 'FOK', 'GTX')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'open', 'filled', 'partially_filled', 'cancelled', 'rejected', 'expired')),
  filled_quantity REAL DEFAULT 0,
  avg_fill_price REAL,
  exchange_order_id TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_futures_orders_wallet ON futures_orders(user_wallet);
CREATE INDEX IF NOT EXISTS idx_futures_orders_exchange ON futures_orders(exchange);
CREATE INDEX IF NOT EXISTS idx_futures_orders_status ON futures_orders(status);
CREATE INDEX IF NOT EXISTS idx_futures_orders_symbol ON futures_orders(symbol);

-- Exchange Credentials table (encrypted)
CREATE TABLE IF NOT EXISTS exchange_credentials (
  id TEXT PRIMARY KEY,
  user_wallet TEXT NOT NULL,
  exchange TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  api_secret_encrypted TEXT NOT NULL,
  passphrase_encrypted TEXT, -- for some exchanges
  is_testnet INTEGER DEFAULT 0,
  permissions TEXT DEFAULT '[]', -- JSON array of allowed permissions
  last_used_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_wallet, exchange)
);

CREATE INDEX IF NOT EXISTS idx_exchange_creds_wallet ON exchange_credentials(user_wallet);
CREATE INDEX IF NOT EXISTS idx_exchange_creds_exchange ON exchange_credentials(exchange);

-- Arbitrage Opportunities table
CREATE TABLE IF NOT EXISTS arbitrage_opportunities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('internal', 'cross_platform', 'combinatorial', 'semantic')),
  platform_a TEXT NOT NULL,
  platform_b TEXT,
  market_a TEXT NOT NULL, -- market/question identifier
  market_b TEXT,
  question_text TEXT,
  price_a REAL NOT NULL,
  price_b REAL,
  spread REAL NOT NULL, -- percentage spread
  expected_profit REAL NOT NULL,
  confidence REAL DEFAULT 50,
  liquidity_score REAL DEFAULT 50,
  risk_score REAL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'executed', 'missed')),
  expires_at INTEGER,
  detected_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_arb_opportunities_type ON arbitrage_opportunities(type);
CREATE INDEX IF NOT EXISTS idx_arb_opportunities_status ON arbitrage_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_arb_opportunities_spread ON arbitrage_opportunities(spread DESC);
CREATE INDEX IF NOT EXISTS idx_arb_opportunities_detected ON arbitrage_opportunities(detected_at DESC);

-- Arbitrage Executions table
CREATE TABLE IF NOT EXISTS arbitrage_executions (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES arbitrage_opportunities(id),
  user_wallet TEXT NOT NULL,
  leg_a_tx TEXT,
  leg_b_tx TEXT,
  leg_a_amount REAL NOT NULL,
  leg_b_amount REAL,
  leg_a_price REAL NOT NULL,
  leg_b_price REAL,
  expected_profit REAL NOT NULL,
  actual_profit REAL,
  fees REAL DEFAULT 0,
  slippage REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'completed', 'failed')),
  error TEXT,
  executed_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_arb_executions_opportunity ON arbitrage_executions(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_arb_executions_wallet ON arbitrage_executions(user_wallet);
CREATE INDEX IF NOT EXISTS idx_arb_executions_status ON arbitrage_executions(status);

-- Backtest Runs table
CREATE TABLE IF NOT EXISTS backtest_runs (
  id TEXT PRIMARY KEY,
  user_wallet TEXT NOT NULL,
  name TEXT NOT NULL,
  strategy_id TEXT NOT NULL,
  strategy_name TEXT NOT NULL,
  strategy_config TEXT NOT NULL, -- JSON config
  start_date INTEGER NOT NULL,
  end_date INTEGER NOT NULL,
  initial_capital REAL NOT NULL DEFAULT 10000,
  symbols TEXT NOT NULL, -- JSON array of symbols
  timeframe TEXT NOT NULL DEFAULT '1h',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  progress REAL DEFAULT 0, -- 0-100
  error TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_backtest_runs_wallet ON backtest_runs(user_wallet);
CREATE INDEX IF NOT EXISTS idx_backtest_runs_status ON backtest_runs(status);
CREATE INDEX IF NOT EXISTS idx_backtest_runs_strategy ON backtest_runs(strategy_id);

-- Backtest Results table
CREATE TABLE IF NOT EXISTS backtest_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
  total_return REAL NOT NULL,
  total_return_percent REAL NOT NULL,
  sharpe_ratio REAL,
  sortino_ratio REAL,
  max_drawdown REAL NOT NULL,
  max_drawdown_percent REAL NOT NULL,
  win_rate REAL NOT NULL,
  profit_factor REAL,
  total_trades INTEGER NOT NULL,
  winning_trades INTEGER NOT NULL,
  losing_trades INTEGER NOT NULL,
  avg_trade_return REAL,
  avg_win REAL,
  avg_loss REAL,
  largest_win REAL,
  largest_loss REAL,
  avg_holding_period_hours REAL,
  equity_curve TEXT NOT NULL, -- JSON array of {timestamp, equity}
  trades TEXT NOT NULL, -- JSON array of individual trades
  monthly_returns TEXT, -- JSON object of month -> return
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_backtest_results_run ON backtest_results(run_id);

-- Risk Metrics table
CREATE TABLE IF NOT EXISTS risk_metrics (
  id TEXT PRIMARY KEY,
  user_wallet TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  portfolio_value REAL NOT NULL,
  var_95 REAL, -- 95% Value at Risk
  var_99 REAL, -- 99% Value at Risk
  cvar_95 REAL, -- Conditional VaR (Expected Shortfall)
  cvar_99 REAL,
  volatility_daily REAL,
  volatility_regime TEXT CHECK (volatility_regime IN ('low', 'normal', 'elevated', 'extreme')),
  beta REAL,
  correlation_btc REAL,
  max_position_concentration REAL,
  leverage_ratio REAL DEFAULT 1,
  margin_usage REAL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_risk_metrics_wallet ON risk_metrics(user_wallet);
CREATE INDEX IF NOT EXISTS idx_risk_metrics_timestamp ON risk_metrics(timestamp DESC);

-- Circuit Breaker Config table
CREATE TABLE IF NOT EXISTS circuit_breaker_config (
  id TEXT PRIMARY KEY,
  user_wallet TEXT NOT NULL UNIQUE,
  enabled INTEGER DEFAULT 1,
  max_daily_loss_percent REAL DEFAULT 10,
  max_position_loss_percent REAL DEFAULT 25,
  max_drawdown_percent REAL DEFAULT 15,
  volatility_threshold REAL DEFAULT 50, -- pause if vol exceeds
  consecutive_losses_limit INTEGER DEFAULT 5,
  cooldown_minutes INTEGER DEFAULT 60,
  trip_count INTEGER DEFAULT 0,
  last_tripped_at INTEGER,
  last_trip_reason TEXT,
  status TEXT DEFAULT 'armed' CHECK (status IN ('armed', 'tripped', 'disabled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_circuit_breaker_wallet ON circuit_breaker_config(user_wallet);
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_status ON circuit_breaker_config(status);

-- Stress Test Results table
CREATE TABLE IF NOT EXISTS stress_test_results (
  id TEXT PRIMARY KEY,
  user_wallet TEXT NOT NULL,
  scenario_name TEXT NOT NULL,
  scenario_type TEXT NOT NULL CHECK (scenario_type IN ('historical', 'hypothetical', 'monte_carlo')),
  scenario_params TEXT NOT NULL, -- JSON config
  portfolio_impact_percent REAL NOT NULL,
  var_impact REAL,
  worst_position TEXT, -- most affected position
  worst_position_loss REAL,
  positions_at_risk INTEGER,
  recovery_time_estimate_days INTEGER,
  recommendations TEXT, -- JSON array of suggestions
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stress_test_wallet ON stress_test_results(user_wallet);
CREATE INDEX IF NOT EXISTS idx_stress_test_scenario ON stress_test_results(scenario_type);

-- Swarm Configs table
CREATE TABLE IF NOT EXISTS swarm_configs (
  id TEXT PRIMARY KEY,
  user_wallet TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  strategy_type TEXT NOT NULL CHECK (strategy_type IN ('copy_trade', 'arbitrage', 'signal', 'ai_builder', 'pump_fun')),
  wallet_count INTEGER NOT NULL DEFAULT 5,
  wallets TEXT NOT NULL, -- JSON array of wallet addresses
  total_capital REAL NOT NULL,
  per_wallet_capital REAL NOT NULL,
  coordination_mode TEXT DEFAULT 'sequential' CHECK (coordination_mode IN ('sequential', 'parallel', 'staggered')),
  stagger_delay_ms INTEGER DEFAULT 100,
  use_jito INTEGER DEFAULT 0, -- use Jito bundles
  jito_tip_lamports INTEGER DEFAULT 10000,
  enabled INTEGER DEFAULT 1,
  status TEXT DEFAULT 'idle' CHECK (status IN ('idle', 'active', 'executing', 'paused', 'error')),
  last_execution_at INTEGER,
  total_executions INTEGER DEFAULT 0,
  total_pnl REAL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_swarm_configs_wallet ON swarm_configs(user_wallet);
CREATE INDEX IF NOT EXISTS idx_swarm_configs_strategy ON swarm_configs(strategy_type);
CREATE INDEX IF NOT EXISTS idx_swarm_configs_status ON swarm_configs(status);

-- Swarm Executions table
CREATE TABLE IF NOT EXISTS swarm_executions (
  id TEXT PRIMARY KEY,
  swarm_id TEXT NOT NULL REFERENCES swarm_configs(id),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('manual', 'signal', 'copy', 'scheduled')),
  trigger_data TEXT, -- JSON context
  action TEXT NOT NULL CHECK (action IN ('buy', 'sell', 'close_all')),
  token TEXT NOT NULL,
  total_amount REAL NOT NULL,
  wallets_used INTEGER NOT NULL,
  successful_txs INTEGER DEFAULT 0,
  failed_txs INTEGER DEFAULT 0,
  tx_signatures TEXT, -- JSON array
  jito_bundle_id TEXT,
  avg_price REAL,
  total_fees REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executing', 'completed', 'partial', 'failed')),
  error TEXT,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_swarm_executions_swarm ON swarm_executions(swarm_id);
CREATE INDEX IF NOT EXISTS idx_swarm_executions_status ON swarm_executions(status);
CREATE INDEX IF NOT EXISTS idx_swarm_executions_token ON swarm_executions(token);

-- Agent Network Registry table (ClawdNet discovery)
CREATE TABLE IF NOT EXISTS agent_registry (
  id TEXT PRIMARY KEY,
  agent_address TEXT NOT NULL UNIQUE, -- on-chain identity
  name TEXT NOT NULL,
  description TEXT,
  capabilities TEXT NOT NULL, -- JSON array of capability strings
  pricing TEXT NOT NULL, -- JSON object of capability -> price in USDC
  reputation_score REAL DEFAULT 50,
  trust_level TEXT DEFAULT 'new' CHECK (trust_level IN ('new', 'building', 'established', 'trusted', 'elite')),
  total_jobs INTEGER DEFAULT 0,
  successful_jobs INTEGER DEFAULT 0,
  total_earnings REAL DEFAULT 0,
  status TEXT DEFAULT 'online' CHECK (status IN ('online', 'busy', 'offline')),
  last_heartbeat_at INTEGER,
  endpoint_url TEXT,
  supported_chains TEXT DEFAULT '["solana"]', -- JSON array
  metadata TEXT, -- JSON for additional data
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_registry_status ON agent_registry(status);
CREATE INDEX IF NOT EXISTS idx_agent_registry_reputation ON agent_registry(reputation_score DESC);
CREATE INDEX IF NOT EXISTS idx_agent_registry_trust ON agent_registry(trust_level);

-- Agent Subscriptions table
CREATE TABLE IF NOT EXISTS agent_subscriptions (
  id TEXT PRIMARY KEY,
  subscriber_wallet TEXT NOT NULL,
  agent_id TEXT NOT NULL REFERENCES agent_registry(id),
  capability TEXT NOT NULL,
  price_per_call REAL NOT NULL,
  calls_remaining INTEGER, -- null = unlimited
  total_calls INTEGER DEFAULT 0,
  total_spent REAL DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'exhausted')),
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(subscriber_wallet, agent_id, capability)
);

CREATE INDEX IF NOT EXISTS idx_agent_subscriptions_subscriber ON agent_subscriptions(subscriber_wallet);
CREATE INDEX IF NOT EXISTS idx_agent_subscriptions_agent ON agent_subscriptions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_subscriptions_status ON agent_subscriptions(status);

-- Agent Jobs table
CREATE TABLE IF NOT EXISTS agent_jobs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agent_registry(id),
  requester_wallet TEXT NOT NULL,
  capability TEXT NOT NULL,
  input_data TEXT NOT NULL, -- JSON request payload
  output_data TEXT, -- JSON response
  price REAL NOT NULL,
  payment_tx TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'running', 'completed', 'failed', 'disputed')),
  error TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_jobs_agent ON agent_jobs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_requester ON agent_jobs(requester_wallet);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_status ON agent_jobs(status);

-- Skills Registry table
CREATE TABLE IF NOT EXISTS skills_registry (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('trading', 'analysis', 'data', 'automation', 'risk', 'social', 'defi', 'nft', 'other')),
  description TEXT NOT NULL,
  version TEXT DEFAULT '1.0.0',
  author TEXT,
  input_schema TEXT, -- JSON Schema for inputs
  output_schema TEXT, -- JSON Schema for outputs
  dependencies TEXT DEFAULT '[]', -- JSON array of other skill names
  config_schema TEXT, -- JSON Schema for configuration
  execution_mode TEXT DEFAULT 'sync' CHECK (execution_mode IN ('sync', 'async', 'streaming')),
  avg_execution_time_ms INTEGER,
  usage_count INTEGER DEFAULT 0,
  success_rate REAL DEFAULT 100,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_skills_registry_category ON skills_registry(category);
CREATE INDEX IF NOT EXISTS idx_skills_registry_name ON skills_registry(name);
CREATE INDEX IF NOT EXISTS idx_skills_registry_enabled ON skills_registry(enabled);

-- Skill Executions table
CREATE TABLE IF NOT EXISTS skill_executions (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL REFERENCES skills_registry(id),
  user_wallet TEXT NOT NULL,
  input_data TEXT NOT NULL, -- JSON
  output_data TEXT, -- JSON
  config TEXT, -- JSON skill config used
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  execution_time_ms INTEGER,
  error TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_skill_executions_skill ON skill_executions(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_executions_user ON skill_executions(user_wallet);
CREATE INDEX IF NOT EXISTS idx_skill_executions_status ON skill_executions(status);

-- Survival Mode State table
CREATE TABLE IF NOT EXISTS survival_mode (
  id TEXT PRIMARY KEY,
  user_wallet TEXT NOT NULL UNIQUE,
  current_mode TEXT NOT NULL DEFAULT 'survival' CHECK (current_mode IN ('growth', 'survival', 'defensive', 'critical', 'hibernation')),
  pnl_24h REAL DEFAULT 0,
  pnl_7d REAL DEFAULT 0,
  pnl_30d REAL DEFAULT 0,
  peak_value REAL,
  current_value REAL,
  drawdown_percent REAL DEFAULT 0,
  mode_entered_at INTEGER,
  mode_history TEXT DEFAULT '[]', -- JSON array of {mode, entered_at, exited_at, pnl}
  auto_mode_enabled INTEGER DEFAULT 1,
  growth_threshold REAL DEFAULT 20, -- PnL % to enter growth mode
  defensive_threshold REAL DEFAULT -15, -- PnL % to enter defensive
  critical_threshold REAL DEFAULT -50, -- PnL % to enter critical
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_survival_mode_wallet ON survival_mode(user_wallet);
CREATE INDEX IF NOT EXISTS idx_survival_mode_current ON survival_mode(current_mode);

-- EVM Transactions table
CREATE TABLE IF NOT EXISTS evm_transactions (
  id TEXT PRIMARY KEY,
  user_wallet TEXT NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN ('ethereum', 'base', 'arbitrum', 'optimism', 'polygon')),
  tx_hash TEXT NOT NULL,
  tx_type TEXT NOT NULL CHECK (tx_type IN ('swap', 'bridge', 'approve', 'transfer', 'contract_call')),
  protocol TEXT, -- uniswap, 1inch, odos, wormhole, etc.
  from_token TEXT,
  to_token TEXT,
  from_amount REAL,
  to_amount REAL,
  gas_used INTEGER,
  gas_price_gwei REAL,
  gas_fee_usd REAL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  block_number INTEGER,
  error TEXT,
  created_at INTEGER NOT NULL,
  confirmed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_evm_transactions_wallet ON evm_transactions(user_wallet);
CREATE INDEX IF NOT EXISTS idx_evm_transactions_chain ON evm_transactions(chain);
CREATE INDEX IF NOT EXISTS idx_evm_transactions_status ON evm_transactions(status);
CREATE INDEX IF NOT EXISTS idx_evm_transactions_type ON evm_transactions(tx_type);

-- ==================== Phase 3: Additional Supporting Tables ====================

-- Arbitrage Config table - user settings for arbitrage detection
CREATE TABLE IF NOT EXISTS arbitrage_config (
  id TEXT PRIMARY KEY,
  user_wallet TEXT NOT NULL UNIQUE,
  enabled INTEGER DEFAULT 1,
  min_spread_percent REAL DEFAULT 1.0,
  max_capital_per_trade REAL DEFAULT 1000,
  allowed_platforms TEXT DEFAULT '[]', -- JSON array
  allowed_types TEXT DEFAULT '["internal", "cross_platform"]', -- JSON array
  auto_execute INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_arb_config_wallet ON arbitrage_config(user_wallet);

-- Backtest Strategies table - pre-defined strategy templates
CREATE TABLE IF NOT EXISTS backtest_strategies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('trend_following', 'mean_reversion', 'breakout', 'market_making', 'arbitrage', 'custom')),
  parameters TEXT NOT NULL, -- JSON schema for parameters
  default_params TEXT NOT NULL, -- JSON default values
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_backtest_strategies_category ON backtest_strategies(category);

-- Kill Switch Events table - emergency stop history
CREATE TABLE IF NOT EXISTS kill_switch_events (
  id TEXT PRIMARY KEY,
  user_wallet TEXT NOT NULL,
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('user', 'circuit_breaker', 'system')),
  reason TEXT NOT NULL,
  positions_closed INTEGER DEFAULT 0,
  orders_cancelled INTEGER DEFAULT 0,
  total_value REAL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kill_switch_wallet ON kill_switch_events(user_wallet);
CREATE INDEX IF NOT EXISTS idx_kill_switch_triggered_by ON kill_switch_events(triggered_by);

-- Swarm Wallets table - individual wallets in a swarm
CREATE TABLE IF NOT EXISTS swarm_wallets (
  id TEXT PRIMARY KEY,
  swarm_id TEXT NOT NULL REFERENCES swarm_configs(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  private_key_encrypted TEXT NOT NULL,
  weight REAL DEFAULT 1.0, -- allocation weight
  balance REAL DEFAULT 0,
  last_used_at INTEGER,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'low_balance')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(swarm_id, address)
);

CREATE INDEX IF NOT EXISTS idx_swarm_wallets_swarm ON swarm_wallets(swarm_id);
CREATE INDEX IF NOT EXISTS idx_swarm_wallets_status ON swarm_wallets(status);

-- Agent Messages table - A2A communication
CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  from_agent_id TEXT NOT NULL,
  to_agent_id TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('request', 'response', 'broadcast', 'heartbeat')),
  payload TEXT NOT NULL, -- JSON
  correlation_id TEXT, -- for request/response matching
  acknowledged INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_to ON agent_messages(to_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_from ON agent_messages(from_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_correlation ON agent_messages(correlation_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_acknowledged ON agent_messages(acknowledged) WHERE acknowledged = 0;

-- Skill Favorites table - user's favorite skills
CREATE TABLE IF NOT EXISTS skill_favorites (
  id TEXT PRIMARY KEY,
  user_wallet TEXT NOT NULL,
  skill_id TEXT NOT NULL REFERENCES skills_registry(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE(user_wallet, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_favorites_user ON skill_favorites(user_wallet);

-- Survival Mode History table - state transition history
CREATE TABLE IF NOT EXISTS survival_mode_history (
  id TEXT PRIMARY KEY,
  user_wallet TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  portfolio_value REAL NOT NULL,
  portfolio_change REAL NOT NULL, -- % change that triggered transition
  trigger_reason TEXT NOT NULL,
  actions_executed TEXT DEFAULT '[]', -- JSON array of actions taken
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_survival_history_wallet ON survival_mode_history(user_wallet);
CREATE INDEX IF NOT EXISTS idx_survival_history_created ON survival_mode_history(created_at DESC);

-- Survival Mode Metrics table - time series metrics
CREATE TABLE IF NOT EXISTS survival_mode_metrics (
  id TEXT PRIMARY KEY,
  user_wallet TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  portfolio_value REAL NOT NULL,
  portfolio_change_24h REAL DEFAULT 0,
  portfolio_change_7d REAL DEFAULT 0,
  risk_score REAL DEFAULT 50,
  liquidity_score REAL DEFAULT 50,
  diversification_score REAL DEFAULT 50,
  current_state TEXT NOT NULL,
  recommended_state TEXT NOT NULL,
  alerts TEXT DEFAULT '[]', -- JSON array
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_survival_metrics_wallet ON survival_mode_metrics(user_wallet);
CREATE INDEX IF NOT EXISTS idx_survival_metrics_timestamp ON survival_mode_metrics(timestamp DESC);

-- EVM Wallets table - mapping Solana wallets to EVM addresses
CREATE TABLE IF NOT EXISTS evm_wallets (
  id TEXT PRIMARY KEY,
  user_wallet TEXT NOT NULL, -- Solana wallet (primary)
  evm_address TEXT NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN ('ethereum', 'base', 'arbitrum', 'polygon', 'optimism', 'bsc', 'avalanche')),
  label TEXT,
  is_primary INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_wallet, evm_address, chain)
);

CREATE INDEX IF NOT EXISTS idx_evm_wallets_user ON evm_wallets(user_wallet);
CREATE INDEX IF NOT EXISTS idx_evm_wallets_chain ON evm_wallets(chain);

-- EVM Balances table - token balances on EVM chains
CREATE TABLE IF NOT EXISTS evm_balances (
  id TEXT PRIMARY KEY,
  user_wallet TEXT NOT NULL,
  evm_address TEXT NOT NULL,
  chain TEXT NOT NULL,
  token_address TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  token_decimals INTEGER NOT NULL,
  balance TEXT NOT NULL, -- BigInt as string
  balance_usd REAL DEFAULT 0,
  last_updated INTEGER NOT NULL,
  UNIQUE(user_wallet, evm_address, chain, token_address)
);

CREATE INDEX IF NOT EXISTS idx_evm_balances_user ON evm_balances(user_wallet);
CREATE INDEX IF NOT EXISTS idx_evm_balances_chain ON evm_balances(chain);

-- Bridge Transactions table - cross-chain bridge transfers
CREATE TABLE IF NOT EXISTS bridge_transactions (
  id TEXT PRIMARY KEY,
  user_wallet TEXT NOT NULL,
  source_chain TEXT NOT NULL,
  target_chain TEXT NOT NULL,
  source_address TEXT NOT NULL,
  target_address TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  amount REAL NOT NULL,
  amount_usd REAL NOT NULL,
  bridge_protocol TEXT NOT NULL, -- wormhole, stargate, etc.
  source_tx_hash TEXT,
  target_tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'source_confirmed', 'bridging', 'completed', 'failed')),
  estimated_arrival INTEGER,
  actual_arrival INTEGER,
  fee REAL DEFAULT 0,
  fee_usd REAL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bridge_tx_wallet ON bridge_transactions(user_wallet);
CREATE INDEX IF NOT EXISTS idx_bridge_tx_status ON bridge_transactions(status);
CREATE INDEX IF NOT EXISTS idx_bridge_tx_source_chain ON bridge_transactions(source_chain);
CREATE INDEX IF NOT EXISTS idx_bridge_tx_target_chain ON bridge_transactions(target_chain);
