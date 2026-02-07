"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Target,
  TrendingUp,
  TrendingDown,
  Clock,
  BarChart3,
  AlertCircle,
  CheckCircle,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { LimitOrders } from "@/components/trading/LimitOrders";

interface OrderStats {
  total: number;
  pending: number;
  executed: number;
  cancelled: number;
  totalVolume: number;
  successRate: number;
}

export default function LimitOrdersPage() {
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Mock wallet
  const walletAddress = "demo_wallet_address";

  useEffect(() => {
    async function fetchStats() {
      setIsLoading(true);
      try {
        const response = await api.getLimitOrderStats(walletAddress);
        if (response.success && response.data) {
          setStats(response.data as OrderStats);
        }
      } catch (error) {
        console.error("Failed to fetch limit order stats:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchStats();
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
            <Target className="w-8 h-8 text-orange-400" /> Limit Orders
          </h1>
          <p className="text-muted-foreground">
            Set conditional orders that execute automatically when price targets are hit.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm">
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </header>

      {/* Stats Overview */}
      {!isLoading && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl border border-white/5 bg-white/[0.02]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Target className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Orders</p>
                <p className="text-xl font-bold text-white">{stats.total}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="p-4 rounded-xl border border-white/5 bg-white/[0.02]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-xl font-bold text-yellow-400">{stats.pending}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-4 rounded-xl border border-white/5 bg-white/[0.02]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Executed</p>
                <p className="text-xl font-bold text-green-400">{stats.executed}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="p-4 rounded-xl border border-white/5 bg-white/[0.02]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-500/10 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-gray-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cancelled</p>
                <p className="text-xl font-bold text-gray-400">{stats.cancelled}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="p-4 rounded-xl border border-white/5 bg-white/[0.02]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Volume</p>
                <p className="text-xl font-bold text-white">${(stats.totalVolume || 0).toFixed(0)}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="p-4 rounded-xl border border-white/5 bg-white/[0.02]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Success Rate</p>
                <p className={cn(
                  "text-xl font-bold",
                  (stats.successRate || 0) >= 50 ? "text-green-400" : "text-red-400"
                )}>
                  {(stats.successRate || 0).toFixed(1)}%
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* How It Works */}
      <div className="p-4 rounded-xl border border-white/5 bg-gradient-to-r from-orange-500/5 to-transparent">
        <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-orange-400" />
          How Limit Orders Work
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold text-xs shrink-0">
              1
            </div>
            <div>
              <p className="font-medium text-white">Set Your Target</p>
              <p className="text-muted-foreground text-xs mt-1">
                Choose a token, target price, and trigger condition (above/below).
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold text-xs shrink-0">
              2
            </div>
            <div>
              <p className="font-medium text-white">Auto-Monitoring</p>
              <p className="text-muted-foreground text-xs mt-1">
                Our system continuously monitors prices and detects when conditions are met.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold text-xs shrink-0">
              3
            </div>
            <div>
              <p className="font-medium text-white">Instant Execution</p>
              <p className="text-muted-foreground text-xs mt-1">
                When triggered, orders execute automatically via Jupiter with optimal routing.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Orders List */}
        <div className="lg:col-span-2">
          <LimitOrders walletAddress={walletAddress} />
        </div>

        {/* Tips & Info */}
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <h3 className="font-semibold text-white mb-3">Pro Tips</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <TrendingUp className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                <span>Use <strong className="text-white">Buy Below</strong> to accumulate tokens during dips.</span>
              </li>
              <li className="flex items-start gap-2">
                <TrendingDown className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>Use <strong className="text-white">Sell Above</strong> to take profits at resistance levels.</span>
              </li>
              <li className="flex items-start gap-2">
                <Clock className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                <span>Set expiration times to avoid stale orders during volatile markets.</span>
              </li>
              <li className="flex items-start gap-2">
                <Target className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                <span>Combine with automation rules for complex trading strategies.</span>
              </li>
            </ul>
          </div>

          <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <h3 className="font-semibold text-white mb-3">Order Types</h3>
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <p className="font-medium text-green-400 text-sm">Buy Limit</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Executes a buy when price drops to or below your target.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="font-medium text-red-400 text-sm">Sell Limit</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Executes a sell when price rises to or above your target.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <p className="font-medium text-blue-400 text-sm">Stop Loss</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Sells when price drops below your stop level to limit losses.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
