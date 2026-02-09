/**
 * Markets Menu Handler - Market search and detail views
 */

import type { MenuContext, MenuResult, MarketSummary } from '../types';
import type { Market } from '../../types';
import { formatNumber, formatCents, formatDate, truncate } from '../utils/format';
import { btn, paginationRow, marketTradingButtons, mainMenuBtn, backBtn } from '../utils/keyboard';
import { logger } from '../../utils/logger';

const PAGE_SIZE = 5;

/**
 * Convert Market to MarketSummary
 */
function marketToSummary(market: Market): MarketSummary {
  const yesOutcome = market.outcomes?.find(
    (o) => o.name.toLowerCase() === 'yes'
  );
  const noOutcome = market.outcomes?.find(
    (o) => o.name.toLowerCase() === 'no'
  );

  return {
    id: market.id,
    conditionId: market.id, // Use market ID as condition ID fallback
    question: market.question,
    yesPrice: yesOutcome?.price ?? 0.5,
    noPrice: noOutcome?.price ?? 0.5,
    yesTokenId: yesOutcome?.tokenId || yesOutcome?.id || market.id + '_yes',
    noTokenId: noOutcome?.tokenId || noOutcome?.id || market.id + '_no',
    volume24h: market.volume24h || 0,
    liquidity: market.liquidity || 0,
    url: market.url,
    endDate: market.endDate,
  };
}

/**
 * Search prompt handler - show search input prompt
 */
export async function searchPromptHandler(ctx: MenuContext): Promise<MenuResult> {
  ctx.state.currentMenu = 'search_input';
  ctx.state.searchQuery = undefined;
  ctx.state.searchPage = 1;

  const text = `🔍 *Market Search*

Type a search term to find markets:

*Examples:*
• "Trump" - Elections
• "Bitcoin 100k" - Crypto
• "Super Bowl" - Sports
• "Fed rate" - Economics

Just send your search term as a message.`;

  return {
    text,
    buttons: [
      [
        btn('🔥 Trending', 'search:_trending:1'),
        btn('💰 High Volume', 'search:_volume:1'),
      ],
      [mainMenuBtn()],
    ],
    parseMode: 'Markdown',
  };
}

/**
 * Search results handler
 */
export async function searchResultsHandler(
  ctx: MenuContext,
  params: string[]
): Promise<MenuResult> {
  const query = params[0] || ctx.state.searchQuery || '';
  const page = parseInt(params[1] || '1', 10);

  ctx.state.currentMenu = 'search_results';
  ctx.state.searchQuery = query;
  ctx.state.searchPage = page;

  // Handle special queries
  let markets: Market[] = [];
  let displayQuery = query;

  try {
    if (query === '_trending' || query === '_volume') {
      // Search with empty query to get popular markets
      markets = await ctx.feeds.searchMarkets('', 'polymarket');
      displayQuery = query === '_trending' ? 'Trending' : 'High Volume';

      // Sort by volume for high volume query
      if (query === '_volume') {
        markets.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
      }
    } else if (query) {
      markets = await ctx.feeds.searchMarkets(query, 'polymarket');
    }
  } catch (error) {
    logger.warn({ error, query }, 'Market search failed');
  }

  if (!markets || markets.length === 0) {
    return {
      text: `🔍 *Market Search*

No markets found for: *${displayQuery}*

Try a different search term or browse trending markets.`,
      buttons: [
        [
          btn('🔥 Trending', 'search:_trending:1'),
          btn('🔍 New Search', 'menu:search'),
        ],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }

  const totalPages = Math.ceil(markets.length / PAGE_SIZE);
  const pageMarkets = markets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  let text = `🔍 *Market Search*\n`;
  text += `Search: *${displayQuery}* (${markets.length} results)\n\n`;

  const marketButtons: ReturnType<typeof btn>[][] = [];

  pageMarkets.forEach((market, i) => {
    const num = (page - 1) * PAGE_SIZE + i + 1;
    const summary = marketToSummary(market);

    text += `*${num}) ${truncate(market.question, 60)}*\n`;
    text += `├ YES ${formatCents(summary.yesPrice)} · NO ${formatCents(summary.noPrice)}\n`;
    text += `├ Vol $${formatNumber(summary.volume24h, 0)} · Liq $${formatNumber(summary.liquidity, 0)}\n`;
    text += `└ [View](${market.url})\n\n`;

    // Add trade button for each market
    marketButtons.push([
      btn(`📊 #${num} Details`, `market:${market.id}`),
    ]);
  });

  const buttons = [
    ...marketButtons,
    paginationRow({
      current: page,
      total: totalPages,
      baseCallback: `search:${query}`,
    }),
    [
      btn('🔍 New Search', 'menu:search'),
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
 * Market detail handler
 */
export async function marketDetailHandler(
  ctx: MenuContext,
  params: string[]
): Promise<MenuResult> {
  const marketId = params[0];
  ctx.state.currentMenu = 'market_detail';
  ctx.state.selectedMarket = marketId;

  let market: Market | null = null;
  try {
    market = await ctx.feeds.getMarket(marketId, 'polymarket');
  } catch (error) {
    logger.warn({ error, marketId }, 'Failed to get market');
  }

  if (!market) {
    return {
      text: `❌ *Market Not Found*

Could not find market with ID: \`${marketId}\`

The market may have been resolved or removed.`,
      buttons: [
        [btn('🔍 Search Markets', 'menu:search')],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }

  const summary = marketToSummary(market);
  ctx.state.selectedToken = summary.yesTokenId;

  // Check if user has position in this market
  const wallet = await ctx.getWallet();
  let positionText = '';
  if (wallet) {
    const positions = ctx.db.getPositions(wallet);
    const marketPositions = positions.filter((p) => p.marketId === marketId);
    if (marketPositions.length > 0) {
      positionText = '\n📌 *Your Position*\n';
      for (const pos of marketPositions) {
        const pnlSign = pos.pnl >= 0 ? '+' : '';
        positionText += `├ ${pos.outcome}: ${pos.shares.toFixed(2)} @ ${formatCents(pos.avgPrice)}\n`;
        positionText += `└ P&L: ${pnlSign}$${pos.pnl.toFixed(2)} (${pnlSign}${(pos.pnlPct * 100).toFixed(1)}%)\n`;
      }
    }
  }

  const text = `📊 *${market.question}*

💹 *Current Prices*
├ Yes: ${formatCents(summary.yesPrice)}
└ No: ${formatCents(summary.noPrice)}

📈 *Market Stats*
├ Volume (All): $${formatNumber(market.volume24h * 30 || 0, 0)}
├ Volume (24h): $${formatNumber(summary.volume24h, 0)}
└ Liquidity: $${formatNumber(summary.liquidity, 0)}

📅 *Timeline*
├ Created: ${formatDate(market.createdAt)}
└ Expires: ${formatDate(summary.endDate)}
${positionText}
🔗 [View on Polymarket](${market.url})`;

  // Build trading buttons
  let buttons = marketTradingButtons(
    summary.yesTokenId,
    summary.noTokenId,
    marketId
  );

  // Add back button if we came from search
  if (ctx.state.searchQuery) {
    buttons = [
      ...buttons.slice(0, -1),
      [
        backBtn(`search:${ctx.state.searchQuery}:${ctx.state.searchPage || 1}`),
        ...buttons[buttons.length - 1],
      ],
    ];
  }

  return {
    text,
    buttons,
    parseMode: 'Markdown',
  };
}
