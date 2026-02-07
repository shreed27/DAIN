"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
    HeartPulse, TrendingUp, TrendingDown, Shield, AlertTriangle,
    RefreshCw, Settings, Activity, Gauge, Clock, DollarSign, Zap
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface SurvivalConfig {
    id: string;
    enabled: boolean;
    currentState: 'growth' | 'normal' | 'defensive' | 'critical' | 'hibernation';
    lastStateChange: number;
    growthThreshold: number;
    defensiveThreshold: number;
    criticalThreshold: number;
    hibernationThreshold: number;
}

interface StateConfig {
    state: string;
    description: string;
    maxAllocation: number;
    riskMultiplier: number;
    allowNewPositions: boolean;
    autoReducePositions: boolean;
    color: string;
}

interface SurvivalMetrics {
    portfolioValue: number;
    portfolioChange24h: number;
    portfolioChange7d: number;
    riskScore: number;
    liquidityScore: number;
    diversificationScore: number;
    currentState: string;
    recommendedState: string;
    alerts: string[];
}

interface StateHistory {
    id: string;
    fromState: string;
    toState: string;
    portfolioValue: number;
    portfolioChange: number;
    reason: string;
    timestamp: number;
}

const STATE_CONFIGS: StateConfig[] = [
    { state: 'growth', description: 'Aggressive growth mode', maxAllocation: 25, riskMultiplier: 1.5, allowNewPositions: true, autoReducePositions: false, color: '#22c55e' },
    { state: 'normal', description: 'Balanced operations', maxAllocation: 15, riskMultiplier: 1.0, allowNewPositions: true, autoReducePositions: false, color: '#3b82f6' },
    { state: 'defensive', description: 'Risk reduction mode', maxAllocation: 5, riskMultiplier: 0.5, allowNewPositions: false, autoReducePositions: false, color: '#f59e0b' },
    { state: 'critical', description: 'Capital preservation', maxAllocation: 2, riskMultiplier: 0.2, allowNewPositions: false, autoReducePositions: true, color: '#ef4444' },
    { state: 'hibernation', description: 'No trading activity', maxAllocation: 0, riskMultiplier: 0, allowNewPositions: false, autoReducePositions: true, color: '#6b7280' },
];

export default function SurvivalPage() {
    const [config, setConfig] = useState<SurvivalConfig | null>(null);
    const [metrics, setMetrics] = useState<SurvivalMetrics | null>(null);
    const [history, setHistory] = useState<StateHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [showSettings, setShowSettings] = useState(false);

    const wallet = "demo-wallet";

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 30000); // Refresh every 30 seconds
        return () => clearInterval(interval);
    }, []);

    const loadData = async () => {
        try {
            const dashboardRes = await api.getSurvivalDashboard(wallet);
            if (dashboardRes.success) {
                const data = dashboardRes.data;
                setConfig(data.config);
                setMetrics(data.metrics);
                setHistory(data.history || []);
            }
        } catch (error) {
            console.error('Error loading survival data:', error);
        } finally {
            setLoading(false);
        }
    };

    const toggleSurvivalMode = async () => {
        try {
            const newEnabled = !config?.enabled;
            await api.toggleSurvivalMode(wallet, newEnabled);
            loadData();
        } catch (error) {
            console.error('Error toggling survival mode:', error);
        }
    };

    const getCurrentStateConfig = () => {
        return STATE_CONFIGS.find(s => s.state === config?.currentState) || STATE_CONFIGS[1];
    };

    const getStateColor = (state: string) => {
        const config = STATE_CONFIGS.find(s => s.state === state);
        return config?.color || '#6b7280';
    };

    const getStateIcon = (state: string) => {
        switch (state) {
            case 'growth': return TrendingUp;
            case 'normal': return Activity;
            case 'defensive': return Shield;
            case 'critical': return AlertTriangle;
            case 'hibernation': return HeartPulse;
            default: return Activity;
        }
    };

    const currentStateConfig = getCurrentStateConfig();
    const StateIcon = getStateIcon(config?.currentState || 'normal');

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3">
                        <HeartPulse className="w-7 h-7 text-primary" />
                        Survival Mode
                    </h1>
                    <p className="text-muted-foreground">
                        Autonomous economic state machine for portfolio protection
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
                        onClick={() => setShowSettings(true)}
                        className="p-2 rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
                    >
                        <Settings className="w-4 h-4" />
                    </button>
                    <button
                        onClick={toggleSurvivalMode}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
                            config?.enabled
                                ? "bg-green-500/20 text-green-400 border border-green-500/50"
                                : "bg-white/5 text-muted-foreground border border-white/10"
                        )}
                    >
                        <Zap className="w-4 h-4" />
                        {config?.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                </div>
            </div>

            {/* Current State Display */}
            <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md p-6">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div
                            className="w-16 h-16 rounded-2xl flex items-center justify-center"
                            style={{ backgroundColor: `${currentStateConfig.color}20` }}
                        >
                            <StateIcon
                                className="w-8 h-8"
                                style={{ color: currentStateConfig.color }}
                            />
                        </div>
                        <div>
                            <div className="text-sm text-muted-foreground">Current State</div>
                            <div
                                className="text-3xl font-bold capitalize"
                                style={{ color: currentStateConfig.color }}
                            >
                                {config?.currentState || 'Normal'}
                            </div>
                            <div className="text-sm text-muted-foreground">
                                {currentStateConfig.description}
                            </div>
                        </div>
                    </div>

                    {metrics?.recommendedState && metrics.recommendedState !== config?.currentState && (
                        <div className="p-4 rounded-lg bg-yellow-500/20 border border-yellow-500/50">
                            <div className="flex items-center gap-2 text-yellow-400 mb-1">
                                <AlertTriangle className="w-4 h-4" />
                                <span className="font-medium">State Transition Recommended</span>
                            </div>
                            <div className="text-sm text-muted-foreground">
                                Conditions suggest moving to{' '}
                                <span className="capitalize font-medium" style={{ color: getStateColor(metrics.recommendedState) }}>
                                    {metrics.recommendedState}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* State Timeline */}
                <div className="flex items-center justify-between px-4">
                    {STATE_CONFIGS.map((state, index) => {
                        const isActive = state.state === config?.currentState;
                        const Icon = getStateIcon(state.state);
                        return (
                            <div key={state.state} className="flex items-center">
                                <div className="text-center">
                                    <div
                                        className={cn(
                                            "w-12 h-12 rounded-full flex items-center justify-center mb-2 transition-all",
                                            isActive ? "ring-2 ring-offset-2 ring-offset-background" : "opacity-50"
                                        )}
                                        style={{
                                            backgroundColor: `${state.color}20`,
                                            ringColor: state.color
                                        }}
                                    >
                                        <Icon className="w-5 h-5" style={{ color: state.color }} />
                                    </div>
                                    <div className={cn(
                                        "text-xs font-medium capitalize",
                                        isActive ? "" : "text-muted-foreground"
                                    )}>
                                        {state.state}
                                    </div>
                                </div>
                                {index < STATE_CONFIGS.length - 1 && (
                                    <div className="w-12 h-0.5 bg-white/10 mx-2" />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
                {/* Metrics */}
                <div className="col-span-2 space-y-4">
                    {/* Portfolio Metrics */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                                <DollarSign className="w-4 h-4" />
                                Portfolio Value
                            </div>
                            <div className="text-2xl font-bold font-mono">
                                ${(metrics?.portfolioValue || 0).toLocaleString()}
                            </div>
                        </div>
                        <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                                <Clock className="w-4 h-4" />
                                24h Change
                            </div>
                            <div className={cn(
                                "text-2xl font-bold font-mono",
                                (metrics?.portfolioChange24h || 0) >= 0 ? "text-green-400" : "text-red-400"
                            )}>
                                {(metrics?.portfolioChange24h || 0) >= 0 ? '+' : ''}{(metrics?.portfolioChange24h || 0).toFixed(2)}%
                            </div>
                        </div>
                        <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                                <Activity className="w-4 h-4" />
                                7d Change
                            </div>
                            <div className={cn(
                                "text-2xl font-bold font-mono",
                                (metrics?.portfolioChange7d || 0) >= 0 ? "text-green-400" : "text-red-400"
                            )}>
                                {(metrics?.portfolioChange7d || 0) >= 0 ? '+' : ''}{(metrics?.portfolioChange7d || 0).toFixed(2)}%
                            </div>
                        </div>
                    </div>

                    {/* Score Gauges */}
                    <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md p-6">
                        <h3 className="font-semibold mb-4">Health Scores</h3>
                        <div className="grid grid-cols-3 gap-6">
                            {[
                                { label: 'Risk Score', value: metrics?.riskScore || 50, color: 'red' },
                                { label: 'Liquidity', value: metrics?.liquidityScore || 50, color: 'blue' },
                                { label: 'Diversification', value: metrics?.diversificationScore || 50, color: 'green' },
                            ].map((score) => (
                                <div key={score.label} className="text-center">
                                    <div className="relative w-24 h-24 mx-auto mb-3">
                                        <svg className="w-24 h-24 transform -rotate-90">
                                            <circle
                                                cx="48"
                                                cy="48"
                                                r="40"
                                                stroke="currentColor"
                                                strokeWidth="8"
                                                fill="none"
                                                className="text-white/10"
                                            />
                                            <circle
                                                cx="48"
                                                cy="48"
                                                r="40"
                                                stroke={`var(--${score.color}-400, ${score.color})`}
                                                strokeWidth="8"
                                                fill="none"
                                                strokeDasharray={`${score.value * 2.51} 251`}
                                                className={`text-${score.color}-400`}
                                            />
                                        </svg>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="text-xl font-bold">{score.value}</span>
                                        </div>
                                    </div>
                                    <div className="text-sm text-muted-foreground">{score.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Alerts */}
                    {metrics?.alerts && metrics.alerts.length > 0 && (
                        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
                            <h3 className="font-semibold flex items-center gap-2 mb-3 text-yellow-400">
                                <AlertTriangle className="w-4 h-4" />
                                Active Alerts
                            </h3>
                            <div className="space-y-2">
                                {metrics.alerts.map((alert, i) => (
                                    <div key={i} className="text-sm text-muted-foreground">
                                        • {alert}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* State Rules & History */}
                <div className="space-y-4">
                    {/* Current State Rules */}
                    <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md p-4">
                        <h3 className="font-semibold mb-4">Current State Rules</h3>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground">Max Allocation</span>
                                <span className="font-mono">{currentStateConfig.maxAllocation}%</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground">Risk Multiplier</span>
                                <span className="font-mono">{currentStateConfig.riskMultiplier}x</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground">New Positions</span>
                                <span className={cn(
                                    "px-2 py-0.5 rounded text-xs",
                                    currentStateConfig.allowNewPositions
                                        ? "bg-green-500/20 text-green-400"
                                        : "bg-red-500/20 text-red-400"
                                )}>
                                    {currentStateConfig.allowNewPositions ? 'Allowed' : 'Blocked'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground">Auto-Reduce</span>
                                <span className={cn(
                                    "px-2 py-0.5 rounded text-xs",
                                    currentStateConfig.autoReducePositions
                                        ? "bg-yellow-500/20 text-yellow-400"
                                        : "bg-gray-500/20 text-gray-400"
                                )}>
                                    {currentStateConfig.autoReducePositions ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* State History */}
                    <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md p-4">
                        <h3 className="font-semibold mb-4">State History</h3>
                        {history.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">
                                No state transitions yet
                            </p>
                        ) : (
                            <div className="space-y-3 max-h-64 overflow-y-auto">
                                {history.map((h) => {
                                    const FromIcon = getStateIcon(h.fromState);
                                    const ToIcon = getStateIcon(h.toState);
                                    return (
                                        <div key={h.id} className="p-3 rounded-lg bg-white/5">
                                            <div className="flex items-center gap-2 mb-1">
                                                <FromIcon
                                                    className="w-4 h-4"
                                                    style={{ color: getStateColor(h.fromState) }}
                                                />
                                                <span className="text-xs">→</span>
                                                <ToIcon
                                                    className="w-4 h-4"
                                                    style={{ color: getStateColor(h.toState) }}
                                                />
                                                <span className="text-xs text-muted-foreground ml-auto">
                                                    {new Date(h.timestamp).toLocaleString()}
                                                </span>
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {h.reason}
                                            </div>
                                            <div className={cn(
                                                "text-xs font-mono mt-1",
                                                h.portfolioChange >= 0 ? "text-green-400" : "text-red-400"
                                            )}>
                                                {h.portfolioChange >= 0 ? '+' : ''}{h.portfolioChange.toFixed(2)}%
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
