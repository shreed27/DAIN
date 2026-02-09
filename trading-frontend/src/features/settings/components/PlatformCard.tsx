'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  MessageCircle,
  Hash,
  Slack,
  Mail,
  TrendingUp,
  Bitcoin,
  Coins,
  BarChart3,
  Settings,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Unplug,
  Zap,
  Link,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Platform, IntegrationStatus, LinkedAccount } from '../types';

interface PlatformCardProps {
  platform: Platform;
  onConnect: () => void;
  onDisconnect: () => void;
  onConfigure: () => void;
  onTest: () => void;
  isConnecting?: boolean;
  isTesting?: boolean;
  linkedAccount?: LinkedAccount;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  telegram: MessageCircle,
  discord: Hash,
  slack: Slack,
  mail: Mail,
  email: Mail,
  chart: BarChart3,
  'trending-up': TrendingUp,
  bitcoin: Bitcoin,
  coins: Coins,
  link: Link,
};

const statusConfig: Record<IntegrationStatus, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  connected: { icon: CheckCircle2, color: 'text-green-500', label: 'Connected' },
  disconnected: { icon: XCircle, color: 'text-muted-foreground', label: 'Not Connected' },
  error: { icon: AlertCircle, color: 'text-destructive', label: 'Error' },
};

export function PlatformCard({
  platform,
  onConnect,
  onDisconnect,
  onConfigure,
  onTest,
  isConnecting,
  isTesting,
  linkedAccount,
}: PlatformCardProps) {
  const [showActions, setShowActions] = useState(false);
  const Icon = iconMap[platform.icon] || Link;
  const statusInfo = statusConfig[platform.status];
  const StatusIcon = statusInfo.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'relative group rounded-xl border bg-card/50 backdrop-blur-sm p-4 transition-all duration-300',
        platform.connected
          ? 'border-green-500/30 hover:border-green-500/50'
          : 'border-border/50 hover:border-border'
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Status indicator */}
      <div className="absolute top-3 right-3">
        <div className={cn('flex items-center gap-1.5 text-xs font-medium', statusInfo.color)}>
          <StatusIcon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{statusInfo.label}</span>
        </div>
      </div>

      {/* Platform info */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
            platform.connected
              ? 'bg-green-500/10 text-green-500'
              : 'bg-muted/50 text-muted-foreground'
          )}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0 pr-16">
          <h3 className="font-semibold text-foreground truncate">{platform.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {platform.description}
          </p>
        </div>
      </div>

      {/* Category badge + linked account */}
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider',
            platform.category === 'messaging' && 'bg-blue-500/10 text-blue-500',
            platform.category === 'exchange' && 'bg-orange-500/10 text-orange-500',
            platform.category === 'prediction' && 'bg-purple-500/10 text-purple-500'
          )}
        >
          {platform.category}
        </span>
        {linkedAccount && (
          <span className="text-xs text-muted-foreground truncate">
            @{linkedAccount.username || linkedAccount.userId}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {platform.connected ? (
          <>
            <button
              onClick={onConfigure}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-accent/50 hover:bg-accent text-sm font-medium transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              Configure
            </button>
            <button
              onClick={onTest}
              disabled={isTesting}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-accent/50 hover:bg-accent text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isTesting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={onDisconnect}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground text-sm font-medium transition-colors"
            >
              <Unplug className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <button
            onClick={onConnect}
            disabled={isConnecting}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Link className="w-4 h-4" />
                Connect
              </>
            )}
          </button>
        )}
      </div>
    </motion.div>
  );
}
