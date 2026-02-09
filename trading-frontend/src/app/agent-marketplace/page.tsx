"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Store, Search, Star, Users, Zap, DollarSign, Shield, Clock,
    RefreshCw, ChevronDown, MessageSquare, CheckCircle, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCustomWalletModal } from "@/components/providers/CustomWalletModalProvider";

interface Agent {
    id: string;
    name: string;
    description: string;
    capabilities: string[];
    pricePerCall: number;
    subscriptionPrice: number;
    reputation: number;
    totalCalls: number;
    successRate: number;
    avgResponseTime: number;
    status: string;
    createdAt: number;
}

interface AgentSubscription {
    id: string;
    agentId: string;
    subscriberWallet: string;
    tier: string;
    pricePerMonth: number;
    callsThisMonth: number;
    callsIncluded: number;
    status: string;
    expiresAt: number;
}

interface NetworkStats {
    totalAgents: number;
    activeAgents: number;
    totalCalls: number;
    totalVolume: number;
    avgResponseTime: number;
}

const CAPABILITY_COLORS: Record<string, string> = {
    'trading': 'bg-green-500/20 text-green-400',
    'analysis': 'bg-blue-500/20 text-blue-400',
    'research': 'bg-purple-500/20 text-purple-400',
    'signals': 'bg-orange-500/20 text-orange-400',
    'execution': 'bg-red-500/20 text-red-400',
    'data': 'bg-cyan-500/20 text-cyan-400',
};

export default function AgentMarketplacePage() {
    const { publicKey, connected } = useWallet();
    const { setVisible } = useCustomWalletModal();
    const [agents, setAgents] = useState<Agent[]>([]);
    const [subscriptions, setSubscriptions] = useState<AgentSubscription[]>([]);
    const [stats, setStats] = useState<NetworkStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCapability, setSelectedCapability] = useState<string | null>(null);
    const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
    const [showHireModal, setShowHireModal] = useState(false);

    const wallet = connected && publicKey ? publicKey.toBase58() : null;

    useEffect(() => {
        if (wallet) {
            loadData();
        } else {
            setLoading(false);
        }
    }, [wallet, searchQuery, selectedCapability]);

    const loadData = async () => {
        if (!wallet) return;
        setLoading(true);
        try {
            const [agentsRes, subsRes, statsRes] = await Promise.all([
                api.discoverAgents({
                    capabilities: selectedCapability ? [selectedCapability] : undefined,
                    status: 'active',
                }),
                api.get('/agent-network/subscriptions', { wallet }),
                api.getAgentNetworkStats(),
            ]);

            if (agentsRes.success) {
                let filteredAgents = agentsRes.data || [];
                if (searchQuery) {
                    filteredAgents = filteredAgents.filter((a: Agent) =>
                        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        a.description.toLowerCase().includes(searchQuery.toLowerCase())
                    );
                }
                setAgents(filteredAgents);
            }
            if (subsRes.success) setSubscriptions(subsRes.data || []);
            if (statsRes.success) setStats(statsRes.data);
        } catch (error) {
            console.error('Error loading marketplace data:', error);
        } finally {
            setLoading(false);
        }
    };

    const subscribeToAgent = async (agentId: string, tier: string) => {
        if (!wallet) {
            setVisible(true);
            return;
        }
        try {
            const result = await api.subscribeToAgent(agentId, wallet, tier);
            if (result.success) {
                setShowHireModal(false);
                setSelectedAgent(null);
                loadData();
            }
        } catch (error) {
            console.error('Error subscribing to agent:', error);
        }
    };

    const hireAgent = async (agentId: string) => {
        if (!wallet) {
            setVisible(true);
            return;
        }
        try {
            const result = await api.hireAgent(agentId, wallet, {
                description: 'One-time task',
                input: {},
            });
            if (result.success) {
                setShowHireModal(false);
                setSelectedAgent(null);
            }
        } catch (error) {
            console.error('Error hiring agent:', error);
        }
    };

    const isSubscribed = (agentId: string) => {
        return subscriptions.some(s => s.agentId === agentId && s.status === 'active');
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3">
                        <Store className="w-7 h-7 text-primary" />
                        Agent Marketplace
                    </h1>
                    <p className="text-muted-foreground">
                        Discover and hire AI agents via ClawdNet A2A protocol
                    </p>
                </div>
                <button
                    onClick={loadData}
                    className="p-2 rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
                >
                    <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-5 gap-4">
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <Users className="w-4 h-4" />
                        Total Agents
                    </div>
                    <div className="text-2xl font-bold">{stats?.totalAgents || 0}</div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <Zap className="w-4 h-4" />
                        Active Now
                    </div>
                    <div className="text-2xl font-bold text-green-400">{stats?.activeAgents || 0}</div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <MessageSquare className="w-4 h-4" />
                        Total Calls
                    </div>
                    <div className="text-2xl font-bold">{(stats?.totalCalls || 0).toLocaleString()}</div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <DollarSign className="w-4 h-4" />
                        Total Volume
                    </div>
                    <div className="text-2xl font-bold font-mono">${(stats?.totalVolume || 0).toLocaleString()}</div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <Clock className="w-4 h-4" />
                        Avg Response
                    </div>
                    <div className="text-2xl font-bold">{(stats?.avgResponseTime || 0).toFixed(0)}ms</div>
                </div>
            </div>

            {/* Search & Filters */}
            <div className="flex gap-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search agents by name or description..."
                        className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-primary outline-none"
                    />
                </div>
                <div className="flex gap-2">
                    {['trading', 'analysis', 'research', 'signals', 'execution', 'data'].map((cap) => (
                        <button
                            key={cap}
                            onClick={() => setSelectedCapability(selectedCapability === cap ? null : cap)}
                            className={cn(
                                "px-3 py-2 rounded-lg text-sm font-medium transition-colors capitalize",
                                selectedCapability === cap
                                    ? CAPABILITY_COLORS[cap] || "bg-white/10 text-white"
                                    : "bg-white/5 text-muted-foreground hover:bg-white/10"
                            )}
                        >
                            {cap}
                        </button>
                    ))}
                </div>
            </div>

            {/* Agent Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {loading ? (
                    <div className="col-span-3 p-8 text-center text-muted-foreground">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                        Loading agents...
                    </div>
                ) : agents.length === 0 ? (
                    <div className="col-span-3 p-8 text-center text-muted-foreground">
                        <Store className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No agents found
                        <p className="text-sm mt-1">Try adjusting your search or filters</p>
                    </div>
                ) : (
                    agents.map((agent) => (
                        <motion.div
                            key={agent.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md overflow-hidden hover:border-white/10 transition-colors"
                        >
                            <div className="p-4">
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <h3 className="font-bold text-lg">{agent.name}</h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <div className="flex items-center gap-1">
                                                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                                <span className="text-sm">{agent.reputation.toFixed(1)}</span>
                                            </div>
                                            <span className="text-xs text-muted-foreground">|</span>
                                            <span className="text-xs text-muted-foreground">
                                                {agent.totalCalls.toLocaleString()} calls
                                            </span>
                                        </div>
                                    </div>
                                    {isSubscribed(agent.id) && (
                                        <span className="px-2 py-1 rounded bg-green-500/20 text-green-400 text-xs flex items-center gap-1">
                                            <CheckCircle className="w-3 h-3" />
                                            Subscribed
                                        </span>
                                    )}
                                </div>

                                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                                    {agent.description}
                                </p>

                                <div className="flex flex-wrap gap-1 mb-4">
                                    {agent.capabilities.map((cap) => (
                                        <span
                                            key={cap}
                                            className={cn(
                                                "px-2 py-0.5 rounded text-xs capitalize",
                                                CAPABILITY_COLORS[cap] || "bg-white/10 text-white"
                                            )}
                                        >
                                            {cap}
                                        </span>
                                    ))}
                                </div>

                                <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                                    <div className="p-2 rounded bg-white/5">
                                        <div className="text-xs text-muted-foreground">Success</div>
                                        <div className="font-medium text-green-400">{(agent.successRate * 100).toFixed(0)}%</div>
                                    </div>
                                    <div className="p-2 rounded bg-white/5">
                                        <div className="text-xs text-muted-foreground">Response</div>
                                        <div className="font-medium">{agent.avgResponseTime}ms</div>
                                    </div>
                                    <div className="p-2 rounded bg-white/5">
                                        <div className="text-xs text-muted-foreground">Per Call</div>
                                        <div className="font-medium font-mono">${agent.pricePerCall.toFixed(3)}</div>
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            setSelectedAgent(agent);
                                            setShowHireModal(true);
                                        }}
                                        className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                                    >
                                        Hire Agent
                                    </button>
                                    <button
                                        onClick={() => subscribeToAgent(agent.id, 'basic')}
                                        disabled={isSubscribed(agent.id)}
                                        className={cn(
                                            "flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
                                            isSubscribed(agent.id)
                                                ? "bg-white/5 text-muted-foreground cursor-not-allowed"
                                                : "bg-white/10 text-white hover:bg-white/20"
                                        )}
                                    >
                                        Subscribe
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ))
                )}
            </div>

            {/* My Subscriptions */}
            {subscriptions.length > 0 && (
                <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md overflow-hidden">
                    <div className="p-4 border-b border-white/5 bg-white/[0.02]">
                        <h2 className="font-semibold">My Subscriptions</h2>
                    </div>
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {subscriptions.map((sub) => {
                            const agent = agents.find(a => a.id === sub.agentId);
                            return (
                                <div key={sub.id} className="p-4 rounded-lg bg-white/5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-medium">{agent?.name || 'Unknown Agent'}</span>
                                        <span className={cn(
                                            "px-2 py-0.5 rounded text-xs",
                                            sub.status === 'active' ? "bg-green-500/20 text-green-400" :
                                            "bg-gray-500/20 text-gray-400"
                                        )}>
                                            {sub.status}
                                        </span>
                                    </div>
                                    <div className="text-sm text-muted-foreground space-y-1">
                                        <div className="flex justify-between">
                                            <span>Tier</span>
                                            <span className="capitalize">{sub.tier}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Calls Used</span>
                                            <span>{sub.callsThisMonth} / {sub.callsIncluded}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Expires</span>
                                            <span>{new Date(sub.expiresAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Hire Modal */}
            <AnimatePresence>
                {showHireModal && selectedAgent && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
                        onClick={() => setShowHireModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-background border border-white/10 rounded-xl p-6 w-full max-w-md"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold">Hire {selectedAgent.name}</h2>
                                <button
                                    onClick={() => setShowHireModal(false)}
                                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="p-4 rounded-lg bg-white/5">
                                    <p className="text-sm text-muted-foreground mb-3">{selectedAgent.description}</p>
                                    <div className="flex flex-wrap gap-1">
                                        {selectedAgent.capabilities.map((cap) => (
                                            <span
                                                key={cap}
                                                className={cn(
                                                    "px-2 py-0.5 rounded text-xs capitalize",
                                                    CAPABILITY_COLORS[cap] || "bg-white/10"
                                                )}
                                            >
                                                {cap}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="font-medium">Pricing</h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => hireAgent(selectedAgent.id)}
                                            className="p-4 rounded-lg border border-white/10 hover:border-primary/50 transition-colors text-left"
                                        >
                                            <div className="text-sm text-muted-foreground">Pay Per Call</div>
                                            <div className="text-xl font-bold font-mono">${selectedAgent.pricePerCall.toFixed(3)}</div>
                                            <div className="text-xs text-muted-foreground mt-1">One-time task</div>
                                        </button>
                                        <button
                                            onClick={() => subscribeToAgent(selectedAgent.id, 'basic')}
                                            className="p-4 rounded-lg border border-primary/50 bg-primary/10 hover:bg-primary/20 transition-colors text-left"
                                        >
                                            <div className="text-sm text-muted-foreground">Monthly Sub</div>
                                            <div className="text-xl font-bold font-mono">${selectedAgent.subscriptionPrice.toFixed(2)}</div>
                                            <div className="text-xs text-muted-foreground mt-1">Unlimited calls</div>
                                        </button>
                                    </div>
                                </div>

                                <div className="p-4 rounded-lg bg-white/5 flex items-center gap-3">
                                    <Shield className="w-5 h-5 text-green-400" />
                                    <div className="text-sm">
                                        <div className="font-medium">Protected by ClawdNet</div>
                                        <div className="text-muted-foreground text-xs">
                                            Reputation staking and dispute resolution included
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
