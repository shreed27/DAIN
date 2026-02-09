/**
 * Orders Menu Handler - View and manage open orders
 */

import type { MenuContext, MenuResult } from '../types';
import type { OpenOrderRef } from '../../types';
import { formatUSD, formatCents, formatRelativeTime, truncate, formatOrderStatus } from '../utils/format';
import { btn, paginationRow, mainMenuBtn, backBtn } from '../utils/keyboard';
import { logger } from '../../utils/logger';

const PAGE_SIZE = 5;

/**
 * Orders list handler
 */
export async function ordersHandler(
  ctx: MenuContext,
  params: string[]
): Promise<MenuResult> {
  const page = parseInt(params[0] || '1', 10);
  ctx.state.currentMenu = 'orders';

  const wallet = await ctx.getWallet();

  if (!wallet) {
    return {
      text: `📋 *Orders*

🔗 *Wallet Not Connected*

Connect your wallet to view and manage your orders.`,
      buttons: [
        [{ text: '🔗 Connect Wallet', url: 'https://app.clodds.com/settings' }],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }

  // Check if we have execution service
  if (!ctx.execution) {
    return {
      text: `📋 *Orders*

⚠️ *Trading Not Configured*

Trading credentials are required to view orders.
Configure them in the web app settings.`,
      buttons: [
        [{ text: '⚙️ Settings', url: 'https://app.clodds.com/settings' }],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }

  let orders: OpenOrderRef[] = [];
  try {
    orders = await ctx.execution.getOpenOrders();
  } catch (error) {
    logger.warn({ error }, 'Failed to get open orders');
    return {
      text: `📋 *Orders*

❌ *Failed to Load Orders*

Could not retrieve your orders. Please try again.`,
      buttons: [
        [btn('🔄 Retry', 'menu:orders')],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }

  if (orders.length === 0) {
    return {
      text: `📋 *Orders*

📭 *No Open Orders*

You don't have any pending orders.

Place a limit order on a market to see it here.`,
      buttons: [
        [btn('🔍 Browse Markets', 'menu:search')],
        [btn('🔄 Refresh', 'menu:orders'), mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }

  // Group by platform
  const byPlatform: Record<string, OpenOrderRef[]> = {};
  for (const order of orders) {
    if (!byPlatform[order.platform]) {
      byPlatform[order.platform] = [];
    }
    byPlatform[order.platform].push(order);
  }

  // Calculate totals
  const totalValue = orders.reduce(
    (sum, o) => sum + o.remainingSize * o.price,
    0
  );

  // Paginate
  const totalPages = Math.ceil(orders.length / PAGE_SIZE);
  const pageOrders = orders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  let platformSummary = '';
  for (const [platform, platformOrders] of Object.entries(byPlatform)) {
    platformSummary += `├ ${platform.charAt(0).toUpperCase() + platform.slice(1)}: ${platformOrders.length} orders\n`;
  }

  let text = `📋 *Open Orders*

📊 *Summary*
├ Total Orders: ${orders.length}
├ Total Value: ${formatUSD(totalValue)}
${platformSummary}
━━━━━━━━━━━━━━━━━━━━

*Orders* (Page ${page}/${totalPages})
`;

  const orderButtons: ReturnType<typeof btn>[][] = [];

  pageOrders.forEach((order, i) => {
    const num = (page - 1) * PAGE_SIZE + i + 1;
    const sideEmoji = order.side === 'buy' ? '🟢' : '🔴';
    const sideText = order.side.toUpperCase();
    const outcomeText = order.outcome || 'N/A';

    text += `
*${num}) ${truncate(order.marketId, 30)}*
├ ${sideEmoji} ${sideText} ${outcomeText}
├ Size: ${order.remainingSize.toFixed(2)} @ ${formatCents(order.price)}
├ Filled: ${order.filledSize.toFixed(2)}/${order.originalSize.toFixed(2)}
└ ${formatOrderStatus(order.status)} · ${formatRelativeTime(order.createdAt)}
`;

    orderButtons.push([
      btn(`❌ Cancel #${num}`, `cancel:${order.orderId}`),
    ]);
  });

  const buttons = [
    ...orderButtons,
    paginationRow({
      current: page,
      total: totalPages,
      baseCallback: 'menu:orders',
    }),
    [
      btn('❌ Cancel All', 'orders:cancelall'),
      btn('🔄 Refresh', 'menu:orders'),
    ],
    [mainMenuBtn()],
  ];

  return {
    text,
    buttons,
    parseMode: 'Markdown',
  };
}

/**
 * Cancel order confirmation handler
 */
export async function cancelOrderHandler(
  ctx: MenuContext,
  params: string[]
): Promise<MenuResult> {
  const orderId = params[0];
  ctx.state.currentMenu = 'cancel_order';

  if (!ctx.execution) {
    return {
      text: `❌ Trading not configured`,
      buttons: [[mainMenuBtn()]],
      parseMode: 'Markdown',
    };
  }

  // Get order details
  let orders: OpenOrderRef[] = [];
  try {
    orders = await ctx.execution.getOpenOrders();
  } catch (error) {
    logger.warn({ error }, 'Failed to get orders for cancel');
  }

  const order = orders.find((o) => o.orderId === orderId);

  if (!order) {
    return {
      text: `❌ *Order Not Found*

The order may have been filled or already cancelled.`,
      buttons: [
        [btn('📋 View Orders', 'menu:orders')],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }

  const sideEmoji = order.side === 'buy' ? '🟢' : '🔴';

  const text = `⚠️ *Cancel Order?*

*${truncate(order.marketId, 45)}*

├ ${sideEmoji} ${order.side.toUpperCase()} ${order.outcome || 'N/A'}
├ Size: ${order.remainingSize.toFixed(2)} @ ${formatCents(order.price)}
└ Filled: ${order.filledSize.toFixed(2)}/${order.originalSize.toFixed(2)}

*Are you sure you want to cancel this order?*`;

  return {
    text,
    buttons: [
      [
        btn('✅ Confirm Cancel', `orders:exec:cancel:${orderId}`),
        btn('↩️ Back', 'menu:orders'),
      ],
    ],
    parseMode: 'Markdown',
  };
}

/**
 * Execute order cancellation
 */
export async function executeCancelOrder(
  ctx: MenuContext,
  params: string[]
): Promise<MenuResult> {
  const orderId = params[0];

  if (!ctx.execution) {
    return {
      text: `❌ Trading not configured`,
      buttons: [[mainMenuBtn()]],
      parseMode: 'Markdown',
    };
  }

  try {
    // Determine platform from order ID format or try polymarket first
    let success = false;
    for (const platform of ['polymarket', 'kalshi', 'opinion', 'predictfun'] as const) {
      try {
        success = await ctx.execution.cancelOrder(platform, orderId);
        if (success) break;
      } catch {
        // Try next platform
      }
    }

    if (success) {
      return {
        text: `✅ *Order Cancelled*

Order \`${orderId}\` has been cancelled successfully.`,
        buttons: [
          [btn('📋 View Orders', 'menu:orders')],
          [mainMenuBtn()],
        ],
        parseMode: 'Markdown',
      };
    } else {
      throw new Error('Order cancellation failed');
    }
  } catch (error) {
    logger.error({ error, orderId }, 'Failed to cancel order');
    return {
      text: `❌ *Failed to Cancel Order*

Error: ${error instanceof Error ? error.message : 'Unknown error'}

The order may have been filled or already cancelled.`,
      buttons: [
        [btn('📋 View Orders', 'menu:orders')],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }
}

/**
 * Cancel all orders confirmation
 */
export async function cancelAllOrdersHandler(ctx: MenuContext): Promise<MenuResult> {
  ctx.state.currentMenu = 'cancel_all_orders';

  if (!ctx.execution) {
    return {
      text: `❌ Trading not configured`,
      buttons: [[mainMenuBtn()]],
      parseMode: 'Markdown',
    };
  }

  let orders: OpenOrderRef[] = [];
  try {
    orders = await ctx.execution.getOpenOrders();
  } catch {
    orders = [];
  }

  if (orders.length === 0) {
    return {
      text: `📋 *No Orders to Cancel*

You don't have any open orders.`,
      buttons: [[mainMenuBtn()]],
      parseMode: 'Markdown',
    };
  }

  const totalValue = orders.reduce(
    (sum, o) => sum + o.remainingSize * o.price,
    0
  );

  const text = `⚠️ *Cancel All Orders?*

This will cancel all ${orders.length} open orders.

├ Total Orders: ${orders.length}
└ Total Value: ${formatUSD(totalValue)}

*Are you sure?*`;

  return {
    text,
    buttons: [
      [
        btn('✅ Cancel All', 'orders:exec:cancelall'),
        btn('↩️ Back', 'menu:orders'),
      ],
    ],
    parseMode: 'Markdown',
  };
}

/**
 * Execute cancel all orders
 */
export async function executeCancelAllOrders(ctx: MenuContext): Promise<MenuResult> {
  if (!ctx.execution) {
    return {
      text: `❌ Trading not configured`,
      buttons: [[mainMenuBtn()]],
      parseMode: 'Markdown',
    };
  }

  try {
    const cancelled = await ctx.execution.cancelAllOrders();

    return {
      text: `✅ *All Orders Cancelled*

Successfully cancelled ${cancelled} orders.`,
      buttons: [
        [btn('📋 View Orders', 'menu:orders')],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  } catch (error) {
    logger.error({ error }, 'Failed to cancel all orders');
    return {
      text: `❌ *Failed to Cancel Orders*

Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      buttons: [
        [btn('🔄 Try Again', 'orders:cancelall')],
        [btn('📋 View Orders', 'menu:orders')],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }
}
