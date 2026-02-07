"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Rocket, RefreshCw, TrendingUp, Users, Star, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface Migration {
    id: string;
    oldMint: string;
    newMint: string;
    oldSymbol?: string;
    newSymbol?: string;
    migrationType: string;
    detectedAt: number;
    rankingScore: number;
    godWalletCount: number;
    volume24h: number;
    marketCap: number;
}

interface MigrationStats {
    total: number;
    last24h: number;
    last7d: number;
    avgRankingScore: number;
    avgGodWalletCount: number;
}

export default function MigrationsTab() {
    const [migrations, setMigrations] = useState<Migration[]>([]);
    const [stats, setStats] = useState<MigrationStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [migrationsRes, statsRes] = await Promise.all([
                api.getMigrations({ limit: 20 }),
                api.getMigrationStats(),
            ]);
            if (migrationsRes.success && migrationsRes.data) {
                setMigrations(migrationsRes.data.migrations);
            }
            if (statsRes.success) {
                setStats(statsRes.data as MigrationStats);
            }
        } catch (error) {
            console.error('Failed to load migrations:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleString();
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                    Track token migrations, launches, and god wallet activity
                </div>
                <button onClick={loadData} className="p-2 rounded-lg border border-white/10 hover:bg-white/5">
                    <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                </button>
            </div>

            {/* Stats */}
            {stats && (
                <div className="grid grid-cols-5 gap-4">
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                            <Rocket className="w-4 h-4" />Total
                        </div>
                        <div className="text-2xl font-bold">{stats.total}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                            24h New
                        </div>
                        <div className="text-2xl font-bold text-green-400">{stats.last24h}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                            7d New
                        </div>
                        <div className="text-2xl font-bold">{stats.last7d}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                            <Star className="w-4 h-4" />Avg Score
                        </div>
                        <div className="text-2xl font-bold">{stats.avgRankingScore.toFixed(1)}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                            <Users className="w-4 h-4" />Avg God Wallets
                        </div>
                        <div className="text-2xl font-bold">{stats.avgGodWalletCount.toFixed(1)}</div>
                    </div>
                </div>
            )}

            {/* Migrations List */}
            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : migrations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                    <Rocket className="w-12 h-12 mb-4 opacity-50" />
                    <p>No migrations detected</p>
                </div>
            ) : (
                <div className="rounded-xl border border-white/5 bg-black/40 overflow-hidden">
                    <div className="p-4 border-b border-white/5 bg-white/[0.02] font-semibold">Recent Migrations</div>
                    <table className="w-full">
                        <thead>
                            <tr className="text-xs text-muted-foreground border-b border-white/5">
                                <th className="text-left p-4">Token</th>
                                <th className="text-left p-4">Type</th>
                                <th className="text-right p-4">Score</th>
                                <th className="text-right p-4">God Wallets</th>
                                <th className="text-right p-4">24h Volume</th>
                                <th className="text-right p-4">Market Cap</th>
                                <th className="text-right p-4">Detected</th>
                            </tr>
                        </thead>
                        <tbody>
                            {migrations.map((m) => (
                                <motion.tr
                                    key={m.id}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="border-b border-white/5 hover:bg-white/[0.02]"
                                >
                                    <td className="p-4">
                                        <div className="flex items-center gap-2">
                                            <Rocket className="w-4 h-4 text-purple-400" />
                                            <div>
                                                <p className="font-medium">{m.newSymbol || 'Unknown'}</p>
                                                <p className="text-xs text-muted-foreground font-mono">
                                                    {m.newMint.slice(0, 8)}...
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <span className="px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-400">
                                            {m.migrationType}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right">
                                        <span className={cn(
                                            "font-bold",
                                            m.rankingScore >= 80 ? "text-green-400" :
                                            m.rankingScore >= 50 ? "text-yellow-400" : "text-gray-400"
                                        )}>
                                            {m.rankingScore.toFixed(0)}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right">
                                        <span className="flex items-center justify-end gap-1">
                                            <Users className="w-3 h-3 text-blue-400" />
                                            {m.godWalletCount}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right font-mono">
                                        ${(m.volume24h / 1000).toFixed(1)}K
                                    </td>
                                    <td className="p-4 text-right font-mono">
                                        ${(m.marketCap / 1000).toFixed(1)}K
                                    </td>
                                    <td className="p-4 text-right text-xs text-muted-foreground">
                                        {formatTime(m.detectedAt)}
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
