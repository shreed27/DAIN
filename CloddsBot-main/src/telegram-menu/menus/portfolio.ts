/**
 * Portfolio Menu Handler - View positions and P&L
 */

import type { MenuContext, MenuResult, PositionSummary } from '../types';
import type { Position } from '../../types';
import { formatUSD, formatPnL, formatPnLPct, formatCents, truncate } from '../utils/format';
import { btn, paginationRow, mainMenuBtn, backBtn } from '../utils/keyboard';
import { logger } from '../../utils/logger';

const PAGE_SIZE = 5;

/**
 * Convert Position to PositionSummary
 */
function positionToSummary(pos: Position): PositionSummary {
  return {
    marketId: pos.marketId,
    marketQuestion: pos.marketQuestion,
    outcome: pos.outcome,
    shares: pos.shares,
    avgPrice: pos.avgPrice,
    currentPrice: pos.currentPrice,
    value: pos.shares * pos.currentPrice,
    pnl: pos.pnl,
    pnlPct: pos.pnlPct,
    platform: pos.platform,
  };
}

/**
 * Portfolio overview handler
 */
export async function portfolioHandler(
  ctx: MenuContext,
  params: string[]
): Promise<MenuResult> {
  const page = parseInt(params[0] || '1', 10);
  ctx.state.currentMenu = 'portfolio';

  const wallet = await ctx.getWallet();

  if (!wallet) {
    return {
      text: `📊 *Portfolio*

🔗 *Wallet Not Connected*

Connect your wallet through the web app to view your portfolio and positions.`,
      buttons: [
        [{ text: '🔗 Connect Wallet', url: 'https://app.clodds.com/settings' }],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }

  let positions: Position[] = [];
  try {
    positions = ctx.db.getPositions(wallet);
  } catch (error) {
    logger.warn({ error, wallet }, 'Failed to get positions');
  }

  if (positions.length === 0) {
    return {
      text: `📊 *Portfolio*

📭 *No Active Positions*

You don't have any open positions yet.

Browse markets to find trading opportunities!`,
      buttons: [
        [btn('🔍 Browse Markets', 'menu:search')],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }

  // Calculate totals
  let totalValue = 0;
  let totalCostBasis = 0;
  const byPlatform: Record<string, { value: number; pnl: number; count: number }> = {};

  for (const pos of positions) {
    const value = pos.shares * pos.currentPrice;
    const costBasis = pos.shares * pos.avgPrice;
    totalValue += value;
    totalCostBasis += costBasis;

    if (!byPlatform[pos.platform]) {
      byPlatform[pos.platform] = { value: 0, pnl: 0, count: 0 };
    }
    byPlatform[pos.platform].value += value;
    byPlatform[pos.platform].pnl += pos.pnl;
    byPlatform[pos.platform].count++;
  }

  const totalPnl = totalValue - totalCostBasis;
  const totalPnlPct = totalCostBasis > 0 ? totalPnl / totalCostBasis : 0;

  // Platform breakdown
  let platformText = '';
  for (const [platform, data] of Object.entries(byPlatform)) {
    const pnlSign = data.pnl >= 0 ? '+' : '';
    platformText += `├ ${platform.charAt(0).toUpperCase() + platform.slice(1)}: ${formatUSD(data.value)} (${pnlSign}${formatUSD(data.pnl)})\n`;
  }

  // Paginate positions
  const totalPages = Math.ceil(positions.length / PAGE_SIZE);
  const pagePositions = positions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  let text = `📊 *Portfolio Overview*

💰 *Total Value:* ${formatUSD(totalValue)}
📈 *Total P&L:* ${formatPnL(totalPnl)} (${(totalPnlPct * 100).toFixed(1)}%)
📋 *Positions:* ${positions.length}

📊 *By Platform*
${platformText}
━━━━━━━━━━━━━━━━━━━━

*Active Positions* (Page ${page}/${totalPages})
`;

  const positionButtons: ReturnType<typeof btn>[][] = [];

  pagePositions.forEach((pos, i) => {
    const summary = positionToSummary(pos);
    const num = (page - 1) * PAGE_SIZE + i + 1;
    const pnlEmoji = summary.pnl >= 0 ? '🟢' : '🔴';
    const pnlSign = summary.pnl >= 0 ? '+' : '';

    text += `
*${num}) ${truncate(summary.marketQuestion, 45)}*
├ ${summary.outcome}: ${summary.shares.toFixed(2)} shares
├ Entry: ${formatCents(summary.avgPrice)} → Current: ${formatCents(summary.currentPrice)}
└ ${pnlEmoji} P&L: ${pnlSign}${formatUSD(summary.pnl)} (${pnlSign}${(summary.pnlPct * 100).toFixed(1)}%)
`;

    positionButtons.push([
      btn(`📊 #${num} Details`, `pos:view:${pos.id}`),
      btn(`📈 Close #${num}`, `pos:close:${pos.id}`),
    ]);
  });

  const buttons = [
    ...positionButtons,
    paginationRow({
      current: page,
      total: totalPages,
      baseCallback: 'menu:portfolio',
    }),
    [
      btn('🔄 Refresh', 'menu:portfolio'),
      mainMenuBtn(),
    ],
  ];

  return {
    text,
    buttons,
    parseMode: 'Markdown',
  };
}

/**
 * Position detail handler
 */
export async function positionDetailHandler(
  ctx: MenuContext,
  params: string[]
): Promise<MenuResult> {
  const positionId = params[0];
  ctx.state.currentMenu = 'position_detail';

  const wallet = await ctx.getWallet();
  if (!wallet) {
    return {
      text: '❌ Wallet not connected',
      buttons: [[mainMenuBtn()]],
      parseMode: 'Markdown',
    };
  }

  const positions = ctx.db.getPositions(wallet);
  const position = positions.find((p) => p.id === positionId);

  if (!position) {
    return {
      text: `❌ *Position Not Found*

The position may have been closed or doesn't exist.`,
      buttons: [
        [btn('📊 Portfolio', 'menu:portfolio')],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }

  const summary = positionToSummary(position);
  const pnlSign = summary.pnl >= 0 ? '+' : '';
  const pnlEmoji = summary.pnl >= 0 ? '🟢' : '🔴';

  const text = `📊 *Position Details*

*${summary.marketQuestion}*

📌 *Position Info*
├ Side: ${summary.outcome}
├ Shares: ${summary.shares.toFixed(4)}
├ Platform: ${summary.platform}
└ Opened: ${position.openedAt ? new Date(position.openedAt).toLocaleDateString() : 'N/A'}

💰 *Pricing*
├ Entry Price: ${formatCents(summary.avgPrice)}
├ Current Price: ${formatCents(summary.currentPrice)}
└ Cost Basis: ${formatUSD(summary.shares * summary.avgPrice)}

📈 *Performance*
├ Current Value: ${formatUSD(summary.value)}
└ ${pnlEmoji} P&L: ${pnlSign}${formatUSD(summary.pnl)} (${pnlSign}${(summary.pnlPct * 100).toFixed(1)}%)`;

  return {
    text,
    buttons: [
      [
        btn('📈 Close Position', `pos:close:${positionId}`),
        btn('🔄 Refresh', `pos:view:${positionId}`),
      ],
      [
        btn('📊 View Market', `market:${position.marketId}`),
      ],
      [
        backBtn('menu:portfolio'),
        mainMenuBtn(),
      ],
    ],
    parseMode: 'Markdown',
  };
}

/**
 * Close position confirmation handler
 */
export async function closePositionHandler(
  ctx: MenuContext,
  params: string[]
): Promise<MenuResult> {
  const positionId = params[0];
  ctx.state.currentMenu = 'close_position';

  const wallet = await ctx.getWallet();
  if (!wallet) {
    return {
      text: '❌ Wallet not connected',
      buttons: [[mainMenuBtn()]],
      parseMode: 'Markdown',
    };
  }

  const positions = ctx.db.getPositions(wallet);
  const position = positions.find((p) => p.id === positionId);

  if (!position) {
    return {
      text: `❌ *Position Not Found*`,
      buttons: [[btn('📊 Portfolio', 'menu:portfolio')], [mainMenuBtn()]],
      parseMode: 'Markdown',
    };
  }

  const summary = positionToSummary(position);
  const pnlSign = summary.pnl >= 0 ? '+' : '';

  const text = `⚠️ *Close Position?*

*${truncate(summary.marketQuestion, 50)}*

├ ${summary.outcome}: ${summary.shares.toFixed(2)} shares
├ Current Price: ${formatCents(summary.currentPrice)}
└ Estimated P&L: ${pnlSign}${formatUSD(summary.pnl)}

This will sell all ${summary.shares.toFixed(2)} shares at market price.

*Are you sure?*`;

  return {
    text,
    buttons: [
      [
        btn('✅ Confirm Close', `pos:exec:close:${positionId}`),
        btn('❌ Cancel', `pos:view:${positionId}`),
      ],
    ],
    parseMode: 'Markdown',
  };
}

/**
 * Execute position close
 */
export async function executeClosePosition(
  ctx: MenuContext,
  params: string[]
): Promise<MenuResult> {
  const positionId = params[0];

  const wallet = await ctx.getWallet();
  if (!wallet || !ctx.execution) {
    return {
      text: `❌ *Cannot Close Position*

${!wallet ? 'Wallet not connected.' : 'Trading service not available.'}`,
      buttons: [[mainMenuBtn()]],
      parseMode: 'Markdown',
    };
  }

  const positions = ctx.db.getPositions(wallet);
  const position = positions.find((p) => p.id === positionId);

  if (!position) {
    return {
      text: `❌ *Position Not Found*`,
      buttons: [[mainMenuBtn()]],
      parseMode: 'Markdown',
    };
  }

  try {
    // Execute market sell
    const result = await ctx.execution.marketSell({
      platform: position.platform as any,
      marketId: position.marketId,
      tokenId: position.outcomeId,
      outcome: position.outcome,
      size: position.shares,
    });

    if (result.success) {
      return {
        text: `✅ *Position Closed!*

*${truncate(position.marketQuestion, 45)}*

├ Sold: ${position.shares.toFixed(2)} shares
├ Fill Price: ${formatCents(result.avgFillPrice || position.currentPrice)}
└ Order ID: \`${result.orderId || 'N/A'}\`

Your portfolio has been updated.`,
        buttons: [
          [btn('📊 View Portfolio', 'menu:portfolio')],
          [mainMenuBtn()],
        ],
        parseMode: 'Markdown',
      };
    } else {
      throw new Error(result.error || 'Order failed');
    }
  } catch (error) {
    logger.error({ error, positionId }, 'Failed to close position');
    return {
      text: `❌ *Failed to Close Position*

Error: ${error instanceof Error ? error.message : 'Unknown error'}

Please try again or check your credentials.`,
      buttons: [
        [btn('🔄 Try Again', `pos:close:${positionId}`)],
        [btn('📊 Portfolio', 'menu:portfolio')],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }
}
