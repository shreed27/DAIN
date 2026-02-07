"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeftRight, RefreshCw, Plus, Wallet, ExternalLink, CheckCircle, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface EVMWallet {
    id: string;
    evmAddress: string;
    chain: string;
    label?: string;
    isPrimary: boolean;
}

interface BridgeTransaction {
    id: string;
    sourceChain: string;
    targetChain: string;
    tokenSymbol: string;
    amount: number;
    status: string;
    createdAt: number;
    txHash?: string;
}

interface Chain {
    id: string;
    name: string;
    icon?: string;
    nativeCurrency: string;
}

export default function EVMBridgeTab() {
    const [wallets, setWallets] = useState<EVMWallet[]>([]);
    const [transactions, setTransactions] = useState<BridgeTransaction[]>([]);
    const [chains, setChains] = useState<Chain[]>([]);
    const [loading, setLoading] = useState(true);
    const wallet = "demo-wallet";

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [walletsRes, txRes, chainsRes] = await Promise.all([
                api.getEVMWallets(wallet),
                api.getBridgeTransactions(wallet, { limit: 20 }),
                api.getSupportedChains(),
            ]);

            if (walletsRes.success) setWallets((walletsRes.data || []) as EVMWallet[]);
            if (txRes.success) setTransactions((txRes.data || []) as BridgeTransaction[]);
            if (chainsRes.success) setChains((chainsRes.data || []) as Chain[]);
        } catch (error) {
            console.error('Failed to load EVM data:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status.toLowerCase()) {
            case 'completed': return <CheckCircle className="w-4 h-4 text-green-400" />;
            case 'pending': return <Clock className="w-4 h-4 text-yellow-400 animate-pulse" />;
            case 'failed': return <XCircle className="w-4 h-4 text-red-400" />;
            default: return <Clock className="w-4 h-4 text-gray-400" />;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status.toLowerCase()) {
            case 'completed': return 'text-green-400 bg-green-500/10';
            case 'pending': return 'text-yellow-400 bg-yellow-500/10';
            case 'failed': return 'text-red-400 bg-red-500/10';
            default: return 'text-gray-400 bg-gray-500/10';
        }
    };

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                    Bridge assets between Solana and EVM chains
                </div>
                <div className="flex gap-2">
                    <button onClick={loadData} className="p-2 rounded-lg border border-white/10 hover:bg-white/5">
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground">
                        <ArrowLeftRight className="w-4 h-4" />
                        New Bridge
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <>
                    {/* Connected Wallets */}
                    <div className="rounded-xl border border-white/5 bg-black/40 overflow-hidden">
                        <div className="p-4 border-b border-white/5 bg-white/[0.02] flex justify-between items-center">
                            <h3 className="font-semibold flex items-center gap-2">
                                <Wallet className="w-4 h-4 text-blue-400" />
                                Connected EVM Wallets
                            </h3>
                            <button className="flex items-center gap-1 text-sm text-primary hover:underline">
                                <Plus className="w-4 h-4" />
                                Add Wallet
                            </button>
                        </div>
                        <div className="p-4">
                            {wallets.length === 0 ? (
                                <div className="text-center text-muted-foreground py-8">
                                    <Wallet className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    <p>No EVM wallets connected</p>
                                    <p className="text-sm">Add a wallet to start bridging</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {wallets.map((w) => (
                                        <div
                                            key={w.id}
                                            className={cn(
                                                "p-4 rounded-lg border transition-colors",
                                                w.isPrimary ? "border-primary/50 bg-primary/5" : "border-white/5 bg-white/[0.02]"
                                            )}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="text-xs px-2 py-0.5 rounded bg-white/10 uppercase">{w.chain}</span>
                                                {w.isPrimary && (
                                                    <span className="text-xs text-primary">Primary</span>
                                                )}
                                            </div>
                                            <p className="font-mono text-sm truncate">{w.evmAddress}</p>
                                            {w.label && <p className="text-xs text-muted-foreground mt-1">{w.label}</p>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Supported Chains */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {chains.map((chain) => (
                            <motion.div
                                key={chain.id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors text-center"
                            >
                                <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-white/10 flex items-center justify-center">
                                    <span className="text-lg">{chain.icon || '🔗'}</span>
                                </div>
                                <p className="font-medium text-sm">{chain.name}</p>
                                <p className="text-xs text-muted-foreground">{chain.nativeCurrency}</p>
                            </motion.div>
                        ))}
                    </div>

                    {/* Bridge History */}
                    <div className="rounded-xl border border-white/5 bg-black/40 overflow-hidden">
                        <div className="p-4 border-b border-white/5 bg-white/[0.02] font-semibold">
                            Bridge History
                        </div>
                        {transactions.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground">
                                <ArrowLeftRight className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p>No bridge transactions yet</p>
                            </div>
                        ) : (
                            <table className="w-full">
                                <thead>
                                    <tr className="text-xs text-muted-foreground border-b border-white/5">
                                        <th className="text-left p-4">Time</th>
                                        <th className="text-left p-4">Route</th>
                                        <th className="text-right p-4">Amount</th>
                                        <th className="text-center p-4">Status</th>
                                        <th className="text-right p-4">TX</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {transactions.map((tx) => (
                                        <motion.tr
                                            key={tx.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="border-b border-white/5 hover:bg-white/[0.02]"
                                        >
                                            <td className="p-4 text-sm text-muted-foreground">
                                                {formatTime(tx.createdAt)}
                                            </td>
                                            <td className="p-4">
                                                <span className="flex items-center gap-2">
                                                    <span className="px-2 py-0.5 rounded bg-white/10 text-xs uppercase">{tx.sourceChain}</span>
                                                    <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
                                                    <span className="px-2 py-0.5 rounded bg-white/10 text-xs uppercase">{tx.targetChain}</span>
                                                </span>
                                            </td>
                                            <td className="p-4 text-right font-mono">
                                                {tx.amount} {tx.tokenSymbol}
                                            </td>
                                            <td className="p-4">
                                                <span className={cn(
                                                    "flex items-center justify-center gap-1 px-2 py-1 rounded text-xs",
                                                    getStatusColor(tx.status)
                                                )}>
                                                    {getStatusIcon(tx.status)}
                                                    {tx.status}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right">
                                                {tx.txHash && (
                                                    <a
                                                        href={`https://etherscan.io/tx/${tx.txHash}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-primary hover:underline text-sm flex items-center justify-end gap-1"
                                                    >
                                                        View
                                                        <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                )}
                                            </td>
                                        </motion.tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
