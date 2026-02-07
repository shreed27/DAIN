"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Plus,
  Settings,
  TrendingUp,
  TrendingDown,
  Pause,
  Play,
  Trash2,
  Copy,
  ExternalLink,
  DollarSign,
  Activity,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface CopyConfig {
  id: string;
  userWallet: string;
  targetWallet: string;
  targetLabel?: string;
  enabled: boolean;
  allocationPercent: number;
  maxPositionSize?: number;
  stopLossPercent?: number;
  takeProfitPercent?: number;
  totalTrades: number;
  totalPnl: number;
  tradesToday?: number;
  maxDailyTrades?: number;
}

interface CopyStats {
  totalConfigs: number;
  activeConfigs: number;
  totalCopiedTrades: number;
  successfulTrades: number;
  totalPnl: number;
  successRate: number;
  topPerformingTarget?: { wallet: string; pnl: number };
}

interface CopyHistory {
  id: string;
  configId: string;
  originalTx: string;
  copiedTx?: string;
  targetWallet: string;
  action: string;
  token: string;
  originalAmount: number;
  copiedAmount?: number;
  status: string;
  pnl?: number;
  createdAt: number;
}

function CreateConfigModal({
  onClose,
  onCreated,
  userWallet,
}: {
  onClose: () => void;
  onCreated: () => void;
  userWallet: string;
}) {
  const [targetWallet, setTargetWallet] = useState("");
  const [targetLabel, setTargetLabel] = useState("");
  const [allocationPercent, setAllocationPercent] = useState(10);
  const [maxPositionSize, setMaxPositionSize] = useState("");
  const [stopLossPercent, setStopLossPercent] = useState("");
  const [takeProfitPercent, setTakeProfitPercent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!targetWallet.trim()) return;

    setIsSubmitting(true);
    try {
      await api.createCopyTradingConfig({
        userWallet,
        targetWallet: targetWallet.trim(),
        targetLabel: targetLabel.trim() || undefined,
        allocationPercent,
        maxPositionSize: maxPositionSize ? parseFloat(maxPositionSize) : undefined,
        stopLossPercent: stopLossPercent ? parseFloat(stopLossPercent) : undefined,
        takeProfitPercent: takeProfitPercent ? parseFloat(takeProfitPercent) : undefined,
      });
      onCreated();
      onClose();
    } catch (error) {
      console.error("Failed to create config:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-900 border border-white/10 rounded-2xl max-w-lg w-full"
      >
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Follow a Trader</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Target Wallet Address *
            </label>
            <input
              type="text"
              value={targetWallet}
              onChange={(e) => setTargetWallet(e.target.value)}
              placeholder="Enter wallet address to copy..."
              className="w-full h-10 px-4 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-green-500/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Label (optional)
            </label>
            <input
              type="text"
              value={targetLabel}
              onChange={(e) => setTargetLabel(e.target.value)}
              placeholder="e.g., Whale Trader, Smart Money..."
              className="w-full h-10 px-4 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-green-500/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Allocation: {allocationPercent}% of portfolio
            </label>
            <input
              type="range"
              min="1"
              max="50"
              value={allocationPercent}
              onChange={(e) => setAllocationPercent(parseInt(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Max Position Size ($)
              </label>
              <input
                type="number"
                value={maxPositionSize}
                onChange={(e) => setMaxPositionSize(e.target.value)}
                placeholder="No limit"
                className="w-full h-10 px-4 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-green-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Stop Loss %
              </label>
              <input
                type="number"
                value={stopLossPercent}
                onChange={(e) => setStopLossPercent(e.target.value)}
                placeholder="e.g., 10"
                className="w-full h-10 px-4 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-green-500/50"
              />
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-white/10">
          <button
            onClick={handleSubmit}
            disabled={!targetWallet.trim() || isSubmitting}
            className="w-full h-12 rounded-xl bg-green-600 hover:bg-green-500 disabled:bg-white/10 disabled:text-muted-foreground text-white font-medium transition-colors"
          >
            {isSubmitting ? "Creating..." : "Start Following"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ConfigCard({
  config,
  onToggle,
  onDelete,
}: {
  config: CopyConfig;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const isProfitable = config.totalPnl >= 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "p-4 rounded-xl border transition-all",
        config.enabled
          ? "bg-white/[0.02] border-white/10"
          : "bg-white/[0.01] border-white/5 opacity-60"
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {config.targetLabel && (
              <span className="font-medium text-white">{config.targetLabel}</span>
            )}
            <span
              className={cn(
                "px-2 py-0.5 rounded text-xs font-bold uppercase",
                config.enabled
                  ? "bg-green-500/10 text-green-400"
                  : "bg-white/5 text-muted-foreground"
              )}
            >
              {config.enabled ? "Active" : "Paused"}
            </span>
          </div>
          <p className="font-mono text-sm text-muted-foreground truncate">
            {config.targetWallet}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onToggle(config.id, !config.enabled)}
            className={cn(
              "p-2 rounded-lg transition-colors",
              config.enabled
                ? "hover:bg-yellow-500/10 text-yellow-400"
                : "hover:bg-green-500/10 text-green-400"
            )}
          >
            {config.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            onClick={() => onDelete(config.id)}
            className="p-2 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Allocation</p>
          <p className="font-medium text-white">{config.allocationPercent}%</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Trades</p>
          <p className="font-medium text-white">{config.totalTrades}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Today</p>
          <p className="font-medium text-white">
            {config.tradesToday || 0}/{config.maxDailyTrades || 20}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total P&L</p>
          <p
            className={cn(
              "font-medium",
              isProfitable ? "text-green-400" : "text-red-400"
            )}
          >
            {isProfitable ? "+" : ""}
            {config.totalPnl.toFixed(2)} SOL
          </p>
        </div>
      </div>
    </motion.div>
  );
}

export default function CopyTradingPage() {
  const [configs, setConfigs] = useState<CopyConfig[]>([]);
  const [stats, setStats] = useState<CopyStats | null>(null);
  const [history, setHistory] = useState<CopyHistory[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Mock wallet - in real app, get from wallet context
  const userWallet = "demo_wallet_address";

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [configsRes, statsRes, historyRes] = await Promise.all([
        api.getCopyTradingConfigs(userWallet),
        api.getCopyTradingStats(userWallet),
        api.getCopyTradingHistory({ userWallet, limit: 20 }),
      ]);

      if (configsRes.success && configsRes.data) {
        setConfigs(configsRes.data as CopyConfig[]);
      }

      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data as CopyStats);
      }

      if (historyRes.success && historyRes.data) {
        setHistory(historyRes.data as CopyHistory[]);
      }
    } catch (error) {
      console.error("Failed to fetch copy trading data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggle = async (configId: string, enabled: boolean) => {
    await api.toggleCopyTradingConfig(configId, enabled);
    fetchData();
  };

  const handleDelete = async (configId: string) => {
    if (confirm("Are you sure you want to stop following this trader?")) {
      await api.deleteCopyTradingConfig(configId);
      fetchData();
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
            <Users className="w-8 h-8 text-purple-400" /> Copy Trading
          </h1>
          <p className="text-muted-foreground">
            Automatically mirror trades from successful wallets.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="h-10 px-6 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium flex items-center gap-2 shadow-lg transition-all hover:scale-105 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Follow Trader
        </button>
      </header>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Following</p>
                <p className="font-bold text-lg text-white">
                  {stats.activeConfigs}/{stats.totalConfigs}
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Copied Trades</p>
                <p className="font-bold text-lg text-white">{stats.totalCopiedTrades}</p>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Success Rate</p>
                <p className="font-bold text-lg text-white">
                  {stats.successRate.toFixed(0)}%
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  stats.totalPnl >= 0 ? "bg-green-500/10" : "bg-red-500/10"
                )}
              >
                <DollarSign
                  className={cn(
                    "w-5 h-5",
                    stats.totalPnl >= 0 ? "text-green-400" : "text-red-400"
                  )}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total P&L</p>
                <p
                  className={cn(
                    "font-bold text-lg",
                    stats.totalPnl >= 0 ? "text-green-400" : "text-red-400"
                  )}
                >
                  {stats.totalPnl >= 0 ? "+" : ""}
                  {stats.totalPnl.toFixed(2)} SOL
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full" />
        </div>
      ) : (
        <>
          {/* Active Configs */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Following</h2>
            {configs.length > 0 ? (
              <div className="space-y-3">
                {configs.map((config) => (
                  <ConfigCard
                    key={config.id}
                    config={config}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 rounded-xl border border-white/5 bg-white/[0.02]">
                <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">
                  You're not following any traders yet.
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="h-10 px-6 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium"
                >
                  Follow Your First Trader
                </button>
              </div>
            )}
          </div>

          {/* Recent History */}
          {history.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-4">Recent Copies</h2>
              <div className="space-y-2">
                {history.slice(0, 10).map((h) => (
                  <div
                    key={h.id}
                    className="p-3 rounded-lg border border-white/5 bg-white/[0.02] flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center",
                          h.action === "buy" ? "bg-green-500/10" : "bg-red-500/10"
                        )}
                      >
                        {h.action === "buy" ? (
                          <TrendingUp className="w-4 h-4 text-green-400" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-red-400" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm text-white">
                          {h.action.toUpperCase()} {h.token.slice(0, 8)}...
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(h.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={cn(
                          "text-sm font-medium px-2 py-0.5 rounded",
                          h.status === "executed"
                            ? "bg-green-500/10 text-green-400"
                            : h.status === "failed"
                              ? "bg-red-500/10 text-red-400"
                              : "bg-yellow-500/10 text-yellow-400"
                        )}
                      >
                        {h.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateConfigModal
            onClose={() => setShowCreateModal(false)}
            onCreated={fetchData}
            userWallet={userWallet}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
