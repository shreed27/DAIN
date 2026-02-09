/**
 * Copy Trading Menu Handler - Manage copy trading subscriptions
 */

import type { MenuContext, MenuResult } from '../types';
import type { CopyTradingConfigRecord } from '../../trading/copy-trading-orchestrator';
import { formatUSD, formatRelativeTime, truncateAddress, formatPercent } from '../utils/format';
import { btn, paginationRow, copyFilterButtons, mainMenuBtn, backBtn } from '../utils/keyboard';
import { logger } from '../../utils/logger';

const PAGE_SIZE = 5;

/**
 * Copy trading overview handler
 */
export async function copyTradingHandler(
  ctx: MenuContext,
  params: string[]
): Promise<MenuResult> {
  const filter = (params[0] as 'all' | 'active' | 'paused') || ctx.state.copyFilter || 'all';
  const page = parseInt(params[1] || '1', 10);

  ctx.state.currentMenu = 'copy_trading';
  ctx.state.copyFilter = filter;
  ctx.state.copyPage = page;

  const wallet = await ctx.getWallet();

  if (!wallet) {
    return {
      text: `🤖 *Copy Trading*

🔗 *Wallet Not Connected*

Connect your wallet to use copy trading.

Copy trading allows you to automatically follow and replicate trades from successful traders.`,
      buttons: [
        [{ text: '🔗 Connect Wallet', url: 'https://app.clodds.com/settings' }],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }

  if (!ctx.copyTrading) {
    return {
      text: `🤖 *Copy Trading*

⚠️ *Service Unavailable*

Copy trading service is not currently available.`,
      buttons: [[mainMenuBtn()]],
      parseMode: 'Markdown',
    };
  }

  // Get configs for this wallet
  let configs: CopyTradingConfigRecord[] = [];
  try {
    configs = await ctx.copyTrading.getConfigsForWallet(wallet);
  } catch (error) {
    logger.warn({ error }, 'Failed to get copy trading configs');
  }

  // Get aggregated stats
  let stats;
  try {
    stats = await ctx.copyTrading.getAggregatedStats(wallet);
  } catch (error) {
    logger.warn({ error }, 'Failed to get copy trading stats');
    stats = {
      totalConfigs: 0,
      activeConfigs: 0,
      totalCopiedTrades: 0,
      successfulTrades: 0,
      totalPnl: 0,
      successRate: 0,
    };
  }

  // Filter configs
  let filteredConfigs = configs;
  if (filter === 'active') {
    filteredConfigs = configs.filter((c) => c.enabled);
  } else if (filter === 'paused') {
    filteredConfigs = configs.filter((c) => !c.enabled);
  }

  // Counts for filter buttons
  const counts = {
    all: configs.length,
    active: configs.filter((c) => c.enabled).length,
    paused: configs.filter((c) => !c.enabled).length,
  };

  // Paginate
  const totalPages = Math.ceil(filteredConfigs.length / PAGE_SIZE) || 1;
  const pageConfigs = filteredConfigs.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  let text = `🤖 *Copy Trading*

📊 *Stats*
├ Active Subscriptions: ${stats.activeConfigs}/${stats.totalConfigs}
├ Total Trades Copied: ${stats.totalCopiedTrades}
├ Success Rate: ${stats.successRate.toFixed(1)}%
└ Total P&L: ${formatUSD(stats.totalPnl)}
${stats.topPerformingTarget ? `\n🏆 Top Performer: \`${truncateAddress(stats.topPerformingTarget.wallet)}\` (+${formatUSD(stats.topPerformingTarget.pnl)})` : ''}

━━━━━━━━━━━━━━━━━━━━
`;

  if (filteredConfigs.length === 0) {
    if (filter === 'all') {
      text += `\n📭 *No Subscriptions*

You're not following any traders yet.

Tap "Add Subscription" to start copying a trader, or use "Discover" to find top performers.`;
    } else {
      text += `\n📭 *No ${filter === 'active' ? 'Active' : 'Paused'} Subscriptions*`;
    }
  } else {
    text += `\n*Subscriptions* (Page ${page}/${totalPages})\n`;

    pageConfigs.forEach((config, i) => {
      const num = (page - 1) * PAGE_SIZE + i + 1;
      const statusEmoji = config.enabled ? '🟢' : '⏸️';
      const label = config.targetLabel || truncateAddress(config.targetWallet);
      const pnlSign = config.totalPnl >= 0 ? '+' : '';

      text += `
*${num}) ${statusEmoji} ${label}*
├ Trades: ${config.totalTrades} · P&L: ${pnlSign}${formatUSD(config.totalPnl)}
├ Size: $${config.fixedSize} · Mode: ${config.sizingMode}
└ Created: ${formatRelativeTime(config.createdAt)}
`;
    });
  }

  // Build subscription action buttons
  const configButtons: ReturnType<typeof btn>[][] = [];
  pageConfigs.forEach((config, i) => {
    const num = (page - 1) * PAGE_SIZE + i + 1;
    configButtons.push([
      config.enabled
        ? btn(`⏸️ Pause #${num}`, `copy:toggle:${config.id}`)
        : btn(`▶️ Resume #${num}`, `copy:toggle:${config.id}`),
      btn(`📊 Stats #${num}`, `copy:stats:${config.id}`),
      btn(`🗑️ #${num}`, `copy:del:${config.id}`),
    ]);
  });

  const buttons = [
    paginationRow({
      current: page,
      total: totalPages,
      baseCallback: `copy:filter:${filter}`,
    }),
    copyFilterButtons(filter, counts),
    ...configButtons,
    [
      btn('➕ Add Subscription', 'copy:add'),
      btn('🏆 Discover', 'copy:discover'),
    ],
    [
      btn('📋 Recent Activity', 'copy:activity'),
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
 * Add subscription prompt handler
 */
export async function addSubscriptionHandler(ctx: MenuContext): Promise<MenuResult> {
  ctx.state.currentMenu = 'copy_add_input';
  ctx.state.pendingWallet = undefined;

  const text = `➕ *Add Subscription*

Enter the trader's wallet address to start copying their trades.

*Example:*
\`0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045\`

*Tips:*
• Use Polymarket leaderboard to find top traders
• Check their trading history before following
• Start with small allocation sizes

Just send the wallet address as a message.`;

  return {
    text,
    buttons: [
      [
        { text: '🏆 Polymarket Leaderboard', url: 'https://polymarket.com/leaderboard' },
      ],
      [
        backBtn('menu:copy'),
        mainMenuBtn(),
      ],
    ],
    parseMode: 'Markdown',
  };
}

/**
 * Confirm subscription handler (after user enters wallet)
 */
export async function confirmSubscriptionHandler(
  ctx: MenuContext,
  targetWallet: string
): Promise<MenuResult> {
  ctx.state.currentMenu = 'copy_confirm';
  ctx.state.pendingWallet = targetWallet;

  const text = `➕ *Confirm Subscription*

*Target Wallet:*
\`${targetWallet}\`

*Default Settings:*
├ Size Mode: Fixed
├ Trade Size: $100
├ Max Position: $500
└ Copy Delay: 5 seconds

*Are you sure you want to follow this trader?*

You can modify settings after creating the subscription.`;

  return {
    text,
    buttons: [
      [
        btn('✅ Confirm', `copy:exec:add:${targetWallet}`),
        btn('⚙️ Configure First', `copy:config:${targetWallet}`),
      ],
      [
        backBtn('copy:add'),
        mainMenuBtn(),
      ],
    ],
    parseMode: 'Markdown',
  };
}

/**
 * Execute add subscription
 */
export async function executeAddSubscription(
  ctx: MenuContext,
  params: string[]
): Promise<MenuResult> {
  const targetWallet = params[0];

  const wallet = await ctx.getWallet();
  if (!wallet || !ctx.copyTrading) {
    return {
      text: `❌ Cannot create subscription`,
      buttons: [[mainMenuBtn()]],
      parseMode: 'Markdown',
    };
  }

  try {
    const config = await ctx.copyTrading.createConfig(wallet, {
      targetWallet,
      enabled: true,
      sizingMode: 'fixed',
      fixedSize: 100,
      maxPositionSize: 500,
      copyDelayMs: 5000,
    });

    return {
      text: `✅ *Subscription Created!*

Now following: \`${truncateAddress(targetWallet)}\`

├ Config ID: \`${config.id}\`
├ Status: 🟢 Active
├ Size: $${config.fixedSize} per trade
└ Max Position: $${config.maxPositionSize}

You'll automatically copy this trader's new positions.`,
      buttons: [
        [btn('📊 View Stats', `copy:stats:${config.id}`)],
        [btn('🤖 Copy Trading', 'menu:copy')],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  } catch (error) {
    logger.error({ error, targetWallet }, 'Failed to create subscription');
    return {
      text: `❌ *Failed to Create Subscription*

Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      buttons: [
        [btn('🔄 Try Again', 'copy:add')],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }
}

/**
 * Toggle subscription handler
 */
export async function toggleSubscriptionHandler(
  ctx: MenuContext,
  params: string[]
): Promise<MenuResult> {
  const configId = params[0];

  const wallet = await ctx.getWallet();
  if (!wallet || !ctx.copyTrading) {
    return {
      text: `❌ Cannot toggle subscription`,
      buttons: [[mainMenuBtn()]],
      parseMode: 'Markdown',
    };
  }

  try {
    const config = await ctx.copyTrading.getConfig(configId);
    if (!config) {
      throw new Error('Subscription not found');
    }

    const newEnabled = !config.enabled;
    await ctx.copyTrading.toggleConfig(configId, newEnabled);

    const statusEmoji = newEnabled ? '🟢' : '⏸️';
    const statusText = newEnabled ? 'Active' : 'Paused';

    return {
      text: `${statusEmoji} *Subscription ${statusText}*

\`${config.targetLabel || truncateAddress(config.targetWallet)}\`

Status changed to: *${statusText}*`,
      buttons: [
        [btn('🤖 Copy Trading', 'menu:copy')],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  } catch (error) {
    logger.error({ error, configId }, 'Failed to toggle subscription');
    return {
      text: `❌ *Failed to Toggle Subscription*

Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      buttons: [
        [btn('🤖 Copy Trading', 'menu:copy')],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }
}

/**
 * Delete subscription confirmation handler
 */
export async function deleteSubscriptionHandler(
  ctx: MenuContext,
  params: string[]
): Promise<MenuResult> {
  const configId = params[0];
  ctx.state.currentMenu = 'copy_delete';

  if (!ctx.copyTrading) {
    return {
      text: `❌ Service unavailable`,
      buttons: [[mainMenuBtn()]],
      parseMode: 'Markdown',
    };
  }

  const config = await ctx.copyTrading.getConfig(configId);
  if (!config) {
    return {
      text: `❌ Subscription not found`,
      buttons: [[btn('🤖 Copy Trading', 'menu:copy')], [mainMenuBtn()]],
      parseMode: 'Markdown',
    };
  }

  const text = `⚠️ *Delete Subscription?*

*${config.targetLabel || truncateAddress(config.targetWallet)}*

├ Trades: ${config.totalTrades}
├ P&L: ${formatUSD(config.totalPnl)}
└ Created: ${formatRelativeTime(config.createdAt)}

*This cannot be undone!*

Note: This will NOT close any existing positions.`;

  return {
    text,
    buttons: [
      [
        btn('🗑️ Delete', `copy:exec:del:${configId}`),
        backBtn('menu:copy'),
      ],
    ],
    parseMode: 'Markdown',
  };
}

/**
 * Execute delete subscription
 */
export async function executeDeleteSubscription(
  ctx: MenuContext,
  params: string[]
): Promise<MenuResult> {
  const configId = params[0];

  if (!ctx.copyTrading) {
    return {
      text: `❌ Service unavailable`,
      buttons: [[mainMenuBtn()]],
      parseMode: 'Markdown',
    };
  }

  try {
    await ctx.copyTrading.deleteConfig(configId);

    return {
      text: `✅ *Subscription Deleted*

The subscription has been removed.`,
      buttons: [
        [btn('🤖 Copy Trading', 'menu:copy')],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  } catch (error) {
    logger.error({ error, configId }, 'Failed to delete subscription');
    return {
      text: `❌ *Failed to Delete*

Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      buttons: [
        [btn('🤖 Copy Trading', 'menu:copy')],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }
}

/**
 * Subscription stats handler
 */
export async function subscriptionStatsHandler(
  ctx: MenuContext,
  params: string[]
): Promise<MenuResult> {
  const configId = params[0];
  ctx.state.currentMenu = 'copy_stats';

  if (!ctx.copyTrading) {
    return {
      text: `❌ Service unavailable`,
      buttons: [[mainMenuBtn()]],
      parseMode: 'Markdown',
    };
  }

  const config = await ctx.copyTrading.getConfig(configId);
  if (!config) {
    return {
      text: `❌ Subscription not found`,
      buttons: [[btn('🤖 Copy Trading', 'menu:copy')], [mainMenuBtn()]],
      parseMode: 'Markdown',
    };
  }

  const wallet = await ctx.getWallet();
  const history = wallet
    ? await ctx.copyTrading.getHistory(wallet, { configId, limit: 10 })
    : [];

  const winningTrades = history.filter((t) => (t.pnl || 0) > 0);
  const winRate = history.length > 0 ? (winningTrades.length / history.length) * 100 : 0;

  const statusEmoji = config.enabled ? '🟢' : '⏸️';

  let text = `📊 *Subscription Stats*

${statusEmoji} *${config.targetLabel || truncateAddress(config.targetWallet)}*

📈 *Performance*
├ Total Trades: ${config.totalTrades}
├ Win Rate: ${winRate.toFixed(1)}%
└ Total P&L: ${formatUSD(config.totalPnl)}

⚙️ *Settings*
├ Mode: ${config.sizingMode}
├ Size: $${config.fixedSize}
├ Max Position: $${config.maxPositionSize}
├ Dry Run: ${config.dryRun ? 'Yes' : 'No'}
└ Created: ${formatRelativeTime(config.createdAt)}

━━━━━━━━━━━━━━━━━━━━
*Recent Trades*
`;

  if (history.length === 0) {
    text += '\nNo trades yet.';
  } else {
    history.slice(0, 5).forEach((trade) => {
      const sideEmoji = trade.side === 'BUY' ? '🟢' : '🔴';
      const pnlText = trade.pnl != null ? ` · ${formatUSD(trade.pnl)}` : '';
      text += `\n${sideEmoji} ${truncateAddress(trade.marketId)} · $${trade.copiedSize.toFixed(2)}${pnlText}`;
    });
  }

  return {
    text,
    buttons: [
      [
        config.enabled
          ? btn('⏸️ Pause', `copy:toggle:${configId}`)
          : btn('▶️ Resume', `copy:toggle:${configId}`),
        btn('🗑️ Delete', `copy:del:${configId}`),
      ],
      [
        btn('🔄 Refresh', `copy:stats:${configId}`),
        backBtn('menu:copy'),
      ],
      [mainMenuBtn()],
    ],
    parseMode: 'Markdown',
  };
}

/**
 * Discover top traders handler
 */
export async function discoverTradersHandler(ctx: MenuContext): Promise<MenuResult> {
  ctx.state.currentMenu = 'copy_discover';

  const text = `🏆 *Discover Top Traders*

Find successful traders to follow:

*Resources:*
• Polymarket Leaderboard - Official rankings
• Polymarket Whales - Large position holders
• Twitter/X - Follow prediction market communities

*Tips for Finding Good Traders:*
├ Look for consistent profits over time
├ Check their trading history
├ Prefer traders with similar risk tolerance
├ Start with small allocation sizes
└ Diversify across multiple traders

⚠️ *Disclaimer:*
Past performance does not guarantee future results. Only invest what you can afford to lose.`;

  return {
    text,
    buttons: [
      [
        { text: '🏆 Polymarket Leaderboard', url: 'https://polymarket.com/leaderboard' },
      ],
      [
        { text: '🐋 Whale Watchers', url: 'https://polymarket.com' },
      ],
      [
        btn('➕ Add Subscription', 'copy:add'),
        backBtn('menu:copy'),
      ],
      [mainMenuBtn()],
    ],
    parseMode: 'Markdown',
  };
}

/**
 * Recent activity handler
 */
export async function recentActivityHandler(ctx: MenuContext): Promise<MenuResult> {
  ctx.state.currentMenu = 'copy_activity';

  const wallet = await ctx.getWallet();
  if (!wallet || !ctx.copyTrading) {
    return {
      text: `❌ Cannot load activity`,
      buttons: [[mainMenuBtn()]],
      parseMode: 'Markdown',
    };
  }

  const history = await ctx.copyTrading.getHistory(wallet, { limit: 15 });

  let text = `📋 *Recent Copy Trading Activity*\n\n`;

  if (history.length === 0) {
    text += `📭 *No Activity Yet*

No trades have been copied yet. Make sure you have active subscriptions.`;
  } else {
    history.forEach((trade) => {
      const sideEmoji = trade.side === 'BUY' ? '🟢' : '🔴';
      const statusEmoji =
        trade.status === 'filled' ? '✅' :
        trade.status === 'closed' ? '🏁' :
        trade.status === 'failed' ? '❌' : '⏳';
      const pnlText = trade.pnl != null ? ` · P&L: ${formatUSD(trade.pnl)}` : '';

      text += `${statusEmoji} ${sideEmoji} ${truncateAddress(trade.targetWallet)}
├ ${truncateAddress(trade.marketId)}
└ $${trade.copiedSize.toFixed(2)} · ${formatRelativeTime(trade.createdAt)}${pnlText}

`;
    });
  }

  return {
    text,
    buttons: [
      [
        btn('🔄 Refresh', 'copy:activity'),
        backBtn('menu:copy'),
      ],
      [mainMenuBtn()],
    ],
    parseMode: 'Markdown',
  };
}
