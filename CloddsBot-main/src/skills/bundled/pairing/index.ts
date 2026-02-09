/**
 * Pairing CLI Skill
 *
 * Commands:
 * /pair - Request pairing (generates code)
 * /pair <code> - Link Telegram/Discord to web wallet using pairing code
 * /pair-code <code> - Enter pairing code
 * /unpair - Remove your pairing
 * /pairing list - List pending requests
 * /pairing approve <code> - Approve pairing request
 * /pairing reject <code> - Reject pairing request
 * /pairing users - List paired users
 * /pairing remove <user> - Remove user pairing
 * /pairing wallet - Show linked wallet
 * /pairing unlink - Unlink wallet
 * /trust <user> owner - Grant owner trust
 * /trust <user> paired - Standard trust
 * /trust list - List trust levels
 */

import {
  createPairingService,
  PairingService,
  TrustLevel,
  WalletLink,
} from '../../../pairing/index';
import { logger } from '../../../utils/logger';
import type { SkillExecutionContext } from '../../executor';

let service: PairingService | null = null;

function getService(): PairingService | null {
  // Service needs to be initialized with a database externally
  // This is a lightweight wrapper
  return service;
}

async function handlePair(channel: string, userId: string, username?: string): Promise<string> {
  const svc = getService();
  if (!svc) return 'Pairing service not initialized. Database required.';

  const code = await svc.createPairingRequest(channel, userId, username);
  if (!code) {
    if (svc.isPaired(channel, userId)) {
      return 'You are already paired.';
    }
    return 'Could not create pairing request. Maximum pending requests may have been reached.';
  }

  return `**Pairing Request Created**\n\n` +
    `Your pairing code: \`${code}\`\n\n` +
    `Share this code with an admin to get approved.\n` +
    `Code expires in 1 hour.`;
}

async function handlePairCode(code: string): Promise<string> {
  const svc = getService();
  if (!svc) return 'Pairing service not initialized.';
  if (!code) return 'Usage: /pair-code <code>';

  const request = await svc.validateCode(code);
  if (!request) {
    return 'Invalid or expired pairing code.';
  }

  return `Pairing successful! User ${request.username || request.userId} has been paired on channel ${request.channel}.`;
}

async function handleUnpair(channel: string, userId: string): Promise<string> {
  const svc = getService();
  if (!svc) return 'Pairing service not initialized.';

  if (!svc.isPaired(channel, userId)) {
    return 'You are not currently paired.';
  }

  svc.removePairedUser(channel, userId);
  return 'Your pairing has been removed.';
}

async function handleList(channel: string): Promise<string> {
  const svc = getService();
  if (!svc) return 'Pairing service not initialized.';

  const pending = svc.listPendingRequests(channel);
  if (pending.length === 0) {
    return 'No pending pairing requests.';
  }

  let output = `**Pending Pairing Requests** (${pending.length})\n\n`;
  for (const req of pending) {
    output += `Code: \`${req.code}\`\n`;
    output += `  User: ${req.username || req.userId}\n`;
    output += `  Requested: ${req.createdAt.toLocaleString()}\n`;
    output += `  Expires: ${req.expiresAt.toLocaleString()}\n\n`;
  }
  return output;
}

async function handleApprove(channel: string, code: string): Promise<string> {
  const svc = getService();
  if (!svc) return 'Pairing service not initialized.';
  if (!code) return 'Usage: /pairing approve <code>';

  const success = await svc.approveRequest(channel, code);
  if (!success) {
    return `Could not approve code "${code}". It may be invalid, expired, or for a different channel.`;
  }

  return `Pairing request \`${code}\` approved.`;
}

async function handleReject(channel: string, code: string): Promise<string> {
  const svc = getService();
  if (!svc) return 'Pairing service not initialized.';
  if (!code) return 'Usage: /pairing reject <code>';

  const success = await svc.rejectRequest(channel, code);
  if (!success) {
    return `Could not reject code "${code}". It may be invalid or expired.`;
  }

  return `Pairing request \`${code}\` rejected.`;
}

async function handleUsers(channel: string): Promise<string> {
  const svc = getService();
  if (!svc) return 'Pairing service not initialized.';

  const users = svc.listPairedUsers(channel);
  if (users.length === 0) {
    return 'No paired users on this channel.';
  }

  let output = `**Paired Users** (${users.length})\n\n`;
  for (const user of users) {
    const trust = user.isOwner ? 'owner' : 'paired';
    output += `**${user.username || user.userId}**\n`;
    output += `  Trust: ${trust}\n`;
    output += `  Paired: ${user.pairedAt.toLocaleString()}\n`;
    output += `  Method: ${user.pairedBy}\n\n`;
  }
  return output;
}

async function handleRemove(channel: string, userId: string): Promise<string> {
  const svc = getService();
  if (!svc) return 'Pairing service not initialized.';
  if (!userId) return 'Usage: /pairing remove <user>';

  svc.removePairedUser(channel, userId);
  return `User ${userId} has been unpaired.`;
}

async function handleTrust(channel: string, userId: string, level: string): Promise<string> {
  const svc = getService();
  if (!svc) return 'Pairing service not initialized.';

  if (level === 'owner') {
    svc.setOwner(channel, userId);
    return `User ${userId} granted owner trust.`;
  } else if (level === 'paired') {
    svc.removeOwner(channel, userId);
    return `User ${userId} set to standard (paired) trust.`;
  }

  return 'Usage: /trust <user> owner|paired';
}

async function handleTrustList(channel: string): Promise<string> {
  const svc = getService();
  if (!svc) return 'Pairing service not initialized.';

  const owners = svc.listOwners(channel);
  const users = svc.listPairedUsers(channel);

  let output = '**Trust Levels**\n\n';
  output += `**Owners** (${owners.length}):\n`;
  for (const owner of owners) {
    output += `  - ${owner.username || owner.userId}\n`;
  }

  output += `\n**Paired** (${users.filter(u => !u.isOwner).length}):\n`;
  for (const user of users.filter(u => !u.isOwner)) {
    output += `  - ${user.username || user.userId}\n`;
  }

  return output;
}

// =============================================================================
// WALLET LINKING HANDLERS
// =============================================================================

/**
 * Handle /pair <code> - Link chat account to web wallet using pairing code
 */
async function handleWalletLink(channel: string, chatUserId: string, code: string): Promise<string> {
  const svc = getService();
  if (!svc) return 'Pairing service not initialized.';

  if (!code) {
    return `**Wallet Linking**

To link your Telegram/Discord account to your web wallet:

1. Go to the web app and connect your Solana wallet
2. Navigate to Settings → Integrations → Link Chat
3. Copy the pairing code shown
4. Run: \`/pair <code>\`

Once linked, you can trade using the credentials stored on the web app.`;
  }

  // Validate the wallet pairing code
  const link = await svc.validateWalletPairingCode(channel, chatUserId, code);
  if (!link) {
    return 'Invalid or expired pairing code. Please generate a new code from the web app.';
  }

  const walletShort = `${link.walletAddress.slice(0, 6)}...${link.walletAddress.slice(-4)}`;
  return `**Wallet Linked Successfully!**

Your ${channel} account is now linked to wallet \`${walletShort}\`.

You can now:
- Trade using \`/poly buy\`, \`/poly sell\` commands
- View positions with \`/poly positions\`
- Check balance with \`/poly balance\`

Your trading credentials are securely stored on the web app.`;
}

/**
 * Handle /pairing wallet - Show linked wallet
 */
async function handleShowWallet(channel: string, chatUserId: string): Promise<string> {
  const svc = getService();
  if (!svc) return 'Pairing service not initialized.';

  const walletAddress = await svc.getWalletForChatUser(channel, chatUserId);
  if (!walletAddress) {
    return 'No wallet linked to this account. Use `/pair <code>` to link your web wallet.';
  }

  const walletShort = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
  return `**Linked Wallet**

Wallet: \`${walletShort}\`
Full address: \`${walletAddress}\`

Use \`/pairing unlink\` to remove this link.`;
}

/**
 * Handle /pairing unlink - Unlink wallet
 */
async function handleUnlinkWallet(channel: string, chatUserId: string): Promise<string> {
  const svc = getService();
  if (!svc) return 'Pairing service not initialized.';

  const success = await svc.unlinkChatUser(channel, chatUserId);
  if (!success) {
    return 'No wallet was linked to this account.';
  }

  return 'Wallet unlinked successfully. You will need to re-link to trade using your web credentials.';
}

/**
 * Handle /pairing links - Admin: list all wallet links
 */
async function handleListWalletLinks(): Promise<string> {
  const svc = getService();
  if (!svc) return 'Pairing service not initialized.';

  const links = svc.listWalletLinks();
  if (links.length === 0) {
    return 'No wallet links registered.';
  }

  let output = `**Wallet Links** (${links.length})\n\n`;
  for (const link of links) {
    const walletShort = `${link.walletAddress.slice(0, 6)}...${link.walletAddress.slice(-4)}`;
    output += `**${link.channel}:${link.chatUserId}**\n`;
    output += `  Wallet: ${walletShort}\n`;
    output += `  Linked: ${link.linkedAt.toLocaleString()}\n`;
    output += `  Method: ${link.linkedBy}\n\n`;
  }
  return output;
}

// Pairing code format: 8 uppercase alphanumeric characters
const PAIRING_CODE_REGEX = /^[A-Z0-9]{6,10}$/;

export async function execute(args: string, context?: SkillExecutionContext): Promise<string> {
  const parts = args.trim().split(/\s+/);
  const command = parts[0]?.toLowerCase() || 'help';
  const rest = parts.slice(1);

  // Use context if available, otherwise default to CLI
  const channel = context?.platform || 'cli';
  const userId = context?.userId || 'cli-user';

  // Check if the first arg looks like a wallet pairing code
  // This handles the case when user does "/pair ABC123"
  const upperFirst = parts[0]?.toUpperCase() || '';
  if (PAIRING_CODE_REGEX.test(upperFirst)) {
    return handleWalletLink(channel, userId, upperFirst);
  }

  switch (command) {
    case 'pair':
      return handlePair(channel, userId);

    case 'pair-code':
      return handlePairCode(rest[0]);

    case 'unpair':
      return handleUnpair(channel, userId);

    case 'list':
      return handleList(channel);

    case 'approve':
      return handleApprove(channel, rest[0]);

    case 'reject':
      return handleReject(channel, rest[0]);

    case 'users':
      return handleUsers(channel);

    case 'remove':
      return handleRemove(channel, rest[0]);

    case 'trust':
      if (rest[0] === 'list') return handleTrustList(channel);
      if (rest.length < 2) return 'Usage: /trust <user> owner|paired';
      return handleTrust(channel, rest[0], rest[1]);

    case 'cleanup':
      if (getService()) {
        getService()!.cleanupExpired();
        return 'Expired pairing requests cleaned up.';
      }
      return 'Pairing service not initialized.';

    // Wallet linking commands
    case 'wallet':
      return handleShowWallet(channel, userId);

    case 'unlink':
      return handleUnlinkWallet(channel, userId);

    case 'links':
      return handleListWalletLinks();

    case 'help':
    default:
      return `**Pairing Commands**

**Wallet Linking (link chat to web wallet):**
  /pair <code>                         - Link to web wallet using pairing code
  /pairing wallet                      - Show linked wallet
  /pairing unlink                      - Unlink wallet

**User Pairing (access control):**
  /pairing pair                        - Request pairing (generates code)
  /pairing pair-code <code>            - Enter pairing code
  /pairing unpair                      - Remove your pairing

**Admin Commands:**
  /pairing list                        - List pending requests
  /pairing approve <code>              - Approve pairing request
  /pairing reject <code>               - Reject pairing request
  /pairing users                       - List paired users
  /pairing remove <user>               - Remove user pairing
  /pairing links                       - List all wallet links
  /pairing cleanup                     - Clean up expired requests

**Trust Management:**
  /pairing trust <user> owner          - Grant owner trust
  /pairing trust <user> paired         - Standard trust
  /pairing trust list                  - List trust levels`;
  }
}

/**
 * Direct /pair handler for the /pair command (separate from /pairing)
 * This is used for wallet linking: /pair <code>
 */
export async function handlePairCommand(args: string, context?: SkillExecutionContext): Promise<string> {
  const code = args.trim();
  const channel = context?.platform || 'cli';
  const userId = context?.userId || 'cli-user';

  // If a code is provided, try wallet linking first
  if (code && code.length >= 6) {
    return handleWalletLink(channel, userId, code);
  }

  // Otherwise, show help for wallet linking
  return handleWalletLink(channel, userId, '');
}

/**
 * Main handler that routes based on the command used
 */
async function mainHandler(args: string, context?: SkillExecutionContext): Promise<string> {
  // The skill executor passes just the args after the command
  // We need to check which command was invoked
  // For /pair <code>, use wallet linking
  // For /pairing <subcommand>, use the full execute function
  return execute(args, context);
}

export default {
  name: 'pairing',
  description: 'User pairing, wallet linking, and trust management',
  commands: ['/pairing', '/pair', '/unpair', '/trust'],
  handle: mainHandler,
};
