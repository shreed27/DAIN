'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Eye,
  EyeOff,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Loader2,
  HelpCircle,
  Copy,
  MessageCircle,
  Wallet,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Platform, PlatformCredentials, TestResult, PairingCode, PairingStatus } from '../types';

interface ConnectPlatformModalProps {
  platform: Platform | null;
  isOpen: boolean;
  onClose: () => void;
  onConnect: (credentials: PlatformCredentials, config?: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
  onTest: (credentials: PlatformCredentials) => Promise<TestResult | null>;
  // New props for pairing and wallet auth
  onGeneratePairingCode?: () => Promise<PairingCode | null>;
  onCheckPairingStatus?: (code: string) => Promise<PairingStatus | null>;
  onConnectWithWallet?: (signMessage: (message: Uint8Array) => Promise<Uint8Array>) => Promise<{ success: boolean; error?: string }>;
  walletAddress?: string;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
}

interface FieldConfig {
  name: string;
  label: string;
  type: 'text' | 'password' | 'email';
  required: boolean;
  placeholder: string;
  helpText?: string;
  helpUrl?: string;
}

// Bot configuration for messaging platforms
const BOT_CONFIG = {
  telegram: {
    botUsername: 'CloddsBot', // Update with actual bot username
    deepLinkTemplate: 'https://t.me/{botUsername}?start={code}',
  },
  discord: {
    botInviteUrl: 'https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot', // Update with actual invite URL
    // For Discord, users typically invite the bot to their server then DM it
  },
};

// Credential fields for exchanges and Kalshi (platforms requiring manual API keys)
const platformFields: Record<string, FieldConfig[]> = {
  binance: [
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      placeholder: 'Your Binance API key',
      helpText: 'Create API key in Binance account settings. Enable READ ONLY permissions.',
      helpUrl: 'https://www.binance.com/en/support/faq/how-to-create-api-keys-on-binance-360002502072',
    },
    {
      name: 'apiSecret',
      label: 'API Secret',
      type: 'password',
      required: true,
      placeholder: 'Your Binance API secret',
      helpText: 'Shown once when you create the API key',
    },
  ],
  bybit: [
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      placeholder: 'Your Bybit API key',
      helpText: 'Create API key in Bybit account settings',
      helpUrl: 'https://www.bybit.com/en-US/help-center/article/How-to-create-your-API-key',
    },
    {
      name: 'apiSecret',
      label: 'API Secret',
      type: 'password',
      required: true,
      placeholder: 'Your Bybit API secret',
    },
  ],
  kalshi: [
    {
      name: 'apiKey',
      label: 'API Key ID',
      type: 'password',
      required: true,
      placeholder: 'Your Kalshi API key ID',
      helpText: 'Find this in your Kalshi account under API settings',
      helpUrl: 'https://kalshi.com/account/api',
    },
    {
      name: 'apiSecret',
      label: 'Private Key',
      type: 'password',
      required: true,
      placeholder: 'Paste your private key PEM contents',
      helpText: 'The contents of your private key file',
    },
  ],
};

// Determine connection method based on platform
function getConnectionMethod(platformId: string): 'pairing' | 'wallet' | 'credentials' {
  if (platformId === 'telegram' || platformId === 'discord') {
    return 'pairing';
  }
  if (platformId === 'polymarket') {
    return 'wallet';
  }
  return 'credentials';
}

// Pairing Flow Component for Telegram/Discord
function MessagingPairingFlow({
  platform,
  onGeneratePairingCode,
  onCheckPairingStatus,
  onClose,
}: {
  platform: Platform;
  onGeneratePairingCode?: () => Promise<PairingCode | null>;
  onCheckPairingStatus?: (code: string) => Promise<PairingStatus | null>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'init' | 'waiting' | 'done'>('init');
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkedAccount, setLinkedAccount] = useState<{ channel: string; userId: string; username?: string } | null>(null);

  const botConfig = BOT_CONFIG[platform.id as keyof typeof BOT_CONFIG];

  const initiatePairing = async () => {
    if (!onGeneratePairingCode) {
      setError('Pairing not configured');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await onGeneratePairingCode();
      if (result) {
        setCode(result.code);
        setStep('waiting');
      } else {
        setError('Failed to generate pairing code');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate pairing code');
    } finally {
      setLoading(false);
    }
  };

  // Poll for pairing completion
  useEffect(() => {
    if (step !== 'waiting' || !code || !onCheckPairingStatus) return;

    const pollInterval = setInterval(async () => {
      try {
        const status = await onCheckPairingStatus(code);
        if (status?.status === 'completed' && status.linkedAccount) {
          setLinkedAccount(status.linkedAccount);
          setStep('done');
          clearInterval(pollInterval);
        } else if (status?.status === 'expired') {
          setError('Pairing code expired. Please try again.');
          setStep('init');
          setCode(null);
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error('Failed to check pairing status:', err);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [step, code, onCheckPairingStatus]);

  const copyCode = () => {
    if (code) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getDeepLink = () => {
    if (!code || !botConfig) return null;
    if (platform.id === 'telegram') {
      return `https://t.me/${BOT_CONFIG.telegram.botUsername}?start=${code}`;
    }
    return null;
  };

  // Initial state - show "Connect" button
  if (step === 'init') {
    return (
      <div className="p-4 space-y-6">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
            <MessageCircle className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Connect {platform.name}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Link your {platform.name} account to receive trading alerts and notifications
            </p>
          </div>
        </div>

        <div className="bg-muted/50 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium">How it works:</p>
          <ol className="text-sm text-muted-foreground space-y-2">
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center">1</span>
              <span>Click "Connect" to generate a pairing code</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center">2</span>
              <span>Open {platform.name} and start a chat with our bot</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center">3</span>
              <span>Send the code to link your account</span>
            </li>
          </ol>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <button
          onClick={initiatePairing}
          disabled={loading}
          className="w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-medium transition-colors disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              Connect {platform.name}
              <ArrowRight className="w-4 h-4" />
            </span>
          )}
        </button>
      </div>
    );
  }

  // Waiting state - show code and deep link
  if (step === 'waiting') {
    const deepLink = getDeepLink();

    return (
      <div className="p-4 space-y-6">
        <div className="text-center space-y-2">
          <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Waiting for you to link your account...</p>
        </div>

        {/* Code display */}
        <div className="bg-muted rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Your pairing code:</span>
            <button
              onClick={copyCode}
              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="text-2xl font-mono font-bold tracking-widest text-center py-2">
            {code}
          </div>
        </div>

        {/* Deep link button for Telegram */}
        {deepLink && (
          <a
            href={deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-[#0088cc] text-white hover:bg-[#0088cc]/90 font-medium transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Open Telegram
          </a>
        )}

        {/* Manual instructions */}
        <div className="text-center text-sm text-muted-foreground">
          <p>Or send <code className="px-1.5 py-0.5 rounded bg-muted font-mono">/start {code}</code> to <strong>@{BOT_CONFIG.telegram.botUsername}</strong></p>
        </div>

        <button
          onClick={() => {
            setStep('init');
            setCode(null);
          }}
          className="w-full px-4 py-2 rounded-lg border border-border hover:bg-accent text-sm font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  // Done state - show success
  return (
    <div className="p-4 space-y-6">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-green-500">Connected!</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Your {platform.name} account has been linked
          </p>
        </div>
      </div>

      {linkedAccount && (
        <div className="bg-muted/50 rounded-xl p-4 text-center">
          <p className="text-sm text-muted-foreground">Linked to:</p>
          <p className="font-medium">{linkedAccount.username || linkedAccount.userId}</p>
        </div>
      )}

      <button
        onClick={onClose}
        className="w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-medium transition-colors"
      >
        Done
      </button>
    </div>
  );
}

// Wallet Connection Flow for Polymarket
function PolymarketWalletFlow({
  platform,
  walletAddress,
  signMessage,
  onConnectWithWallet,
  onClose,
}: {
  platform: Platform;
  walletAddress?: string;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
  onConnectWithWallet?: (signMessage: (message: Uint8Array) => Promise<Uint8Array>) => Promise<{ success: boolean; error?: string }>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'init' | 'signing' | 'done'>('init');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectWallet = async () => {
    if (!signMessage || !onConnectWithWallet) {
      setError('Please connect your wallet first');
      return;
    }

    setLoading(true);
    setError(null);
    setStep('signing');

    try {
      const result = await onConnectWithWallet(signMessage);
      if (result.success) {
        setStep('done');
      } else {
        setError(result.error || 'Failed to connect wallet');
        setStep('init');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect wallet');
      setStep('init');
    } finally {
      setLoading(false);
    }
  };

  // Initial state
  if (step === 'init') {
    return (
      <div className="p-4 space-y-6">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-purple-500/10 flex items-center justify-center">
            <Wallet className="w-8 h-8 text-purple-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Connect Polymarket</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Sign with your wallet to connect your Polymarket account
            </p>
          </div>
        </div>

        <div className="bg-muted/50 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium">How it works:</p>
          <ol className="text-sm text-muted-foreground space-y-2">
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-500/20 text-purple-500 text-xs flex items-center justify-center">1</span>
              <span>Click "Connect with Wallet" below</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-500/20 text-purple-500 text-xs flex items-center justify-center">2</span>
              <span>Sign the message in your wallet (no gas fee)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-500/20 text-purple-500 text-xs flex items-center justify-center">3</span>
              <span>Your Polymarket account is automatically linked</span>
            </li>
          </ol>
        </div>

        {walletAddress && (
          <div className="bg-muted/50 rounded-xl p-3">
            <p className="text-xs text-muted-foreground">Connected wallet:</p>
            <p className="font-mono text-sm truncate">{walletAddress}</p>
          </div>
        )}

        {!walletAddress && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 text-yellow-600 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>Please connect your wallet first using the button in the header</p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <button
          onClick={connectWallet}
          disabled={loading || !walletAddress || !signMessage}
          className="w-full px-4 py-3 rounded-xl bg-purple-600 text-white hover:bg-purple-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Connecting...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Wallet className="w-4 h-4" />
              Connect with Wallet
            </span>
          )}
        </button>
      </div>
    );
  }

  // Signing state
  if (step === 'signing') {
    return (
      <div className="p-4 space-y-6">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 mx-auto animate-spin text-purple-500" />
          <div>
            <h3 className="text-lg font-semibold">Sign the message</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Please confirm the signature in your wallet
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Done state
  return (
    <div className="p-4 space-y-6">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-green-500">Connected!</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Your Polymarket account has been linked
          </p>
        </div>
      </div>

      <button
        onClick={onClose}
        className="w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-medium transition-colors"
      >
        Done
      </button>
    </div>
  );
}

// Credential Flow for Exchanges (Binance/Bybit)
function ExchangeCredentialFlow({
  platform,
  onConnect,
  onTest,
}: {
  platform: Platform;
  onConnect: (credentials: PlatformCredentials, config?: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
  onTest: (credentials: PlatformCredentials) => Promise<TestResult | null>;
}) {
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [isConnecting, setIsConnecting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fields = platformFields[platform.id] || [];

  const handleInputChange = (name: string, value: string) => {
    setCredentials(prev => ({ ...prev, [name]: value }));
    setError(null);
    setTestResult(null);
  };

  const togglePasswordVisibility = (name: string) => {
    setShowPasswords(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const validateCredentials = (): boolean => {
    for (const field of fields) {
      if (field.required && !credentials[field.name]?.trim()) {
        setError(`${field.label} is required`);
        return false;
      }
    }
    return true;
  };

  const handleTest = async () => {
    if (!validateCredentials()) return;

    setIsTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const result = await onTest(credentials as PlatformCredentials);
      setTestResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const handleConnect = async () => {
    if (!validateCredentials()) return;

    setIsConnecting(true);
    setError(null);

    try {
      const result = await onConnect(credentials as PlatformCredentials);
      if (!result.success) {
        setError(result.error || 'Failed to connect');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Step-by-step guide */}
      <div className="bg-muted/50 rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium flex items-center gap-2">
          <HelpCircle className="w-4 h-4" />
          How to get your API keys:
        </p>
        <ol className="text-sm text-muted-foreground space-y-1.5">
          <li>1. Log in to your {platform.name} account</li>
          <li>2. Go to API Management in settings</li>
          <li>3. Create a new API key with <strong>READ ONLY</strong> permissions</li>
          <li>4. Copy the API Key and Secret below</li>
        </ol>
        {fields[0]?.helpUrl && (
          <a
            href={fields[0].helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View step-by-step guide
          </a>
        )}
      </div>

      {/* Warning about permissions */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 text-yellow-600 text-sm">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-medium">Important: Use READ ONLY permissions</p>
          <p className="text-xs mt-0.5 opacity-80">For security, only enable reading permissions. We don't need withdrawal or trading access.</p>
        </div>
      </div>

      {/* Credential fields */}
      {fields.map(field => (
        <div key={field.name}>
          <label className="flex items-center gap-2 text-sm font-medium mb-1.5">
            {field.label}
            {field.required && <span className="text-destructive">*</span>}
          </label>
          <div className="relative">
            <input
              type={
                field.type === 'password' && !showPasswords[field.name]
                  ? 'password'
                  : 'text'
              }
              value={credentials[field.name] || ''}
              onChange={e => handleInputChange(field.name, e.target.value)}
              placeholder={field.placeholder}
              className={cn(
                'w-full px-3 py-2 rounded-lg border bg-background/50 text-sm transition-colors',
                'placeholder:text-muted-foreground/50',
                'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
                field.type === 'password' && 'pr-10'
              )}
            />
            {field.type === 'password' && (
              <button
                type="button"
                onClick={() => togglePasswordVisibility(field.name)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPasswords[field.name] ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
          {field.helpText && (
            <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>
          )}
        </div>
      ))}

      {/* Test Result */}
      {testResult && (
        <div
          className={cn(
            'flex items-start gap-2 p-3 rounded-lg text-sm',
            testResult.testResult === 'passed'
              ? 'bg-green-500/10 text-green-500'
              : 'bg-destructive/10 text-destructive'
          )}
        >
          {testResult.testResult === 'passed' ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          )}
          <div>
            <p className="font-medium">
              {testResult.testResult === 'passed' ? 'Connection successful' : 'Connection failed'}
            </p>
            <p className="text-xs opacity-80">{testResult.message}</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Buttons */}
      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={handleTest}
          disabled={isTesting || isConnecting}
          className="px-4 py-2 rounded-lg border border-border hover:bg-accent text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isTesting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Testing...
            </span>
          ) : (
            'Test Connection'
          )}
        </button>
        <div className="flex-1" />
        <button
          onClick={handleConnect}
          disabled={isConnecting || isTesting}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isConnecting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Connecting...
            </span>
          ) : (
            'Connect'
          )}
        </button>
      </div>
    </div>
  );
}

export function ConnectPlatformModal({
  platform,
  isOpen,
  onClose,
  onConnect,
  onTest,
  onGeneratePairingCode,
  onCheckPairingStatus,
  onConnectWithWallet,
  walletAddress,
  signMessage,
}: ConnectPlatformModalProps) {
  useEffect(() => {
    // Reset any state when modal opens with a new platform
  }, [isOpen, platform?.id]);

  if (!platform) return null;

  const connectionMethod = getConnectionMethod(platform.id);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-50"
          >
            <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div>
                  <h2 className="text-lg font-semibold">Connect {platform.name}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {platform.description}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-accent transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Content based on connection method */}
              {connectionMethod === 'pairing' && (
                <MessagingPairingFlow
                  platform={platform}
                  onGeneratePairingCode={onGeneratePairingCode}
                  onCheckPairingStatus={onCheckPairingStatus}
                  onClose={onClose}
                />
              )}

              {connectionMethod === 'wallet' && (
                <PolymarketWalletFlow
                  platform={platform}
                  walletAddress={walletAddress}
                  signMessage={signMessage}
                  onConnectWithWallet={onConnectWithWallet}
                  onClose={onClose}
                />
              )}

              {connectionMethod === 'credentials' && (
                <ExchangeCredentialFlow
                  platform={platform}
                  onConnect={onConnect}
                  onTest={onTest}
                />
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
