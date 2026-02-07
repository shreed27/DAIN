"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Target, Clock, CheckCircle, AlertCircle, BarChart3, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { LimitOrders } from "@/components/trading/LimitOrders";

interface OrderStats {
    total: number;
    pending: number;
    executed: number;
    cancelled: number;
    totalVolume: number;
    successRate: number;
}

export default function LimitOrdersTab() {
    const [stats, setStats] = useState<OrderStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const walletAddress = "demo_wallet_address";

    useEffect(() => {
        async function fetchStats() {
            setIsLoading(true);
            try {
                const response = await api.getLimitOrderStats(walletAddress);
                if (response.success && response.data) {
                    setStats(response.data as OrderStats);
                }
            } catch (error) {
                console.error("Failed to fetch limit order stats:", error);
            } finally {
                setIsLoading(false);
            }
        }
        fetchStats();
    }, []);

    return (
        <div className="space-y-6">
            {/* Stats */}
            {!isLoading && stats && (
                <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                                <Target className="w-5 h-5 text-orange-400" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Total Orders</p>
                                <p className="text-xl font-bold">{stats.total}</p>
                            </div>
                        </div>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                                <Clock className="w-5 h-5 text-yellow-400" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Pending</p>
                                <p className="text-xl font-bold text-yellow-400">{stats.pending}</p>
                            </div>
                        </div>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                                <CheckCircle className="w-5 h-5 text-green-400" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Executed</p>
                                <p className="text-xl font-bold text-green-400">{stats.executed}</p>
                            </div>
                        </div>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-gray-500/10 flex items-center justify-center">
                                <AlertCircle className="w-5 h-5 text-gray-400" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Cancelled</p>
                                <p className="text-xl font-bold text-gray-400">{stats.cancelled}</p>
                            </div>
                        </div>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                <BarChart3 className="w-5 h-5 text-blue-400" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Volume</p>
                                <p className="text-xl font-bold">${(stats.totalVolume || 0).toFixed(0)}</p>
                            </div>
                        </div>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                                <TrendingUp className="w-5 h-5 text-purple-400" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Success Rate</p>
                                <p className={cn("text-xl font-bold", (stats.successRate || 0) >= 50 ? "text-green-400" : "text-red-400")}>
                                    {(stats.successRate || 0).toFixed(1)}%
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Main Content */}
            <LimitOrders walletAddress={walletAddress} />
        </div>
    );
}
