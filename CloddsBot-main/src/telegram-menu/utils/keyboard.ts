/**
 * Telegram Menu Keyboard Builders - Inline keyboard utilities
 */

import type { MessageButton } from '../../types';

// =============================================================================
// BASIC BUTTON BUILDERS
// =============================================================================

/**
 * Create a callback button
 */
export function btn(text: string, callbackData: string): MessageButton {
  return { text, callbackData };
}

/**
 * Create a URL button
 */
export function urlBtn(text: string, url: string): MessageButton {
  return { text, url };
}

/**
 * Create a disabled/noop button
 */
export function noopBtn(text: string): MessageButton {
  return { text, callbackData: 'noop' };
}

// =============================================================================
// NAVIGATION BUTTONS
// =============================================================================

/**
 * Main menu button
 */
export function mainMenuBtn(): MessageButton {
  return btn('🏠 Main Menu', 'menu:main');
}

/**
 * Back button
 */
export function backBtn(target?: string): MessageButton {
  if (target) {
    return btn('↩️ Back', target);
  }
  return btn('↩️ Back', 'back');
}

/**
 * Refresh button
 */
export function refreshBtn(target?: string): MessageButton {
  return btn('🔄 Refresh', target || 'refresh');
}

/**
 * Cancel button
 */
export function cancelBtn(): MessageButton {
  return btn('❌ Cancel', 'menu:main');
}

// =============================================================================
// PAGINATION BUTTONS
// =============================================================================

export interface PaginationOptions {
  current: number;
  total: number;
  baseCallback: string;
}

/**
 * Create pagination row
 */
export function paginationRow(opts: PaginationOptions): MessageButton[] {
  const { current, total, baseCallback } = opts;

  const prevEnabled = current > 1;
  const nextEnabled = current < total;

  return [
    prevEnabled
      ? btn('◀️ Prev', `${baseCallback}:${current - 1}`)
      : noopBtn('◀️ Prev'),
    noopBtn(`${current}/${total}`),
    nextEnabled
      ? btn('Next ▶️', `${baseCallback}:${current + 1}`)
      : noopBtn('Next ▶️'),
  ];
}

// =============================================================================
// MENU BUTTONS
// =============================================================================

/**
 * Main menu buttons grid
 */
export function mainMenuButtons(): MessageButton[][] {
  return [
    [
      btn('📊 Portfolio', 'menu:portfolio'),
      btn('📋 Orders', 'menu:orders'),
      btn('💰 Wallet', 'menu:wallet'),
    ],
    [
      btn('🔍 Browse Markets', 'menu:search'),
      btn('🤖 Copy Trading', 'menu:copy'),
    ],
    [
      btn('⚙️ Settings', 'menu:settings'),
      refreshBtn('menu:main'),
    ],
  ];
}

/**
 * Copy trading filter buttons
 */
export function copyFilterButtons(
  filter: 'all' | 'active' | 'paused',
  counts: { all: number; active: number; paused: number }
): MessageButton[] {
  return [
    filter === 'all'
      ? noopBtn(`📁 All [${counts.all}]`)
      : btn(`📁 All [${counts.all}]`, 'copy:filter:all'),
    filter === 'active'
      ? noopBtn(`🟢 Active [${counts.active}]`)
      : btn(`🟢 Active [${counts.active}]`, 'copy:filter:active'),
    filter === 'paused'
      ? noopBtn(`⏸️ Paused [${counts.paused}]`)
      : btn(`⏸️ Paused [${counts.paused}]`, 'copy:filter:paused'),
  ];
}

// =============================================================================
// TRADING BUTTONS
// =============================================================================

/**
 * Market trading action buttons
 */
export function marketTradingButtons(
  yesTokenId: string,
  noTokenId: string,
  marketId: string
): MessageButton[][] {
  return [
    [
      btn('🟢 Buy Yes', `buy:${yesTokenId}`),
      btn('🔴 Buy No', `buy:${noTokenId}`),
    ],
    [
      btn('📈 Limit Yes', `limitb:${yesTokenId}`),
      btn('📈 Limit No', `limitb:${noTokenId}`),
    ],
    [
      refreshBtn(`market:${marketId}`),
      mainMenuBtn(),
    ],
  ];
}

/**
 * Order size selection buttons
 */
export function orderSizeButtons(tokenId: string): MessageButton[][] {
  return [
    [
      btn('$10', `order:size:${tokenId}:10`),
      btn('$25', `order:size:${tokenId}:25`),
      btn('$50', `order:size:${tokenId}:50`),
    ],
    [
      btn('$100', `order:size:${tokenId}:100`),
      btn('$250', `order:size:${tokenId}:250`),
      btn('$500', `order:size:${tokenId}:500`),
    ],
    [
      btn('$1000', `order:size:${tokenId}:1000`),
      btn('Custom', `order:custom:${tokenId}`),
    ],
    [cancelBtn()],
  ];
}

/**
 * Order price selection buttons (for limit orders)
 */
export function orderPriceButtons(
  tokenId: string,
  currentPrice: number
): MessageButton[][] {
  // Generate prices around current price
  const prices = [
    Math.max(0.01, currentPrice - 0.20),
    Math.max(0.01, currentPrice - 0.10),
    Math.max(0.01, currentPrice - 0.05),
    currentPrice,
    Math.min(0.99, currentPrice + 0.05),
    Math.min(0.99, currentPrice + 0.10),
  ].map((p) => Math.round(p * 100) / 100);

  return [
    prices.slice(0, 3).map((p) =>
      btn(`${(p * 100).toFixed(0)}¢`, `order:price:${tokenId}:${p.toFixed(2)}`)
    ),
    prices.slice(3, 6).map((p) =>
      btn(`${(p * 100).toFixed(0)}¢`, `order:price:${tokenId}:${p.toFixed(2)}`)
    ),
    [
      backBtn(`buy:${tokenId}`),
      cancelBtn(),
    ],
  ];
}

/**
 * Order confirmation buttons
 */
export function orderConfirmButtons(tokenId: string): MessageButton[][] {
  return [
    [
      btn('✅ Confirm Order', `order:exec:${tokenId}`),
      cancelBtn(),
    ],
  ];
}

// =============================================================================
// POSITION & ORDER MANAGEMENT
// =============================================================================

/**
 * Position action buttons
 */
export function positionActionButtons(positionId: string): MessageButton[][] {
  return [
    [
      btn('📈 Close Position', `pos:close:${positionId}`),
      btn('⚙️ Modify', `pos:modify:${positionId}`),
    ],
    [mainMenuBtn()],
  ];
}

/**
 * Open order action buttons
 */
export function openOrderButtons(orderId: string): MessageButton[][] {
  return [
    [
      btn('❌ Cancel Order', `cancel:${orderId}`),
    ],
    [mainMenuBtn()],
  ];
}

// =============================================================================
// COPY TRADING BUTTONS
// =============================================================================

/**
 * Copy trading subscription toggle button
 */
export function copyToggleBtn(
  configId: string,
  enabled: boolean
): MessageButton {
  return enabled
    ? btn('⏸️ Pause', `copy:toggle:${configId}`)
    : btn('▶️ Resume', `copy:toggle:${configId}`);
}

/**
 * Copy trading subscription row
 */
export function copySubscriptionRow(
  configId: string,
  enabled: boolean
): MessageButton[] {
  return [
    copyToggleBtn(configId, enabled),
    btn('📊 Stats', `copy:stats:${configId}`),
    btn('🗑️ Delete', `copy:del:${configId}`),
  ];
}

/**
 * Copy trading main action buttons
 */
export function copyTradingButtons(): MessageButton[][] {
  return [
    [
      btn('➕ Add Subscription', 'copy:add'),
      btn('🏆 Discover', 'copy:discover'),
    ],
    [
      btn('📋 Recent Activity', 'copy:activity'),
      mainMenuBtn(),
    ],
  ];
}

// =============================================================================
// WALLET BUTTONS
// =============================================================================

/**
 * Wallet action buttons
 */
export function walletButtons(hasWallet: boolean): MessageButton[][] {
  if (!hasWallet) {
    return [
      [urlBtn('🔗 Connect Wallet', 'https://app.clodds.com/settings')],
      [mainMenuBtn()],
    ];
  }

  return [
    [
      btn('📥 Deposit', 'wallet:deposit'),
      btn('📤 Withdraw', 'wallet:withdraw'),
    ],
    [
      btn('🔄 Refresh Balance', 'menu:wallet'),
      mainMenuBtn(),
    ],
  ];
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Build a grid of buttons from an array
 */
export function buildGrid(
  items: MessageButton[],
  columns: number
): MessageButton[][] {
  const grid: MessageButton[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    grid.push(items.slice(i, i + columns));
  }
  return grid;
}

/**
 * Add navigation footer to any button grid
 */
export function withNavFooter(
  buttons: MessageButton[][],
  options?: {
    showBack?: boolean;
    backTarget?: string;
    showRefresh?: boolean;
    refreshTarget?: string;
    showMainMenu?: boolean;
  }
): MessageButton[][] {
  const {
    showBack = false,
    backTarget,
    showRefresh = false,
    refreshTarget,
    showMainMenu = true,
  } = options || {};

  const footer: MessageButton[] = [];

  if (showBack) {
    footer.push(backBtn(backTarget));
  }
  if (showRefresh) {
    footer.push(refreshBtn(refreshTarget));
  }
  if (showMainMenu) {
    footer.push(mainMenuBtn());
  }

  if (footer.length > 0) {
    return [...buttons, footer];
  }

  return buttons;
}
