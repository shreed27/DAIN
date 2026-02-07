"use client";

import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, Activity, Timer, Wallet, Layers, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:4000';

interface Order {
    id: string;
    price: number;
    size: number;
    total: number;
    type: "bid" | "ask";
    depth: number;
}

interface Trade {
    id: string;
    time: string;
    price: number;
    size: number;
    side: "buy" | "sell";
}

export default function ExecutionTab() {
    const [bids, setBids] = useState<Order[]>([]);
    const [asks, setAsks] = useState<Order[]>([]);
    const [trades, setTrades] = useState<Trade[]>([]);
    const [price, setPrice] = useState(145.20);
    const [connected, setConnected] = useState(false);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        const socket = io(GATEWAY_URL, {
            transports: ['websocket', 'polling'],
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            setConnected(true);
            socket.emit('subscribe', ['market', 'execution']);
        });

        socket.on('disconnect', () => {
            setConnected(false);
        });

        socket.on('price_update', (data: { data: { price?: number } }) => {
            if (data.data?.price) {
                setPrice(data.data.price);
            }
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    useEffect(() => {
        const generateBook = () => {
            const newBids = Array.from({ length: 15 }).map((_, i) => ({
                id: `bid-${i}`,
                price: price - (i * 0.05) - (Math.random() * 0.02),
                size: Math.random() * 10,
                total: Math.random() * 100,
                type: "bid" as const,
                depth: Math.random() * 60 + 10
            }));
            const newAsks = Array.from({ length: 15 }).map((_, i) => ({
                id: `ask-${i}`,
                price: price + (i * 0.05) + (Math.random() * 0.02),
                size: Math.random() * 10,
                total: Math.random() * 100,
                type: "ask" as const,
                depth: Math.random() * 60 + 10
            }));
            setBids(newBids);
            setAsks(newAsks.reverse());
        };

        generateBook();
        const interval = setInterval(generateBook, 1500);
        return () => clearInterval(interval);
    }, [price]);

    useEffect(() => {
        const interval = setInterval(() => {
            const isBuy = Math.random() > 0.5;
            const newTrade = {
                id: Math.random().toString(36),
                time: new Date().toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
                price: price + (Math.random() - 0.5) * 0.1,
                size: Math.random() * 5,
                side: isBuy ? "buy" : "sell" as "buy" | "sell"
            };
            setTrades(prev => [newTrade, ...prev].slice(0, 20));
            setPrice(p => p + (Math.random() - 0.5) * 0.05);
        }, 400);
        return () => clearInterval(interval);
    }, [price]);

    return (
        <div className="h-[calc(100vh-16rem)] flex flex-col gap-6">
            {/* Top Stats Bar */}
            <div className="flex items-center gap-6 p-4 rounded-xl border border-white/5 bg-white/[0.02] backdrop-blur-sm">
                <div className="flex items-center gap-3 pr-6 border-r border-white/5">
                    <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center",
                        connected ? "bg-blue-500/10 text-blue-400" : "bg-orange-500/10 text-orange-400"
                    )}>
                        <Activity className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground uppercase">Market Status</div>
                        <div className="font-bold text-white flex items-center gap-2">
                            {connected ? 'Connected' : 'Connecting...'}
                            <span className={cn(
                                "w-2 h-2 rounded-full",
                                connected ? "bg-green-500 animate-pulse" : "bg-orange-500"
                            )} />
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3 pr-6 border-r border-white/5">
                    <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                        <Timer className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground uppercase">Avg Latency</div>
                        <div className="font-bold text-white font-mono">12.4ms</div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400">
                        <Layers className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground uppercase">Order Depth</div>
                        <div className="font-bold text-white">$2.4M</div>
                    </div>
                </div>
                <div className="ml-auto text-right">
                    <div className="text-2xl font-bold font-mono tracking-tight">${price.toFixed(2)}</div>
                    <div className="text-xs text-green-400 font-mono">+2.4% (24h)</div>
                </div>
            </div>

            <div className="flex flex-1 gap-6 overflow-hidden">
                {/* Order Book */}
                <div className="w-80 flex flex-col rounded-xl border border-white/5 bg-black/40 backdrop-blur-md overflow-hidden">
                    <div className="p-3 border-b border-white/5 bg-white/[0.02] font-semibold text-sm">Order Book</div>
                    <div className="flex text-xs text-muted-foreground px-4 py-2 border-b border-white/5">
                        <span className="w-20">Price</span>
                        <span className="w-20 text-right">Size</span>
                        <span className="flex-1 text-right">Total</span>
                    </div>

                    <div className="flex-1 overflow-hidden flex flex-col">
                        <div className="flex-1 overflow-hidden flex flex-col justify-end pb-1">
                            {asks.map((ask) => (
                                <div key={ask.id} className="relative flex text-xs font-mono py-0.5 px-4 hover:bg-white/5">
                                    <div className="absolute top-0 right-0 bottom-0 bg-red-500/10 transition-all duration-300" style={{ width: `${ask.depth}%` }} />
                                    <span className="w-20 text-red-400 relative z-10">{ask.price.toFixed(2)}</span>
                                    <span className="w-20 text-white/70 text-right relative z-10">{ask.size.toFixed(2)}</span>
                                    <span className="flex-1 text-white/40 text-right relative z-10">{ask.total.toFixed(0)}</span>
                                </div>
                            ))}
                        </div>

                        <div className="py-2 px-4 border-y border-white/5 bg-white/[0.02] text-center font-bold font-mono text-lg flex items-center justify-center gap-2">
                            {price.toFixed(2)} <Activity className="w-3 h-3 text-blue-400" />
                        </div>

                        <div className="flex-1 overflow-hidden pt-1">
                            {bids.map((bid) => (
                                <div key={bid.id} className="relative flex text-xs font-mono py-0.5 px-4 hover:bg-white/5">
                                    <div className="absolute top-0 right-0 bottom-0 bg-green-500/10 transition-all duration-300" style={{ width: `${bid.depth}%` }} />
                                    <span className="w-20 text-green-400 relative z-10">{bid.price.toFixed(2)}</span>
                                    <span className="w-20 text-white/70 text-right relative z-10">{bid.size.toFixed(2)}</span>
                                    <span className="flex-1 text-white/40 text-right relative z-10">{bid.total.toFixed(0)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Main Chart Area */}
                <div className="flex-1 rounded-xl border border-white/5 bg-black/40 backdrop-blur-md flex flex-col relative overflow-hidden">
                    <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20" />
                    <div className="p-3 border-b border-white/5 mx-4 flex justify-between items-center relative z-10">
                        <span className="font-semibold text-sm">SOL/USDC Execution Map</span>
                        <div className="flex gap-2">
                            <button className="px-2 py-1 text-xs rounded bg-white/10 text-white">1m</button>
                            <button className="px-2 py-1 text-xs rounded hover:bg-white/5 text-muted-foreground">5m</button>
                            <button className="px-2 py-1 text-xs rounded hover:bg-white/5 text-muted-foreground">15m</button>
                        </div>
                    </div>
                    <div className="flex-1 flex items-center justify-center relative z-10">
                        <div className="text-center opacity-50">
                            <Activity className="w-12 h-12 mx-auto mb-4 text-blue-400 animate-pulse" />
                            <p className="font-mono text-xl">Live Execution Stream</p>
                            <p className="text-sm text-muted-foreground mt-2">Visualizing High-Frequency Ticks</p>
                        </div>
                    </div>
                </div>

                {/* Live Trades */}
                <div className="w-64 flex flex-col rounded-xl border border-white/5 bg-black/40 backdrop-blur-md overflow-hidden">
                    <div className="p-3 border-b border-white/5 bg-white/[0.02] font-semibold text-sm">Recent Trades</div>
                    <div className="flex text-xs text-muted-foreground px-3 py-2 border-b border-white/5">
                        <span className="w-16">Time</span>
                        <span className="w-16">Price</span>
                        <span className="flex-1 text-right">Size</span>
                    </div>
                    <div className="flex-1 overflow-auto scrollbar-hide">
                        {trades.map((trade) => (
                            <motion.div
                                key={trade.id}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="flex text-xs font-mono py-1 px-3 hover:bg-white/5"
                            >
                                <span className="w-16 text-muted-foreground">{trade.time.split(" ")[0]}</span>
                                <span className={cn("w-16", trade.side === 'buy' ? "text-green-400" : "text-red-400")}>
                                    {trade.price.toFixed(2)}
                                </span>
                                <span className="flex-1 text-right text-white/70">{trade.size.toFixed(4)}</span>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
