"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Store, Star, Users, RefreshCw, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface NetworkAgent {
    agentId: string;
    name: string;
    description: string;
    capabilities: string[];
    reputation: number;
    pricePerCall: number;
    status: string;
}

export default function MarketplaceTab() {
    const [agents, setAgents] = useState<NetworkAgent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadAgents();
    }, []);

    const loadAgents = async () => {
        setLoading(true);
        try {
            const response = await api.discoverAgents({ limit: 20 });
            if (response.success) {
                setAgents((response.data || []) as NetworkAgent[]);
            }
        } catch (error) {
            console.error('Failed to load agents:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                    Discover and hire specialized agents from the ClawdNet network
                </div>
                <button onClick={loadAgents} className="p-2 rounded-lg border border-white/10 hover:bg-white/5">
                    <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : agents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                    <Store className="w-12 h-12 mb-4 opacity-50" />
                    <p>No agents available in marketplace</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {agents.map((agent) => (
                        <motion.div
                            key={agent.agentId}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                        >
                            <div className="flex justify-between items-start mb-3">
                                <h3 className="font-semibold">{agent.name}</h3>
                                <span className={cn(
                                    "px-2 py-0.5 rounded text-xs",
                                    agent.status === 'online' ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"
                                )}>
                                    {agent.status}
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{agent.description}</p>
                            <div className="flex flex-wrap gap-1 mb-3">
                                {agent.capabilities.slice(0, 3).map((cap) => (
                                    <span key={cap} className="px-2 py-0.5 rounded-full bg-white/5 text-xs">{cap}</span>
                                ))}
                            </div>
                            <div className="flex justify-between items-center pt-3 border-t border-white/5">
                                <div className="flex items-center gap-1">
                                    <Star className="w-3 h-3 text-yellow-400" />
                                    <span className="text-sm">{agent.reputation.toFixed(1)}</span>
                                </div>
                                <span className="text-sm font-mono">${agent.pricePerCall}/call</span>
                            </div>
                            <button className="w-full mt-3 py-2 rounded-lg bg-primary/10 text-primary text-sm hover:bg-primary/20 transition-colors">
                                Hire Agent
                            </button>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}
