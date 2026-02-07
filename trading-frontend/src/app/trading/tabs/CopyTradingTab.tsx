"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Copy, Plus, RefreshCw, Play, Pause, Settings, TrendingUp, Activity, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface CopyConfig {
    id: string;
    targetWallet: string;
    targetLabel?: string;
    enabled: boolean;
    allocationPercent: number;
    totalTrades: number;
    totalPnl: number;
}

interface CopyStats {
    totalConfigs: number;
    activeConfigs: number;
    totalCopiedTrades: number;
    totalPnl: number;
    successRate: number;
}

export default function CopyTradingTab() {
    const [configs, setConfigs] = useState<CopyConfig[]>([]);
    const [stats, setStats] = useState<CopyStats | null>(null);
    const [loading, setLoading] = useState(true);
    const wallet = "demo-wallet";

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [configsRes, statsRes] = await Promise.all([
                api.getCopyTradingConfigs(wallet),
                api.getCopyTradingStats(wallet),
            ]);
            if (configsRes.success) setConfigs((configsRes.data || []) as CopyConfig[]);
            if (statsRes.success) setStats(statsRes.data as CopyStats);
        } catch (error) {
            console.error('Failed to load copy trading data:', error);
        } finally {
            setLoading(false);
        }
    };

    const toggleConfig = async (configId: string, enabled: boolean) => {
        try {
            await api.toggleCopyTradingConfig(configId, !enabled);
            loadData();
        } catch (error) {
            console.error('Failed to toggle config:', error);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header Actions */}
            <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                    Automatically mirror trades from successful wallets
                </div>
                <div className="flex gap-2">
                    <button onClick={loadData} className="p-2 rounded-lg border border-white/10 hover:bg-white/5">
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground">
                        <Plus className="w-4 h-4" />
                        Add Wallet to Copy
                    </button>
                </div>
            </div>

            {/* Stats */}
            {stats && (
                <div className="grid grid-cols-5 gap-4">
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                            <Copy className="w-4 h-4" />Total Configs
                        </div>
                        <div className="text-2xl font-bold">{stats.totalConfigs}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                            <Activity className="w-4 h-4" />Active
                        </div>
                        <div className="text-2xl font-bold text-green-400">{stats.activeConfigs}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                            <TrendingUp className="w-4 h-4" />Copied Trades
                        </div>
                        <div className="text-2xl font-bold">{stats.totalCopiedTrades}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                            <Target className="w-4 h-4" />Success Rate
                        </div>
                        <div className="text-2xl font-bold">{(stats.successRate * 100).toFixed(1)}%</div>
                    </div>
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                            Total P&L
                        </div>
                        <div className={cn("text-2xl font-bold font-mono", stats.totalPnl >= 0 ? "text-green-400" : "text-red-400")}>
                            {stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(2)}
                        </div>
                    </div>
                </div>
            )}

            {/* Configs */}
            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : configs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                    <Copy className="w-12 h-12 mb-4 opacity-50" />
                    <p>No copy trading configs</p>
                    <p className="text-sm">Add a wallet to start copying trades</p>
                </div>
            ) : (
                <div className="rounded-xl border border-white/5 bg-black/40 overflow-hidden">
                    <div className="p-4 border-b border-white/5 bg-white/[0.02] font-semibold">Copy Trading Configs</div>
                    <table className="w-full">
                        <thead>
                            <tr className="text-xs text-muted-foreground border-b border-white/5">
                                <th className="text-left p-4">Target Wallet</th>
                                <th className="text-center p-4">Status</th>
                                <th className="text-right p-4">Allocation</th>
                                <th className="text-right p-4">Trades</th>
                                <th className="text-right p-4">P&L</th>
                                <th className="text-right p-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {configs.map((config) => (
                                <tr key={config.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                                    <td className="p-4">
                                        <div>
                                            <p className="font-medium">{config.targetLabel || 'Unnamed'}</p>
                                            <p className="text-xs text-muted-foreground font-mono">
                                                {config.targetWallet.slice(0, 8)}...{config.targetWallet.slice(-6)}
                                            </p>
                                        </div>
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className={cn("px-2 py-1 rounded text-xs", config.enabled ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400")}>
                                            {config.enabled ? 'Active' : 'Paused'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right">{config.allocationPercent}%</td>
                                    <td className="p-4 text-right">{config.totalTrades}</td>
                                    <td className={cn("p-4 text-right font-mono", config.totalPnl >= 0 ? "text-green-400" : "text-red-400")}>
                                        {config.totalPnl >= 0 ? '+' : ''}${config.totalPnl.toFixed(2)}
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex gap-2 justify-end">
                                            <button
                                                onClick={() => toggleConfig(config.id, config.enabled)}
                                                className={cn("p-2 rounded-lg", config.enabled ? "bg-yellow-500/20 text-yellow-400" : "bg-green-500/20 text-green-400")}
                                            >
                                                {config.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                            </button>
                                            <button className="p-2 rounded-lg bg-white/5 hover:bg-white/10">
                                                <Settings className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
