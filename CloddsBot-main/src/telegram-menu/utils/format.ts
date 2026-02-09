/**
 * Telegram Menu Formatters - Message formatting utilities
 */

/**
 * Format a number with commas and optional decimal places
 */
export function formatNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '0';

  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }

  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format price as cents (e.g., 0.65 -> 65¢)
 */
export function formatCents(price: number): string {
  return `${(price * 100).toFixed(1)}¢`;
}

/**
 * Format price as percentage (e.g., 0.65 -> 65%)
 */
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Format USD value
 */
export function formatUSD(value: number, showCents = true): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1_000_000) {
    return `${sign}$${(absValue / 1_000_000).toFixed(2)}M`;
  }
  if (absValue >= 1_000) {
    return `${sign}$${(absValue / 1_000).toFixed(2)}K`;
  }

  if (showCents) {
    return `${sign}$${absValue.toFixed(2)}`;
  }
  return `${sign}$${Math.round(absValue)}`;
}

/**
 * Format P&L with color indicator
 */
export function formatPnL(value: number): string {
  const formatted = formatUSD(value);
  if (value > 0) return `🟢 +${formatted}`;
  if (value < 0) return `🔴 ${formatted}`;
  return `⚪ ${formatted}`;
}

/**
 * Format P&L percentage with color indicator
 */
export function formatPnLPct(value: number): string {
  const pct = (value * 100).toFixed(2);
  if (value > 0) return `🟢 +${pct}%`;
  if (value < 0) return `🔴 ${pct}%`;
  return `⚪ ${pct}%`;
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string | undefined): string {
  if (!date) return 'N/A';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return 'N/A';

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = Date.now();
  const diff = now - d.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Truncate wallet address (e.g., 0x1234...5678)
 */
export function truncateAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Escape Markdown special characters
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

/**
 * Create a progress bar
 */
export function progressBar(value: number, max = 1, length = 10): string {
  const filled = Math.round((value / max) * length);
  const empty = length - filled;
  return '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, empty));
}

/**
 * Format position side emoji
 */
export function sideEmoji(side: 'buy' | 'sell' | 'BUY' | 'SELL' | 'YES' | 'NO'): string {
  const s = side.toLowerCase();
  if (s === 'buy' || s === 'yes') return '🟢';
  return '🔴';
}

/**
 * Format market status
 */
export function formatMarketStatus(
  resolved: boolean,
  endDate?: Date | string
): string {
  if (resolved) return '🏁 Resolved';

  const end = endDate ? new Date(endDate) : null;
  if (end && end.getTime() < Date.now()) {
    return '⏰ Awaiting Resolution';
  }

  return '🔵 Active';
}

/**
 * Format order status
 */
export function formatOrderStatus(
  status: 'pending' | 'open' | 'filled' | 'partial' | 'cancelled' | 'expired' | string
): string {
  switch (status.toLowerCase()) {
    case 'pending':
      return '⏳ Pending';
    case 'open':
      return '📖 Open';
    case 'filled':
      return '✅ Filled';
    case 'partial':
      return '🔄 Partial';
    case 'cancelled':
      return '❌ Cancelled';
    case 'expired':
      return '⌛ Expired';
    default:
      return status;
  }
}

/**
 * Create a divider line
 */
export function divider(char = '─', length = 20): string {
  return char.repeat(length);
}

/**
 * Build a tree-style list item
 */
export function treeItem(
  text: string,
  isLast: boolean,
  indent = 0
): string {
  const prefix = isLast ? '└' : '├';
  const indentStr = '  '.repeat(indent);
  return `${indentStr}${prefix} ${text}`;
}
