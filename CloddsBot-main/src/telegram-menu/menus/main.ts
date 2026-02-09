/**
 * Main Menu Handler - Welcome screen and main navigation
 */

import type { MenuContext, MenuResult, PortfolioSummary } from '../types';
import { formatUSD, formatPnL } from '../utils/format';
import { mainMenuButtons } from '../utils/keyboard';
import { logger } from '../../utils/logger';

/**
 * Get portfolio summary for user
 */
async function getPortfolioSummary(ctx: MenuContext): Promise<PortfolioSummary | null> {
  const wallet = await ctx.getWallet();
  if (!wallet) return null;

  try {
    const positions = ctx.db.getPositions(wallet);
    if (positions.length === 0) {
      return {
        totalValue: 0,
        totalPnl: 0,
        totalPnlPct: 0,
        positionsCount: 0,
        tradableBalance: 0,
        openOrdersValue: 0,
        byPlatform: {},
      };
    }

    let totalValue = 0;
    let totalCostBasis = 0;
    const byPlatform: Record<string, { value: number; pnl: number }> = {};

    for (const pos of positions) {
      const value = pos.shares * pos.currentPrice;
      const costBasis = pos.shares * pos.avgPrice;
      const pnl = value - costBasis;

      totalValue += value;
      totalCostBasis += costBasis;

      if (!byPlatform[pos.platform]) {
        byPlatform[pos.platform] = { value: 0, pnl: 0 };
      }
      byPlatform[pos.platform].value += value;
      byPlatform[pos.platform].pnl += pnl;
    }

    const totalPnl = totalValue - totalCostBasis;
    const totalPnlPct = totalCostBasis > 0 ? totalPnl / totalCostBasis : 0;

    return {
      totalValue,
      totalPnl,
      totalPnlPct,
      positionsCount: positions.length,
      tradableBalance: 0, // Would need to fetch from exchange
      openOrdersValue: 0, // Would need to fetch from exchange
      byPlatform,
    };
  } catch (error) {
    logger.warn({ error }, 'Failed to get portfolio summary');
    return null;
  }
}

/**
 * Main menu handler - /start command and menu:main callback
 */
export async function mainMenuHandler(ctx: MenuContext): Promise<MenuResult> {
  ctx.state.currentMenu = 'main';

  const wallet = await ctx.getWallet();
  const portfolio = await getPortfolioSummary(ctx);

  let portfolioText: string;

  if (!wallet) {
    portfolioText = `🔗 *Link your wallet to start trading*

Connect your wallet through the web app at app.clodds.com to enable trading features.`;
  } else if (!portfolio || portfolio.positionsCount === 0) {
    portfolioText = `📊 *No Active Positions*

Your wallet is connected! Browse markets below to start trading.`;
  } else {
    portfolioText = `📊 *Portfolio Summary*

💰 Positions Value: ${formatUSD(portfolio.totalValue)}
📈 Total P&L: ${formatPnL(portfolio.totalPnl)} (${(portfolio.totalPnlPct * 100).toFixed(1)}%)
📋 Active Positions: ${portfolio.positionsCount}`;
  }

  const text = `🚀 *Welcome to CloddsBot*

The fastest and most secure bot for trading on Polymarket.

${portfolioText}`;

  return {
    text,
    buttons: mainMenuButtons(),
    parseMode: 'Markdown',
  };
}

/**
 * Settings menu handler
 */
export async function settingsMenuHandler(ctx: MenuContext): Promise<MenuResult> {
  ctx.state.currentMenu = 'settings';

  const wallet = await ctx.getWallet();

  let credentialsStatus = '❌ Not Connected';
  if (wallet) {
    const hasPolymarket = await ctx.credentials.hasCredentials(wallet, 'polymarket');
    const hasKalshi = await ctx.credentials.hasCredentials(wallet, 'kalshi');

    const platforms: string[] = [];
    if (hasPolymarket) platforms.push('Polymarket');
    if (hasKalshi) platforms.push('Kalshi');

    credentialsStatus = platforms.length > 0
      ? `✅ ${platforms.join(', ')}`
      : '❌ No platforms connected';
  }

  const text = `⚙️ *Settings*

🔗 *Wallet Status*
${wallet ? `Connected: \`${wallet.slice(0, 6)}...${wallet.slice(-4)}\`` : '❌ Not connected'}

🔐 *Trading Credentials*
${credentialsStatus}

📱 *Manage Settings*
Visit app.clodds.com to:
• Connect/disconnect wallet
• Add trading credentials
• Configure notifications
• View detailed analytics`;

  return {
    text,
    buttons: [
      [
        { text: '🌐 Open Web App', url: 'https://app.clodds.com/settings' },
      ],
      [
        { text: '🔄 Refresh', callbackData: 'menu:settings' },
        { text: '🏠 Main Menu', callbackData: 'menu:main' },
      ],
    ],
    parseMode: 'Markdown',
  };
}
