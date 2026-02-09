'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import type {
  Platform,
  ConnectedPlatform,
  PlatformStatus,
  TestResult,
  NotificationSettings,
  NotificationEvent,
  PlatformCredentials,
  PlatformsData,
  PairingCode,
  PairingStatus,
  LinkedAccount,
} from '../types';

// Default platforms when gateway is unavailable
// Note: Slack and Email removed - only Telegram and Discord for messaging
const DEFAULT_PLATFORMS = {
  messaging: [
    { id: 'telegram', name: 'Telegram', icon: 'telegram', category: 'messaging', description: 'Receive instant trade alerts via Telegram bot', connected: false, status: 'disconnected' },
    { id: 'discord', name: 'Discord', icon: 'discord', category: 'messaging', description: 'Get notifications in your Discord server', connected: false, status: 'disconnected' },
  ] as Platform[],
  exchange: [
    { id: 'binance', name: 'Binance', icon: 'bitcoin', category: 'exchange', description: 'Connect your Binance account for futures trading', connected: false, status: 'disconnected' },
    { id: 'bybit', name: 'Bybit', icon: 'coins', category: 'exchange', description: 'Trade futures on Bybit exchange', connected: false, status: 'disconnected' },
  ] as Platform[],
  prediction: [
    { id: 'polymarket', name: 'Polymarket', icon: 'chart', category: 'prediction', description: 'Trade on Polymarket prediction markets', connected: false, status: 'disconnected' },
    { id: 'kalshi', name: 'Kalshi', icon: 'trending-up', category: 'prediction', description: 'Access Kalshi prediction markets', connected: false, status: 'disconnected' },
  ] as Platform[],
  notificationEvents: [
    { id: 'trade_executed', name: 'Trade Executed', description: 'When a trade is successfully executed' },
    { id: 'price_alert', name: 'Price Alert', description: 'When a price target is reached' },
    { id: 'position_closed', name: 'Position Closed', description: 'When a position is closed' },
    { id: 'stop_loss_hit', name: 'Stop Loss Hit', description: 'When a stop loss is triggered' },
    { id: 'take_profit_hit', name: 'Take Profit Hit', description: 'When take profit is triggered' },
  ] as NotificationEvent[],
} satisfies PlatformsData;

interface UseIntegrationsResult {
  // Data
  platforms: PlatformsData | null;
  connectedPlatforms: ConnectedPlatform[];
  notificationSettings: NotificationSettings;
  notificationEvents: NotificationEvent[];
  linkedAccounts: LinkedAccount[];

  // Loading states
  loading: boolean;
  connectingPlatform: string | null;
  testingPlatform: string | null;

  // Methods
  refreshPlatforms: () => Promise<void>;
  connectPlatform: (platform: string, credentials: PlatformCredentials, config?: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
  disconnectPlatform: (platform: string) => Promise<{ success: boolean; error?: string }>;
  testConnection: (platform: string, credentials?: PlatformCredentials) => Promise<TestResult | null>;
  getPlatformStatus: (platform: string) => Promise<PlatformStatus | null>;
  sendTestNotification: (platform: string) => Promise<{ success: boolean; message?: string }>;
  updateNotificationSettings: (settings: NotificationSettings) => Promise<{ success: boolean; error?: string }>;

  // Pairing methods (for messaging platforms)
  generatePairingCode: () => Promise<PairingCode | null>;
  checkPairingStatus: (code: string) => Promise<PairingStatus | null>;
  refreshLinkedAccounts: () => Promise<void>;
  unlinkAccount: (channel: string, userId: string) => Promise<{ success: boolean; error?: string }>;

  // Polymarket wallet auth
  connectPolymarketWithWallet: (address: string, signMessage: (message: Uint8Array) => Promise<Uint8Array>) => Promise<{ success: boolean; error?: string }>;
}

export function useIntegrations(): UseIntegrationsResult {
  const [platforms, setPlatforms] = useState<PlatformsData | null>(null);
  const [connectedPlatforms, setConnectedPlatforms] = useState<ConnectedPlatform[]>([]);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({});
  const [notificationEvents, setNotificationEvents] = useState<NotificationEvent[]>([]);
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [testingPlatform, setTestingPlatform] = useState<string | null>(null);

  const refreshLinkedAccounts = useCallback(async () => {
    try {
      const res = await api.getLinkedAccounts();
      if (res.success && res.data) {
        setLinkedAccounts(res.data.linkedAccounts.map(acc => ({
          channel: acc.channel,
          userId: acc.userId,
          username: acc.username,
          linkedAt: acc.linkedAt,
          linkedBy: acc.linkedBy as LinkedAccount['linkedBy'],
        })));
      }
    } catch (error) {
      console.error('Failed to fetch linked accounts:', error);
    }
  }, []);

  const refreshPlatforms = useCallback(async () => {
    try {
      const [platformsRes, connectedRes, notifRes, linkedRes] = await Promise.allSettled([
        api.getAvailablePlatforms(),
        api.getConnectedPlatforms(),
        api.getNotificationSettings(),
        api.getLinkedAccounts(),
      ]);

      // Handle platforms response
      if (platformsRes.status === 'fulfilled' && platformsRes.value.success && platformsRes.value.data) {
        setPlatforms(platformsRes.value.data as PlatformsData);
        if (platformsRes.value.data.notificationEvents) {
          setNotificationEvents(platformsRes.value.data.notificationEvents);
        }
      } else {
        // Use default platforms when gateway is unavailable
        console.warn('Gateway unavailable, using default platforms');
        setPlatforms(DEFAULT_PLATFORMS as PlatformsData);
        setNotificationEvents(DEFAULT_PLATFORMS.notificationEvents);
      }

      // Handle connected platforms response
      if (connectedRes.status === 'fulfilled' && connectedRes.value.success && connectedRes.value.data) {
        setConnectedPlatforms(connectedRes.value.data as ConnectedPlatform[]);
      } else {
        // Load from localStorage if gateway unavailable
        const savedConnections = localStorage.getItem('connected_platforms');
        if (savedConnections) {
          try {
            setConnectedPlatforms(JSON.parse(savedConnections));
          } catch {
            setConnectedPlatforms([]);
          }
        }
      }

      // Handle notification settings response
      if (notifRes.status === 'fulfilled' && notifRes.value.success && notifRes.value.data) {
        setNotificationSettings(notifRes.value.data);
      } else {
        // Load from localStorage if gateway unavailable
        const savedSettings = localStorage.getItem('notification_settings');
        if (savedSettings) {
          try {
            setNotificationSettings(JSON.parse(savedSettings));
          } catch {
            setNotificationSettings({});
          }
        }
      }

      // Handle linked accounts response
      if (linkedRes.status === 'fulfilled' && linkedRes.value.success && linkedRes.value.data) {
        setLinkedAccounts(linkedRes.value.data.linkedAccounts.map((acc: { channel: string; userId: string; username?: string; linkedAt: string; linkedBy: string }) => ({
          channel: acc.channel,
          userId: acc.userId,
          username: acc.username,
          linkedAt: acc.linkedAt,
          linkedBy: acc.linkedBy as LinkedAccount['linkedBy'],
        })));
      }
    } catch (error) {
      console.error('Failed to fetch integrations:', error);
      // Fallback to defaults
      setPlatforms(DEFAULT_PLATFORMS as PlatformsData);
      setNotificationEvents(DEFAULT_PLATFORMS.notificationEvents);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshPlatforms();
  }, [refreshPlatforms]);

  const connectPlatform = useCallback(async (
    platform: string,
    credentials: PlatformCredentials,
    config?: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }> => {
    setConnectingPlatform(platform);
    try {
      const response = await api.connectPlatform(platform, credentials as Record<string, unknown>, config);
      if (response.success) {
        await refreshPlatforms();
        return { success: true };
      }

      // If gateway fails, try to save locally
      if (response.error?.includes('Network error') || response.error?.includes('fetch')) {
        console.warn('Gateway unavailable, saving connection locally');

        // Find platform info
        const allPlatforms = [...(platforms?.messaging || []), ...(platforms?.exchange || []), ...(platforms?.prediction || [])];
        const platformInfo = allPlatforms.find(p => p.id === platform);

        if (platformInfo) {
          const newConnection: ConnectedPlatform = {
            id: `local_${platform}_${Date.now()}`,
            userId: 'local',
            platform,
            category: platformInfo.category,
            config: { ...config, credentials: '***' }, // Don't store actual credentials
            status: 'connected',
            lastConnectedAt: Date.now(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            name: platformInfo.name,
            icon: platformInfo.icon,
            description: platformInfo.description,
          };

          const updatedConnections = [...connectedPlatforms, newConnection];
          setConnectedPlatforms(updatedConnections);
          localStorage.setItem('connected_platforms', JSON.stringify(updatedConnections));

          // Update platform status
          if (platforms) {
            const updatedPlatforms = { ...platforms };
            const category = platformInfo.category as keyof PlatformsData;
            if (Array.isArray(updatedPlatforms[category])) {
              updatedPlatforms[category] = (updatedPlatforms[category] as Platform[]).map((p: Platform) =>
                p.id === platform ? { ...p, connected: true, status: 'connected' as const } : p
              );
            }
            setPlatforms(updatedPlatforms);
          }

          return { success: true };
        }
      }

      return { success: false, error: response.error || 'Failed to connect' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to connect' };
    } finally {
      setConnectingPlatform(null);
    }
  }, [refreshPlatforms, platforms, connectedPlatforms]);

  const disconnectPlatform = useCallback(async (platform: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await api.disconnectPlatform(platform);
      if (response.success) {
        await refreshPlatforms();
        return { success: true };
      }

      // If gateway fails, disconnect locally
      if (response.error?.includes('Network error') || response.error?.includes('fetch')) {
        console.warn('Gateway unavailable, disconnecting locally');

        const updatedConnections = connectedPlatforms.filter(p => p.platform !== platform);
        setConnectedPlatforms(updatedConnections);
        localStorage.setItem('connected_platforms', JSON.stringify(updatedConnections));

        // Update platform status
        if (platforms) {
          const updatedPlatforms = { ...platforms };
          for (const category of ['messaging', 'exchange', 'prediction'] as const) {
            if (Array.isArray(updatedPlatforms[category])) {
              updatedPlatforms[category] = (updatedPlatforms[category] as Platform[]).map((p: Platform) =>
                p.id === platform ? { ...p, connected: false, status: 'disconnected' as const } : p
              );
            }
          }
          setPlatforms(updatedPlatforms);
        }

        return { success: true };
      }

      return { success: false, error: response.error || 'Failed to disconnect' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to disconnect' };
    }
  }, [refreshPlatforms, platforms, connectedPlatforms]);

  const testConnection = useCallback(async (
    platform: string,
    credentials?: PlatformCredentials
  ): Promise<TestResult | null> => {
    setTestingPlatform(platform);
    try {
      const response = await api.testPlatformConnection(platform, credentials as Record<string, unknown> | undefined);
      if (response.success && response.data) {
        return response.data;
      }

      // If gateway unavailable, return a status indicating gateway is down
      if (response.error?.includes('Network error') || response.error?.includes('fetch')) {
        return {
          platform,
          testResult: 'failed',
          message: 'Gateway unavailable. Credentials saved locally - they will be validated when the gateway is online.',
          latencyMs: undefined,
        };
      }

      return {
        platform,
        testResult: 'failed',
        message: response.error || 'Connection test failed',
      };
    } catch (error) {
      console.error('Failed to test connection:', error);
      return {
        platform,
        testResult: 'failed',
        message: 'Gateway unavailable. Please try again later.',
      };
    } finally {
      setTestingPlatform(null);
    }
  }, []);

  const getPlatformStatus = useCallback(async (platform: string): Promise<PlatformStatus | null> => {
    try {
      const response = await api.getPlatformStatus(platform);
      if (response.success && response.data) {
        return response.data as PlatformStatus;
      }
      return null;
    } catch (error) {
      console.error('Failed to get platform status:', error);
      return null;
    }
  }, []);

  const sendTestNotification = useCallback(async (platform: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await api.sendTestNotification(platform);
      if (response.success && response.data) {
        return { success: response.data.sent, message: response.data.message };
      }
      return { success: false, message: response.error };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Failed to send' };
    }
  }, []);

  const updateNotificationSettings = useCallback(async (
    settings: NotificationSettings
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await api.updateNotificationSettings(settings);
      if (response.success) {
        setNotificationSettings(settings);
        return { success: true };
      }
      return { success: false, error: response.error || 'Failed to update settings' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update settings' };
    }
  }, []);

  // Pairing methods for messaging platforms
  const generatePairingCode = useCallback(async (): Promise<PairingCode | null> => {
    try {
      const response = await api.generatePairingCode();
      if (response.success && response.data) {
        return {
          code: response.data.code,
          expiresIn: response.data.expiresIn,
        };
      }
      return null;
    } catch (error) {
      console.error('Failed to generate pairing code:', error);
      return null;
    }
  }, []);

  const checkPairingStatus = useCallback(async (code: string): Promise<PairingStatus | null> => {
    try {
      const response = await api.checkPairingStatus(code);
      if (response.success && response.data) {
        return response.data;
      }
      return null;
    } catch (error) {
      console.error('Failed to check pairing status:', error);
      return null;
    }
  }, []);

  const unlinkAccount = useCallback(async (channel: string, userId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await api.unlinkAccount(channel, userId);
      if (response.success) {
        setLinkedAccounts(prev => prev.filter(acc => !(acc.channel === channel && acc.userId === userId)));
        return { success: true };
      }
      return { success: false, error: response.error || 'Failed to unlink account' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to unlink account' };
    }
  }, []);

  // Polymarket wallet auth
  const connectPolymarketWithWallet = useCallback(async (
    address: string,
    signMessage: (message: Uint8Array) => Promise<Uint8Array>
  ): Promise<{ success: boolean; error?: string }> => {
    setConnectingPlatform('polymarket');
    try {
      // 1. Get challenge from backend
      const challengeRes = await api.getPolymarketChallenge();
      if (!challengeRes.success || !challengeRes.data) {
        return { success: false, error: 'Failed to get authentication challenge' };
      }

      const { challenge } = challengeRes.data;

      // 2. Sign the challenge with user's wallet
      const messageBytes = new TextEncoder().encode(challenge);
      const signatureBytes = await signMessage(messageBytes);

      // Convert signature to hex
      const signature = Array.from(signatureBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // 3. Send to backend to verify and derive credentials
      const connectRes = await api.connectPolymarketWallet({
        signature,
        address,
        challenge,
      });

      if (connectRes.success) {
        await refreshPlatforms();
        return { success: true };
      }

      return { success: false, error: connectRes.error || 'Failed to connect wallet' };
    } catch (error) {
      if (error instanceof Error && error.message.includes('User rejected')) {
        return { success: false, error: 'Wallet signature rejected' };
      }
      return { success: false, error: error instanceof Error ? error.message : 'Failed to connect wallet' };
    } finally {
      setConnectingPlatform(null);
    }
  }, [refreshPlatforms]);

  return {
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
    getPlatformStatus,
    sendTestNotification,
    updateNotificationSettings,
    // Pairing methods
    generatePairingCode,
    checkPairingStatus,
    refreshLinkedAccounts,
    unlinkAccount,
    // Polymarket wallet auth
    connectPolymarketWithWallet,
  };
}
