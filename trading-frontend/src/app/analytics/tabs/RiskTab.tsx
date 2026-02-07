"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Shield, AlertTriangle, Activity, TrendingDown, RefreshCw, Power, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface RiskMetrics {
    portfolioValue: number;
    dailyVaR: number;
    maxDrawdown: number;
    sharpeRatio: number;
    volatility: number;
    concentration: number;
}

interface CircuitBreaker {
    enabled: boolean;
    dailyLossLimit: number;
    maxDrawdownLimit: number;
    positionSizeLimit: number;
    status: 'active' | 'triggered' | 'disabled';
}

export default function RiskTab() {
    const [metrics, setMetrics] = useState<RiskMetrics | null>(null);
    const [circuitBreaker, setCircuitBreaker] = useState<CircuitBreaker | null>(null);
    const [loading, setLoading] = useState(true);
    const wallet = "demo-wallet";

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [metricsRes, cbRes] = await Promise.all([
                api.getRiskMetrics(wallet),
                api.getCircuitBreakerConfig(wallet),
            ]);
            if (metricsRes.success) setMetrics(metricsRes.data as RiskMetrics);
            if (cbRes.success) setCircuitBreaker(cbRes.data as CircuitBreaker);
        } catch (error) {
            console.error('Failed to load risk data:', error);
        } finally {
            setLoading(false);
        }
    };

    const triggerKillSwitch = async () => {
        if (!confirm('Are you sure you want to trigger the kill switch? This will close all positions.')) return;
        try {
            await api.triggerKillSwitch(wallet, 'Manual trigger');
            loadData();
        } catch (error) {
            console.error('Failed to trigger kill switch:', error);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                    Monitor portfolio risk and configure safety mechanisms
                </div>
                <div className="flex gap-2">
                    <button onClick={loadData} className="p-2 rounded-lg border border-white/10 hover:bg-white/5">
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                    </button>
                    <button
                        onClick={triggerKillSwitch}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600"
                    >
                        <Power className="w-4 h-4" />
                        Kill Switch
                    </button>
                </div>
            </div>

            {/* Risk Metrics */}
            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                            <div className="text-xs text-muted-foreground mb-1">Portfolio Value</div>
                            <div className="text-xl font-bold font-mono">${(metrics?.portfolioValue || 0).toFixed(2)}</div>
                        </div>
                        <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                            <div className="text-xs text-muted-foreground mb-1">Daily VaR (95%)</div>
                            <div className="text-xl font-bold font-mono text-red-400">${(metrics?.dailyVaR || 0).toFixed(2)}</div>
                        </div>
                        <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                            <div className="text-xs text-muted-foreground mb-1">Max Drawdown</div>
                            <div className="text-xl font-bold font-mono text-red-400">{(metrics?.maxDrawdown || 0).toFixed(2)}%</div>
                        </div>
                        <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                            <div className="text-xs text-muted-foreground mb-1">Sharpe Ratio</div>
                            <div className={cn("text-xl font-bold font-mono", (metrics?.sharpeRatio || 0) >= 1 ? "text-green-400" : "text-yellow-400")}>
                                {(metrics?.sharpeRatio || 0).toFixed(2)}
                            </div>
                        </div>
                        <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                            <div className="text-xs text-muted-foreground mb-1">Volatility</div>
                            <div className="text-xl font-bold font-mono">{(metrics?.volatility || 0).toFixed(2)}%</div>
                        </div>
                        <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                            <div className="text-xs text-muted-foreground mb-1">Concentration</div>
                            <div className={cn("text-xl font-bold font-mono", (metrics?.concentration || 0) > 50 ? "text-red-400" : "text-green-400")}>
                                {(metrics?.concentration || 0).toFixed(0)}%
                            </div>
                        </div>
                    </div>

                    {/* Circuit Breaker */}
                    <div className="rounded-xl border border-white/5 bg-black/40 overflow-hidden">
                        <div className="p-4 border-b border-white/5 bg-white/[0.02] flex justify-between items-center">
                            <h3 className="font-semibold flex items-center gap-2">
                                <Shield className="w-4 h-4 text-blue-400" />
                                Circuit Breaker
                            </h3>
                            <span className={cn(
                                "px-3 py-1 rounded-full text-xs font-medium",
                                circuitBreaker?.status === 'active' ? "bg-green-500/20 text-green-400" :
                                circuitBreaker?.status === 'triggered' ? "bg-red-500/20 text-red-400" : "bg-gray-500/20 text-gray-400"
                            )}>
                                {circuitBreaker?.status || 'Unknown'}
                            </span>
                        </div>
                        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm text-muted-foreground">Daily Loss Limit</span>
                                    <span className="font-mono">{circuitBreaker?.dailyLossLimit || 0}%</span>
                                </div>
                                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                    <div className="h-full bg-red-500" style={{ width: `${Math.min((circuitBreaker?.dailyLossLimit || 0), 100)}%` }} />
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm text-muted-foreground">Max Drawdown Limit</span>
                                    <span className="font-mono">{circuitBreaker?.maxDrawdownLimit || 0}%</span>
                                </div>
                                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                    <div className="h-full bg-orange-500" style={{ width: `${Math.min((circuitBreaker?.maxDrawdownLimit || 0), 100)}%` }} />
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm text-muted-foreground">Position Size Limit</span>
                                    <span className="font-mono">{circuitBreaker?.positionSizeLimit || 0}%</span>
                                </div>
                                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500" style={{ width: `${Math.min((circuitBreaker?.positionSizeLimit || 0), 100)}%` }} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Risk Warnings */}
                    <div className="space-y-3">
                        {(metrics?.maxDrawdown || 0) > 10 && (
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="flex items-center gap-3 p-4 rounded-xl border border-red-500/20 bg-red-500/5"
                            >
                                <AlertTriangle className="w-5 h-5 text-red-400" />
                                <div>
                                    <p className="font-medium text-red-400">High Drawdown Warning</p>
                                    <p className="text-sm text-muted-foreground">Your portfolio has experienced a {(metrics?.maxDrawdown || 0).toFixed(2)}% drawdown</p>
                                </div>
                            </motion.div>
                        )}
                        {(metrics?.concentration || 0) > 50 && (
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="flex items-center gap-3 p-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5"
                            >
                                <Activity className="w-5 h-5 text-yellow-400" />
                                <div>
                                    <p className="font-medium text-yellow-400">High Concentration</p>
                                    <p className="text-sm text-muted-foreground">Consider diversifying - {(metrics?.concentration || 0).toFixed(0)}% in single position</p>
                                </div>
                            </motion.div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
