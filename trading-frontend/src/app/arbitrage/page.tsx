"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    ArrowLeftRight, TrendingUp, Clock, DollarSign, Zap, RefreshCw,
    Play, Pause, Settings, CheckCircle, AlertTriangle, Activity
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface ArbitrageOpportunity {
    id: string;
    type: 'internal' | 'cross_platform' | 'triangular' | 'combinatorial';
    symbol: string;
    buyPlatform: string;
    sellPlatform: string;
    buyPrice: number;
    sellPrice: number;
    spreadPercent: number;
    potentialProfit: number;
    confidence: number;
    volume24h: number;
    expiresAt: number;
    status: string;
}

interface ArbitrageExecution {
    id: string;
    opportunityId: string;
    symbol: string;
    buyPlatform: string;
    sellPlatform: string;
    buyPrice: number;
    sellPrice: number;
    amount: number;
    profit: number;
    profitPercent: number;
    status: string;
    executedAt: number;
}

interface ArbitrageConfig {
    id: string;
    enabled: boolean;
    minSpreadPercent: number;
    maxPositionSize: number;
    autoExecute: boolean;
}

export default function ArbitragePage() {
    const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
    const [executions, setExecutions] = useState<ArbitrageExecution[]>([]);
    const [config, setConfig] = useState<ArbitrageConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [autoExecute, setAutoExecute] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [stats, setStats] = useState<{ totalExecutions: number; totalProfit: number; successRate: number } | null>(null);

    const wallet = "demo-wallet";

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 5000); // Refresh every 5 seconds
        return () => clearInterval(interval);
    }, []);

    const loadData = async () => {
        try {
            const [oppsRes, execsRes, configRes, statsRes] = await Promise.all([
                api.getArbitrageOpportunitiesV2({ status: 'active' }),
                api.getArbitrageExecutions(wallet, 20),
                api.getArbitrageConfig(wallet),
                api.get('/arbitrage/stats', { wallet }),
            ]);

            if (oppsRes.success) setOpportunities(oppsRes.data || []);
            if (execsRes.success) setExecutions(execsRes.data || []);
            if (configRes.success) {
                setConfig(configRes.data);
                setAutoExecute(configRes.data?.autoExecute || false);
            }
            if (statsRes.success) setStats(statsRes.data);
        } catch (error) {
            console.error('Error loading arbitrage data:', error);
        } finally {
            setLoading(false);
        }
    };

    const executeArbitrage = async (opportunityId: string) => {
        try {
            const result = await api.executeArbitrage(opportunityId, wallet, 100); // $100 default
            if (result.success) {
                loadData();
            }
        } catch (error) {
            console.error('Error executing arbitrage:', error);
        }
    };

    const toggleAutoExecute = async () => {
        try {
            const newValue = !autoExecute;
            setAutoExecute(newValue);
            await api.saveArbitrageConfig(wallet, { autoExecute: newValue });
        } catch (error) {
            console.error('Error toggling auto-execute:', error);
        }
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'internal': return 'text-blue-400 bg-blue-500/20';
            case 'cross_platform': return 'text-purple-400 bg-purple-500/20';
            case 'triangular': return 'text-orange-400 bg-orange-500/20';
            case 'combinatorial': return 'text-green-400 bg-green-500/20';
            default: return 'text-gray-400 bg-gray-500/20';
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3">
                        <ArrowLeftRight className="w-7 h-7 text-primary" />
                        Arbitrage Detection
                    </h1>
                    <p className="text-muted-foreground">
                        Real-time cross-platform arbitrage opportunities
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={toggleAutoExecute}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
                            autoExecute
                                ? "bg-green-500/20 text-green-400 border border-green-500/50"
                                : "bg-white/5 text-muted-foreground border border-white/10"
                        )}
                    >
                        {autoExecute ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                        Auto-Execute {autoExecute ? 'ON' : 'OFF'}
                    </button>
                    <button
                        onClick={() => setShowSettings(true)}
                        className="p-2 rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
                    >
                        <Settings className="w-4 h-4" />
                    </button>
                    <button
                        onClick={loadData}
                        className="p-2 rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
                    >
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-4">
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <Activity className="w-4 h-4" />
                        Active Opportunities
                    </div>
                    <div className="text-2xl font-bold">{opportunities.length}</div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <Zap className="w-4 h-4" />
                        Total Executions
                    </div>
                    <div className="text-2xl font-bold">{stats?.totalExecutions || 0}</div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <DollarSign className="w-4 h-4" />
                        Total Profit
                    </div>
                    <div className="text-2xl font-bold font-mono text-green-400">
                        +${(stats?.totalProfit || 0).toFixed(2)}
                    </div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <CheckCircle className="w-4 h-4" />
                        Success Rate
                    </div>
                    <div className="text-2xl font-bold">
                        {((stats?.successRate || 0) * 100).toFixed(1)}%
                    </div>
                </div>
            </div>

            {/* Opportunities Grid */}
            <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md overflow-hidden">
                <div className="p-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                    <h2 className="font-semibold">Live Opportunities</h2>
                    <span className="text-xs text-muted-foreground">
                        Refreshing every 5s
                    </span>
                </div>

                {loading ? (
                    <div className="p-8 text-center text-muted-foreground">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                        Scanning for opportunities...
                    </div>
                ) : opportunities.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                        <ArrowLeftRight className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No active opportunities
                        <p className="text-sm mt-1">Markets are efficiently priced right now</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                        {opportunities.map((opp) => (
                            <motion.div
                                key={opp.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-4 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <span className="font-bold">{opp.symbol}</span>
                                    <span className={cn(
                                        "px-2 py-0.5 rounded text-xs font-medium",
                                        getTypeColor(opp.type)
                                    )}>
                                        {opp.type.replace('_', ' ')}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between mb-3 text-sm">
                                    <div className="text-center">
                                        <div className="text-muted-foreground text-xs">Buy</div>
                                        <div className="font-medium">{opp.buyPlatform}</div>
                                        <div className="font-mono text-green-400">${opp.buyPrice.toFixed(4)}</div>
                                    </div>
                                    <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
                                    <div className="text-center">
                                        <div className="text-muted-foreground text-xs">Sell</div>
                                        <div className="font-medium">{opp.sellPlatform}</div>
                                        <div className="font-mono text-red-400">${opp.sellPrice.toFixed(4)}</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                                    <div className="p-2 rounded bg-white/5">
                                        <div className="text-muted-foreground">Spread</div>
                                        <div className="font-mono text-green-400">{opp.spreadPercent.toFixed(3)}%</div>
                                    </div>
                                    <div className="p-2 rounded bg-white/5">
                                        <div className="text-muted-foreground">Est. Profit</div>
                                        <div className="font-mono text-green-400">${opp.potentialProfit.toFixed(2)}</div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <Clock className="w-3 h-3" />
                                        {Math.max(0, Math.floor((opp.expiresAt - Date.now()) / 1000))}s left
                                    </div>
                                    <button
                                        onClick={() => executeArbitrage(opp.id)}
                                        className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                                    >
                                        Execute
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            {/* Recent Executions */}
            <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md overflow-hidden">
                <div className="p-4 border-b border-white/5 bg-white/[0.02]">
                    <h2 className="font-semibold">Recent Executions</h2>
                </div>

                {executions.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                        No executions yet
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-xs text-muted-foreground border-b border-white/5">
                                    <th className="text-left p-4">Time</th>
                                    <th className="text-left p-4">Symbol</th>
                                    <th className="text-left p-4">Route</th>
                                    <th className="text-right p-4">Amount</th>
                                    <th className="text-right p-4">Profit</th>
                                    <th className="text-right p-4">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {executions.map((exec) => (
                                    <tr key={exec.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                                        <td className="p-4 text-sm text-muted-foreground">
                                            {new Date(exec.executedAt).toLocaleTimeString()}
                                        </td>
                                        <td className="p-4 font-medium">{exec.symbol}</td>
                                        <td className="p-4 text-sm">
                                            {exec.buyPlatform} → {exec.sellPlatform}
                                        </td>
                                        <td className="p-4 text-right font-mono">${exec.amount.toFixed(2)}</td>
                                        <td className={cn(
                                            "p-4 text-right font-mono",
                                            exec.profit >= 0 ? "text-green-400" : "text-red-400"
                                        )}>
                                            {exec.profit >= 0 ? '+' : ''}${exec.profit.toFixed(2)}
                                            <span className="text-xs ml-1">({exec.profitPercent.toFixed(3)}%)</span>
                                        </td>
                                        <td className="p-4 text-right">
                                            <span className={cn(
                                                "px-2 py-1 rounded text-xs",
                                                exec.status === 'completed' ? "bg-green-500/20 text-green-400" :
                                                exec.status === 'failed' ? "bg-red-500/20 text-red-400" :
                                                "bg-yellow-500/20 text-yellow-400"
                                            )}>
                                                {exec.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
