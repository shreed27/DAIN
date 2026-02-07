"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Network, Wallet, Plus, Play, Pause, Settings, RefreshCw,
    Users, DollarSign, Activity, Zap, Trash2, X, CheckCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface SwarmConfig {
    id: string;
    name: string;
    description: string;
    strategy: string;
    maxWallets: number;
    minWallets: number;
    maxPositionPerWallet: number;
    totalBudget: number;
    usedBudget: number;
    status: 'active' | 'paused' | 'completed';
    createdAt: number;
}

interface SwarmWallet {
    id: string;
    swarmId: string;
    walletAddress: string;
    label: string;
    allocatedAmount: number;
    usedAmount: number;
    trades: number;
    pnl: number;
    status: string;
}

interface SwarmExecution {
    id: string;
    swarmId: string;
    symbol: string;
    action: string;
    totalAmount: number;
    walletsUsed: number;
    avgPrice: number;
    status: string;
    executedAt: number;
}

interface SwarmStats {
    totalSwarms: number;
    activeSwarms: number;
    totalWallets: number;
    totalPnl: number;
    totalVolume: number;
}

export default function SwarmPage() {
    const [swarms, setSwarms] = useState<SwarmConfig[]>([]);
    const [selectedSwarm, setSelectedSwarm] = useState<SwarmConfig | null>(null);
    const [wallets, setWallets] = useState<SwarmWallet[]>([]);
    const [executions, setExecutions] = useState<SwarmExecution[]>([]);
    const [stats, setStats] = useState<SwarmStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [showCreateSwarm, setShowCreateSwarm] = useState(false);

    // New swarm form
    const [newSwarm, setNewSwarm] = useState({
        name: '',
        strategy: 'coordinated_buy',
        maxWallets: 10,
        totalBudget: 10000,
    });

    const wallet = "demo-wallet";

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [swarmsRes, statsRes] = await Promise.all([
                api.getSwarms(wallet),
                api.getSwarmStats(wallet),
            ]);

            if (swarmsRes.success) {
                setSwarms(swarmsRes.data || []);
                if (swarmsRes.data?.length > 0 && !selectedSwarm) {
                    selectSwarm(swarmsRes.data[0]);
                }
            }
            if (statsRes.success) setStats(statsRes.data);
        } catch (error) {
            console.error('Error loading swarm data:', error);
        } finally {
            setLoading(false);
        }
    };

    const selectSwarm = async (swarm: SwarmConfig) => {
        setSelectedSwarm(swarm);
        // Load wallets and executions for this swarm
        try {
            const [walletsRes, execsRes] = await Promise.all([
                api.get(`/swarm/${swarm.id}/wallets`, {}),
                api.get(`/swarm/${swarm.id}/executions`, {}),
            ]);

            if (walletsRes.success) setWallets(walletsRes.data || []);
            if (execsRes.success) setExecutions(execsRes.data || []);
        } catch (error) {
            console.error('Error loading swarm details:', error);
        }
    };

    const createSwarm = async () => {
        try {
            const result = await api.createSwarm({
                userWallet: wallet,
                name: newSwarm.name || `Swarm ${swarms.length + 1}`,
                strategy: newSwarm.strategy,
                maxWallets: newSwarm.maxWallets,
                minWallets: Math.floor(newSwarm.maxWallets / 2),
                maxPositionPerWallet: newSwarm.totalBudget / newSwarm.maxWallets,
                totalBudget: newSwarm.totalBudget,
            });

            if (result.success) {
                setShowCreateSwarm(false);
                setNewSwarm({ name: '', strategy: 'coordinated_buy', maxWallets: 10, totalBudget: 10000 });
                loadData();
            }
        } catch (error) {
            console.error('Error creating swarm:', error);
        }
    };

    const executeSwarm = async () => {
        if (!selectedSwarm) return;

        try {
            await api.executeSwarmTrade(selectedSwarm.id, {
                symbol: 'SOL/USDC',
                action: 'buy',
                totalAmount: 1000,
                splitStrategy: 'equal',
            });
            selectSwarm(selectedSwarm);
        } catch (error) {
            console.error('Error executing swarm:', error);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3">
                        <Network className="w-7 h-7 text-primary" />
                        Swarm Trading
                    </h1>
                    <p className="text-muted-foreground">
                        Coordinate trades across multiple wallets for better execution
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
                        onClick={() => setShowCreateSwarm(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Create Swarm
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-5 gap-4">
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <Network className="w-4 h-4" />
                        Total Swarms
                    </div>
                    <div className="text-2xl font-bold">{stats?.totalSwarms || 0}</div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <Activity className="w-4 h-4" />
                        Active Swarms
                    </div>
                    <div className="text-2xl font-bold text-green-400">{stats?.activeSwarms || 0}</div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <Wallet className="w-4 h-4" />
                        Total Wallets
                    </div>
                    <div className="text-2xl font-bold">{stats?.totalWallets || 0}</div>
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
                        <Zap className="w-4 h-4" />
                        Total Volume
                    </div>
                    <div className="text-2xl font-bold font-mono">${(stats?.totalVolume || 0).toLocaleString()}</div>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
                {/* Swarm List */}
                <div className="col-span-1">
                    <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md overflow-hidden">
                        <div className="p-4 border-b border-white/5 bg-white/[0.02]">
                            <h2 className="font-semibold">Your Swarms</h2>
                        </div>
                        <div className="p-2 max-h-[500px] overflow-y-auto">
                            {swarms.length === 0 ? (
                                <div className="p-6 text-center text-muted-foreground">
                                    <Network className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    No swarms created yet
                                </div>
                            ) : (
                                swarms.map((swarm) => (
                                    <button
                                        key={swarm.id}
                                        onClick={() => selectSwarm(swarm)}
                                        className={cn(
                                            "w-full p-3 rounded-lg text-left transition-colors mb-2",
                                            selectedSwarm?.id === swarm.id
                                                ? "bg-primary/20 border border-primary/50"
                                                : "bg-white/5 hover:bg-white/10"
                                        )}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-medium">{swarm.name}</span>
                                            <span className={cn(
                                                "px-2 py-0.5 rounded text-xs",
                                                swarm.status === 'active' ? "bg-green-500/20 text-green-400" :
                                                swarm.status === 'paused' ? "bg-yellow-500/20 text-yellow-400" :
                                                "bg-gray-500/20 text-gray-400"
                                            )}>
                                                {swarm.status}
                                            </span>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {swarm.maxWallets} wallets | ${swarm.totalBudget.toLocaleString()} budget
                                        </div>
                                        <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary transition-all"
                                                style={{ width: `${(swarm.usedBudget / swarm.totalBudget) * 100}%` }}
                                            />
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Swarm Details */}
                <div className="col-span-2">
                    {selectedSwarm ? (
                        <div className="space-y-4">
                            {/* Swarm Header */}
                            <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md p-4">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h2 className="text-xl font-bold">{selectedSwarm.name}</h2>
                                        <p className="text-sm text-muted-foreground">{selectedSwarm.description}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={executeSwarm}
                                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                                        >
                                            <Play className="w-4 h-4" />
                                            Execute
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-4 gap-4">
                                    <div className="p-3 rounded-lg bg-white/5">
                                        <div className="text-xs text-muted-foreground">Strategy</div>
                                        <div className="font-medium capitalize">{selectedSwarm.strategy.replace('_', ' ')}</div>
                                    </div>
                                    <div className="p-3 rounded-lg bg-white/5">
                                        <div className="text-xs text-muted-foreground">Wallets</div>
                                        <div className="font-medium">{wallets.length} / {selectedSwarm.maxWallets}</div>
                                    </div>
                                    <div className="p-3 rounded-lg bg-white/5">
                                        <div className="text-xs text-muted-foreground">Budget Used</div>
                                        <div className="font-medium font-mono">
                                            ${selectedSwarm.usedBudget.toLocaleString()} / ${selectedSwarm.totalBudget.toLocaleString()}
                                        </div>
                                    </div>
                                    <div className="p-3 rounded-lg bg-white/5">
                                        <div className="text-xs text-muted-foreground">Max Per Wallet</div>
                                        <div className="font-medium font-mono">${selectedSwarm.maxPositionPerWallet.toLocaleString()}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Wallets */}
                            <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md overflow-hidden">
                                <div className="p-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                                    <h3 className="font-semibold">Swarm Wallets</h3>
                                    <button className="text-xs text-primary hover:underline">
                                        + Add Wallet
                                    </button>
                                </div>
                                {wallets.length === 0 ? (
                                    <div className="p-6 text-center text-muted-foreground">
                                        No wallets added to this swarm yet
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="text-xs text-muted-foreground border-b border-white/5">
                                                    <th className="text-left p-3">Wallet</th>
                                                    <th className="text-right p-3">Allocated</th>
                                                    <th className="text-right p-3">Used</th>
                                                    <th className="text-right p-3">Trades</th>
                                                    <th className="text-right p-3">P&L</th>
                                                    <th className="text-right p-3">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {wallets.map((w) => (
                                                    <tr key={w.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                                                        <td className="p-3">
                                                            <div className="font-medium">{w.label}</div>
                                                            <div className="text-xs text-muted-foreground font-mono">
                                                                {w.walletAddress.slice(0, 8)}...{w.walletAddress.slice(-6)}
                                                            </div>
                                                        </td>
                                                        <td className="p-3 text-right font-mono">${w.allocatedAmount.toFixed(2)}</td>
                                                        <td className="p-3 text-right font-mono">${w.usedAmount.toFixed(2)}</td>
                                                        <td className="p-3 text-right">{w.trades}</td>
                                                        <td className={cn(
                                                            "p-3 text-right font-mono",
                                                            w.pnl >= 0 ? "text-green-400" : "text-red-400"
                                                        )}>
                                                            {w.pnl >= 0 ? '+' : ''}${w.pnl.toFixed(2)}
                                                        </td>
                                                        <td className="p-3 text-right">
                                                            <span className={cn(
                                                                "px-2 py-0.5 rounded text-xs",
                                                                w.status === 'active' ? "bg-green-500/20 text-green-400" :
                                                                "bg-gray-500/20 text-gray-400"
                                                            )}>
                                                                {w.status}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {/* Executions */}
                            <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md overflow-hidden">
                                <div className="p-4 border-b border-white/5 bg-white/[0.02]">
                                    <h3 className="font-semibold">Recent Executions</h3>
                                </div>
                                {executions.length === 0 ? (
                                    <div className="p-6 text-center text-muted-foreground">
                                        No executions yet
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="text-xs text-muted-foreground border-b border-white/5">
                                                    <th className="text-left p-3">Time</th>
                                                    <th className="text-left p-3">Symbol</th>
                                                    <th className="text-left p-3">Action</th>
                                                    <th className="text-right p-3">Amount</th>
                                                    <th className="text-right p-3">Wallets</th>
                                                    <th className="text-right p-3">Avg Price</th>
                                                    <th className="text-right p-3">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {executions.map((exec) => (
                                                    <tr key={exec.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                                                        <td className="p-3 text-sm text-muted-foreground">
                                                            {new Date(exec.executedAt).toLocaleTimeString()}
                                                        </td>
                                                        <td className="p-3 font-medium">{exec.symbol}</td>
                                                        <td className="p-3">
                                                            <span className={cn(
                                                                "px-2 py-0.5 rounded text-xs",
                                                                exec.action === 'buy' ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                                                            )}>
                                                                {exec.action.toUpperCase()}
                                                            </span>
                                                        </td>
                                                        <td className="p-3 text-right font-mono">${exec.totalAmount.toFixed(2)}</td>
                                                        <td className="p-3 text-right">{exec.walletsUsed}</td>
                                                        <td className="p-3 text-right font-mono">${exec.avgPrice.toFixed(4)}</td>
                                                        <td className="p-3 text-right">
                                                            <span className={cn(
                                                                "px-2 py-0.5 rounded text-xs",
                                                                exec.status === 'completed' ? "bg-green-500/20 text-green-400" :
                                                                exec.status === 'failed' ? "bg-red-500/20 text-red-400" :
                                                                "bg-yellow-500/20 text-yellow-400"
                                                            )}>
                                                                {exec.status}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md h-full flex items-center justify-center min-h-[500px]">
                            <div className="text-center text-muted-foreground">
                                <Network className="w-16 h-16 mx-auto mb-4 opacity-50" />
                                <h3 className="text-lg font-medium mb-2">No Swarm Selected</h3>
                                <p className="text-sm">Create or select a swarm to view details</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Create Swarm Modal */}
            <AnimatePresence>
                {showCreateSwarm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
                        onClick={() => setShowCreateSwarm(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-background border border-white/10 rounded-xl p-6 w-full max-w-md"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold">Create Swarm</h2>
                                <button
                                    onClick={() => setShowCreateSwarm(false)}
                                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">Swarm Name</label>
                                    <input
                                        type="text"
                                        value={newSwarm.name}
                                        onChange={(e) => setNewSwarm({ ...newSwarm, name: e.target.value })}
                                        placeholder="My Trading Swarm"
                                        className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-primary outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">Strategy</label>
                                    <select
                                        value={newSwarm.strategy}
                                        onChange={(e) => setNewSwarm({ ...newSwarm, strategy: e.target.value })}
                                        className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-primary outline-none"
                                    >
                                        <option value="coordinated_buy">Coordinated Buy</option>
                                        <option value="coordinated_sell">Coordinated Sell</option>
                                        <option value="copy_trading">Copy Trading</option>
                                        <option value="arbitrage">Arbitrage</option>
                                        <option value="dca">DCA (Dollar Cost Average)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">
                                        Max Wallets: {newSwarm.maxWallets}
                                    </label>
                                    <input
                                        type="range"
                                        min="2"
                                        max="20"
                                        value={newSwarm.maxWallets}
                                        onChange={(e) => setNewSwarm({ ...newSwarm, maxWallets: parseInt(e.target.value) })}
                                        className="w-full accent-primary"
                                    />
                                </div>

                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">Total Budget (USD)</label>
                                    <input
                                        type="number"
                                        value={newSwarm.totalBudget}
                                        onChange={(e) => setNewSwarm({ ...newSwarm, totalBudget: parseFloat(e.target.value) || 0 })}
                                        className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-primary outline-none font-mono"
                                    />
                                </div>

                                <div className="p-4 rounded-lg bg-white/5 space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Per Wallet Allocation</span>
                                        <span className="font-mono">${(newSwarm.totalBudget / newSwarm.maxWallets).toFixed(2)}</span>
                                    </div>
                                </div>

                                <button
                                    onClick={createSwarm}
                                    className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
                                >
                                    Create Swarm
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
