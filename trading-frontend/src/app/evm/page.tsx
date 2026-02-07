"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Layers, ArrowLeftRight, Wallet, Plus, RefreshCw, ExternalLink,
    Clock, CheckCircle, AlertTriangle, ChevronDown, X, DollarSign
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface EVMChain {
    id: string;
    name: string;
    chainId: number;
    rpcUrl: string;
    explorerUrl: string;
    nativeCurrency: string;
    color: string;
}

interface EVMWallet {
    id: string;
    evmAddress: string;
    chain: string;
    label: string;
    isPrimary: boolean;
    createdAt: number;
}

interface EVMBalance {
    id: string;
    evmAddress: string;
    chain: string;
    tokenSymbol: string;
    tokenAddress: string;
    balance: string;
    balanceUsd: number;
}

interface BridgeTransaction {
    id: string;
    sourceChain: string;
    targetChain: string;
    tokenSymbol: string;
    amount: number;
    amountUsd: number;
    status: string;
    sourceTxHash: string;
    targetTxHash: string;
    estimatedArrival: number;
    createdAt: number;
}

interface SwapQuote {
    tokenIn: string;
    tokenOut: string;
    amountIn: number;
    amountOut: number;
    priceImpact: number;
    route: string[];
    estimatedGas: number;
    protocol: string;
}

const CHAINS: EVMChain[] = [
    { id: 'ethereum', name: 'Ethereum', chainId: 1, rpcUrl: '', explorerUrl: 'https://etherscan.io', nativeCurrency: 'ETH', color: '#627eea' },
    { id: 'base', name: 'Base', chainId: 8453, rpcUrl: '', explorerUrl: 'https://basescan.org', nativeCurrency: 'ETH', color: '#0052ff' },
    { id: 'arbitrum', name: 'Arbitrum', chainId: 42161, rpcUrl: '', explorerUrl: 'https://arbiscan.io', nativeCurrency: 'ETH', color: '#28a0f0' },
    { id: 'polygon', name: 'Polygon', chainId: 137, rpcUrl: '', explorerUrl: 'https://polygonscan.com', nativeCurrency: 'MATIC', color: '#8247e5' },
    { id: 'optimism', name: 'Optimism', chainId: 10, rpcUrl: '', explorerUrl: 'https://optimistic.etherscan.io', nativeCurrency: 'ETH', color: '#ff0420' },
    { id: 'bsc', name: 'BNB Chain', chainId: 56, rpcUrl: '', explorerUrl: 'https://bscscan.com', nativeCurrency: 'BNB', color: '#f0b90b' },
    { id: 'avalanche', name: 'Avalanche', chainId: 43114, rpcUrl: '', explorerUrl: 'https://snowtrace.io', nativeCurrency: 'AVAX', color: '#e84142' },
];

export default function EVMPage() {
    const [selectedChain, setSelectedChain] = useState<EVMChain>(CHAINS[0]);
    const [wallets, setWallets] = useState<EVMWallet[]>([]);
    const [balances, setBalances] = useState<EVMBalance[]>([]);
    const [bridges, setBridges] = useState<BridgeTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddWallet, setShowAddWallet] = useState(false);
    const [showBridge, setShowBridge] = useState(false);
    const [showSwap, setShowSwap] = useState(false);

    // Forms
    const [newWalletAddress, setNewWalletAddress] = useState('');
    const [newWalletLabel, setNewWalletLabel] = useState('');

    const [bridgeForm, setBridgeForm] = useState({
        sourceChain: 'ethereum',
        targetChain: 'base',
        token: 'ETH',
        amount: 0.1,
    });

    const [swapForm, setSwapForm] = useState({
        tokenIn: 'ETH',
        tokenOut: 'USDC',
        amountIn: 0.1,
    });
    const [swapQuote, setSwapQuote] = useState<SwapQuote | null>(null);

    const userWallet = "demo-wallet";

    useEffect(() => {
        loadData();
    }, [selectedChain]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [walletsRes, balancesRes, bridgesRes] = await Promise.all([
                api.getEVMWallets(userWallet, selectedChain.id),
                api.getEVMBalances(userWallet, selectedChain.id),
                api.get('/evm/bridge', { wallet: userWallet }),
            ]);

            if (walletsRes.success) setWallets(walletsRes.data || []);
            if (balancesRes.success) setBalances(balancesRes.data || []);
            if (bridgesRes.success) setBridges(bridgesRes.data || []);
        } catch (error) {
            console.error('Error loading EVM data:', error);
        } finally {
            setLoading(false);
        }
    };

    const addWallet = async () => {
        if (!newWalletAddress) return;

        try {
            await api.post('/evm/wallets', {
                userWallet,
                evmAddress: newWalletAddress,
                chain: selectedChain.id,
                label: newWalletLabel || 'My Wallet',
                isPrimary: wallets.length === 0,
            });
            setShowAddWallet(false);
            setNewWalletAddress('');
            setNewWalletLabel('');
            loadData();
        } catch (error) {
            console.error('Error adding wallet:', error);
        }
    };

    const getSwapQuote = async () => {
        try {
            const result = await api.getEVMSwapQuote(
                selectedChain.id,
                swapForm.tokenIn,
                swapForm.tokenOut,
                swapForm.amountIn
            );
            if (result.success) {
                setSwapQuote(result.data);
            }
        } catch (error) {
            console.error('Error getting quote:', error);
        }
    };

    const executeSwap = async () => {
        if (!swapQuote || wallets.length === 0) return;

        try {
            await api.executeEVMSwap({
                userWallet,
                evmAddress: wallets[0].evmAddress,
                chain: selectedChain.id,
                tokenIn: swapForm.tokenIn,
                tokenOut: swapForm.tokenOut,
                amountIn: swapForm.amountIn,
                slippage: 0.5,
            });
            setShowSwap(false);
            setSwapQuote(null);
            loadData();
        } catch (error) {
            console.error('Error executing swap:', error);
        }
    };

    const initiateBridge = async () => {
        if (wallets.length === 0) return;

        try {
            await api.initiateBridge({
                userWallet,
                sourceChain: bridgeForm.sourceChain,
                targetChain: bridgeForm.targetChain,
                sourceAddress: wallets[0].evmAddress,
                targetAddress: wallets[0].evmAddress,
                tokenSymbol: bridgeForm.token,
                amount: bridgeForm.amount,
            });
            setShowBridge(false);
            loadData();
        } catch (error) {
            console.error('Error initiating bridge:', error);
        }
    };

    const totalBalance = balances.reduce((sum, b) => sum + b.balanceUsd, 0);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3">
                        <Layers className="w-7 h-7 text-primary" />
                        EVM Bridge & Swap
                    </h1>
                    <p className="text-muted-foreground">
                        Multi-chain EVM operations and cross-chain bridging
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
                        onClick={() => setShowAddWallet(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Add Wallet
                    </button>
                </div>
            </div>

            {/* Chain Selector */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                {CHAINS.map((chain) => (
                    <button
                        key={chain.id}
                        onClick={() => setSelectedChain(chain)}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                            selectedChain.id === chain.id
                                ? "text-white border"
                                : "bg-white/5 text-muted-foreground hover:bg-white/10"
                        )}
                        style={{
                            backgroundColor: selectedChain.id === chain.id ? `${chain.color}20` : undefined,
                            borderColor: selectedChain.id === chain.id ? `${chain.color}50` : undefined,
                        }}
                    >
                        <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: chain.color }}
                        />
                        {chain.name}
                    </button>
                ))}
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-4 gap-4">
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <Wallet className="w-4 h-4" />
                        Connected Wallets
                    </div>
                    <div className="text-2xl font-bold">{wallets.length}</div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <DollarSign className="w-4 h-4" />
                        Total Balance
                    </div>
                    <div className="text-2xl font-bold font-mono">${totalBalance.toLocaleString()}</div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <ArrowLeftRight className="w-4 h-4" />
                        Active Bridges
                    </div>
                    <div className="text-2xl font-bold">
                        {bridges.filter(b => b.status === 'initiated' || b.status === 'pending').length}
                    </div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <Layers className="w-4 h-4" />
                        Current Chain
                    </div>
                    <div className="text-2xl font-bold" style={{ color: selectedChain.color }}>
                        {selectedChain.name}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                {/* Wallets & Balances */}
                <div className="space-y-4">
                    {/* Wallets */}
                    <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md overflow-hidden">
                        <div className="p-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                            <h2 className="font-semibold">Wallets on {selectedChain.name}</h2>
                        </div>
                        {wallets.length === 0 ? (
                            <div className="p-6 text-center text-muted-foreground">
                                <Wallet className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                No wallets connected
                                <p className="text-sm mt-1">Add an EVM wallet to get started</p>
                            </div>
                        ) : (
                            <div className="p-4 space-y-3">
                                {wallets.map((w) => (
                                    <div key={w.id} className="p-3 rounded-lg bg-white/5 flex items-center justify-between">
                                        <div>
                                            <div className="font-medium flex items-center gap-2">
                                                {w.label}
                                                {w.isPrimary && (
                                                    <span className="px-1.5 py-0.5 rounded text-xs bg-primary/20 text-primary">
                                                        Primary
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-muted-foreground font-mono">
                                                {w.evmAddress.slice(0, 10)}...{w.evmAddress.slice(-8)}
                                            </div>
                                        </div>
                                        <a
                                            href={`${selectedChain.explorerUrl}/address/${w.evmAddress}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-2 rounded hover:bg-white/10 transition-colors"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                        </a>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Balances */}
                    <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md overflow-hidden">
                        <div className="p-4 border-b border-white/5 bg-white/[0.02]">
                            <h2 className="font-semibold">Token Balances</h2>
                        </div>
                        {balances.length === 0 ? (
                            <div className="p-6 text-center text-muted-foreground">
                                No balances found
                            </div>
                        ) : (
                            <div className="p-4 space-y-2">
                                {balances.map((b) => (
                                    <div key={b.id} className="flex items-center justify-between py-2">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs">
                                                {b.tokenSymbol.slice(0, 2)}
                                            </div>
                                            <div>
                                                <div className="font-medium">{b.tokenSymbol}</div>
                                                <div className="text-xs text-muted-foreground font-mono">
                                                    {parseFloat(b.balance).toFixed(6)}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-mono">${b.balanceUsd.toFixed(2)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="space-y-4">
                    {/* Quick Actions */}
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => setShowSwap(true)}
                            className="p-6 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors text-left"
                        >
                            <ArrowLeftRight className="w-8 h-8 text-blue-400 mb-3" />
                            <div className="font-semibold mb-1">Swap Tokens</div>
                            <div className="text-sm text-muted-foreground">
                                Swap tokens via DEX aggregators
                            </div>
                        </button>
                        <button
                            onClick={() => setShowBridge(true)}
                            className="p-6 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors text-left"
                        >
                            <Layers className="w-8 h-8 text-purple-400 mb-3" />
                            <div className="font-semibold mb-1">Bridge Assets</div>
                            <div className="text-sm text-muted-foreground">
                                Cross-chain bridging via Wormhole
                            </div>
                        </button>
                    </div>

                    {/* Bridge History */}
                    <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md overflow-hidden">
                        <div className="p-4 border-b border-white/5 bg-white/[0.02]">
                            <h2 className="font-semibold">Bridge Transactions</h2>
                        </div>
                        {bridges.length === 0 ? (
                            <div className="p-6 text-center text-muted-foreground">
                                No bridge transactions
                            </div>
                        ) : (
                            <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
                                {bridges.map((b) => (
                                    <div key={b.id} className="p-3 rounded-lg bg-white/5">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2 text-sm">
                                                <span className="capitalize">{b.sourceChain}</span>
                                                <ArrowLeftRight className="w-3 h-3" />
                                                <span className="capitalize">{b.targetChain}</span>
                                            </div>
                                            <span className={cn(
                                                "px-2 py-0.5 rounded text-xs",
                                                b.status === 'completed' ? "bg-green-500/20 text-green-400" :
                                                b.status === 'failed' ? "bg-red-500/20 text-red-400" :
                                                "bg-yellow-500/20 text-yellow-400"
                                            )}>
                                                {b.status}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="font-mono">{b.amount} {b.tokenSymbol}</span>
                                            <span className="text-muted-foreground">
                                                {new Date(b.createdAt).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Add Wallet Modal */}
            <AnimatePresence>
                {showAddWallet && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
                        onClick={() => setShowAddWallet(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-background border border-white/10 rounded-xl p-6 w-full max-w-md"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold">Add EVM Wallet</h2>
                                <button
                                    onClick={() => setShowAddWallet(false)}
                                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">Chain</label>
                                    <div
                                        className="px-4 py-2 rounded-lg border flex items-center gap-2"
                                        style={{ borderColor: `${selectedChain.color}50`, backgroundColor: `${selectedChain.color}10` }}
                                    >
                                        <div
                                            className="w-4 h-4 rounded-full"
                                            style={{ backgroundColor: selectedChain.color }}
                                        />
                                        {selectedChain.name}
                                    </div>
                                </div>

                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">Wallet Address</label>
                                    <input
                                        type="text"
                                        value={newWalletAddress}
                                        onChange={(e) => setNewWalletAddress(e.target.value)}
                                        placeholder="0x..."
                                        className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-primary outline-none font-mono"
                                    />
                                </div>

                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">Label (optional)</label>
                                    <input
                                        type="text"
                                        value={newWalletLabel}
                                        onChange={(e) => setNewWalletLabel(e.target.value)}
                                        placeholder="My Trading Wallet"
                                        className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-primary outline-none"
                                    />
                                </div>

                                <button
                                    onClick={addWallet}
                                    disabled={!newWalletAddress}
                                    className={cn(
                                        "w-full py-3 rounded-lg font-medium transition-colors",
                                        newWalletAddress
                                            ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                            : "bg-white/10 text-muted-foreground cursor-not-allowed"
                                    )}
                                >
                                    Add Wallet
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Swap Modal */}
            <AnimatePresence>
                {showSwap && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
                        onClick={() => setShowSwap(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-background border border-white/10 rounded-xl p-6 w-full max-w-md"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold">Swap Tokens</h2>
                                <button
                                    onClick={() => setShowSwap(false)}
                                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">From</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="number"
                                            value={swapForm.amountIn}
                                            onChange={(e) => setSwapForm({ ...swapForm, amountIn: parseFloat(e.target.value) || 0 })}
                                            className="flex-1 px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-primary outline-none font-mono"
                                        />
                                        <select
                                            value={swapForm.tokenIn}
                                            onChange={(e) => setSwapForm({ ...swapForm, tokenIn: e.target.value })}
                                            className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 outline-none"
                                        >
                                            <option value="ETH">ETH</option>
                                            <option value="USDC">USDC</option>
                                            <option value="USDT">USDT</option>
                                            <option value="WBTC">WBTC</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="flex justify-center">
                                    <ArrowLeftRight className="w-5 h-5 text-muted-foreground rotate-90" />
                                </div>

                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">To</label>
                                    <div className="flex gap-2">
                                        <div className="flex-1 px-4 py-2 rounded-lg bg-white/5 border border-white/10 font-mono">
                                            {swapQuote ? swapQuote.amountOut.toFixed(6) : '0.00'}
                                        </div>
                                        <select
                                            value={swapForm.tokenOut}
                                            onChange={(e) => setSwapForm({ ...swapForm, tokenOut: e.target.value })}
                                            className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 outline-none"
                                        >
                                            <option value="USDC">USDC</option>
                                            <option value="ETH">ETH</option>
                                            <option value="USDT">USDT</option>
                                            <option value="WBTC">WBTC</option>
                                        </select>
                                    </div>
                                </div>

                                <button
                                    onClick={getSwapQuote}
                                    className="w-full py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                                >
                                    Get Quote
                                </button>

                                {swapQuote && (
                                    <div className="p-4 rounded-lg bg-white/5 space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Price Impact</span>
                                            <span className={swapQuote.priceImpact > 1 ? "text-yellow-400" : ""}>
                                                {swapQuote.priceImpact.toFixed(2)}%
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Est. Gas</span>
                                            <span>{swapQuote.estimatedGas.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Protocol</span>
                                            <span>{swapQuote.protocol}</span>
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={executeSwap}
                                    disabled={!swapQuote || wallets.length === 0}
                                    className={cn(
                                        "w-full py-3 rounded-lg font-medium transition-colors",
                                        swapQuote && wallets.length > 0
                                            ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                            : "bg-white/10 text-muted-foreground cursor-not-allowed"
                                    )}
                                >
                                    {wallets.length === 0 ? 'Add Wallet First' : 'Execute Swap'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Bridge Modal */}
            <AnimatePresence>
                {showBridge && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
                        onClick={() => setShowBridge(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-background border border-white/10 rounded-xl p-6 w-full max-w-md"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold">Bridge Assets</h2>
                                <button
                                    onClick={() => setShowBridge(false)}
                                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm text-muted-foreground mb-2 block">From Chain</label>
                                        <select
                                            value={bridgeForm.sourceChain}
                                            onChange={(e) => setBridgeForm({ ...bridgeForm, sourceChain: e.target.value })}
                                            className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 outline-none"
                                        >
                                            {CHAINS.map((c) => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-sm text-muted-foreground mb-2 block">To Chain</label>
                                        <select
                                            value={bridgeForm.targetChain}
                                            onChange={(e) => setBridgeForm({ ...bridgeForm, targetChain: e.target.value })}
                                            className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 outline-none"
                                        >
                                            {CHAINS.map((c) => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">Token</label>
                                    <select
                                        value={bridgeForm.token}
                                        onChange={(e) => setBridgeForm({ ...bridgeForm, token: e.target.value })}
                                        className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 outline-none"
                                    >
                                        <option value="ETH">ETH</option>
                                        <option value="USDC">USDC</option>
                                        <option value="USDT">USDT</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">Amount</label>
                                    <input
                                        type="number"
                                        value={bridgeForm.amount}
                                        onChange={(e) => setBridgeForm({ ...bridgeForm, amount: parseFloat(e.target.value) || 0 })}
                                        className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-primary outline-none font-mono"
                                    />
                                </div>

                                <div className="p-4 rounded-lg bg-white/5 space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Bridge Protocol</span>
                                        <span>Wormhole</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Est. Time</span>
                                        <span>~15 minutes</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Network Fee</span>
                                        <span>~$5-10</span>
                                    </div>
                                </div>

                                <button
                                    onClick={initiateBridge}
                                    disabled={wallets.length === 0 || bridgeForm.sourceChain === bridgeForm.targetChain}
                                    className={cn(
                                        "w-full py-3 rounded-lg font-medium transition-colors",
                                        wallets.length > 0 && bridgeForm.sourceChain !== bridgeForm.targetChain
                                            ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                            : "bg-white/10 text-muted-foreground cursor-not-allowed"
                                    )}
                                >
                                    {wallets.length === 0 ? 'Add Wallet First' :
                                     bridgeForm.sourceChain === bridgeForm.targetChain ? 'Select Different Chains' :
                                     'Initiate Bridge'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
