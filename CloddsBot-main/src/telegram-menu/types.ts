/**
 * Telegram Menu Types - Type definitions for interactive menu system
 */

import type { FeedManager } from '../feeds';
import type { Database } from '../db';
import type { CredentialsManager } from '../credentials';
import type { PairingService } from '../pairing';
import type { CopyTradingOrchestrator } from '../trading/copy-trading-orchestrator';
import type { ExecutionService } from '../execution';
import type { OutgoingMessage, MessageButton } from '../types';

// =============================================================================
// MENU STATE
// =============================================================================

export interface MenuState {
  userId: string;
  chatId: string;
  currentMenu: string;
  messageId?: string;
  // Search state
  searchQuery?: string;
  searchPage?: number;
  // Market state
  selectedMarket?: string;
  selectedToken?: string;
  // Order state
  orderSide?: 'buy' | 'sell';
  orderType?: 'market' | 'limit';
  orderSize?: number;
  orderPrice?: number;
  // Copy trading state
  copyFilter?: 'all' | 'active' | 'paused';
  copyPage?: number;
  pendingWallet?: string;
  // Navigation history for back button
  history: string[];
}

// =============================================================================
// MENU CONTEXT
// =============================================================================

export interface MenuContext {
  state: MenuState;
  feeds: FeedManager;
  db: Database;
  credentials: CredentialsManager;
  execution: ExecutionService | null;
  copyTrading: CopyTradingOrchestrator | null;
  pairing: PairingService;
  send: SendMessageFn;
  edit: EditMessageFn;
  editButtons: EditButtonsFn;
  getWallet: () => Promise<string | null>;
}

// =============================================================================
// FUNCTION TYPES
// =============================================================================

export type SendMessageFn = (msg: OutgoingMessage) => Promise<string | null>;

export type EditMessageFn = (msg: OutgoingMessage & { messageId: string }) => Promise<void>;

export type EditButtonsFn = (
  chatId: string,
  messageId: string,
  buttons: MessageButton[][]
) => Promise<void>;

// =============================================================================
// MENU RESULT
// =============================================================================

export interface MenuResult {
  text: string;
  buttons: MessageButton[][];
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
}

// =============================================================================
// MENU HANDLER
// =============================================================================

export type MenuHandler = (
  ctx: MenuContext,
  params: string[]
) => Promise<MenuResult>;

// =============================================================================
// TELEGRAM MENU SERVICE INTERFACE
// =============================================================================

export interface TelegramMenuService {
  /**
   * Handle /start command - show main menu
   */
  handleStart(userId: string, chatId: string): Promise<void>;

  /**
   * Handle callback query from inline button click
   */
  handleCallback(
    userId: string,
    chatId: string,
    messageId: string | undefined,
    data: string
  ): Promise<void>;

  /**
   * Handle text input (for search, wallet address, etc.)
   * Returns true if the input was handled, false to pass to normal flow
   */
  handleTextInput(userId: string, chatId: string, text: string): Promise<boolean>;

  /**
   * Clear user state (on /new command)
   */
  clearState(userId: string): void;
}

// =============================================================================
// CALLBACK DATA PROTOCOL
// =============================================================================

/**
 * Callback data format: action:param1:param2:...
 * Limited to 64 bytes by Telegram
 *
 * Actions:
 * - menu:main, menu:portfolio, menu:orders, menu:wallet, menu:copy, menu:search, menu:settings
 * - search:query:page       - Search markets
 * - market:conditionId      - View market detail
 * - buy:tokenId             - Start buy flow
 * - sell:tokenId            - Start sell flow
 * - limitb:tokenId          - Limit buy flow
 * - limits:tokenId          - Limit sell flow
 * - order:size:tokenId:amt  - Set order size
 * - order:price:tokenId:p   - Set order price
 * - order:exec:tokenId      - Execute order
 * - order:cancel            - Cancel order entry
 * - pos:close:posId         - Close position
 * - cancel:orderId          - Cancel open order
 * - copy:add                - Add subscription
 * - copy:toggle:cfgId       - Toggle subscription
 * - copy:del:cfgId          - Delete subscription
 * - copy:filter:type        - Filter subscriptions
 * - copy:discover           - Discover top traders
 * - copy:activity           - View recent activity
 * - refresh                 - Refresh current view
 * - back                    - Go back in history
 * - noop                    - No operation (disabled button)
 */

export type CallbackAction =
  | 'menu'
  | 'search'
  | 'market'
  | 'buy'
  | 'sell'
  | 'limitb'
  | 'limits'
  | 'order'
  | 'pos'
  | 'cancel'
  | 'copy'
  | 'refresh'
  | 'back'
  | 'noop';

// =============================================================================
// ORDER WIZARD STATES
// =============================================================================

export type OrderWizardStep =
  | 'select_size'
  | 'select_price'
  | 'confirm'
  | 'executing'
  | 'complete';

export interface OrderWizardState {
  step: OrderWizardStep;
  tokenId: string;
  marketId: string;
  marketQuestion: string;
  side: 'buy' | 'sell';
  orderType: 'market' | 'limit';
  size?: number;
  price?: number;
  currentPrice?: number;
}

// =============================================================================
// PORTFOLIO & POSITIONS
// =============================================================================

export interface PositionSummary {
  marketId: string;
  marketQuestion: string;
  outcome: string;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  value: number;
  pnl: number;
  pnlPct: number;
  platform: string;
}

export interface PortfolioSummary {
  totalValue: number;
  totalPnl: number;
  totalPnlPct: number;
  positionsCount: number;
  tradableBalance: number;
  openOrdersValue: number;
  byPlatform: Record<string, { value: number; pnl: number }>;
}

// =============================================================================
// MARKET DATA
// =============================================================================

export interface MarketSummary {
  id: string;
  conditionId: string;
  question: string;
  yesPrice: number;
  noPrice: number;
  yesTokenId: string;
  noTokenId: string;
  volume24h: number;
  liquidity: number;
  url: string;
  endDate?: Date;
}
