"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FlaskConical, Play, RefreshCw, TrendingUp, Target, BarChart3, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface BacktestRun {
    id: string;
    name: string;
    strategy: string;
    symbol: string;
    status: string;
    totalReturn: number;
    winRate: number;
    sharpeRatio: number;
    maxDrawdown: number;
    createdAt: number;
}

interface Strategy {
    id: string;
    name: string;
    description: string;
}

export default function BacktestTab() {
    const [runs, setRuns] = useState<BacktestRun[]>([]);
    const [strategies, setStrategies] = useState<Strategy[]>([]);
    const [loading, setLoading] = useState(true);
    const [showNewBacktest, setShowNewBacktest] = useState(false);
    const wallet = "demo-wallet";

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [runsRes, strategiesRes] = await Promise.all([
                api.getBacktestRuns(wallet, { limit: 10 }),
                api.getBacktestStrategies(),
            ]);
            if (runsRes.success) setRuns((runsRes.data || []) as BacktestRun[]);
            if (strategiesRes.success) setStrategies((strategiesRes.data || []) as Strategy[]);
        } catch (error) {
            console.error('Failed to load backtest data:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                    Test trading strategies against historical market data
                </div>
                <div className="flex gap-2">
                    <button onClick={loadData} className="p-2 rounded-lg border border-white/10 hover:bg-white/5">
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                    </button>
                    <button
                        onClick={() => setShowNewBacktest(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground"
                    >
                        <Play className="w-4 h-4" />
                        New Backtest
                    </button>
                </div>
            </div>

            {/* Available Strategies */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {strategies.map((strategy) => (
                    <div key={strategy.id} className="p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors cursor-pointer">
                        <div className="flex items-center gap-2 mb-2">
                            <FlaskConical className="w-4 h-4 text-purple-400" />
                            <h3 className="font-semibold">{strategy.name}</h3>
                        </div>
                        <p className="text-xs text-muted-foreground">{strategy.description}</p>
                    </div>
                ))}
                {strategies.length === 0 && !loading && (
                    <div className="col-span-3 p-8 text-center text-muted-foreground">
                        No strategies available
                    </div>
                )}
            </div>

            {/* Previous Runs */}
            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : runs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                    <FlaskConical className="w-12 h-12 mb-4 opacity-50" />
                    <p>No backtest runs yet</p>
                    <p className="text-sm">Run a backtest to see historical performance</p>
                </div>
            ) : (
                <div className="rounded-xl border border-white/5 bg-black/40 overflow-hidden">
                    <div className="p-4 border-b border-white/5 bg-white/[0.02] font-semibold">Backtest History</div>
                    <table className="w-full">
                        <thead>
                            <tr className="text-xs text-muted-foreground border-b border-white/5">
                                <th className="text-left p-4">Name</th>
                                <th className="text-left p-4">Strategy</th>
                                <th className="text-left p-4">Symbol</th>
                                <th className="text-right p-4">Return</th>
                                <th className="text-right p-4">Win Rate</th>
                                <th className="text-right p-4">Sharpe</th>
                                <th className="text-right p-4">Max DD</th>
                                <th className="text-center p-4">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {runs.map((run) => (
                                <motion.tr
                                    key={run.id}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer"
                                >
                                    <td className="p-4 font-medium">{run.name}</td>
                                    <td className="p-4 text-sm text-muted-foreground">{run.strategy}</td>
                                    <td className="p-4">{run.symbol}</td>
                                    <td className={cn("p-4 text-right font-mono", run.totalReturn >= 0 ? "text-green-400" : "text-red-400")}>
                                        {run.totalReturn >= 0 ? '+' : ''}{run.totalReturn.toFixed(2)}%
                                    </td>
                                    <td className="p-4 text-right">{(run.winRate * 100).toFixed(1)}%</td>
                                    <td className="p-4 text-right font-mono">{run.sharpeRatio.toFixed(2)}</td>
                                    <td className="p-4 text-right text-red-400 font-mono">{run.maxDrawdown.toFixed(2)}%</td>
                                    <td className="p-4 text-center">
                                        <span className={cn(
                                            "px-2 py-1 rounded text-xs",
                                            run.status === 'completed' ? "bg-green-500/20 text-green-400" :
                                            run.status === 'running' ? "bg-blue-500/20 text-blue-400" : "bg-gray-500/20 text-gray-400"
                                        )}>
                                            {run.status}
                                        </span>
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
