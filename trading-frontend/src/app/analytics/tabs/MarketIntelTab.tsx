"use client";

import { useEffect, useState } from "react";
import { PredictionCard } from "@/components/market/PredictionCard";
import { TokenRow } from "@/components/market/TokenRow";
import { GodWalletPanel } from "@/features/god-wallets/components/GodWalletPanel";
import { Search, Filter, Zap, Trophy, BarChart3, Loader2 } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import api from "@/lib/api";

interface Prediction {
    question: string;
    volume: string;
    chance: number;
    category: "Crypto" | "Macro" | "Sports" | "Politics";
    timeLeft: string;
    chartData: Array<{ time: string; value: number }>;
}

interface Token {
    rank: number;
    symbol: string;
    name: string;
    price: number;
    change24h: number;
    volume: string;
    mcap: string;
    liquidity: string;
}

interface MarketStats {
    sentiment: string;
    fearGreedIndex: number;
    topGainers: Array<{ symbol: string; change: number }>;
}

export default function MarketIntelTab() {
    const [predictions, setPredictions] = useState<Prediction[]>([]);
    const [tokens, setTokens] = useState<Token[]>([]);
    const [marketStats, setMarketStats] = useState<MarketStats | null>(null);
    const [signals, setSignals] = useState<Array<{ id: string; source: string; data: unknown; timestamp: number }>>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            try {
                const [predResponse, trendingResponse, statsResponse, signalsResponse] = await Promise.all([
                    api.getPredictionMarkets(),
                    api.getTrendingTokens(),
                    api.getMarketStats(),
                    api.getSignals({ limit: 5 }),
                ]);

                if (predResponse.success && predResponse.data) {
                    setPredictions(predResponse.data.slice(0, 3).map(p => ({
                        question: p.question,
                        volume: formatVolume(p.volume24h),
                        chance: Math.round((p.outcomes[0]?.price || 0.5) * 100),
                        category: "Crypto" as const,
                        timeLeft: "24h",
                        chartData: [{ time: 'A', value: 40 }, { time: 'B', value: Math.round((p.outcomes[0]?.price || 0.5) * 100 * 0.9) }, { time: 'C', value: Math.round((p.outcomes[0]?.price || 0.5) * 100) }],
                    })));
                }

                if (trendingResponse.success && trendingResponse.data) {
                    setTokens(trendingResponse.data.slice(0, 12).map((t, i) => ({
                        rank: i + 1, symbol: t.symbol, name: t.name, price: t.price, change24h: t.change24h,
                        volume: "-", mcap: "-", liquidity: "-",
                    })));
                }

                if (statsResponse.success && statsResponse.data) {
                    setMarketStats({ sentiment: statsResponse.data.sentiment, fearGreedIndex: statsResponse.data.fearGreedIndex, topGainers: statsResponse.data.topGainers || [] });
                }

                if (signalsResponse.success && signalsResponse.data) {
                    setSignals(signalsResponse.data);
                }
            } catch (error) {
                console.error('Failed to fetch market data:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, []);

    const formatVolume = (vol: number) => {
        if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
        if (vol >= 1000) return `${(vol / 1000).toFixed(0)}K`;
        return vol.toString();
    };

    const formatTimeAgo = (timestamp: number) => {
        const diff = Date.now() - timestamp;
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h`;
        return `${Math.floor(hours / 24)}d`;
    };

    return (
        <div className="space-y-6">
            {/* Sentiment & Predictions */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-1 p-6 rounded-2xl border border-white/5 bg-gradient-to-br from-blue-950/30 to-purple-950/30 flex flex-col justify-center items-center text-center">
                    {loading ? (
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    ) : (
                        <>
                            <div className="w-32 h-32 rounded-full border-8 border-white/5 border-t-green-500 flex items-center justify-center mb-4 rotate-45">
                                <div className="-rotate-45">
                                    <div className="text-3xl font-bold">{marketStats?.fearGreedIndex || 50}</div>
                                    <div className="text-xs uppercase text-green-400 font-bold">{marketStats?.sentiment || 'Neutral'}</div>
                                </div>
                            </div>
                            <p className="text-sm text-muted-foreground">Market Sentiment</p>
                        </>
                    )}
                </div>
                <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                    {loading ? (
                        [1, 2, 3].map(i => (
                            <div key={i} className="h-48 rounded-xl border border-white/5 bg-white/[0.02] animate-pulse flex items-center justify-center">
                                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            </div>
                        ))
                    ) : predictions.length > 0 ? (
                        predictions.map((pred, i) => <PredictionCard key={i} {...pred} />)
                    ) : (
                        <div className="lg:col-span-3 h-48 rounded-xl border border-white/5 bg-white/[0.02] flex items-center justify-center text-muted-foreground">
                            No prediction markets available
                        </div>
                    )}
                </div>
            </div>

            {/* Token Screener & Signals */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 rounded-2xl border border-white/5 bg-black/40 overflow-hidden">
                    <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                        <h3 className="font-semibold flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-purple-400" /> Trending Pairs
                        </h3>
                        <div className="relative">
                            <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input type="text" placeholder="Filter..." className="h-8 pl-8 pr-3 rounded bg-black/40 border border-white/10 text-xs w-32" />
                        </div>
                    </div>
                    <div className="overflow-auto max-h-96">
                        {loading ? (
                            <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
                        ) : tokens.length > 0 ? (
                            <table className="w-full text-left">
                                <thead className="bg-white/[0.02] sticky top-0 z-10">
                                    <tr>
                                        <th className="px-4 py-3 text-xs font-medium text-muted-foreground w-8">#</th>
                                        <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Token</th>
                                        <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">Price</th>
                                        <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">24h %</th>
                                    </tr>
                                </thead>
                                <tbody>{tokens.map((token) => <TokenRow key={token.rank} {...token} />)}</tbody>
                            </table>
                        ) : (
                            <div className="flex items-center justify-center h-64 text-muted-foreground">No tokens available</div>
                        )}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-blue-900/5 to-transparent p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-400" /> Alpha Stream</h3>
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        </div>
                        <div className="space-y-3 max-h-48 overflow-auto">
                            {signals.length > 0 ? signals.map((signal) => (
                                <div key={signal.id} className="text-xs p-3 rounded-xl bg-white/5 border border-white/5">
                                    <div className="flex justify-between mb-1">
                                        <span className="font-bold text-blue-300">@{signal.source}</span>
                                        <span className="text-muted-foreground">{formatTimeAgo(signal.timestamp)}</span>
                                    </div>
                                    <p className="text-gray-300">{String(signal.data).slice(0, 100)}</p>
                                </div>
                            )) : <div className="text-center text-muted-foreground text-sm py-4">No signals</div>}
                        </div>
                    </div>
                    <GodWalletPanel />
                </div>
            </div>
        </div>
    );
}
