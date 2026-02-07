"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    TrendingUp, TrendingDown, Activity, AlertTriangle, DollarSign,
    Gauge, Target, X, Plus, RefreshCw, ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface FuturesPosition {
    id: string;
    userWallet: string;
    exchange: string;
    symbol: string;
    side: 'long' | 'short';
    entryPrice: number;
    currentPrice: number;
    size: number;
    leverage: number;
    liquidationPrice: number;
    margin: number;
    unrealizedPnl: number;
    unrealizedPnlPercent: number;
    status: string;
    createdAt: number;
}

interface FuturesStats {
    totalPositions: number;
    totalPnl: number;
    totalMargin: number;
    avgLeverage: number;
    winRate: number;
}

const EXCHANGES = [
    { id: 'hyperliquid', name: 'Hyperliquid', maxLeverage: 50, color: 'blue' },
    { id: 'binance', name: 'Binance', maxLeverage: 125, color: 'yellow' },
    { id: 'bybit', name: 'Bybit', maxLeverage: 100, color: 'orange' },
    { id: 'mexc', name: 'MEXC', maxLeverage: 200, color: 'green' },
];

const MARKETS = [
    { symbol: 'BTC-PERP', name: 'Bitcoin', price: 67432.50 },
    { symbol: 'ETH-PERP', name: 'Ethereum', price: 3521.80 },
    { symbol: 'SOL-PERP', name: 'Solana', price: 145.20 },
    { symbol: 'ARB-PERP', name: 'Arbitrum', price: 1.12 },
    { symbol: 'DOGE-PERP', name: 'Dogecoin', price: 0.156 },
];

export default function FuturesPage() {
    const [positions, setPositions] = useState<FuturesPosition[]>([]);
    const [stats, setStats] = useState<FuturesStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedExchange, setSelectedExchange] = useState(EXCHANGES[0]);
    const [showNewPosition, setShowNewPosition] = useState(false);

    // New position form
    const [newPosition, setNewPosition] = useState({
        symbol: 'SOL-PERP',
        side: 'long' as 'long' | 'short',
        size: 100,
        leverage: 10,
    });

    const wallet = "demo-wallet"; // Would come from wallet connection

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

            if (positionsRes.success) {
                setPositions(positionsRes.data || []);
            }
            if (statsRes.success) {
                setStats(statsRes.data);
            }
        } catch (error) {
            console.error('Error loading futures data:', error);
        } finally {
            setLoading(false);
        }
    };

    const openPosition = async () => {
        try {
            const market = MARKETS.find(m => m.symbol === newPosition.symbol);
            if (!market) return;

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

    const closePosition = async (positionId: string) => {
        try {
            const position = positions.find(p => p.id === positionId);
            if (!position) return;

            await api.closeFuturesPosition(positionId, position.currentPrice);
            loadData();
        } catch (error) {
            console.error('Error closing position:', error);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Futures Trading</h1>
                    <p className="text-muted-foreground">
                        Leveraged perpetual futures across {EXCHANGES.length} exchanges
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
                        onClick={() => setShowNewPosition(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Open Position
                    </button>
                </div>
            </div>

            {/* Exchange Selector */}
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
                        <span className="ml-2 text-xs opacity-70">
                            {exchange.maxLeverage}x
                        </span>
                    </button>
                ))}
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-5 gap-4">
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <Activity className="w-4 h-4" />
                        Open Positions
                    </div>
                    <div className="text-2xl font-bold">{stats?.totalPositions || 0}</div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <DollarSign className="w-4 h-4" />
                        Total P&L
                    </div>
                    <div className={cn(
                        "text-2xl font-bold font-mono",
                        (stats?.totalPnl || 0) >= 0 ? "text-green-400" : "text-red-400"
                    )}>
                        {(stats?.totalPnl || 0) >= 0 ? '+' : ''}${(stats?.totalPnl || 0).toFixed(2)}
                    </div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <Gauge className="w-4 h-4" />
                        Avg Leverage
                    </div>
                    <div className="text-2xl font-bold">{stats?.avgLeverage?.toFixed(1) || 0}x</div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <Target className="w-4 h-4" />
                        Win Rate
                    </div>
                    <div className="text-2xl font-bold">{((stats?.winRate || 0) * 100).toFixed(1)}%</div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <AlertTriangle className="w-4 h-4" />
                        Total Margin
                    </div>
                    <div className="text-2xl font-bold font-mono">${(stats?.totalMargin || 0).toFixed(2)}</div>
                </div>
            </div>

            {/* Positions Table */}
            <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md overflow-hidden">
                <div className="p-4 border-b border-white/5 bg-white/[0.02]">
                    <h2 className="font-semibold">Open Positions</h2>
                </div>

                {loading ? (
                    <div className="p-8 text-center text-muted-foreground">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                        Loading positions...
                    </div>
                ) : positions.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                        <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No open positions
                        <p className="text-sm mt-1">Open a new position to get started</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-xs text-muted-foreground border-b border-white/5">
                                    <th className="text-left p-4">Symbol</th>
                                    <th className="text-left p-4">Side</th>
                                    <th className="text-right p-4">Size</th>
                                    <th className="text-right p-4">Entry</th>
                                    <th className="text-right p-4">Current</th>
                                    <th className="text-right p-4">Leverage</th>
                                    <th className="text-right p-4">Liq. Price</th>
                                    <th className="text-right p-4">P&L</th>
                                    <th className="text-right p-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {positions.map((position) => (
                                    <motion.tr
                                        key={position.id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="border-b border-white/5 hover:bg-white/[0.02]"
                                    >
                                        <td className="p-4 font-medium">{position.symbol}</td>
                                        <td className="p-4">
                                            <span className={cn(
                                                "px-2 py-1 rounded text-xs font-medium",
                                                position.side === 'long'
                                                    ? "bg-green-500/20 text-green-400"
                                                    : "bg-red-500/20 text-red-400"
                                            )}>
                                                {position.side === 'long' ? (
                                                    <TrendingUp className="w-3 h-3 inline mr-1" />
                                                ) : (
                                                    <TrendingDown className="w-3 h-3 inline mr-1" />
                                                )}
                                                {position.side.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right font-mono">${position.size.toFixed(2)}</td>
                                        <td className="p-4 text-right font-mono">${position.entryPrice.toFixed(2)}</td>
                                        <td className="p-4 text-right font-mono">${position.currentPrice.toFixed(2)}</td>
                                        <td className="p-4 text-right">
                                            <span className="px-2 py-1 rounded bg-white/10 text-xs font-medium">
                                                {position.leverage}x
                                            </span>
                                        </td>
                                        <td className="p-4 text-right font-mono text-orange-400">
                                            ${position.liquidationPrice.toFixed(2)}
                                        </td>
                                        <td className={cn(
                                            "p-4 text-right font-mono font-medium",
                                            position.unrealizedPnl >= 0 ? "text-green-400" : "text-red-400"
                                        )}>
                                            {position.unrealizedPnl >= 0 ? '+' : ''}${position.unrealizedPnl.toFixed(2)}
                                            <span className="text-xs ml-1">
                                                ({position.unrealizedPnlPercent >= 0 ? '+' : ''}{position.unrealizedPnlPercent.toFixed(2)}%)
                                            </span>
                                        </td>
                                        <td className="p-4 text-right">
                                            <button
                                                onClick={() => closePosition(position.id)}
                                                className="px-3 py-1 rounded bg-red-500/20 text-red-400 text-xs hover:bg-red-500/30 transition-colors"
                                            >
                                                Close
                                            </button>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
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
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-background border border-white/10 rounded-xl p-6 w-full max-w-md"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold">Open Position</h2>
                                <button
                                    onClick={() => setShowNewPosition(false)}
                                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                {/* Exchange */}
                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">Exchange</label>
                                    <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/10">
                                        {selectedExchange.name}
                                    </div>
                                </div>

                                {/* Market */}
                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">Market</label>
                                    <select
                                        value={newPosition.symbol}
                                        onChange={(e) => setNewPosition({ ...newPosition, symbol: e.target.value })}
                                        className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-primary outline-none"
                                    >
                                        {MARKETS.map((market) => (
                                            <option key={market.symbol} value={market.symbol}>
                                                {market.symbol} - ${market.price}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Side */}
                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">Side</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => setNewPosition({ ...newPosition, side: 'long' })}
                                            className={cn(
                                                "px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2",
                                                newPosition.side === 'long'
                                                    ? "bg-green-500/20 text-green-400 border border-green-500/50"
                                                    : "bg-white/5 text-muted-foreground hover:bg-white/10"
                                            )}
                                        >
                                            <TrendingUp className="w-4 h-4" />
                                            Long
                                        </button>
                                        <button
                                            onClick={() => setNewPosition({ ...newPosition, side: 'short' })}
                                            className={cn(
                                                "px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2",
                                                newPosition.side === 'short'
                                                    ? "bg-red-500/20 text-red-400 border border-red-500/50"
                                                    : "bg-white/5 text-muted-foreground hover:bg-white/10"
                                            )}
                                        >
                                            <TrendingDown className="w-4 h-4" />
                                            Short
                                        </button>
                                    </div>
                                </div>

                                {/* Size */}
                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">Size (USD)</label>
                                    <input
                                        type="number"
                                        value={newPosition.size}
                                        onChange={(e) => setNewPosition({ ...newPosition, size: parseFloat(e.target.value) || 0 })}
                                        className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-primary outline-none font-mono"
                                    />
                                </div>

                                {/* Leverage */}
                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">
                                        Leverage: {newPosition.leverage}x
                                    </label>
                                    <input
                                        type="range"
                                        min="1"
                                        max={selectedExchange.maxLeverage}
                                        value={newPosition.leverage}
                                        onChange={(e) => setNewPosition({ ...newPosition, leverage: parseInt(e.target.value) })}
                                        className="w-full accent-primary"
                                    />
                                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                        <span>1x</span>
                                        <span>{selectedExchange.maxLeverage}x</span>
                                    </div>
                                </div>

                                {/* Summary */}
                                <div className="p-4 rounded-lg bg-white/5 space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Margin Required</span>
                                        <span className="font-mono">${(newPosition.size / newPosition.leverage).toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Position Value</span>
                                        <span className="font-mono">${newPosition.size.toFixed(2)}</span>
                                    </div>
                                </div>

                                <button
                                    onClick={openPosition}
                                    className={cn(
                                        "w-full py-3 rounded-lg font-medium transition-colors",
                                        newPosition.side === 'long'
                                            ? "bg-green-500 text-white hover:bg-green-600"
                                            : "bg-red-500 text-white hover:bg-red-600"
                                    )}
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
