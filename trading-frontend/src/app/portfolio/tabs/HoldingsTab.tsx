"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis } from "recharts";
import { Wallet, TrendingUp, TrendingDown, Loader2, ChevronDown, BarChart3 } from "lucide-react";
import { PriceHistoryChart } from "@/components/charts/PriceHistoryChart";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { PieChart as PieChartIcon } from "lucide-react";

interface PortfolioData {
    totalValue: number;
    totalPnL: number;
    pnlPercent: number;
}

interface HoldingData {
    name: string;
    value: number;
    color: string;
    amount: number;
    usdValue: number;
}

interface Position {
    id: string;
    token: string;
    tokenSymbol: string;
    side: string;
    amount: number;
    entryPrice: number;
    currentPrice: number;
    unrealizedPnL: number;
    openedAt?: number;
}

const COLORS = ["#9945FF", "#2775CA", "#F7931A", "#627EEA", "#22c55e", "#f59e0b", "#ec4899", "#8b5cf6"];

export default function HoldingsTab() {
    const [loading, setLoading] = useState(true);
    const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
    const [holdings, setHoldings] = useState<HoldingData[]>([]);
    const [positions, setPositions] = useState<Position[]>([]);
    const [performanceData, setPerformanceData] = useState<Array<{ name: string; value: number }>>([]);
    const [expandedPosition, setExpandedPosition] = useState<string | null>(null);

    useEffect(() => {
        async function fetchData() {
            try {
                const positionsResponse = await api.getPositions();
                if (positionsResponse.success && positionsResponse.data) {
                    const { positions: posData, summary } = positionsResponse.data;
                    setPositions(posData as Position[]);
                    setPortfolio({
                        totalValue: summary.totalValue,
                        totalPnL: summary.totalUnrealizedPnL,
                        pnlPercent: summary.totalValue > 0
                            ? (summary.totalUnrealizedPnL / summary.totalValue) * 100
                            : 0,
                    });
                }

                const holdingsResponse = await api.getHoldings();
                if (holdingsResponse.success && holdingsResponse.data) {
                    const totalValue = holdingsResponse.data.reduce((acc, h) => acc + h.value, 0) || 1;
                    const holdingsData = holdingsResponse.data.map((h, i) => ({
                        name: h.symbol,
                        value: Math.round((h.value / totalValue) * 100),
                        color: COLORS[i % COLORS.length],
                        amount: h.amount,
                        usdValue: h.value,
                    }));
                    setHoldings(holdingsData);
                }

                const totalVal = portfolio?.totalValue || 10000;
                const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                const perfData = days.map((name, i) => ({
                    name,
                    value: totalVal * (0.85 + (i * 0.025) + Math.random() * 0.05),
                }));
                setPerformanceData(perfData);

            } catch (error) {
                console.error('Failed to fetch portfolio data:', error);
            } finally {
                setLoading(false);
            }
        }

        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, []);

    const formatTimeAgo = (timestamp?: number) => {
        if (!timestamp) return 'Recently';
        const diff = Date.now() - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'Just now';
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Total Balance Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="lg:col-span-2 p-6 rounded-2xl border border-white/5 bg-gradient-to-br from-blue-900/10 to-purple-900/10 backdrop-blur-md relative overflow-hidden"
                >
                    {loading ? (
                        <div className="h-80 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <>
                            <div className="relative z-10 flex justify-between items-start mb-6">
                                <div>
                                    <p className="text-muted-foreground font-medium mb-1">Total Balance Estimate</p>
                                    <h2 className="text-4xl font-bold tracking-tight text-white">
                                        ${(portfolio?.totalValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </h2>
                                    <div className={cn(
                                        "flex items-center gap-2 mt-2 font-medium",
                                        (portfolio?.totalPnL || 0) >= 0 ? "text-green-400" : "text-red-400"
                                    )}>
                                        {(portfolio?.totalPnL || 0) >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                                        {(portfolio?.pnlPercent || 0) >= 0 ? "+" : ""}{(portfolio?.pnlPercent || 0).toFixed(1)}% (${Math.abs(portfolio?.totalPnL || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                        <span className="text-muted-foreground text-sm font-normal">unrealized</span>
                                    </div>
                                </div>
                                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                                    <Wallet className="w-6 h-6 text-white" />
                                </div>
                            </div>

                            <div className="h-64 w-full -ml-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={performanceData}>
                                        <defs>
                                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#8884d8" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#666', fontSize: 12 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#666', fontSize: 12 }} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#000', border: '1px solid #333' }}
                                            labelStyle={{ color: '#888' }}
                                        />
                                        <Area type="monotone" dataKey="value" stroke="#8884d8" fillOpacity={1} fill="url(#colorValue)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </>
                    )}
                </motion.div>

                {/* Allocation Donut */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="p-6 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-md flex flex-col"
                >
                    <h3 className="font-semibold mb-6 flex items-center gap-2">
                        <PieChartIcon className="w-4 h-4 text-purple-400" /> Asset Allocation
                    </h3>
                    {loading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : holdings.length > 0 ? (
                        <>
                            <div className="flex-1 min-h-[200px] relative">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={holdings}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {holdings.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(0,0,0,0.2)" />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #333', borderRadius: '8px' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                    <div className="text-center">
                                        <div className="text-xs text-muted-foreground">Top Asset</div>
                                        <div className="font-bold text-lg text-white">{holdings[0]?.name || '-'}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3 mt-4">
                                {holdings.map((asset) => (
                                    <div key={asset.name} className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: asset.color }} />
                                            <span className="text-muted-foreground">{asset.name}</span>
                                        </div>
                                        <span className="font-medium text-white">{asset.value}%</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                            No holdings found
                        </div>
                    )}
                </motion.div>

                {/* Open Positions Table */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="lg:col-span-3 p-6 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-md"
                >
                    <h3 className="font-semibold mb-6">Open Positions</h3>
                    {loading ? (
                        <div className="h-48 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : positions.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-muted-foreground uppercase border-b border-white/5">
                                    <tr>
                                        <th className="px-4 py-3 font-medium">Side</th>
                                        <th className="px-4 py-3 font-medium">Asset</th>
                                        <th className="px-4 py-3 font-medium">Amount</th>
                                        <th className="px-4 py-3 font-medium">Entry Price</th>
                                        <th className="px-4 py-3 font-medium">Current Price</th>
                                        <th className="px-4 py-3 font-medium">PnL</th>
                                        <th className="px-4 py-3 font-medium text-right">Opened</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {positions.map((pos) => (
                                        <React.Fragment key={pos.id}>
                                            <tr
                                                className="hover:bg-white/[0.02] transition-colors cursor-pointer"
                                                onClick={() => setExpandedPosition(expandedPosition === pos.id ? null : pos.id)}
                                            >
                                                <td className="px-4 py-3">
                                                    <span className={cn(
                                                        "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                                        pos.side === 'long' ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                                                    )}>
                                                        {pos.side}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 font-medium text-white">
                                                    <span className="flex items-center gap-2">
                                                        {pos.tokenSymbol}
                                                        <BarChart3 className="w-3 h-3 text-muted-foreground" />
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-muted-foreground">{pos.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                                                <td className="px-4 py-3 text-muted-foreground">${pos.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</td>
                                                <td className="px-4 py-3 text-muted-foreground">${pos.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</td>
                                                <td className="px-4 py-3">
                                                    <span className={cn(
                                                        "flex items-center gap-1",
                                                        pos.unrealizedPnL >= 0 ? "text-green-400" : "text-red-400"
                                                    )}>
                                                        {pos.unrealizedPnL >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                                        {pos.unrealizedPnL >= 0 ? "+" : ""}${pos.unrealizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right text-muted-foreground text-xs flex items-center justify-end gap-2">
                                                    {formatTimeAgo(pos.openedAt)}
                                                    <ChevronDown className={cn(
                                                        "w-4 h-4 transition-transform",
                                                        expandedPosition === pos.id && "rotate-180"
                                                    )} />
                                                </td>
                                            </tr>
                                            {expandedPosition === pos.id && (
                                                <tr key={`${pos.id}-chart`}>
                                                    <td colSpan={7} className="px-4 py-4 bg-white/[0.01]">
                                                        <PriceHistoryChart
                                                            token={pos.token}
                                                            tokenSymbol={pos.tokenSymbol}
                                                            height={250}
                                                            showStats={true}
                                                        />
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="h-48 flex items-center justify-center text-muted-foreground">
                            No open positions
                        </div>
                    )}
                </motion.div>
            </div>
        </div>
    );
}
