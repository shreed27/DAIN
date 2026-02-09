"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    FlaskConical, Play, Clock, TrendingUp, TrendingDown, DollarSign,
    BarChart3, RefreshCw, ChevronDown, Calendar, Settings, Activity, Wallet
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCustomWalletModal } from "@/components/providers/CustomWalletModalProvider";

interface BacktestStrategy {
    id: string;
    name: string;
    description: string;
    category: string;
    defaultParams: string;
}

interface BacktestRun {
    id: string;
    strategyId: string;
    strategyName: string;
    symbol: string;
    startDate: string;
    endDate: string;
    initialCapital: number;
    status: string;
    createdAt: number;
}

interface BacktestResult {
    id: string;
    runId: string;
    totalReturn: number;
    totalReturnPercent: number;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    sharpeRatio: number;
    sortinoRatio: number;
    winRate: number;
    totalTrades: number;
    profitFactor: number;
    avgWin: number;
    avgLoss: number;
    equityCurve: string;
}

export default function BacktestPage() {
    const { publicKey, connected } = useWallet();
    const { setVisible } = useCustomWalletModal();
    const [strategies, setStrategies] = useState<BacktestStrategy[]>([]);
    const [runs, setRuns] = useState<BacktestRun[]>([]);
    const [selectedRun, setSelectedRun] = useState<BacktestRun | null>(null);
    const [results, setResults] = useState<BacktestResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);

    // New backtest form
    const [selectedStrategy, setSelectedStrategy] = useState<string>('');
    const [symbol, setSymbol] = useState('SOL/USDC');
    const [startDate, setStartDate] = useState('2024-01-01');
    const [endDate, setEndDate] = useState('2024-12-31');
    const [initialCapital, setInitialCapital] = useState(10000);

    const wallet = connected && publicKey ? publicKey.toBase58() : null;

    useEffect(() => {
        loadData();
    }, [wallet]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [strategiesRes, runsRes] = await Promise.all([
                api.getBacktestStrategies(),
                wallet ? api.getBacktestRuns(wallet) : Promise.resolve({ success: true, data: [] }),
            ]);

            if (strategiesRes.success) {
                setStrategies(strategiesRes.data || []);
                if (strategiesRes.data?.length > 0 && !selectedStrategy) {
                    setSelectedStrategy(strategiesRes.data[0].id);
                }
            }
            if (runsRes.success) {
                setRuns(runsRes.data || []);
            }
        } catch (error) {
            console.error('Error loading backtest data:', error);
        } finally {
            setLoading(false);
        }
    };

    const runBacktest = async () => {
        if (!selectedStrategy || !wallet) return;

        setRunning(true);
        try {
            const strategy = strategies.find(s => s.id === selectedStrategy);
            const result = await api.createBacktestRun({
                userWallet: wallet,
                strategyId: selectedStrategy,
                strategyName: strategy?.name || 'Unknown',
                symbol,
                startDate,
                endDate,
                initialCapital,
                params: strategy?.defaultParams || '{}',
            });

            if (result.success) {
                // Simulate backtest running
                setTimeout(async () => {
                    await api.simulateBacktest(result.data.id, {
                        totalReturn: Math.random() * 5000 - 1000,
                        totalReturnPercent: Math.random() * 100 - 20,
                        maxDrawdown: Math.random() * 3000,
                        maxDrawdownPercent: Math.random() * 30,
                        sharpeRatio: Math.random() * 3,
                        sortinoRatio: Math.random() * 4,
                        winRate: 0.4 + Math.random() * 0.3,
                        totalTrades: Math.floor(50 + Math.random() * 200),
                        profitFactor: 1 + Math.random() * 2,
                        avgWin: 50 + Math.random() * 100,
                        avgLoss: 30 + Math.random() * 50,
                    });
                    loadData();
                    setRunning(false);
                }, 2000);
            }
        } catch (error) {
            console.error('Error running backtest:', error);
            setRunning(false);
        }
    };

    const loadResults = async (run: BacktestRun) => {
        setSelectedRun(run);
        try {
            const res = await api.getBacktestResults(run.id);
            if (res.success && res.data?.length > 0) {
                setResults(res.data[0]);
            }
        } catch (error) {
            console.error('Error loading results:', error);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3">
                        <FlaskConical className="w-7 h-7 text-primary" />
                        Strategy Backtester
                    </h1>
                    <p className="text-muted-foreground">
                        Test trading strategies on historical data
                    </p>
                </div>
                <button
                    onClick={loadData}
                    className="p-2 rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
                >
                    <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                </button>
            </div>

            <div className="grid grid-cols-3 gap-6">
                {/* Configuration Panel */}
                <div className="col-span-1 space-y-4">
                    <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md p-4">
                        <h2 className="font-semibold mb-4">Configuration</h2>

                        {/* Strategy Select */}
                        <div className="mb-4">
                            <label className="text-sm text-muted-foreground mb-2 block">Strategy</label>
                            <select
                                value={selectedStrategy}
                                onChange={(e) => setSelectedStrategy(e.target.value)}
                                className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-primary outline-none"
                            >
                                {strategies.map((strategy) => (
                                    <option key={strategy.id} value={strategy.id}>
                                        {strategy.name}
                                    </option>
                                ))}
                            </select>
                            {selectedStrategy && strategies.find(s => s.id === selectedStrategy) && (
                                <p className="text-xs text-muted-foreground mt-2">
                                    {strategies.find(s => s.id === selectedStrategy)?.description}
                                </p>
                            )}
                        </div>

                        {/* Symbol */}
                        <div className="mb-4">
                            <label className="text-sm text-muted-foreground mb-2 block">Symbol</label>
                            <select
                                value={symbol}
                                onChange={(e) => setSymbol(e.target.value)}
                                className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-primary outline-none"
                            >
                                <option value="SOL/USDC">SOL/USDC</option>
                                <option value="BTC/USDC">BTC/USDC</option>
                                <option value="ETH/USDC">ETH/USDC</option>
                                <option value="ARB/USDC">ARB/USDC</option>
                            </select>
                        </div>

                        {/* Date Range */}
                        <div className="grid grid-cols-2 gap-2 mb-4">
                            <div>
                                <label className="text-sm text-muted-foreground mb-2 block">Start Date</label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-primary outline-none text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-sm text-muted-foreground mb-2 block">End Date</label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-primary outline-none text-sm"
                                />
                            </div>
                        </div>

                        {/* Initial Capital */}
                        <div className="mb-4">
                            <label className="text-sm text-muted-foreground mb-2 block">Initial Capital</label>
                            <input
                                type="number"
                                value={initialCapital}
                                onChange={(e) => setInitialCapital(parseFloat(e.target.value) || 0)}
                                className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-primary outline-none font-mono"
                            />
                        </div>

                        <button
                            onClick={runBacktest}
                            disabled={running || !selectedStrategy}
                            className={cn(
                                "w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2",
                                running
                                    ? "bg-white/10 text-muted-foreground cursor-not-allowed"
                                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                            )}
                        >
                            {running ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    Running Backtest...
                                </>
                            ) : (
                                <>
                                    <Play className="w-4 h-4" />
                                    Run Backtest
                                </>
                            )}
                        </button>
                    </div>

                    {/* Previous Runs */}
                    <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md p-4">
                        <h2 className="font-semibold mb-4">Previous Runs</h2>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {runs.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-4">
                                    No backtests run yet
                                </p>
                            ) : (
                                runs.map((run) => (
                                    <button
                                        key={run.id}
                                        onClick={() => loadResults(run)}
                                        className={cn(
                                            "w-full p-3 rounded-lg text-left transition-colors",
                                            selectedRun?.id === run.id
                                                ? "bg-primary/20 border border-primary/50"
                                                : "bg-white/5 hover:bg-white/10"
                                        )}
                                    >
                                        <div className="font-medium text-sm">{run.strategyName}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {run.symbol} | {new Date(run.createdAt).toLocaleDateString()}
                                        </div>
                                        <span className={cn(
                                            "text-xs px-2 py-0.5 rounded mt-1 inline-block",
                                            run.status === 'completed' ? "bg-green-500/20 text-green-400" :
                                            run.status === 'running' ? "bg-yellow-500/20 text-yellow-400" :
                                            "bg-red-500/20 text-red-400"
                                        )}>
                                            {run.status}
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Results Panel */}
                <div className="col-span-2">
                    {results ? (
                        <div className="space-y-4">
                            {/* Metrics Grid */}
                            <div className="grid grid-cols-4 gap-4">
                                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                                        <DollarSign className="w-4 h-4" />
                                        Total Return
                                    </div>
                                    <div className={cn(
                                        "text-2xl font-bold font-mono",
                                        results.totalReturn >= 0 ? "text-green-400" : "text-red-400"
                                    )}>
                                        {results.totalReturn >= 0 ? '+' : ''}${results.totalReturn.toFixed(2)}
                                    </div>
                                    <div className={cn(
                                        "text-sm",
                                        results.totalReturnPercent >= 0 ? "text-green-400" : "text-red-400"
                                    )}>
                                        {results.totalReturnPercent >= 0 ? '+' : ''}{results.totalReturnPercent.toFixed(2)}%
                                    </div>
                                </div>

                                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                                        <TrendingDown className="w-4 h-4" />
                                        Max Drawdown
                                    </div>
                                    <div className="text-2xl font-bold font-mono text-red-400">
                                        -${results.maxDrawdown.toFixed(2)}
                                    </div>
                                    <div className="text-sm text-red-400">
                                        -{results.maxDrawdownPercent.toFixed(2)}%
                                    </div>
                                </div>

                                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                                        <BarChart3 className="w-4 h-4" />
                                        Sharpe Ratio
                                    </div>
                                    <div className={cn(
                                        "text-2xl font-bold font-mono",
                                        results.sharpeRatio >= 1 ? "text-green-400" :
                                        results.sharpeRatio >= 0 ? "text-yellow-400" : "text-red-400"
                                    )}>
                                        {results.sharpeRatio.toFixed(2)}
                                    </div>
                                </div>

                                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                                        <Activity className="w-4 h-4" />
                                        Win Rate
                                    </div>
                                    <div className={cn(
                                        "text-2xl font-bold",
                                        results.winRate >= 0.5 ? "text-green-400" : "text-yellow-400"
                                    )}>
                                        {(results.winRate * 100).toFixed(1)}%
                                    </div>
                                </div>
                            </div>

                            {/* Detailed Stats */}
                            <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md p-6">
                                <h3 className="font-semibold mb-4">Performance Metrics</h3>
                                <div className="grid grid-cols-3 gap-6">
                                    <div className="space-y-3">
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Total Trades</span>
                                            <span className="font-mono">{results.totalTrades}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Profit Factor</span>
                                            <span className={cn(
                                                "font-mono",
                                                results.profitFactor >= 1.5 ? "text-green-400" : "text-yellow-400"
                                            )}>
                                                {results.profitFactor.toFixed(2)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Avg Win</span>
                                            <span className="font-mono text-green-400">${results.avgWin.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Avg Loss</span>
                                            <span className="font-mono text-red-400">-${results.avgLoss.toFixed(2)}</span>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Sortino Ratio</span>
                                            <span className="font-mono">{results.sortinoRatio.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Risk/Reward</span>
                                            <span className="font-mono">{(results.avgWin / results.avgLoss).toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Equity Curve Placeholder */}
                            <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md p-6 h-64 flex items-center justify-center">
                                <div className="text-center text-muted-foreground">
                                    <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                    <p>Equity Curve Visualization</p>
                                    <p className="text-sm">Chart would render here</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md h-full flex items-center justify-center min-h-[500px]">
                            <div className="text-center text-muted-foreground">
                                <FlaskConical className="w-16 h-16 mx-auto mb-4 opacity-50" />
                                <h3 className="text-lg font-medium mb-2">No Results Selected</h3>
                                <p className="text-sm">Run a backtest or select a previous run to view results</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
