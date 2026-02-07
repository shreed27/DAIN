"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Network, Plus, Activity, Wallet, RefreshCw, Settings, Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface Swarm {
    id: string;
    name: string;
    strategy: string;
    walletCount: number;
    status: string;
    totalPnl: number;
    totalTrades: number;
}

export default function SwarmTab() {
    const [swarms, setSwarms] = useState<Swarm[]>([]);
    const [loading, setLoading] = useState(true);
    const wallet = "demo-wallet";

    useEffect(() => {
        loadSwarms();
    }, []);

    const loadSwarms = async () => {
        setLoading(true);
        try {
            const response = await api.getSwarms(wallet);
            if (response.success) {
                setSwarms((response.data || []) as Swarm[]);
            }
        } catch (error) {
            console.error('Failed to load swarms:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header Actions */}
            <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                    Coordinate multi-wallet trading strategies with Jito bundles
                </div>
                <div className="flex gap-2">
                    <button onClick={loadSwarms} className="p-2 rounded-lg border border-white/10 hover:bg-white/5">
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground">
                        <Plus className="w-4 h-4" />
                        Create Swarm
                    </button>
                </div>
            </div>

            {/* Info Card */}
            <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
                <h3 className="font-semibold text-blue-400 mb-2 flex items-center gap-2">
                    <Network className="w-4 h-4" />
                    How Swarm Trading Works
                </h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                        <p className="font-medium">1. Create a Swarm</p>
                        <p className="text-muted-foreground text-xs">Define strategy and allocate wallets</p>
                    </div>
                    <div>
                        <p className="font-medium">2. Coordinate Execution</p>
                        <p className="text-muted-foreground text-xs">Trades are bundled via Jito for MEV protection</p>
                    </div>
                    <div>
                        <p className="font-medium">3. Aggregate Results</p>
                        <p className="text-muted-foreground text-xs">Track combined P&L across all wallets</p>
                    </div>
                </div>
            </div>

            {/* Swarms Grid */}
            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : swarms.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                    <Network className="w-12 h-12 mb-4 opacity-50" />
                    <p>No swarms created yet</p>
                    <p className="text-sm">Create a swarm to coordinate multi-wallet trades</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {swarms.map((swarm) => (
                        <motion.div
                            key={swarm.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="font-semibold">{swarm.name}</h3>
                                    <p className="text-xs text-muted-foreground">{swarm.strategy}</p>
                                </div>
                                <span className={cn(
                                    "px-2 py-1 rounded text-xs",
                                    swarm.status === 'active' ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"
                                )}>
                                    {swarm.status}
                                </span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-center mb-4">
                                <div className="p-2 rounded-lg bg-white/5">
                                    <p className="text-xs text-muted-foreground">Wallets</p>
                                    <p className="font-bold">{swarm.walletCount}</p>
                                </div>
                                <div className="p-2 rounded-lg bg-white/5">
                                    <p className="text-xs text-muted-foreground">Trades</p>
                                    <p className="font-bold">{swarm.totalTrades}</p>
                                </div>
                                <div className="p-2 rounded-lg bg-white/5">
                                    <p className="text-xs text-muted-foreground">P&L</p>
                                    <p className={cn("font-bold font-mono", swarm.totalPnl >= 0 ? "text-green-400" : "text-red-400")}>
                                        ${swarm.totalPnl.toFixed(2)}
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm flex items-center justify-center gap-2">
                                    {swarm.status === 'active' ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                                    {swarm.status === 'active' ? 'Pause' : 'Start'}
                                </button>
                                <button className="p-2 rounded-lg bg-white/5 hover:bg-white/10">
                                    <Settings className="w-4 h-4" />
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}
