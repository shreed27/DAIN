"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    TrendingUp, TrendingDown, Activity, AlertTriangle, DollarSign,
    Gauge, Target, X, Plus, RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface FuturesPosition {
    id: string;
    symbol: string;
    side: 'long' | 'short';
    entryPrice: number;
    currentPrice: number;
    size: number;
    leverage: number;
    liquidationPrice: number;
    unrealizedPnl: number;
    unrealizedPnlPercent: number;
}

interface FuturesStats {
    totalPositions: number;
    totalPnl: number;
    totalMargin: number;
    avgLeverage: number;
    winRate: number;
}

const EXCHANGES = [
    { id: 'hyperliquid', name: 'Hyperliquid', maxLeverage: 50 },
    { id: 'binance', name: 'Binance', maxLeverage: 125 },
    { id: 'bybit', name: 'Bybit', maxLeverage: 100 },
];

const MARKETS = [
    { symbol: 'BTC-PERP', name: 'Bitcoin', price: 67432.50 },
    { symbol: 'ETH-PERP', name: 'Ethereum', price: 3521.80 },
    { symbol: 'SOL-PERP', name: 'Solana', price: 145.20 },
];

export default function FuturesTab() {
    const [positions, setPositions] = useState<FuturesPosition[]>([]);
    const [stats, setStats] = useState<FuturesStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedExchange, setSelectedExchange] = useState(EXCHANGES[0]);
    const [showNewPosition, setShowNewPosition] = useState(false);
    const [newPosition, setNewPosition] = useState({
        symbol: 'SOL-PERP',
        side: 'long' as 'long' | 'short',
        size: 100,
        leverage: 10,
    });

    const wallet = "demo-wallet";

    useEffect(() => {
        loadData();
    }, [selectedExchange]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [positionsRes, statsRes] = await Promise.all([
                api.getFuturesPositions(wallet, selectedExchange.id),
                api.getFuturesStats(wallet),
            ]);
            if (positionsRes.success) setPositions((positionsRes.data || []) as FuturesPosition[]);
            if (statsRes.success) setStats(statsRes.data as FuturesStats);
        } catch (error) {
            console.error('Error loading futures data:', error);
        } finally {
            setLoading(false);
        }
    };

    const openPosition = async () => {
        const market = MARKETS.find(m => m.symbol === newPosition.symbol);
        if (!market) return;
        try {
            const result = await api.createFuturesPosition({
                userWallet: wallet,
                exchange: selectedExchange.id,
                symbol: newPosition.symbol,
                side: newPosition.side,
                entryPrice: market.price,
                size: newPosition.size,
                leverage: newPosition.leverage,
                margin: newPosition.size / newPosition.leverage,
            });
            if (result.success) {
                setShowNewPosition(false);
                loadData();
            }
        } catch (error) {
            console.error('Error opening position:', error);
        }
    };

    return (
        <div className="space-y-6">
            {/* Exchange Selector */}
            <div className="flex gap-2 items-center justify-between">
                <div className="flex gap-2">
                    {EXCHANGES.map((exchange) => (
                        <button
                            key={exchange.id}
                            onClick={() => setSelectedExchange(exchange)}
                            className={cn(
                                "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                                selectedExchange.id === exchange.id
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-white/5 text-muted-foreground hover:bg-white/10"
                            )}
                        >
                            {exchange.name}
                            <span className="ml-2 text-xs opacity-70">{exchange.maxLeverage}x</span>
                        </button>
                    ))}
                </div>
                <div className="flex gap-2">
                    <button onClick={loadData} className="p-2 rounded-lg border border-white/10 hover:bg-white/5">
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                    </button>
                    <button
                        onClick={() => setShowNewPosition(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground"
                    >
                        <Plus className="w-4 h-4" />
                        Open Position
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-5 gap-4">
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <Activity className="w-4 h-4" />Open Positions
                    </div>
                    <div className="text-2xl font-bold">{stats?.totalPositions || 0}</div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <DollarSign className="w-4 h-4" />Total P&L
                    </div>
                    <div className={cn("text-2xl font-bold font-mono", (stats?.totalPnl || 0) >= 0 ? "text-green-400" : "text-red-400")}>
                        {(stats?.totalPnl || 0) >= 0 ? '+' : ''}${(stats?.totalPnl || 0).toFixed(2)}
                    </div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <Gauge className="w-4 h-4" />Avg Leverage
                    </div>
                    <div className="text-2xl font-bold">{stats?.avgLeverage?.toFixed(1) || 0}x</div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <Target className="w-4 h-4" />Win Rate
                    </div>
                    <div className="text-2xl font-bold">{((stats?.winRate || 0) * 100).toFixed(1)}%</div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <AlertTriangle className="w-4 h-4" />Total Margin
                    </div>
                    <div className="text-2xl font-bold font-mono">${(stats?.totalMargin || 0).toFixed(2)}</div>
                </div>
            </div>

            {/* Positions Table */}
            <div className="rounded-xl border border-white/5 bg-black/40 overflow-hidden">
                <div className="p-4 border-b border-white/5 bg-white/[0.02] font-semibold">Open Positions</div>
                {loading ? (
                    <div className="p-8 text-center text-muted-foreground">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />Loading...
                    </div>
                ) : positions.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                        <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No open positions
                    </div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="text-xs text-muted-foreground border-b border-white/5">
                                <th className="text-left p-4">Symbol</th>
                                <th className="text-left p-4">Side</th>
                                <th className="text-right p-4">Size</th>
                                <th className="text-right p-4">Entry</th>
                                <th className="text-right p-4">Current</th>
                                <th className="text-right p-4">Leverage</th>
                                <th className="text-right p-4">P&L</th>
                            </tr>
                        </thead>
                        <tbody>
                            {positions.map((pos) => (
                                <tr key={pos.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                                    <td className="p-4 font-medium">{pos.symbol}</td>
                                    <td className="p-4">
                                        <span className={cn("px-2 py-1 rounded text-xs", pos.side === 'long' ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400")}>
                                            {pos.side.toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right font-mono">${pos.size.toFixed(2)}</td>
                                    <td className="p-4 text-right font-mono">${pos.entryPrice.toFixed(2)}</td>
                                    <td className="p-4 text-right font-mono">${pos.currentPrice.toFixed(2)}</td>
                                    <td className="p-4 text-right">{pos.leverage}x</td>
                                    <td className={cn("p-4 text-right font-mono", pos.unrealizedPnl >= 0 ? "text-green-400" : "text-red-400")}>
                                        {pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* New Position Modal */}
            <AnimatePresence>
                {showNewPosition && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
                        onClick={() => setShowNewPosition(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.95 }}
                            className="bg-background border border-white/10 rounded-xl p-6 w-full max-w-md"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex justify-between mb-6">
                                <h2 className="text-xl font-bold">Open Position</h2>
                                <button onClick={() => setShowNewPosition(false)} className="p-2 hover:bg-white/10 rounded-lg">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">Market</label>
                                    <select
                                        value={newPosition.symbol}
                                        onChange={(e) => setNewPosition({ ...newPosition, symbol: e.target.value })}
                                        className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10"
                                    >
                                        {MARKETS.map((m) => (
                                            <option key={m.symbol} value={m.symbol}>{m.symbol} - ${m.price}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">Side</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => setNewPosition({ ...newPosition, side: 'long' })}
                                            className={cn("px-4 py-3 rounded-lg flex items-center justify-center gap-2", newPosition.side === 'long' ? "bg-green-500/20 text-green-400 border border-green-500/50" : "bg-white/5")}
                                        >
                                            <TrendingUp className="w-4 h-4" />Long
                                        </button>
                                        <button
                                            onClick={() => setNewPosition({ ...newPosition, side: 'short' })}
                                            className={cn("px-4 py-3 rounded-lg flex items-center justify-center gap-2", newPosition.side === 'short' ? "bg-red-500/20 text-red-400 border border-red-500/50" : "bg-white/5")}
                                        >
                                            <TrendingDown className="w-4 h-4" />Short
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">Size (USD)</label>
                                    <input
                                        type="number"
                                        value={newPosition.size}
                                        onChange={(e) => setNewPosition({ ...newPosition, size: parseFloat(e.target.value) || 0 })}
                                        className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">Leverage: {newPosition.leverage}x</label>
                                    <input
                                        type="range"
                                        min="1"
                                        max={selectedExchange.maxLeverage}
                                        value={newPosition.leverage}
                                        onChange={(e) => setNewPosition({ ...newPosition, leverage: parseInt(e.target.value) })}
                                        className="w-full accent-primary"
                                    />
                                </div>
                                <button
                                    onClick={openPosition}
                                    className={cn("w-full py-3 rounded-lg font-medium", newPosition.side === 'long' ? "bg-green-500 text-white" : "bg-red-500 text-white")}
                                >
                                    Open {newPosition.side === 'long' ? 'Long' : 'Short'} Position
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
