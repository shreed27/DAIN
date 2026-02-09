/**
 * Order Wizard Handler - Step-by-step order entry flow
 */

import type { MenuContext, MenuResult } from '../types';
import type { Market } from '../../types';
import { formatUSD, formatCents, truncate } from '../utils/format';
import { btn, orderSizeButtons, orderPriceButtons, orderConfirmButtons, mainMenuBtn, backBtn } from '../utils/keyboard';
import { logger } from '../../utils/logger';

/**
 * Start buy flow - size selection
 */
export async function startBuyHandler(
  ctx: MenuContext,
  params: string[]
): Promise<MenuResult> {
  const tokenId = params[0];
  ctx.state.currentMenu = 'buy';
  ctx.state.selectedToken = tokenId;
  ctx.state.orderSide = 'buy';
  ctx.state.orderType = 'market';
  ctx.state.orderSize = undefined;
  ctx.state.orderPrice = undefined;

  const wallet = await ctx.getWallet();

  if (!wallet) {
    return {
      text: `❌ *Wallet Not Connected*

Connect your wallet to place orders.`,
      buttons: [
        [{ text: '🔗 Connect Wallet', url: 'https://app.clodds.com/settings' }],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }

  // Check credentials
  const hasPolymarket = await ctx.credentials.hasCredentials(wallet, 'polymarket');
  if (!hasPolymarket) {
    return {
      text: `❌ *Polymarket Not Connected*

You need to connect your Polymarket credentials to trade.

Visit the web app settings to add your API credentials.`,
      buttons: [
        [{ text: '⚙️ Settings', url: 'https://app.clodds.com/settings' }],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }

  // Get current price for the token
  let currentPrice = 0.5;
  try {
    // Try to get price from market
    const marketId = ctx.state.selectedMarket;
    if (marketId) {
      const market = await ctx.feeds.getMarket(marketId, 'polymarket');
      if (market) {
        const outcome = market.outcomes?.find(
          (o) => o.tokenId === tokenId || o.id === tokenId
        );
        if (outcome) {
          currentPrice = outcome.price;
        }
      }
    }
  } catch (error) {
    logger.warn({ error, tokenId }, 'Failed to get token price');
  }

  const text = `📝 *Market Buy Order*

Token: \`${tokenId.slice(0, 12)}...\`
Current Price: ${formatCents(currentPrice)}

*Select Order Size (USD):*

Your order will be executed at the best available price.`;

  return {
    text,
    buttons: orderSizeButtons(tokenId),
    parseMode: 'Markdown',
  };
}

/**
 * Start sell flow - size selection
 */
export async function startSellHandler(
  ctx: MenuContext,
  params: string[]
): Promise<MenuResult> {
  const tokenId = params[0];
  ctx.state.currentMenu = 'sell';
  ctx.state.selectedToken = tokenId;
  ctx.state.orderSide = 'sell';
  ctx.state.orderType = 'market';
  ctx.state.orderSize = undefined;
  ctx.state.orderPrice = undefined;

  const wallet = await ctx.getWallet();
  if (!wallet) {
    return {
      text: `❌ Wallet not connected`,
      buttons: [[mainMenuBtn()]],
      parseMode: 'Markdown',
    };
  }

  const text = `📝 *Market Sell Order*

Token: \`${tokenId.slice(0, 12)}...\`

*Select Order Size (USD):*

Your shares will be sold at the best available price.`;

  return {
    text,
    buttons: orderSizeButtons(tokenId),
    parseMode: 'Markdown',
  };
}

/**
 * Start limit buy flow
 */
export async function startLimitBuyHandler(
  ctx: MenuContext,
  params: string[]
): Promise<MenuResult> {
  const tokenId = params[0];
  ctx.state.currentMenu = 'limitb';
  ctx.state.selectedToken = tokenId;
  ctx.state.orderSide = 'buy';
  ctx.state.orderType = 'limit';
  ctx.state.orderSize = undefined;
  ctx.state.orderPrice = undefined;

  const wallet = await ctx.getWallet();
  if (!wallet) {
    return {
      text: `❌ Wallet not connected`,
      buttons: [[mainMenuBtn()]],
      parseMode: 'Markdown',
    };
  }

  const hasPolymarket = await ctx.credentials.hasCredentials(wallet, 'polymarket');
  if (!hasPolymarket) {
    return {
      text: `❌ *Polymarket Not Connected*

Add your Polymarket credentials in settings.`,
      buttons: [
        [{ text: '⚙️ Settings', url: 'https://app.clodds.com/settings' }],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }

  const text = `📈 *Limit Buy Order*

Token: \`${tokenId.slice(0, 12)}...\`

*Select Order Size (USD):*

After selecting size, you'll choose your limit price.`;

  return {
    text,
    buttons: orderSizeButtons(tokenId),
    parseMode: 'Markdown',
  };
}

/**
 * Start limit sell flow
 */
export async function startLimitSellHandler(
  ctx: MenuContext,
  params: string[]
): Promise<MenuResult> {
  const tokenId = params[0];
  ctx.state.currentMenu = 'limits';
  ctx.state.selectedToken = tokenId;
  ctx.state.orderSide = 'sell';
  ctx.state.orderType = 'limit';
  ctx.state.orderSize = undefined;
  ctx.state.orderPrice = undefined;

  const wallet = await ctx.getWallet();
  if (!wallet) {
    return {
      text: `❌ Wallet not connected`,
      buttons: [[mainMenuBtn()]],
      parseMode: 'Markdown',
    };
  }

  const text = `📈 *Limit Sell Order*

Token: \`${tokenId.slice(0, 12)}...\`

*Select Order Size (USD):*

After selecting size, you'll choose your limit price.`;

  return {
    text,
    buttons: orderSizeButtons(tokenId),
    parseMode: 'Markdown',
  };
}

/**
 * Handle size selection
 */
export async function handleSizeSelection(
  ctx: MenuContext,
  params: string[]
): Promise<MenuResult> {
  const tokenId = params[0];
  const size = parseFloat(params[1]);

  ctx.state.orderSize = size;

  // For market orders, go straight to confirmation
  if (ctx.state.orderType === 'market') {
    return orderConfirmHandler(ctx, [tokenId]);
  }

  // For limit orders, show price selection
  // Get current price for reference
  let currentPrice = 0.5;
  try {
    const marketId = ctx.state.selectedMarket;
    if (marketId) {
      const market = await ctx.feeds.getMarket(marketId, 'polymarket');
      if (market) {
        const outcome = market.outcomes?.find(
          (o) => o.tokenId === tokenId || o.id === tokenId
        );
        if (outcome) {
          currentPrice = outcome.price;
        }
      }
    }
  } catch {
    // Use default
  }

  const sideText = ctx.state.orderSide === 'buy' ? 'Buy' : 'Sell';

  const text = `📈 *Limit ${sideText} Order*

Token: \`${tokenId.slice(0, 12)}...\`
Size: ${formatUSD(size)}
Current Price: ${formatCents(currentPrice)}

*Select Limit Price:*

${ctx.state.orderSide === 'buy'
  ? 'Your order will fill when price drops to or below your limit.'
  : 'Your order will fill when price rises to or above your limit.'}`;

  return {
    text,
    buttons: orderPriceButtons(tokenId, currentPrice),
    parseMode: 'Markdown',
  };
}

/**
 * Handle price selection
 */
export async function handlePriceSelection(
  ctx: MenuContext,
  params: string[]
): Promise<MenuResult> {
  const tokenId = params[0];
  const price = parseFloat(params[1]);

  ctx.state.orderPrice = price;

  return orderConfirmHandler(ctx, [tokenId]);
}

/**
 * Order confirmation handler
 */
export async function orderConfirmHandler(
  ctx: MenuContext,
  params: string[]
): Promise<MenuResult> {
  const tokenId = params[0] || ctx.state.selectedToken;
  ctx.state.currentMenu = 'order_confirm';

  const size = ctx.state.orderSize!;
  const price = ctx.state.orderPrice;
  const side = ctx.state.orderSide!;
  const orderType = ctx.state.orderType!;

  // Calculate estimated shares
  const estimatedPrice = price || 0.5; // Use limit price or assume 0.5 for market
  const estimatedShares = size / estimatedPrice;

  const sideEmoji = side === 'buy' ? '🟢' : '🔴';
  const orderTypeText = orderType === 'market' ? 'Market' : 'Limit';

  let priceText = '';
  if (orderType === 'limit') {
    priceText = `├ Limit Price: ${formatCents(price!)}`;
  } else {
    priceText = `├ Type: Market Order (best available)`;
  }

  const text = `✅ *Confirm ${orderTypeText} ${side.charAt(0).toUpperCase() + side.slice(1)}*

${sideEmoji} *Order Details*
├ Token: \`${tokenId?.slice(0, 12)}...\`
├ Size: ${formatUSD(size)}
${priceText}
└ Est. Shares: ~${estimatedShares.toFixed(2)}

⚠️ *This will execute a real trade!*

Make sure you have sufficient balance.`;

  return {
    text,
    buttons: orderConfirmButtons(tokenId!),
    parseMode: 'Markdown',
  };
}

/**
 * Execute order
 */
export async function executeOrderHandler(
  ctx: MenuContext,
  params: string[]
): Promise<MenuResult> {
  const tokenId = params[0] || ctx.state.selectedToken!;
  ctx.state.currentMenu = 'order_executing';

  const wallet = await ctx.getWallet();
  if (!wallet || !ctx.execution) {
    return {
      text: `❌ *Cannot Execute Order*

${!wallet ? 'Wallet not connected.' : 'Trading service not available.'}`,
      buttons: [[mainMenuBtn()]],
      parseMode: 'Markdown',
    };
  }

  const size = ctx.state.orderSize!;
  const price = ctx.state.orderPrice;
  const side = ctx.state.orderSide!;
  const orderType = ctx.state.orderType!;
  const marketId = ctx.state.selectedMarket || tokenId.split('_')[0];

  try {
    let result;

    // Calculate size in shares (approximately)
    const sharePrice = price || 0.5;
    const shares = size / sharePrice;

    if (orderType === 'market') {
      if (side === 'buy') {
        result = await ctx.execution.marketBuy({
          platform: 'polymarket',
          marketId,
          tokenId,
          size: shares,
        });
      } else {
        result = await ctx.execution.marketSell({
          platform: 'polymarket',
          marketId,
          tokenId,
          size: shares,
        });
      }
    } else {
      // Limit order
      if (side === 'buy') {
        result = await ctx.execution.buyLimit({
          platform: 'polymarket',
          marketId,
          tokenId,
          price: price!,
          size: shares,
          orderType: 'GTC',
        });
      } else {
        result = await ctx.execution.sellLimit({
          platform: 'polymarket',
          marketId,
          tokenId,
          price: price!,
          size: shares,
          orderType: 'GTC',
        });
      }
    }

    if (result.success) {
      const sideEmoji = side === 'buy' ? '🟢' : '🔴';
      const orderTypeText = orderType === 'market' ? 'Market' : 'Limit';

      return {
        text: `✅ *Order Placed!*

${sideEmoji} *${orderTypeText} ${side.charAt(0).toUpperCase() + side.slice(1)}*

├ Order ID: \`${result.orderId || 'N/A'}\`
├ Status: ${result.status || 'pending'}
├ Size: ${formatUSD(size)}
${result.avgFillPrice ? `├ Fill Price: ${formatCents(result.avgFillPrice)}` : ''}
└ Filled: ${result.filledSize?.toFixed(2) || '0'} shares

${orderType === 'limit' ? 'Your limit order is now active. Check Orders to manage.' : ''}`,
        buttons: [
          [btn('📋 View Orders', 'menu:orders')],
          [btn('📊 Portfolio', 'menu:portfolio')],
          [mainMenuBtn()],
        ],
        parseMode: 'Markdown',
      };
    } else {
      throw new Error(result.error || 'Order placement failed');
    }
  } catch (error) {
    logger.error({ error, tokenId, size, side, orderType }, 'Order execution failed');

    return {
      text: `❌ *Order Failed*

Error: ${error instanceof Error ? error.message : 'Unknown error'}

Please check:
• Your balance is sufficient
• Your credentials are valid
• The market is still active`,
      buttons: [
        [btn('🔄 Try Again', `${side === 'buy' ? 'buy' : 'sell'}:${tokenId}`)],
        [btn('📊 View Market', `market:${ctx.state.selectedMarket || tokenId}`)],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }
}

/**
 * Custom size input handler (for text input)
 */
export async function handleCustomSizeInput(
  ctx: MenuContext,
  input: string
): Promise<MenuResult | null> {
  // Only handle if we're in buy/sell flow
  if (!['buy', 'sell', 'limitb', 'limits'].includes(ctx.state.currentMenu)) {
    return null;
  }

  const size = parseFloat(input.replace(/[$,]/g, ''));
  if (isNaN(size) || size <= 0) {
    return {
      text: `❌ *Invalid Amount*

Please enter a valid USD amount (e.g., "50" or "$100").`,
      buttons: [
        [btn('↩️ Back', `${ctx.state.orderSide === 'buy' ? 'buy' : 'sell'}:${ctx.state.selectedToken}`)],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }

  if (size > 10000) {
    return {
      text: `❌ *Amount Too Large*

Maximum order size is $10,000. Please enter a smaller amount.`,
      buttons: [
        [btn('↩️ Back', `${ctx.state.orderSide === 'buy' ? 'buy' : 'sell'}:${ctx.state.selectedToken}`)],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }

  ctx.state.orderSize = size;

  // Continue to price selection (limit) or confirmation (market)
  if (ctx.state.orderType === 'market') {
    return orderConfirmHandler(ctx, [ctx.state.selectedToken!]);
  } else {
    return handleSizeSelection(ctx, [ctx.state.selectedToken!, size.toString()]);
  }
}
