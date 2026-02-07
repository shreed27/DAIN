"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeftRight, RefreshCw, TrendingUp, DollarSign, Target, Activity, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface ArbitrageOpportunity {
    id: string;
    token: string;
    buyPlatform: string;
    buyPrice: number;
    sellPlatform: string;
    sellPrice: number;
    profitPercent: number;
    confidence: number;
}

export default function ArbitrageTab() {
    const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
    const [loading, setLoading] = useState(true);
    const wallet = "demo-wallet";

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const response = await api.getArbitrageOpportunities();
            if (response.success && response.data) {
                setOpportunities(response.data);
            }
        } catch (error) {
            console.error('Failed to load arbitrage opportunities:', error);
        } finally {
            setLoading(false);
        }
    };

    const executeArbitrage = async (oppId: string) => {
        try {
            await api.executeArbitrage(oppId, wallet, 100);
            loadData();
        } catch (error) {
            console.error('Failed to execute arbitrage:', error);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                    Find and exploit price differences across prediction markets and exchanges
                </div>
                <button onClick={loadData} className="p-2 rounded-lg border border-white/10 hover:bg-white/5">
                    <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <Activity className="w-4 h-4" />Active Opportunities
                    </div>
                    <div className="text-2xl font-bold">{opportunities.length}</div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <TrendingUp className="w-4 h-4" />Best Spread
                    </div>
                    <div className="text-2xl font-bold text-green-400">
                        {opportunities.length > 0 ? `${Math.max(...opportunities.map(o => o.profitPercent)).toFixed(2)}%` : '0%'}
                    </div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <Target className="w-4 h-4" />Avg Confidence
                    </div>
                    <div className="text-2xl font-bold">
                        {opportunities.length > 0 ? `${(opportunities.reduce((a, b) => a + b.confidence, 0) / opportunities.length * 100).toFixed(0)}%` : '0%'}
                    </div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <DollarSign className="w-4 h-4" />Total Volume
                    </div>
                    <div className="text-2xl font-bold">$12.4K</div>
                </div>
            </div>

            {/* Info */}
            <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
                <h3 className="font-semibold text-blue-400 mb-2 flex items-center gap-2">
                    <ArrowLeftRight className="w-4 h-4" />
                    How Arbitrage Works
                </h3>
                <p className="text-sm text-muted-foreground">
                    Our system scans multiple prediction markets (Polymarket, Kalshi) and exchanges for price discrepancies.
                    When a significant spread is found, you can execute the arbitrage to profit from the difference.
                </p>
            </div>

            {/* Opportunities */}
            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : opportunities.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                    <ArrowLeftRight className="w-12 h-12 mb-4 opacity-50" />
                    <p>No arbitrage opportunities found</p>
                    <p className="text-sm">Check back later for new opportunities</p>
                </div>
            ) : (
                <div className="rounded-xl border border-white/5 bg-black/40 overflow-hidden">
                    <div className="p-4 border-b border-white/5 bg-white/[0.02] font-semibold">Arbitrage Opportunities</div>
                    <table className="w-full">
                        <thead>
                            <tr className="text-xs text-muted-foreground border-b border-white/5">
                                <th className="text-left p-4">Token/Market</th>
                                <th className="text-left p-4">Buy</th>
                                <th className="text-left p-4">Sell</th>
                                <th className="text-right p-4">Spread</th>
                                <th className="text-right p-4">Confidence</th>
                                <th className="text-right p-4">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {opportunities.map((opp) => (
                                <motion.tr
                                    key={opp.id}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="border-b border-white/5 hover:bg-white/[0.02]"
                                >
                                    <td className="p-4 font-medium">{opp.token}</td>
                                    <td className="p-4">
                                        <div>
                                            <p className="text-sm">{opp.buyPlatform}</p>
                                            <p className="text-xs text-muted-foreground font-mono">${opp.buyPrice.toFixed(4)}</p>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div>
                                            <p className="text-sm">{opp.sellPlatform}</p>
                                            <p className="text-xs text-muted-foreground font-mono">${opp.sellPrice.toFixed(4)}</p>
                                        </div>
                                    </td>
                                    <td className="p-4 text-right">
                                        <span className="text-green-400 font-bold">+{opp.profitPercent.toFixed(2)}%</span>
                                    </td>
                                    <td className="p-4 text-right">
                                        <span className={cn(
                                            "px-2 py-1 rounded text-xs",
                                            opp.confidence >= 0.8 ? "bg-green-500/20 text-green-400" :
                                            opp.confidence >= 0.5 ? "bg-yellow-500/20 text-yellow-400" : "bg-gray-500/20 text-gray-400"
                                        )}>
                                            {(opp.confidence * 100).toFixed(0)}%
                                        </span>
                                    </td>
                                    <td className="p-4 text-right">
                                        <button
                                            onClick={() => executeArbitrage(opp.id)}
                                            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs flex items-center gap-1 ml-auto"
                                        >
                                            <Play className="w-3 h-3" />
                                            Execute
                                        </button>
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
