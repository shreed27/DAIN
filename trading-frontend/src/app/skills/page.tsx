"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Sparkles, Search, Star, Play, Clock, DollarSign, CheckCircle,
    RefreshCw, Heart, Filter, X, Zap, Code, BarChart3, Database, Wallet
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCustomWalletModal } from "@/components/providers/CustomWalletModalProvider";

interface Skill {
    id: string;
    name: string;
    displayName: string;
    description: string;
    category: string;
    subcategory: string;
    version: string;
    costPerCall: number;
    avgExecutionTimeMs: number;
    totalExecutions: number;
    successRate: number;
    enabled: boolean;
}

interface SkillExecution {
    id: string;
    skillId: string;
    skillName: string;
    input: string;
    output: string;
    status: string;
    executionTimeMs: number;
    cost: number;
    createdAt: number;
}

interface SkillStats {
    totalExecutions: number;
    totalCost: number;
    avgExecutionTime: number;
    favoriteCount: number;
}

const CATEGORY_ICONS: Record<string, any> = {
    trading: Zap,
    analysis: BarChart3,
    data: Database,
    defi: DollarSign,
    automation: Play,
    research: Search,
};

const CATEGORY_COLORS: Record<string, string> = {
    trading: 'text-green-400 bg-green-500/20',
    analysis: 'text-blue-400 bg-blue-500/20',
    data: 'text-cyan-400 bg-cyan-500/20',
    defi: 'text-purple-400 bg-purple-500/20',
    automation: 'text-orange-400 bg-orange-500/20',
    research: 'text-yellow-400 bg-yellow-500/20',
};

export default function SkillsPage() {
    const { publicKey, connected } = useWallet();
    const { setVisible } = useCustomWalletModal();
    const [skills, setSkills] = useState<Skill[]>([]);
    const [skillsByCategory, setSkillsByCategory] = useState<Record<string, Skill[]>>({});
    const [executions, setExecutions] = useState<SkillExecution[]>([]);
    const [favorites, setFavorites] = useState<string[]>([]);
    const [stats, setStats] = useState<SkillStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
    const [showExecuteModal, setShowExecuteModal] = useState(false);
    const [executeInput, setExecuteInput] = useState('');
    const [executing, setExecuting] = useState(false);

    const wallet = connected && publicKey ? publicKey.toBase58() : null;

    useEffect(() => {
        loadData();
    }, [wallet]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [skillsRes, byCategoryRes, execsRes, favsRes, statsRes] = await Promise.all([
                api.getSkills({ enabled: true }),
                api.getSkillsByCategory(),
                wallet ? api.get('/skills/executions/wallet/' + wallet, { limit: 20 }) : Promise.resolve({ success: true, data: [] }),
                wallet ? api.getFavoriteSkills(wallet) : Promise.resolve({ success: true, data: [] }),
                wallet ? api.get('/skills/stats/' + wallet, {}) : Promise.resolve({ success: true, data: null }),
            ]);

            if (skillsRes.success) setSkills(skillsRes.data || []);
            if (byCategoryRes.success) setSkillsByCategory(byCategoryRes.data || {});
            if (execsRes.success) setExecutions(execsRes.data || []);
            if (favsRes.success) setFavorites((favsRes.data || []).map((f: any) => f.skillId));
            if (statsRes.success) setStats(statsRes.data);
        } catch (error) {
            console.error('Error loading skills data:', error);
        } finally {
            setLoading(false);
        }
    };

    const executeSkill = async () => {
        if (!selectedSkill || !wallet) return;

        setExecuting(true);
        try {
            let parsedInput = {};
            try {
                parsedInput = JSON.parse(executeInput || '{}');
            } catch (e) {
                parsedInput = { query: executeInput };
            }

            const result = await api.executeSkill(selectedSkill.id, wallet, parsedInput);
            if (result.success) {
                setShowExecuteModal(false);
                setSelectedSkill(null);
                setExecuteInput('');
                loadData();
            }
        } catch (error) {
            console.error('Error executing skill:', error);
        } finally {
            setExecuting(false);
        }
    };

    const toggleFavorite = async (skillId: string) => {
        if (!wallet) return;
        try {
            if (favorites.includes(skillId)) {
                await api.delete(`/skills/favorites/${wallet}/${skillId}`);
                setFavorites(favorites.filter(id => id !== skillId));
            } else {
                await api.post('/skills/favorites', { userWallet: wallet, skillId });
                setFavorites([...favorites, skillId]);
            }
        } catch (error) {
            console.error('Error toggling favorite:', error);
        }
    };

    const filteredSkills = skills.filter(skill => {
        const matchesSearch = !searchQuery ||
            skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            skill.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            skill.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = !selectedCategory || skill.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    const categories = Object.keys(skillsByCategory);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3">
                        <Sparkles className="w-7 h-7 text-primary" />
                        Skills Library
                    </h1>
                    <p className="text-muted-foreground">
                        Execute AI-powered skills for trading, analysis, and automation
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
            <div className="grid grid-cols-4 gap-4">
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <Sparkles className="w-4 h-4" />
                        Available Skills
                    </div>
                    <div className="text-2xl font-bold">{skills.length}</div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <Play className="w-4 h-4" />
                        Total Executions
                    </div>
                    <div className="text-2xl font-bold">{stats?.totalExecutions || 0}</div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <DollarSign className="w-4 h-4" />
                        Total Cost
                    </div>
                    <div className="text-2xl font-bold font-mono">${(stats?.totalCost || 0).toFixed(4)}</div>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <Heart className="w-4 h-4" />
                        Favorites
                    </div>
                    <div className="text-2xl font-bold">{favorites.length}</div>
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
                        placeholder="Search skills..."
                        className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-primary outline-none"
                    />
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setSelectedCategory(null)}
                        className={cn(
                            "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                            !selectedCategory
                                ? "bg-primary text-primary-foreground"
                                : "bg-white/5 text-muted-foreground hover:bg-white/10"
                        )}
                    >
                        All
                    </button>
                    {categories.map((cat) => {
                        const Icon = CATEGORY_ICONS[cat] || Sparkles;
                        return (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                                className={cn(
                                    "px-3 py-2 rounded-lg text-sm font-medium transition-colors capitalize flex items-center gap-2",
                                    selectedCategory === cat
                                        ? CATEGORY_COLORS[cat] || "bg-white/10 text-white"
                                        : "bg-white/5 text-muted-foreground hover:bg-white/10"
                                )}
                            >
                                <Icon className="w-4 h-4" />
                                {cat}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Skills Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {loading ? (
                    <div className="col-span-3 p-8 text-center text-muted-foreground">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                        Loading skills...
                    </div>
                ) : filteredSkills.length === 0 ? (
                    <div className="col-span-3 p-8 text-center text-muted-foreground">
                        <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No skills found
                        <p className="text-sm mt-1">Try adjusting your search or filters</p>
                    </div>
                ) : (
                    filteredSkills.map((skill) => (
                        <motion.div
                            key={skill.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md overflow-hidden hover:border-white/10 transition-colors"
                        >
                            <div className="p-4">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold">{skill.displayName}</h3>
                                            <span className="text-xs text-muted-foreground">v{skill.version}</span>
                                        </div>
                                        <span className={cn(
                                            "px-2 py-0.5 rounded text-xs capitalize inline-block mt-1",
                                            CATEGORY_COLORS[skill.category] || "bg-white/10"
                                        )}>
                                            {skill.category}
                                            {skill.subcategory && ` / ${skill.subcategory}`}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => toggleFavorite(skill.id)}
                                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                                    >
                                        <Heart className={cn(
                                            "w-4 h-4",
                                            favorites.includes(skill.id)
                                                ? "text-red-400 fill-red-400"
                                                : "text-muted-foreground"
                                        )} />
                                    </button>
                                </div>

                                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                                    {skill.description}
                                </p>

                                <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                                    <div className="p-2 rounded bg-white/5">
                                        <div className="text-xs text-muted-foreground">Cost</div>
                                        <div className="font-mono text-sm">${skill.costPerCall.toFixed(4)}</div>
                                    </div>
                                    <div className="p-2 rounded bg-white/5">
                                        <div className="text-xs text-muted-foreground">Avg Time</div>
                                        <div className="text-sm">{skill.avgExecutionTimeMs}ms</div>
                                    </div>
                                    <div className="p-2 rounded bg-white/5">
                                        <div className="text-xs text-muted-foreground">Success</div>
                                        <div className="text-sm text-green-400">{(skill.successRate * 100).toFixed(0)}%</div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => {
                                        setSelectedSkill(skill);
                                        setShowExecuteModal(true);
                                    }}
                                    className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Play className="w-4 h-4" />
                                    Execute
                                </button>
                            </div>
                        </motion.div>
                    ))
                )}
            </div>

            {/* Recent Executions */}
            {executions.length > 0 && (
                <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md overflow-hidden">
                    <div className="p-4 border-b border-white/5 bg-white/[0.02]">
                        <h2 className="font-semibold">Recent Executions</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-xs text-muted-foreground border-b border-white/5">
                                    <th className="text-left p-4">Time</th>
                                    <th className="text-left p-4">Skill</th>
                                    <th className="text-right p-4">Duration</th>
                                    <th className="text-right p-4">Cost</th>
                                    <th className="text-right p-4">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {executions.map((exec) => (
                                    <tr key={exec.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                                        <td className="p-4 text-sm text-muted-foreground">
                                            {new Date(exec.createdAt).toLocaleTimeString()}
                                        </td>
                                        <td className="p-4">
                                            <div className="font-medium">{exec.skillName || 'Unknown'}</div>
                                        </td>
                                        <td className="p-4 text-right font-mono">{exec.executionTimeMs}ms</td>
                                        <td className="p-4 text-right font-mono">${exec.cost.toFixed(4)}</td>
                                        <td className="p-4 text-right">
                                            <span className={cn(
                                                "px-2 py-1 rounded text-xs",
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
                </div>
            )}

            {/* Execute Modal */}
            <AnimatePresence>
                {showExecuteModal && selectedSkill && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
                        onClick={() => setShowExecuteModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-background border border-white/10 rounded-xl p-6 w-full max-w-lg"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h2 className="text-xl font-bold">{selectedSkill.displayName}</h2>
                                    <span className={cn(
                                        "px-2 py-0.5 rounded text-xs capitalize",
                                        CATEGORY_COLORS[selectedSkill.category] || "bg-white/10"
                                    )}>
                                        {selectedSkill.category}
                                    </span>
                                </div>
                                <button
                                    onClick={() => setShowExecuteModal(false)}
                                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <p className="text-sm text-muted-foreground">{selectedSkill.description}</p>

                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">Input (JSON or text)</label>
                                    <textarea
                                        value={executeInput}
                                        onChange={(e) => setExecuteInput(e.target.value)}
                                        placeholder='{"query": "What is the current price of SOL?"}'
                                        className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 focus:border-primary outline-none font-mono text-sm resize-none h-32"
                                    />
                                </div>

                                <div className="p-4 rounded-lg bg-white/5 flex items-center justify-between">
                                    <div className="text-sm">
                                        <div className="text-muted-foreground">Estimated Cost</div>
                                        <div className="font-mono font-bold">${selectedSkill.costPerCall.toFixed(4)}</div>
                                    </div>
                                    <div className="text-sm text-right">
                                        <div className="text-muted-foreground">Avg Time</div>
                                        <div className="font-mono">{selectedSkill.avgExecutionTimeMs}ms</div>
                                    </div>
                                </div>

                                <button
                                    onClick={executeSkill}
                                    disabled={executing}
                                    className={cn(
                                        "w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2",
                                        executing
                                            ? "bg-white/10 text-muted-foreground cursor-not-allowed"
                                            : "bg-primary text-primary-foreground hover:bg-primary/90"
                                    )}
                                >
                                    {executing ? (
                                        <>
                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                            Executing...
                                        </>
                                    ) : (
                                        <>
                                            <Play className="w-4 h-4" />
                                            Execute Skill
                                        </>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
