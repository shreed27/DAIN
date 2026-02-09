/**
 * Telegram Menu Service - Central orchestrator for interactive Telegram menus
 *
 * This service provides PolyBot-style interactive menu UI for Telegram,
 * replacing text commands with inline keyboard buttons.
 */

import type {
  TelegramMenuService,
  MenuState,
  MenuContext,
  MenuResult,
  SendMessageFn,
  EditMessageFn,
  EditButtonsFn,
} from './types';
import type { FeedManager } from '../feeds';
import type { Database } from '../db';
import type { CredentialsManager } from '../credentials';
import type { PairingService } from '../pairing';
import type { CopyTradingOrchestrator } from '../trading/copy-trading-orchestrator';
import type { ExecutionService } from '../execution';
import { logger } from '../utils/logger';

// Import menu handlers
import { mainMenuHandler, settingsMenuHandler } from './menus/main';
import {
  searchPromptHandler,
  searchResultsHandler,
  marketDetailHandler,
} from './menus/markets';
import {
  portfolioHandler,
  positionDetailHandler,
  closePositionHandler,
  executeClosePosition,
} from './menus/portfolio';
import {
  ordersHandler,
  cancelOrderHandler,
  executeCancelOrder,
  cancelAllOrdersHandler,
  executeCancelAllOrders,
} from './menus/orders';
import { walletHandler, depositHandler, withdrawHandler } from './menus/wallet';
import {
  copyTradingHandler,
  addSubscriptionHandler,
  confirmSubscriptionHandler,
  executeAddSubscription,
  toggleSubscriptionHandler,
  deleteSubscriptionHandler,
  executeDeleteSubscription,
  subscriptionStatsHandler,
  discoverTradersHandler,
  recentActivityHandler,
} from './menus/copy-trading';
import {
  startBuyHandler,
  startSellHandler,
  startLimitBuyHandler,
  startLimitSellHandler,
  handleSizeSelection,
  handlePriceSelection,
  executeOrderHandler,
  handleCustomSizeInput,
} from './menus/order-wizard';

// =============================================================================
// SERVICE FACTORY
// =============================================================================

export interface TelegramMenuServiceDeps {
  feeds: FeedManager;
  db: Database;
  credentials: CredentialsManager;
  pairing: PairingService;
  copyTrading: CopyTradingOrchestrator | null;
  execution: ExecutionService | null;
  send: SendMessageFn;
  edit: EditMessageFn;
  editButtons: EditButtonsFn;
}

/**
 * Create the Telegram menu service
 */
export function createTelegramMenuService(
  deps: TelegramMenuServiceDeps
): TelegramMenuService {
  const { feeds, db, credentials, pairing, copyTrading, execution, send, edit, editButtons } = deps;

  // Per-user menu state storage
  const userStates = new Map<string, MenuState>();

  /**
   * Get or create state for a user
   */
  function getOrCreateState(userId: string, chatId: string): MenuState {
    const existingState = userStates.get(userId);
    if (existingState) {
      existingState.chatId = chatId;
      return existingState;
    }

    const newState: MenuState = {
      userId,
      chatId,
      currentMenu: 'main',
      history: [],
    };
    userStates.set(userId, newState);
    return newState;
  }

  /**
   * Create menu context with all dependencies
   */
  function createContext(state: MenuState): MenuContext {
    return {
      state,
      feeds,
      db,
      credentials,
      execution,
      copyTrading,
      pairing,
      send,
      edit,
      editButtons,
      getWallet: async () => {
        return pairing.getWalletForChatUser('telegram', state.userId);
      },
    };
  }

  /**
   * Send menu result to user (new message)
   */
  async function sendResult(
    chatId: string,
    result: MenuResult
  ): Promise<string | null> {
    return send({
      platform: 'telegram',
      chatId,
      text: result.text,
      buttons: result.buttons,
      parseMode: result.parseMode || 'Markdown',
    });
  }

  /**
   * Edit existing message with menu result
   */
  async function editResult(
    chatId: string,
    messageId: string,
    result: MenuResult
  ): Promise<void> {
    await edit({
      platform: 'telegram',
      chatId,
      messageId,
      text: result.text,
      buttons: result.buttons,
      parseMode: result.parseMode || 'Markdown',
    });
  }

  /**
   * Route callback to appropriate handler
   */
  async function routeCallback(
    ctx: MenuContext,
    action: string,
    params: string[]
  ): Promise<MenuResult> {
    logger.debug({ action, params, currentMenu: ctx.state.currentMenu }, 'Routing callback');

    switch (action) {
      // Main menus
      case 'menu':
        switch (params[0]) {
          case 'main':
            return mainMenuHandler(ctx);
          case 'portfolio':
            return portfolioHandler(ctx, params.slice(1));
          case 'orders':
            return ordersHandler(ctx, params.slice(1));
          case 'wallet':
            return walletHandler(ctx);
          case 'search':
            return searchPromptHandler(ctx);
          case 'copy':
            return copyTradingHandler(ctx, params.slice(1));
          case 'settings':
            return settingsMenuHandler(ctx);
          default:
            return mainMenuHandler(ctx);
        }

      // Market search
      case 'search':
        return searchResultsHandler(ctx, params);

      // Market detail
      case 'market':
        return marketDetailHandler(ctx, params);

      // Trading - Buy
      case 'buy':
        return startBuyHandler(ctx, params);

      // Trading - Sell
      case 'sell':
        return startSellHandler(ctx, params);

      // Trading - Limit Buy
      case 'limitb':
        return startLimitBuyHandler(ctx, params);

      // Trading - Limit Sell
      case 'limits':
        return startLimitSellHandler(ctx, params);

      // Order wizard
      case 'order':
        switch (params[0]) {
          case 'size':
            return handleSizeSelection(ctx, params.slice(1));
          case 'price':
            return handlePriceSelection(ctx, params.slice(1));
          case 'exec':
            return executeOrderHandler(ctx, params.slice(1));
          case 'custom':
            // Show custom input prompt
            ctx.state.currentMenu = ctx.state.orderType === 'market'
              ? (ctx.state.orderSide === 'buy' ? 'buy_custom' : 'sell_custom')
              : (ctx.state.orderSide === 'buy' ? 'limitb_custom' : 'limits_custom');
            return {
              text: `💰 *Enter Custom Amount*

Type the amount in USD (e.g., "75" or "$150"):`,
              buttons: [
                [{ text: '↩️ Back', callbackData: `${ctx.state.orderSide === 'buy' ? 'buy' : 'sell'}:${ctx.state.selectedToken}` }],
                [{ text: '🏠 Main Menu', callbackData: 'menu:main' }],
              ],
              parseMode: 'Markdown',
            };
          default:
            return mainMenuHandler(ctx);
        }

      // Position management
      case 'pos':
        switch (params[0]) {
          case 'view':
            return positionDetailHandler(ctx, params.slice(1));
          case 'close':
            return closePositionHandler(ctx, params.slice(1));
          case 'exec':
            if (params[1] === 'close') {
              return executeClosePosition(ctx, params.slice(2));
            }
            return mainMenuHandler(ctx);
          default:
            return portfolioHandler(ctx, []);
        }

      // Order cancellation
      case 'cancel':
        return cancelOrderHandler(ctx, params);

      // Orders management
      case 'orders':
        switch (params[0]) {
          case 'cancelall':
            return cancelAllOrdersHandler(ctx);
          case 'exec':
            if (params[1] === 'cancel') {
              return executeCancelOrder(ctx, params.slice(2));
            }
            if (params[1] === 'cancelall') {
              return executeCancelAllOrders(ctx);
            }
            return ordersHandler(ctx, []);
          default:
            return ordersHandler(ctx, params);
        }

      // Wallet
      case 'wallet':
        switch (params[0]) {
          case 'deposit':
            return depositHandler(ctx);
          case 'withdraw':
            return withdrawHandler(ctx);
          default:
            return walletHandler(ctx);
        }

      // Copy trading
      case 'copy':
        switch (params[0]) {
          case 'add':
            return addSubscriptionHandler(ctx);
          case 'filter':
            return copyTradingHandler(ctx, params.slice(1));
          case 'toggle':
            return toggleSubscriptionHandler(ctx, params.slice(1));
          case 'del':
            return deleteSubscriptionHandler(ctx, params.slice(1));
          case 'stats':
            return subscriptionStatsHandler(ctx, params.slice(1));
          case 'discover':
            return discoverTradersHandler(ctx);
          case 'activity':
            return recentActivityHandler(ctx);
          case 'exec':
            if (params[1] === 'add') {
              return executeAddSubscription(ctx, params.slice(2));
            }
            if (params[1] === 'del') {
              return executeDeleteSubscription(ctx, params.slice(2));
            }
            return copyTradingHandler(ctx, []);
          default:
            return copyTradingHandler(ctx, params);
        }

      // Refresh - re-render current menu
      case 'refresh':
        return routeCallback(ctx, 'menu', [ctx.state.currentMenu.split('_')[0]]);

      // Back - go to previous menu
      case 'back':
        const prevMenu = ctx.state.history.pop();
        if (prevMenu) {
          const [backAction, ...backParams] = prevMenu.split(':');
          return routeCallback(ctx, backAction, backParams);
        }
        return mainMenuHandler(ctx);

      // No-op for disabled buttons
      case 'noop':
        return {
          text: ctx.state.currentMenu === 'main' ? '' : 'Button disabled',
          buttons: [],
          parseMode: 'Markdown',
        };

      default:
        logger.warn({ action, params }, 'Unknown callback action');
        return mainMenuHandler(ctx);
    }
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  return {
    /**
     * Handle /start command
     */
    async handleStart(userId: string, chatId: string): Promise<void> {
      const state = getOrCreateState(userId, chatId);
      state.currentMenu = 'main';
      state.history = [];

      const ctx = createContext(state);
      const result = await mainMenuHandler(ctx);

      const messageId = await sendResult(chatId, result);
      if (messageId) {
        state.messageId = messageId;
      }
    },

    /**
     * Handle callback query from button click
     */
    async handleCallback(
      userId: string,
      chatId: string,
      messageId: string | undefined,
      data: string
    ): Promise<void> {
      const state = getOrCreateState(userId, chatId);
      if (messageId) {
        state.messageId = messageId;
      }

      // Parse callback data
      const [action, ...params] = data.split(':');

      // Handle noop immediately without updating
      if (action === 'noop') {
        return;
      }

      // Save current menu to history for back navigation
      if (action !== 'back' && action !== 'refresh') {
        const currentMenu = state.currentMenu;
        if (currentMenu && currentMenu !== 'main') {
          // Don't add duplicates to history
          if (state.history[state.history.length - 1] !== `menu:${currentMenu}`) {
            state.history.push(`menu:${currentMenu}`);
            // Keep history limited
            if (state.history.length > 10) {
              state.history.shift();
            }
          }
        }
      }

      const ctx = createContext(state);

      try {
        const result = await routeCallback(ctx, action, params);

        // If result has empty text (noop), don't update
        if (!result.text) {
          return;
        }

        // Edit existing message if we have messageId
        if (messageId) {
          await editResult(chatId, messageId, result);
        } else {
          const newMsgId = await sendResult(chatId, result);
          if (newMsgId) {
            state.messageId = newMsgId;
          }
        }
      } catch (error) {
        logger.error({ error, action, params, userId }, 'Callback handler error');

        // Send error message
        const errorResult: MenuResult = {
          text: `❌ *Error*

Something went wrong. Please try again.

Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          buttons: [[{ text: '🏠 Main Menu', callbackData: 'menu:main' }]],
          parseMode: 'Markdown',
        };

        if (messageId) {
          await editResult(chatId, messageId, errorResult);
        } else {
          await sendResult(chatId, errorResult);
        }
      }
    },

    /**
     * Handle text input from user
     */
    async handleTextInput(
      userId: string,
      chatId: string,
      text: string
    ): Promise<boolean> {
      const state = userStates.get(userId);
      if (!state) {
        return false;
      }

      const ctx = createContext(state);
      const trimmedText = text.trim();

      // Handle search input
      if (state.currentMenu === 'search_input') {
        state.searchQuery = trimmedText;
        state.searchPage = 1;

        const result = await searchResultsHandler(ctx, [trimmedText, '1']);

        if (state.messageId) {
          await editResult(chatId, state.messageId, result);
        } else {
          const msgId = await sendResult(chatId, result);
          if (msgId) state.messageId = msgId;
        }

        return true;
      }

      // Handle copy trading wallet input
      if (state.currentMenu === 'copy_add_input') {
        // Validate wallet address
        if (!/^0x[a-fA-F0-9]{40}$/.test(trimmedText)) {
          const errorResult: MenuResult = {
            text: `❌ *Invalid Wallet Address*

Please enter a valid Ethereum address starting with 0x.

Example: \`0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045\``,
            buttons: [
              [{ text: '↩️ Back', callbackData: 'menu:copy' }],
              [{ text: '🏠 Main Menu', callbackData: 'menu:main' }],
            ],
            parseMode: 'Markdown',
          };

          if (state.messageId) {
            await editResult(chatId, state.messageId, errorResult);
          } else {
            await sendResult(chatId, errorResult);
          }

          return true;
        }

        const result = await confirmSubscriptionHandler(ctx, trimmedText);

        if (state.messageId) {
          await editResult(chatId, state.messageId, result);
        } else {
          const msgId = await sendResult(chatId, result);
          if (msgId) state.messageId = msgId;
        }

        return true;
      }

      // Handle custom order size input
      if (
        state.currentMenu.endsWith('_custom') ||
        ['buy', 'sell', 'limitb', 'limits'].includes(state.currentMenu)
      ) {
        const result = await handleCustomSizeInput(ctx, trimmedText);
        if (result) {
          if (state.messageId) {
            await editResult(chatId, state.messageId, result);
          } else {
            const msgId = await sendResult(chatId, result);
            if (msgId) state.messageId = msgId;
          }
          return true;
        }
      }

      // Not handled - let normal flow continue
      return false;
    },

    /**
     * Clear user state
     */
    clearState(userId: string): void {
      userStates.delete(userId);
    },
  };
}

// Re-export types
export * from './types';
