"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Target, Clock, DollarSign, RefreshCw, ChevronRight, Award, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface Bounty {
    id: string;
    question: string;
    description?: string;
    reward: { amount: number; token: string };
    poster_wallet: string;
    status: string;
    difficulty: string;
    tags: string[];
    deadline: string;
    created_at: string;
}

export default function BountiesTab() {
    const [bounties, setBounties] = useState<Bounty[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'open' | 'claimed'>('all');

    useEffect(() => {
        loadBounties();
    }, [filter]);

    const loadBounties = async () => {
        setLoading(true);
        try {
            const params: { status?: string } = {};
            if (filter !== 'all') params.status = filter;
            const response = await api.getBounties(params);
            if (response.success && response.data) {
                setBounties(response.data.bounties as Bounty[]);
            }
        } catch (error) {
            console.error('Failed to load bounties:', error);
        } finally {
            setLoading(false);
        }
    };

    const getDifficultyColor = (difficulty: string) => {
        switch (difficulty.toLowerCase()) {
            case 'easy': return 'text-green-400 bg-green-500/10';
            case 'medium': return 'text-yellow-400 bg-yellow-500/10';
            case 'hard': return 'text-orange-400 bg-orange-500/10';
            case 'expert': return 'text-red-400 bg-red-500/10';
            default: return 'text-gray-400 bg-gray-500/10';
        }
    };

    const getStatusColor = (status: string) => {
        switch (status.toLowerCase()) {
            case 'open': return 'text-green-400 bg-green-500/10';
            case 'claimed': return 'text-blue-400 bg-blue-500/10';
            case 'completed': return 'text-purple-400 bg-purple-500/10';
            case 'expired': return 'text-gray-400 bg-gray-500/10';
            default: return 'text-gray-400 bg-gray-500/10';
        }
    };

    const formatDeadline = (deadline: string) => {
        const date = new Date(deadline);
        const now = new Date();
        const diff = date.getTime() - now.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        if (days < 0) return 'Expired';
        if (days === 0) return 'Today';
        if (days === 1) return '1 day left';
        return `${days} days left`;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                    OSINT bounties and intelligence rewards
                </div>
                <div className="flex gap-2">
                    <div className="flex rounded-lg border border-white/10 overflow-hidden">
                        {(['all', 'open', 'claimed'] as const).map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={cn(
                                    "px-3 py-1.5 text-sm capitalize",
                                    filter === f ? "bg-primary text-primary-foreground" : "hover:bg-white/5"
                                )}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                    <button onClick={loadBounties} className="p-2 rounded-lg border border-white/10 hover:bg-white/5">
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Bounties List */}
            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : bounties.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                    <Target className="w-12 h-12 mb-4 opacity-50" />
                    <p>No bounties available</p>
                    <p className="text-sm">Check back later for new opportunities</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {bounties.map((bounty) => (
                        <motion.div
                            key={bounty.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors cursor-pointer group"
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className={cn(
                                            "px-2 py-0.5 rounded text-xs font-medium",
                                            getStatusColor(bounty.status)
                                        )}>
                                            {bounty.status}
                                        </span>
                                        <span className={cn(
                                            "px-2 py-0.5 rounded text-xs font-medium",
                                            getDifficultyColor(bounty.difficulty)
                                        )}>
                                            {bounty.difficulty}
                                        </span>
                                    </div>
                                    <h3 className="font-semibold text-lg mb-1">{bounty.question}</h3>
                                    {bounty.description && (
                                        <p className="text-sm text-muted-foreground line-clamp-2">{bounty.description}</p>
                                    )}
                                </div>
                                <div className="text-right">
                                    <div className="flex items-center gap-1 text-green-400 font-bold">
                                        <DollarSign className="w-4 h-4" />
                                        {bounty.reward.amount} {bounty.reward.token}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-1 mb-3">
                                {bounty.tags.slice(0, 4).map(tag => (
                                    <span key={tag} className="px-2 py-0.5 rounded-full bg-white/5 text-xs">
                                        {tag}
                                    </span>
                                ))}
                            </div>

                            <div className="flex justify-between items-center pt-3 border-t border-white/5">
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {formatDeadline(bounty.deadline)}
                                    </span>
                                </div>
                                <button className="flex items-center gap-1 text-sm text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                                    View Details
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Info Banner */}
            <div className="flex items-start gap-3 p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
                <Award className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                    <h4 className="font-medium text-blue-400 mb-1">Earn rewards for intelligence</h4>
                    <p className="text-sm text-muted-foreground">
                        Complete bounties by providing accurate market intelligence, wallet analysis, or on-chain research.
                        Rewards are paid in crypto upon successful verification.
                    </p>
                </div>
            </div>
        </div>
    );
}
