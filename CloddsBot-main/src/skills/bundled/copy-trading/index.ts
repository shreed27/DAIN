/**
 * Copy Trading CLI Skill
 *
 * Commands:
 * /copy follow <address> - Start following a wallet (with real execution if credentials exist)
 * /copy unfollow <address> - Stop following
 * /copy list - List followed wallets
 * /copy status - Copy trading status
 * /copy trades - Recent copied trades
 * /copy close <id> - Close a copied position
 * /copy config - View/update config
 */

import type { SkillExecutionContext } from '../../executor';

async function execute(args: string, context?: SkillExecutionContext): Promise<string> {
  const parts = args.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase() || 'help';

  try {
    // Try to use the orchestrator first (for real execution with credentials)
    const { getCopyTradingOrchestrator } = await import('../../../trading/copy-trading-orchestrator');
    const orchestrator = getCopyTradingOrchestrator();

    // Resolve wallet address from context
    let walletAddress: string | null = null;

    if (context?.userId && context?.platform) {
      try {
        const { createPairingService } = await import('../../../pairing/index');
        const { createDatabase } = await import('../../../db/index');

        // Get pairing service to resolve wallet
        const db = createDatabase();
        const pairingService = createPairingService(db);
        walletAddress = await pairingService.getWalletForChatUser(context.platform, context.userId);
      } catch {
        // Pairing service not available
      }
    }

    // If no orchestrator, fall back to basic mode
    if (!orchestrator) {
      return await executeFallback(cmd, parts, args);
    }

    switch (cmd) {
      case 'follow': {
        if (!parts[1]) return 'Usage: /copy follow <address> [--size <amount>] [--label <name>]';

        if (!walletAddress) {
          return `**Wallet Not Linked**

Link your wallet first via the web app, then send \`/pair <code>\` here.

1. Go to Settings > Integrations in the web app
2. Click "Link Telegram" and get a pairing code
3. Send \`/pair <code>\` here to link your account`;
        }

        // Check if user has Polymarket credentials
        const hasPolymarket = await orchestrator.hasCredentials(walletAddress, 'polymarket');
        if (!hasPolymarket) {
          return `**Polymarket Not Connected**

Connect your Polymarket account in the web app first:

1. Go to Settings > Integrations
2. Click "Connect" next to Polymarket
3. Sign the message with your wallet

Once connected, you can copy trade with real execution.`;
        }

        const targetWallet = parts[1];
        const labelIdx = parts.indexOf('--label');
        const label = labelIdx >= 0 ? parts.slice(labelIdx + 1).join(' ') : undefined;
        const sizeIdx = parts.indexOf('--size');
        const size = sizeIdx >= 0 ? parseFloat(parts[sizeIdx + 1]) : 100;

        // Create config with orchestrator (real execution)
        const config = await orchestrator.createConfig(walletAddress, {
          targetWallet,
          targetLabel: label,
          enabled: true,
          dryRun: false,  // REAL TRADES!
          fixedSize: size,
        });

        return `**Now Copying Trades**

Target: \`${targetWallet}\`${label ? `\nLabel: ${label}` : ''}
Size: $${size} per trade
Mode: **Live execution**

Trades from this wallet will be automatically copied to your Polymarket account.

Use \`/copy list\` to see all followed wallets.
Use \`/copy stop ${config.id}\` to stop following.`;
      }

      case 'unfollow':
      case 'stop': {
        if (!parts[1]) return 'Usage: /copy unfollow <address-or-config-id>';

        if (!walletAddress) {
          return 'Link your wallet first. Use `/pair` for instructions.';
        }

        const target = parts[1];
        const configs = await orchestrator.getConfigsForWallet(walletAddress);

        // Find config by ID or target wallet
        const config = configs.find(c => c.id === target || c.targetWallet.toLowerCase() === target.toLowerCase());

        if (!config) {
          return `Config not found: ${target}\n\nUse \`/copy list\` to see your configs.`;
        }

        await orchestrator.deleteConfig(config.id);
        return `Stopped following \`${config.targetWallet}\`${config.targetLabel ? ` (${config.targetLabel})` : ''}.`;
      }

      case 'list':
      case 'ls': {
        if (!walletAddress) {
          return 'Link your wallet first. Use `/pair` for instructions.';
        }

        const configs = await orchestrator.getConfigsForWallet(walletAddress);

        if (configs.length === 0) {
          return `No copy trading configs found.

Use \`/copy follow <wallet-address>\` to start following a trader.`;
        }

        let output = `**Copy Trading Configs** (${configs.length})\n\n`;

        for (const config of configs) {
          const status = config.enabled ? '**Active**' : 'Paused';
          const mode = config.dryRun ? 'Dry run' : 'Live';
          output += `${config.targetLabel || config.targetWallet.slice(0, 10) + '...'}\n`;
          output += `  Status: ${status} | Mode: ${mode}\n`;
          output += `  Size: $${config.fixedSize} | Trades: ${config.totalTrades} | P&L: $${config.totalPnl.toFixed(2)}\n`;
          output += `  ID: \`${config.id}\`\n\n`;
        }

        return output;
      }

      case 'status': {
        if (!walletAddress) {
          return 'Link your wallet first. Use `/pair` for instructions.';
        }

        const stats = await orchestrator.getAggregatedStats(walletAddress);
        const hasSession = orchestrator.hasActiveSession(walletAddress);

        let output = '**Copy Trading Status**\n\n';
        output += `Active Session: ${hasSession ? 'Yes' : 'No'}\n`;
        output += `Total Configs: ${stats.totalConfigs}\n`;
        output += `Active Configs: ${stats.activeConfigs}\n`;
        output += `Total Trades Copied: ${stats.totalCopiedTrades}\n`;
        output += `Successful: ${stats.successfulTrades}\n`;
        output += `Success Rate: ${stats.successRate.toFixed(1)}%\n`;
        output += `Total P&L: $${stats.totalPnl.toFixed(2)}\n`;

        if (stats.topPerformingTarget) {
          output += `\nTop Performer: \`${stats.topPerformingTarget.wallet.slice(0, 10)}...\` ($${stats.topPerformingTarget.pnl.toFixed(2)})`;
        }

        return output;
      }

      case 'trades':
      case 'history': {
        if (!walletAddress) {
          return 'Link your wallet first. Use `/pair` for instructions.';
        }

        const limit = parseInt(parts[1] || '10');
        const trades = await orchestrator.getHistory(walletAddress, { limit });

        if (trades.length === 0) {
          return 'No copied trades yet.';
        }

        let output = `**Recent Copied Trades** (last ${trades.length})\n\n`;

        for (const t of trades) {
          const emoji = t.status === 'filled' || t.status === 'closed'
            ? (t.pnl && t.pnl > 0 ? '+' : t.pnl && t.pnl < 0 ? '-' : '')
            : '';
          output += `[${t.status}] ${t.side} $${t.copiedSize.toFixed(2)} @ ${t.entryPrice.toFixed(4)}`;
          if (t.pnl !== undefined && t.pnl !== null) {
            output += ` | P&L: ${emoji}$${Math.abs(t.pnl).toFixed(2)}`;
          }
          output += `\n  Market: \`${t.marketId.slice(0, 20)}...\`\n`;
        }

        return output;
      }

      case 'toggle': {
        if (!parts[1]) return 'Usage: /copy toggle <config-id>';

        if (!walletAddress) {
          return 'Link your wallet first. Use `/pair` for instructions.';
        }

        const configId = parts[1];
        const config = await orchestrator.getConfig(configId);

        if (!config || config.userWallet !== walletAddress) {
          return `Config not found: ${configId}`;
        }

        const newState = !config.enabled;
        await orchestrator.toggleConfig(configId, newState);

        return `Config \`${configId}\` is now ${newState ? '**active**' : '**paused**'}.`;
      }

      case 'config': {
        if (!walletAddress) {
          return 'Link your wallet first. Use `/pair` for instructions.';
        }

        const sub = parts[1]?.toLowerCase();

        if (sub === 'set') {
          const configId = parts[2];
          const key = parts[3];
          const value = parts[4];

          if (!configId || !key || value === undefined) {
            return 'Usage: /copy config set <config-id> <key> <value>';
          }

          const config = await orchestrator.getConfig(configId);
          if (!config || config.userWallet !== walletAddress) {
            return `Config not found: ${configId}`;
          }

          const updates: Record<string, any> = {};
          if (key === 'dryRun') updates.dryRun = value === 'true';
          else if (key === 'fixedSize' || key === 'size') updates.fixedSize = parseFloat(value);
          else if (key === 'maxPosition') updates.maxPositionSize = parseFloat(value);
          else if (key === 'stopLoss') updates.stopLoss = parseFloat(value);
          else if (key === 'takeProfit') updates.takeProfit = parseFloat(value);
          else if (key === 'label') updates.targetLabel = value;
          else return `Unknown config key: ${key}`;

          await orchestrator.updateConfig(configId, updates);
          return `Config updated: ${key} = ${value}`;
        }

        // Show all configs overview
        const configs = await orchestrator.getConfigsForWallet(walletAddress);

        if (configs.length === 0) {
          return 'No configs found. Use `/copy follow <address>` to create one.';
        }

        let output = '**Copy Trading Configs**\n\n';

        for (const c of configs) {
          output += `**${c.targetLabel || c.targetWallet.slice(0, 10) + '...'}** (${c.id})\n`;
          output += `  Enabled: ${c.enabled}\n`;
          output += `  Mode: ${c.dryRun ? 'Dry run' : 'Live'}\n`;
          output += `  Size: $${c.fixedSize}\n`;
          output += `  Stop Loss: ${c.stopLoss ? c.stopLoss + '%' : 'None'}\n`;
          output += `  Take Profit: ${c.takeProfit ? c.takeProfit + '%' : 'None'}\n\n`;
        }

        output += 'Update with: `/copy config set <id> <key> <value>`\n';
        output += 'Keys: dryRun, size, maxPosition, stopLoss, takeProfit, label';

        return output;
      }

      default:
        return helpText();
    }
  } catch (error) {
    // Fall back to basic mode
    return await executeFallback(cmd, parts, args);
  }
}

/**
 * Fallback execution without orchestrator (dry-run only)
 */
async function executeFallback(cmd: string, parts: string[], _args: string): Promise<string> {
  try {
    const { createCopyTradingService } = await import('../../../trading/copy-trading');
    const { createWhaleTracker } = await import('../../../feeds/polymarket/whale-tracker');

    // Create whale tracker (provides trade signals) and copy service
    const tracker = createWhaleTracker();
    const config = {
      followedAddresses: [],
      dryRun: true,
    };
    const service = createCopyTradingService(tracker, null, config);

    switch (cmd) {
      case 'follow': {
        if (!parts[1]) return 'Usage: /copy follow <address> [--size <amount>] [--delay <ms>]';
        const addr = parts[1];
        service.follow(addr);
        const sizeIdx = parts.indexOf('--size');
        const size = sizeIdx >= 0 ? parts[sizeIdx + 1] : '100';
        const delayIdx = parts.indexOf('--delay');
        const delay = delayIdx >= 0 ? parts[delayIdx + 1] : '5000';
        return `**Following Wallet** (Dry Run Mode)

Address: \`${addr}\`
Size: $${size}
Delay: ${delay}ms
Status: Active

**Note:** This is dry-run mode. For live execution:
1. Link your wallet via the web app
2. Connect Polymarket credentials
3. Send \`/pair <code>\` here`;
      }

      case 'unfollow': {
        if (!parts[1]) return 'Usage: /copy unfollow <address>';
        service.unfollow(parts[1]);
        return `Unfollowed \`${parts[1]}\`.`;
      }

      case 'list':
      case 'ls': {
        const addrs = service.getFollowedAddresses();
        if (!addrs.length) return 'No wallets being followed. Use `/copy follow <address>` to start.';
        let output = `**Followed Wallets** (${addrs.length})\n\n`;
        for (const addr of addrs) {
          output += `  \`${addr}\`\n`;
        }
        return output;
      }

      case 'status': {
        const stats = service.getStats();
        let output = '**Copy Trading Status** (Dry Run Mode)\n\n';
        output += `Active: ${service.isRunning() ? 'Yes' : 'No'}\n`;
        output += `Following: ${stats.followedAddresses} wallets\n`;
        output += `Total copied: ${stats.totalCopied} trades\n`;
        output += `Total skipped: ${stats.totalSkipped}\n`;
        output += `Open positions: ${stats.openPositions}\n`;
        output += `Win rate: ${stats.winRate.toFixed(1)}%\n`;
        output += `Total P&L: $${stats.totalPnl.toFixed(2)}\n`;
        output += `Avg return: ${stats.avgReturn.toFixed(2)}%\n`;
        return output;
      }

      case 'trades': {
        const limit = parseInt(parts[1] || '10');
        const trades = service.getCopiedTrades(limit);
        if (!trades.length) return 'No copied trades yet.';
        let output = `**Recent Copied Trades** (last ${trades.length})\n\n`;
        for (const t of trades) {
          output += `[${t.status}] ${t.side} $${t.size.toFixed(2)} @ ${t.entryPrice.toFixed(4)}`;
          if (t.pnl !== undefined) output += ` | P&L: $${t.pnl.toFixed(2)}`;
          output += `\n  From: \`${t.originalTrade.maker.slice(0, 10)}...\`\n`;
        }
        return output;
      }

      case 'positions':
      case 'open': {
        const positions = service.getOpenPositions();
        if (!positions.length) return 'No open copied positions.';
        let output = `**Open Copied Positions** (${positions.length})\n\n`;
        for (const p of positions) {
          output += `[${p.id}] ${p.side} $${p.size.toFixed(2)} @ ${p.entryPrice.toFixed(4)}\n`;
          output += `  Status: ${p.status}\n`;
        }
        return output;
      }

      case 'close': {
        if (!parts[1]) return 'Usage: /copy close <trade-id> or /copy close all';
        if (parts[1] === 'all') {
          await service.closeAllPositions();
          return 'All copied positions closed.';
        }
        await service.closePosition(parts[1]);
        return `Position \`${parts[1]}\` closed.`;
      }

      case 'start': {
        service.start();
        return 'Copy trading started. Monitoring followed wallets for new trades.';
      }

      case 'stop': {
        service.stop();
        return 'Copy trading stopped.';
      }

      case 'config': {
        const sub = parts[1]?.toLowerCase();
        if (sub === 'set') {
          const key = parts[2];
          const value = parts[3];
          if (!key || !value) return 'Usage: /copy config set <key> <value>';
          const updates: Record<string, unknown> = {};
          if (key === 'dryRun') updates.dryRun = value === 'true';
          else if (key === 'fixedSize') updates.fixedSize = parseFloat(value);
          else if (key === 'maxPosition') updates.maxPositionSize = parseFloat(value);
          else if (key === 'minTradeSize') updates.minTradeSize = parseFloat(value);
          else if (key === 'copyDelay') updates.copyDelayMs = parseInt(value);
          else if (key === 'stopLoss') updates.stopLoss = parseFloat(value);
          else if (key === 'takeProfit') updates.takeProfit = parseFloat(value);
          else return `Unknown config key: ${key}`;
          service.updateConfig(updates);
          return `Config updated: ${key} = ${value}`;
        }
        return `**Copy Trading Config** (Dry Run Mode)\n\n` +
          `Sizing: fixed ($100)\n` +
          `Max position: $500\n` +
          `Min trade size: $1,000\n` +
          `Copy delay: 5,000ms\n` +
          `Max slippage: 2%\n` +
          `Dry run: true\n\n` +
          `Use \`/copy config set <key> <value>\` to change.\n` +
          `Keys: dryRun, fixedSize, maxPosition, minTradeSize, copyDelay, stopLoss, takeProfit`;
      }

      default:
        return helpText();
    }
  } catch {
    return helpText();
  }
}

function helpText(): string {
  return `**Copy Trading Commands**

  /copy follow <address>              - Follow a wallet (live if credentials linked)
  /copy unfollow <address>            - Stop following
  /copy list                          - List followed wallets
  /copy status                        - Current stats
  /copy trades [n]                    - Recent copied trades
  /copy toggle <config-id>            - Pause/resume a config
  /copy stop <config-id>              - Delete a config
  /copy config                        - View all configs
  /copy config set <id> <key> <val>   - Update config

**Setup for Live Trading:**
1. Link wallet via web app + \`/pair <code>\`
2. Connect Polymarket in Settings > Integrations
3. Then \`/copy follow <address>\` will execute real trades`;
}

export default {
  name: 'copy-trading',
  description: 'Automatically copy trades from successful wallets on Polymarket and crypto',
  commands: ['/copy', '/copytrade'],
  handle: execute,
};
