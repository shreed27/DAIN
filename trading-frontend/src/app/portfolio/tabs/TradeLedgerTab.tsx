"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FileText, TrendingUp, TrendingDown, RefreshCw, Filter, Download, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface TradeEntry {
    id: string;
    walletAddress: string;
    action: string;
    token: string;
    tokenSymbol?: string;
    chain: string;
    amount: number;
    price: number;
    decisionSource: string;
    reasoning?: string;
    confidence?: number;
    txSignature?: string;
    fees: number;
    slippage: number;
    pnl?: number;
    createdAt: number;
}

interface TradeStats {
    totalTrades: number;
    totalVolume: number;
    totalFees: number;
    totalPnl: number;
    winCount: number;
    lossCount: number;
    winRate: number;
    avgTradeSize: number;
    bySource: Record<string, number>;
    byAction: Record<string, number>;
}

export default function TradeLedgerTab() {
    const [entries, setEntries] = useState<TradeEntry[]>([]);
    const [stats, setStats] = useState<TradeStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'buy' | 'sell'>('all');
    const wallet = "demo-wallet";

    useEffect(() => {
        loadData();
    }, [filter]);

    const loadData = async () => {
        setLoading(true);
        try {
            const params: { walletAddress: string; action?: string; limit: number } = {
                walletAddress: wallet,
                limit: 50,
            };
            if (filter !== 'all') params.action = filter;

            const [entriesRes, statsRes] = await Promise.all([
                api.getTradeLedger(params),
                api.getTradeLedgerStats(wallet),
            ]);

            if (entriesRes.success && entriesRes.data) {
                setEntries(entriesRes.data.entries as TradeEntry[]);
            }
            if (statsRes.success && statsRes.data) {
                setStats(statsRes.data as TradeStats);
            }
        } catch (error) {
            console.error('Failed to load trade ledger:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getSourceColor = (source: string) => {
        switch (source.toLowerCase()) {
            case 'agent': return 'text-purple-400 bg-purple-500/10';
            case 'manual': return 'text-blue-400 bg-blue-500/10';
            case 'automation': return 'text-green-400 bg-green-500/10';
            case 'copy': return 'text-orange-400 bg-orange-500/10';
            default: return 'text-gray-400 bg-gray-500/10';
        }
    };

    return (
        <div className="space-y-6">
            {/* Stats Overview */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="text-xs text-muted-foreground mb-1">Total Trades</div>
                        <div className="text-2xl font-bold">{stats.totalTrades}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="text-xs text-muted-foreground mb-1">Total Volume</div>
                        <div className="text-2xl font-bold font-mono">${stats.totalVolume.toLocaleString()}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="text-xs text-muted-foreground mb-1">Total PnL</div>
                        <div className={cn("text-2xl font-bold font-mono", stats.totalPnl >= 0 ? "text-green-400" : "text-red-400")}>
                            {stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toLocaleString()}
                        </div>
                    </div>
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="text-xs text-muted-foreground mb-1">Win Rate</div>
                        <div className="text-2xl font-bold text-green-400">{(stats.winRate * 100).toFixed(1)}%</div>
                    </div>
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="text-xs text-muted-foreground mb-1">Total Fees</div>
                        <div className="text-2xl font-bold font-mono text-muted-foreground">${stats.totalFees.toFixed(2)}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="text-xs text-muted-foreground mb-1">Avg Trade Size</div>
                        <div className="text-2xl font-bold font-mono">${stats.avgTradeSize.toFixed(2)}</div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <div className="flex rounded-lg border border-white/10 overflow-hidden">
                        {(['all', 'buy', 'sell'] as const).map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={cn(
                                    "px-3 py-1.5 text-sm capitalize",
                                    filter === f ? "bg-primary text-primary-foreground" : "hover:bg-white/5"
                                )}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex gap-2">
                    <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-sm">
                        <Download className="w-4 h-4" />
                        Export
                    </button>
                    <button onClick={loadData} className="p-2 rounded-lg border border-white/10 hover:bg-white/5">
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Trade History Table */}
            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : entries.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                    <FileText className="w-12 h-12 mb-4 opacity-50" />
                    <p>No trade history found</p>
                </div>
            ) : (
                <div className="rounded-xl border border-white/5 bg-black/40 overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="text-xs text-muted-foreground border-b border-white/5">
                                <th className="text-left p-4">Time</th>
                                <th className="text-left p-4">Action</th>
                                <th className="text-left p-4">Token</th>
                                <th className="text-right p-4">Amount</th>
                                <th className="text-right p-4">Price</th>
                                <th className="text-right p-4">PnL</th>
                                <th className="text-center p-4">Source</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((entry, i) => (
                                <motion.tr
                                    key={entry.id}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: i * 0.02 }}
                                    className="border-b border-white/5 hover:bg-white/[0.02]"
                                >
                                    <td className="p-4 text-sm text-muted-foreground">
                                        {formatTime(entry.createdAt)}
                                    </td>
                                    <td className="p-4">
                                        <span className={cn(
                                            "flex items-center gap-1 text-sm font-medium",
                                            entry.action === 'buy' ? "text-green-400" : "text-red-400"
                                        )}>
                                            {entry.action === 'buy' ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                                            {entry.action.toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="p-4 font-medium">{entry.tokenSymbol || entry.token.slice(0, 8)}</td>
                                    <td className="p-4 text-right font-mono">{entry.amount.toLocaleString()}</td>
                                    <td className="p-4 text-right font-mono">${entry.price.toFixed(6)}</td>
                                    <td className="p-4 text-right">
                                        {entry.pnl !== undefined && (
                                            <span className={cn("font-mono", entry.pnl >= 0 ? "text-green-400" : "text-red-400")}>
                                                {entry.pnl >= 0 ? '+' : ''}${entry.pnl.toFixed(2)}
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className={cn("px-2 py-0.5 rounded text-xs", getSourceColor(entry.decisionSource))}>
                                            {entry.decisionSource}
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
