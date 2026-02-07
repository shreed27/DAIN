"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
    Shield, AlertTriangle, Activity, TrendingDown, Gauge, Power,
    RefreshCw, Settings, AlertOctagon, BarChart3, Zap, Clock
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface RiskMetrics {
    valueAtRisk: number;
    conditionalVaR: number;
    sharpeRatio: number;
    volatility: number;
    volatilityRegime: 'low' | 'normal' | 'high' | 'extreme';
    maxDrawdown: number;
    currentDrawdown: number;
    beta: number;
    correlationBTC: number;
}

interface CircuitBreakerConfig {
    id: string;
    enabled: boolean;
    maxDailyLoss: number;
    maxPositionSize: number;
    maxDrawdown: number;
    volatilityThreshold: number;
    cooldownMinutes: number;
    currentlyTriggered: boolean;
    triggeredAt: number | null;
}

interface StressTestResult {
    id: string;
    scenario: string;
    portfolioImpact: number;
    portfolioImpactPercent: number;
    worstAsset: string;
    worstAssetImpact: number;
    recoveryEstimate: string;
}

export default function RiskPage() {
    const [metrics, setMetrics] = useState<RiskMetrics | null>(null);
    const [circuitBreaker, setCircuitBreaker] = useState<CircuitBreakerConfig | null>(null);
    const [stressTests, setStressTests] = useState<StressTestResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [killSwitchActive, setKillSwitchActive] = useState(false);
    const [showKillConfirm, setShowKillConfirm] = useState(false);

    const wallet = "demo-wallet";

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 10000); // Refresh every 10 seconds
        return () => clearInterval(interval);
    }, []);

    const loadData = async () => {
        try {
            const dashboardRes = await api.getRiskDashboard(wallet);
            if (dashboardRes.success) {
                const data = dashboardRes.data;
                setMetrics(data.metrics);
                setCircuitBreaker(data.circuitBreaker);
                setStressTests(data.stressTests || []);
            }
        } catch (error) {
            console.error('Error loading risk data:', error);
        } finally {
            setLoading(false);
        }
    };

    const triggerKillSwitch = async () => {
        try {
            setKillSwitchActive(true);
            await api.triggerKillSwitch(wallet, 'Manual kill switch activated');
            setShowKillConfirm(false);
            loadData();
        } catch (error) {
            console.error('Error triggering kill switch:', error);
            setKillSwitchActive(false);
        }
    };

    const runStressTest = async (scenario: string) => {
        try {
            await api.runStressTest(wallet, scenario, {});
            loadData();
        } catch (error) {
            console.error('Error running stress test:', error);
        }
    };

    const getVolatilityColor = (regime: string) => {
        switch (regime) {
            case 'low': return 'text-green-400 bg-green-500/20';
            case 'normal': return 'text-blue-400 bg-blue-500/20';
            case 'high': return 'text-orange-400 bg-orange-500/20';
            case 'extreme': return 'text-red-400 bg-red-500/20';
            default: return 'text-gray-400 bg-gray-500/20';
        }
    };

    const getVaRColor = (var_: number) => {
        if (var_ < 1000) return 'text-green-400';
        if (var_ < 5000) return 'text-yellow-400';
        if (var_ < 10000) return 'text-orange-400';
        return 'text-red-400';
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3">
                        <Shield className="w-7 h-7 text-primary" />
                        Risk Management
                    </h1>
                    <p className="text-muted-foreground">
                        Portfolio risk metrics, circuit breakers, and stress testing
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={loadData}
                        className="p-2 rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
                    >
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                    </button>
                    <button
                        onClick={() => setShowKillConfirm(true)}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
                            killSwitchActive
                                ? "bg-red-500 text-white animate-pulse"
                                : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                        )}
                    >
                        <Power className="w-4 h-4" />
                        Kill Switch
                    </button>
                </div>
            </div>

            {/* Kill Switch Confirmation Modal */}
            {showKillConfirm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-background border border-red-500/50 rounded-xl p-6 w-full max-w-md"
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <AlertOctagon className="w-8 h-8 text-red-500" />
                            <h2 className="text-xl font-bold">Emergency Kill Switch</h2>
                        </div>
                        <p className="text-muted-foreground mb-6">
                            This will immediately close all positions, cancel all pending orders,
                            and halt all trading activity. This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowKillConfirm(false)}
                                className="flex-1 py-2 rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={triggerKillSwitch}
                                className="flex-1 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors font-medium"
                            >
                                Activate Kill Switch
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Risk Metrics */}
            <div className="grid grid-cols-4 gap-4">
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <AlertTriangle className="w-4 h-4" />
                        Value at Risk (95%)
                    </div>
                    <div className={cn("text-2xl font-bold font-mono", getVaRColor(metrics?.valueAtRisk || 0))}>
                        ${(metrics?.valueAtRisk || 0).toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Daily potential loss</div>
                </div>

                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <TrendingDown className="w-4 h-4" />
                        Conditional VaR
                    </div>
                    <div className="text-2xl font-bold font-mono text-orange-400">
                        ${(metrics?.conditionalVaR || 0).toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Expected shortfall</div>
                </div>

                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <Gauge className="w-4 h-4" />
                        Volatility Regime
                    </div>
                    <div className={cn(
                        "text-lg font-bold px-3 py-1 rounded inline-block",
                        getVolatilityColor(metrics?.volatilityRegime || 'normal')
                    )}>
                        {(metrics?.volatilityRegime || 'normal').toUpperCase()}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                        {(metrics?.volatility || 0).toFixed(2)}% daily
                    </div>
                </div>

                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <BarChart3 className="w-4 h-4" />
                        Max Drawdown
                    </div>
                    <div className="text-2xl font-bold font-mono text-red-400">
                        -{(metrics?.maxDrawdownPercent || 0).toFixed(2)}%
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                        Current: -{(metrics?.currentDrawdown || 0).toFixed(2)}%
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                {/* Circuit Breaker */}
                <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md">
                    <div className="p-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                        <h2 className="font-semibold flex items-center gap-2">
                            <Zap className="w-4 h-4 text-yellow-400" />
                            Circuit Breaker
                        </h2>
                        <span className={cn(
                            "px-2 py-1 rounded text-xs font-medium",
                            circuitBreaker?.currentlyTriggered
                                ? "bg-red-500/20 text-red-400"
                                : circuitBreaker?.enabled
                                    ? "bg-green-500/20 text-green-400"
                                    : "bg-gray-500/20 text-gray-400"
                        )}>
                            {circuitBreaker?.currentlyTriggered ? 'TRIGGERED' : circuitBreaker?.enabled ? 'ACTIVE' : 'DISABLED'}
                        </span>
                    </div>

                    <div className="p-4 space-y-4">
                        {circuitBreaker?.currentlyTriggered && (
                            <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/50 flex items-center gap-3">
                                <AlertOctagon className="w-5 h-5 text-red-400" />
                                <div>
                                    <div className="font-medium text-red-400">Circuit Breaker Triggered</div>
                                    <div className="text-xs text-muted-foreground">
                                        Trading halted at {circuitBreaker.triggeredAt
                                            ? new Date(circuitBreaker.triggeredAt).toLocaleTimeString()
                                            : 'unknown'}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground">Max Daily Loss</span>
                                <span className="font-mono">${(circuitBreaker?.maxDailyLoss || 0).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground">Max Position Size</span>
                                <span className="font-mono">${(circuitBreaker?.maxPositionSize || 0).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground">Max Drawdown Threshold</span>
                                <span className="font-mono">{(circuitBreaker?.maxDrawdown || 0).toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground">Volatility Threshold</span>
                                <span className="font-mono">{(circuitBreaker?.volatilityThreshold || 0).toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground">Cooldown Period</span>
                                <span className="font-mono">{circuitBreaker?.cooldownMinutes || 0} min</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Stress Tests */}
                <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md">
                    <div className="p-4 border-b border-white/5 bg-white/[0.02]">
                        <h2 className="font-semibold flex items-center gap-2">
                            <Activity className="w-4 h-4 text-purple-400" />
                            Stress Test Scenarios
                        </h2>
                    </div>

                    <div className="p-4 space-y-3">
                        {['market_crash', 'black_swan', 'liquidity_crisis', 'flash_crash'].map((scenario) => (
                            <div
                                key={scenario}
                                className="p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-between"
                                onClick={() => runStressTest(scenario)}
                            >
                                <div>
                                    <div className="font-medium capitalize">
                                        {scenario.replace('_', ' ')}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {scenario === 'market_crash' && 'BTC -30%, ETH -40%'}
                                        {scenario === 'black_swan' && 'All assets -50%'}
                                        {scenario === 'liquidity_crisis' && 'Spreads +500%, volume -80%'}
                                        {scenario === 'flash_crash' && '10% drop in 5 minutes'}
                                    </div>
                                </div>
                                <button className="px-3 py-1 rounded bg-purple-500/20 text-purple-400 text-xs hover:bg-purple-500/30 transition-colors">
                                    Run Test
                                </button>
                            </div>
                        ))}
                    </div>

                    {stressTests.length > 0 && (
                        <div className="p-4 border-t border-white/5">
                            <h3 className="text-sm font-medium mb-3">Recent Results</h3>
                            <div className="space-y-2">
                                {stressTests.slice(0, 3).map((test) => (
                                    <div key={test.id} className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground capitalize">
                                            {test.scenario.replace('_', ' ')}
                                        </span>
                                        <span className={cn(
                                            "font-mono",
                                            test.portfolioImpact < 0 ? "text-red-400" : "text-green-400"
                                        )}>
                                            {test.portfolioImpact >= 0 ? '+' : ''}${test.portfolioImpact.toFixed(2)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Additional Metrics */}
            <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md p-6">
                <h2 className="font-semibold mb-4">Portfolio Risk Correlations</h2>
                <div className="grid grid-cols-4 gap-6">
                    <div className="text-center">
                        <div className="text-3xl font-bold font-mono mb-1">
                            {(metrics?.sharpeRatio || 0).toFixed(2)}
                        </div>
                        <div className="text-sm text-muted-foreground">Sharpe Ratio</div>
                    </div>
                    <div className="text-center">
                        <div className="text-3xl font-bold font-mono mb-1">
                            {(metrics?.beta || 0).toFixed(2)}
                        </div>
                        <div className="text-sm text-muted-foreground">Beta (vs Market)</div>
                    </div>
                    <div className="text-center">
                        <div className="text-3xl font-bold font-mono mb-1">
                            {(metrics?.correlationBTC || 0).toFixed(2)}
                        </div>
                        <div className="text-sm text-muted-foreground">BTC Correlation</div>
                    </div>
                    <div className="text-center">
                        <div className={cn(
                            "text-3xl font-bold font-mono mb-1",
                            (metrics?.volatility || 0) > 50 ? "text-red-400" :
                            (metrics?.volatility || 0) > 25 ? "text-orange-400" : "text-green-400"
                        )}>
                            {(metrics?.volatility || 0).toFixed(1)}%
                        </div>
                        <div className="text-sm text-muted-foreground">Annualized Volatility</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
