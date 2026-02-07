"use client";

import { FC, useState, useCallback, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  Wallet,
  ChevronDown,
  Copy,
  LogOut,
  ExternalLink,
  Check,
  AlertCircle,
} from "lucide-react";
import { truncateAddress } from "@/lib/walletAuth";
import { cn } from "@/lib/utils";

interface WalletButtonProps {
  className?: string;
}

export const WalletButton: FC<WalletButtonProps> = ({ className }) => {
  const { publicKey, wallet, disconnect, connected, wallets, select, connecting } = useWallet();
  const { connection } = useConnection();
  const { setVisible, visible } = useWalletModal();
  const [error, setError] = useState<string | null>(null);

  const [balance, setBalance] = useState<number | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);

  // Fetch SOL balance when connected
  useEffect(() => {
    if (!publicKey) {
      setBalance(null);
      return;
    }

    const fetchBalance = async () => {
      try {
        const lamports = await connection.getBalance(publicKey);
        setBalance(lamports / LAMPORTS_PER_SOL);
      } catch (error) {
        console.error("Error fetching balance:", error);
        setBalance(null);
      }
    };

    fetchBalance();

    // Subscribe to balance changes
    const subscriptionId = connection.onAccountChange(publicKey, (account) => {
      setBalance(account.lamports / LAMPORTS_PER_SOL);
    });

    return () => {
      connection.removeAccountChangeListener(subscriptionId);
    };
  }, [publicKey, connection]);

  const handleConnect = useCallback(() => {
    setError(null);

    // Check if any wallets are detected
    const installedWallets = wallets.filter(w => w.readyState === "Installed" || w.readyState === "Loadable");

    if (installedWallets.length === 0) {
      // No wallets installed - show modal anyway (it will show install options)
      console.log("[Wallet] No wallets detected, showing modal with install options");
    } else {
      console.log("[Wallet] Detected wallets:", installedWallets.map(w => w.adapter.name));
    }

    // Open the wallet modal
    setVisible(true);
  }, [setVisible, wallets]);

  const handleDisconnect = useCallback(async () => {
    await disconnect();
    setShowDropdown(false);
  }, [disconnect]);

  const handleCopyAddress = useCallback(() => {
    if (publicKey) {
      navigator.clipboard.writeText(publicKey.toBase58());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [publicKey]);

  const handleViewExplorer = useCallback(() => {
    if (publicKey) {
      window.open(
        `https://solscan.io/account/${publicKey.toBase58()}`,
        "_blank"
      );
    }
  }, [publicKey]);

  // Not connected state
  if (!connected || !publicKey) {
    return (
      <div className="space-y-2">
        <button
          onClick={handleConnect}
          disabled={connecting}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary to-purple-600 text-white font-medium text-sm transition-all hover:shadow-lg hover:shadow-primary/25 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-wait w-full justify-center",
            className
          )}
        >
          <Wallet className={cn("w-4 h-4", connecting && "animate-pulse")} />
          {connecting ? "Connecting..." : "Connect Wallet"}
        </button>
        {error && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="w-3 h-3" />
            <span>{error}</span>
          </div>
        )}
      </div>
    );
  }

  // Connected state
  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={cn(
          "flex items-center gap-3 w-full px-3 py-2.5 rounded-xl bg-card/50 border border-border/50 hover:bg-card/80 transition-all group",
          className
        )}
      >
        {/* Wallet Icon */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center flex-shrink-0">
          {wallet?.adapter.icon ? (
            <img
              src={wallet.adapter.icon}
              alt={wallet.adapter.name}
              className="w-5 h-5 rounded-full"
            />
          ) : (
            <Wallet className="w-4 h-4 text-white" />
          )}
        </div>

        {/* Address and Balance */}
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium text-foreground truncate">
            {truncateAddress(publicKey.toBase58(), 4, 4)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {balance !== null ? `${balance.toFixed(4)} SOL` : "Loading..."}
          </p>
        </div>

        {/* Dropdown indicator */}
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground transition-transform",
            showDropdown && "rotate-180"
          )}
        />
      </button>

      {/* Dropdown Menu */}
      {showDropdown && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDropdown(false)}
          />

          {/* Menu */}
          <div className="absolute bottom-full left-0 right-0 mb-2 bg-card border border-border/50 rounded-xl shadow-lg z-50 overflow-hidden">
            <div className="p-2 space-y-1">
              <button
                onClick={handleCopyAddress}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copied ? "Copied!" : "Copy Address"}
              </button>

              <button
                onClick={handleViewExplorer}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                View on Solscan
              </button>

              <div className="border-t border-border/50 my-1" />

              <button
                onClick={handleDisconnect}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Disconnect
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
