"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Play, Pause, Settings, Cpu, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface Agent {
    id: string;
    name: string;
    type: string;
    status: string;
    pnl: number;
    trades: number;
    winRate: number;
}

export default function AgentsTab() {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchAgents = async () => {
        try {
            const response = await api.getAgents();
            if (response.success && response.data) {
                setAgents(response.data.map(a => ({
                    id: a.id, name: a.name, type: a.type, status: a.status,
                    pnl: a.performance?.totalPnL || 0, trades: a.performance?.totalTrades || 0, winRate: a.performance?.winRate || 0,
                })));
            }
        } catch (error) {
            console.error('Failed to fetch agents:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAgents();
        const interval = setInterval(fetchAgents, 15000);
        return () => clearInterval(interval);
    }, []);

    const handleToggleStatus = async (agentId: string, currentStatus: string) => {
        const newStatus = currentStatus === 'active' ? 'paused' : 'active';
        try {
            const response = await api.updateAgentStatus(agentId, newStatus);
            if (response.success) {
                setAgents(prev => prev.map(a => a.id === agentId ? { ...a, status: newStatus } : a));
            }
        } catch (error) {
            console.error('Failed to update agent status:', error);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground">
                    <Plus className="w-4 h-4" />
                    New Agent
                </button>
            </div>

            {agents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <Cpu className="w-12 h-12 mb-4 opacity-50" />
                    <p>No agents deployed yet</p>
                    <p className="text-sm mt-1">Click "New Agent" to create your first agent</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {agents.map((agent, i) => (
                        <motion.div
                            key={agent.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="p-6 rounded-2xl border border-border/60 bg-card hover:border-primary/20 transition-all"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex gap-3 items-center">
                                    <div className={cn(
                                        "w-10 h-10 rounded-xl flex items-center justify-center border",
                                        agent.status === 'active' ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-muted/50 border-border text-muted-foreground"
                                    )}>
                                        <Cpu className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold">{agent.name}</h3>
                                        <span className={cn(
                                            "text-xs px-1.5 py-0.5 rounded",
                                            agent.status === 'active' ? "text-green-400 bg-green-900/30" : "text-muted-foreground bg-muted"
                                        )}>
                                            {agent.status}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-baseline justify-between mb-4">
                                <div>
                                    <div className="text-xs text-muted-foreground mb-1">Net PnL</div>
                                    <div className={cn("text-2xl font-bold", agent.pnl >= 0 ? "text-green-400" : "text-red-400")}>
                                        {agent.pnl >= 0 ? "+" : ""}${agent.pnl.toLocaleString()}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs text-muted-foreground mb-1">Win Rate</div>
                                    <div className="text-lg font-bold">{agent.winRate}%</div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleToggleStatus(agent.id, agent.status)}
                                    className={cn(
                                        "flex-1 h-9 rounded-lg flex items-center justify-center gap-2 text-sm font-medium",
                                        agent.status === 'active' ? "bg-white/5 hover:bg-white/10" : "bg-primary text-primary-foreground"
                                    )}
                                >
                                    {agent.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                                    {agent.status === 'active' ? "Pause" : "Start"}
                                </button>
                                <button className="h-9 w-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/50">
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
