/**
 * Wallet Menu Handler - Balance and deposit/withdraw info
 */

import type { MenuContext, MenuResult } from '../types';
import { formatUSD, truncateAddress } from '../utils/format';
import { btn, mainMenuBtn, walletButtons } from '../utils/keyboard';
import { logger } from '../../utils/logger';

/**
 * Wallet overview handler
 */
export async function walletHandler(ctx: MenuContext): Promise<MenuResult> {
  ctx.state.currentMenu = 'wallet';

  const wallet = await ctx.getWallet();

  if (!wallet) {
    return {
      text: `💰 *Wallet*

🔗 *No Wallet Connected*

Connect your wallet to view balances and enable trading.

*How to Connect:*
1. Visit app.clodds.com
2. Connect your Web3 wallet
3. Pair with Telegram via settings

Once connected, you can:
• View USDC balance
• Deposit to Polymarket
• Withdraw funds
• Trade prediction markets`,
      buttons: [
        [{ text: '🔗 Connect Wallet', url: 'https://app.clodds.com/settings' }],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }

  // Check credentials
  let hasPolymarket = false;
  let hasKalshi = false;

  try {
    hasPolymarket = await ctx.credentials.hasCredentials(wallet, 'polymarket');
    hasKalshi = await ctx.credentials.hasCredentials(wallet, 'kalshi');
  } catch (error) {
    logger.warn({ error }, 'Failed to check credentials');
  }

  // Get portfolio value from positions
  let portfolioValue = 0;
  try {
    const positions = ctx.db.getPositions(wallet);
    portfolioValue = positions.reduce(
      (sum, pos) => sum + pos.shares * pos.currentPrice,
      0
    );
  } catch (error) {
    logger.warn({ error }, 'Failed to get portfolio value');
  }

  // Build platform status
  const platforms: string[] = [];
  if (hasPolymarket) platforms.push('✅ Polymarket');
  else platforms.push('❌ Polymarket');
  if (hasKalshi) platforms.push('✅ Kalshi');
  else platforms.push('❌ Kalshi');

  const text = `💰 *Wallet Overview*

🔗 *Connected Wallet*
\`${truncateAddress(wallet, 8)}\`

📊 *Portfolio Summary*
├ Positions Value: ${formatUSD(portfolioValue)}
├ Open Orders: ${formatUSD(0)}
└ Total: ${formatUSD(portfolioValue)}

🔐 *Trading Platforms*
${platforms.join('\n')}

━━━━━━━━━━━━━━━━━━━━

💡 *Deposit Instructions*

*Polymarket (USDC on Polygon):*
1. Send USDC to your Polymarket proxy wallet
2. Or deposit via app.polymarket.com

*Kalshi (USD):*
1. Connect bank account at kalshi.com
2. Transfer USD to your Kalshi account

⚠️ *Note:* Actual USDC balance requires API access.
Check individual platform websites for exact balances.`;

  return {
    text,
    buttons: [
      [
        { text: '📈 Polymarket', url: 'https://polymarket.com' },
        { text: '📊 Kalshi', url: 'https://kalshi.com' },
      ],
      [
        btn('🔄 Refresh', 'menu:wallet'),
        { text: '⚙️ Settings', url: 'https://app.clodds.com/settings' },
      ],
      [mainMenuBtn()],
    ],
    parseMode: 'Markdown',
  };
}

/**
 * Deposit info handler
 */
export async function depositHandler(ctx: MenuContext): Promise<MenuResult> {
  ctx.state.currentMenu = 'deposit';

  const wallet = await ctx.getWallet();

  if (!wallet) {
    return {
      text: `💰 Connect your wallet first`,
      buttons: [
        [{ text: '🔗 Connect Wallet', url: 'https://app.clodds.com/settings' }],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }

  const text = `📥 *Deposit Instructions*

*Polymarket Deposits (USDC on Polygon)*

Your deposit address:
\`${wallet}\`

*Steps:*
1. Get USDC on Polygon network
2. Send USDC to the address above
3. Wait for confirmation (1-2 minutes)
4. Funds will appear in your trading balance

*Getting USDC on Polygon:*
• Bridge from Ethereum via polygon.technology
• Buy on exchanges that support Polygon
• Use cross-chain bridges like Hop or Stargate

⚠️ *Important:*
• Only send USDC on Polygon network
• Do NOT send on Ethereum mainnet
• Minimum deposit: $1

━━━━━━━━━━━━━━━━━━━━

*Kalshi Deposits (USD)*

Kalshi uses USD bank transfers:
1. Log into kalshi.com
2. Go to Portfolio → Deposit
3. Connect your bank account
4. Transfer USD

Kalshi does not accept crypto deposits.`;

  return {
    text,
    buttons: [
      [
        { text: '📈 Polymarket Deposit', url: 'https://polymarket.com/deposit' },
        { text: '📊 Kalshi Deposit', url: 'https://kalshi.com/portfolio' },
      ],
      [
        btn('💰 Back to Wallet', 'menu:wallet'),
        mainMenuBtn(),
      ],
    ],
    parseMode: 'Markdown',
  };
}

/**
 * Withdraw info handler
 */
export async function withdrawHandler(ctx: MenuContext): Promise<MenuResult> {
  ctx.state.currentMenu = 'withdraw';

  const wallet = await ctx.getWallet();

  if (!wallet) {
    return {
      text: `💰 Connect your wallet first`,
      buttons: [
        [{ text: '🔗 Connect Wallet', url: 'https://app.clodds.com/settings' }],
        [mainMenuBtn()],
      ],
      parseMode: 'Markdown',
    };
  }

  const text = `📤 *Withdraw Instructions*

*Polymarket Withdrawals (USDC on Polygon)*

*Steps:*
1. Go to polymarket.com
2. Click your profile → Withdraw
3. Enter withdrawal amount
4. USDC will be sent to your wallet

*Notes:*
• Withdrawals are instant
• No minimum withdrawal
• Received on Polygon network

━━━━━━━━━━━━━━━━━━━━

*Kalshi Withdrawals (USD)*

*Steps:*
1. Log into kalshi.com
2. Go to Portfolio → Withdraw
3. Select linked bank account
4. Enter withdrawal amount

*Notes:*
• Processing time: 1-3 business days
• Minimum withdrawal: $10
• Sent via ACH transfer`;

  return {
    text,
    buttons: [
      [
        { text: '📈 Polymarket Withdraw', url: 'https://polymarket.com' },
        { text: '📊 Kalshi Withdraw', url: 'https://kalshi.com/portfolio' },
      ],
      [
        btn('💰 Back to Wallet', 'menu:wallet'),
        mainMenuBtn(),
      ],
    ],
    parseMode: 'Markdown',
  };
}
