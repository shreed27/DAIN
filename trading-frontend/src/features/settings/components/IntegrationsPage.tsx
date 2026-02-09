'use client';

import { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  Plug,
  MessageCircle,
  TrendingUp,
  BarChart3,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIntegrations } from '../hooks/useIntegrations';
import { PlatformCard } from './PlatformCard';
import { ConnectPlatformModal } from './ConnectPlatformModal';
import { NotificationSettings } from './NotificationSettings';
import { Platform, PlatformCredentials, TestResult } from '../types';

const categoryInfo = {
  messaging: {
    icon: MessageCircle,
    title: 'Messaging & Notifications',
    description: 'Connect messaging platforms to receive trading alerts and notifications',
  },
  exchange: {
    icon: TrendingUp,
    title: 'Crypto Exchanges',
    description: 'Link your exchange accounts for automated trading',
  },
  prediction: {
    icon: BarChart3,
    title: 'Prediction Markets',
    description: 'Connect to prediction market platforms',
  },
};

export function IntegrationsPage() {
  const { publicKey, signMessage } = useWallet();
  const walletAddress = publicKey?.toBase58();

  const {
    platforms,
    connectedPlatforms,
    notificationSettings,
    notificationEvents,
    linkedAccounts,
    loading,
    connectingPlatform,
    testingPlatform,
    refreshPlatforms,
    connectPlatform,
    disconnectPlatform,
    testConnection,
    sendTestNotification,
    updateNotificationSettings,
    // New pairing methods
    generatePairingCode,
    checkPairingStatus,
    unlinkAccount,
    // Polymarket wallet auth
    connectPolymarketWithWallet,
  } = useIntegrations();

  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filter out Slack and Email from messaging platforms
  const filteredMessagingPlatforms = useMemo(() => {
    if (!platforms?.messaging) return [];
    return platforms.messaging.filter(p => p.id === 'telegram' || p.id === 'discord');
  }, [platforms?.messaging]);

  // Check if a platform is connected via linked accounts (for messaging)
  const getLinkedAccountForPlatform = useCallback((platformId: string) => {
    const channelMap: Record<string, string> = {
      telegram: 'telegram',
      discord: 'discord',
    };
    const channel = channelMap[platformId];
    return linkedAccounts.find(acc => acc.channel === channel);
  }, [linkedAccounts]);

  // Handle Polymarket wallet connection
  const handleConnectPolymarketWithWallet = useCallback(async (
    walletSignMessage: (message: Uint8Array) => Promise<Uint8Array>
  ): Promise<{ success: boolean; error?: string }> => {
    if (!walletAddress) {
      return { success: false, error: 'Wallet not connected' };
    }
    return connectPolymarketWithWallet(walletAddress, walletSignMessage);
  }, [walletAddress, connectPolymarketWithWallet]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleConnect = (platform: Platform) => {
    setSelectedPlatform(platform);
    setIsModalOpen(true);
  };

  const handleDisconnect = async (platform: Platform) => {
    const result = await disconnectPlatform(platform.id);
    if (result.success) {
      showToast('success', `Disconnected from ${platform.name}`);
    } else {
      showToast('error', result.error || 'Failed to disconnect');
    }
  };

  const handleConfigure = (platform: Platform) => {
    // For now, open the connect modal to reconfigure
    setSelectedPlatform(platform);
    setIsModalOpen(true);
  };

  const handleTest = async (platform: Platform) => {
    const result = await testConnection(platform.id);
    if (result?.testResult === 'passed') {
      showToast('success', `${platform.name} connection verified`);
    } else {
      showToast('error', result?.message || 'Connection test failed');
    }
  };

  const handleModalConnect = useCallback(async (
    credentials: PlatformCredentials,
    config?: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }> => {
    if (!selectedPlatform) return { success: false, error: 'No platform selected' };
    const result = await connectPlatform(selectedPlatform.id, credentials, config);
    if (result.success) {
      showToast('success', `Connected to ${selectedPlatform.name}`);
    }
    return result;
  }, [selectedPlatform, connectPlatform]);

  const handleModalTest = useCallback(async (credentials: PlatformCredentials): Promise<TestResult | null> => {
    if (!selectedPlatform) return null;
    return testConnection(selectedPlatform.id, credentials);
  }, [selectedPlatform, testConnection]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading integrations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Toast Notification */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={cn(
            'fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg',
            toast.type === 'success'
              ? 'bg-green-500 text-white'
              : 'bg-destructive text-destructive-foreground'
          )}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">{toast.message}</span>
        </motion.div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Plug className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Integrations</h1>
            <p className="text-sm text-muted-foreground">
              Connect platforms for notifications and automated trading
            </p>
          </div>
        </div>
        <button
          onClick={refreshPlatforms}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-accent text-sm font-medium transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Connected Summary */}
      {connectedPlatforms.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-green-500/30 bg-green-500/5 p-4"
        >
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <div>
              <p className="font-medium text-green-500">
                {connectedPlatforms.length} platform{connectedPlatforms.length !== 1 ? 's' : ''} connected
              </p>
              <p className="text-xs text-muted-foreground">
                {connectedPlatforms.map(p => p.name).join(', ')}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Platform Categories */}
      {platforms && (
        <>
          {/* Messaging Platforms (Telegram & Discord only) */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <categoryInfo.messaging.icon className="w-5 h-5 text-blue-500" />
              <div>
                <h2 className="text-lg font-semibold">{categoryInfo.messaging.title}</h2>
                <p className="text-xs text-muted-foreground">Link your Telegram or Discord to receive alerts via bot</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredMessagingPlatforms.map(platform => {
                const linkedAccount = getLinkedAccountForPlatform(platform.id);
                const isLinked = !!linkedAccount;
                return (
                  <PlatformCard
                    key={platform.id}
                    platform={{
                      ...platform,
                      connected: isLinked,
                      status: isLinked ? 'connected' : 'disconnected',
                    }}
                    onConnect={() => handleConnect(platform)}
                    onDisconnect={() => handleDisconnect(platform)}
                    onConfigure={() => handleConfigure(platform)}
                    onTest={() => handleTest(platform)}
                    isConnecting={connectingPlatform === platform.id}
                    isTesting={testingPlatform === platform.id}
                    linkedAccount={linkedAccount}
                  />
                );
              })}
            </div>
          </section>

          {/* Notification Settings */}
          <section>
            <NotificationSettings
              connectedPlatforms={connectedPlatforms}
              notificationEvents={notificationEvents}
              settings={notificationSettings}
              onSave={updateNotificationSettings}
            />
          </section>

          {/* Prediction Markets */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <categoryInfo.prediction.icon className="w-5 h-5 text-purple-500" />
              <div>
                <h2 className="text-lg font-semibold">{categoryInfo.prediction.title}</h2>
                <p className="text-xs text-muted-foreground">{categoryInfo.prediction.description}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {platforms.prediction.map(platform => (
                <PlatformCard
                  key={platform.id}
                  platform={platform}
                  onConnect={() => handleConnect(platform)}
                  onDisconnect={() => handleDisconnect(platform)}
                  onConfigure={() => handleConfigure(platform)}
                  onTest={() => handleTest(platform)}
                  isConnecting={connectingPlatform === platform.id}
                  isTesting={testingPlatform === platform.id}
                />
              ))}
            </div>
          </section>

          {/* Crypto Exchanges */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <categoryInfo.exchange.icon className="w-5 h-5 text-orange-500" />
              <div>
                <h2 className="text-lg font-semibold">{categoryInfo.exchange.title}</h2>
                <p className="text-xs text-muted-foreground">{categoryInfo.exchange.description}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {platforms.exchange.map(platform => (
                <PlatformCard
                  key={platform.id}
                  platform={platform}
                  onConnect={() => handleConnect(platform)}
                  onDisconnect={() => handleDisconnect(platform)}
                  onConfigure={() => handleConfigure(platform)}
                  onTest={() => handleTest(platform)}
                  isConnecting={connectingPlatform === platform.id}
                  isTesting={testingPlatform === platform.id}
                />
              ))}
            </div>
          </section>
        </>
      )}

      {/* Connect Modal */}
      <ConnectPlatformModal
        platform={selectedPlatform}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedPlatform(null);
        }}
        onConnect={handleModalConnect}
        onTest={handleModalTest}
        // Pairing props for messaging platforms
        onGeneratePairingCode={generatePairingCode}
        onCheckPairingStatus={checkPairingStatus}
        // Wallet auth props for Polymarket
        onConnectWithWallet={handleConnectPolymarketWithWallet}
        walletAddress={walletAddress}
        signMessage={signMessage}
      />
    </div>
  );
}
