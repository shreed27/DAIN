"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Zap, Plus, Play, Pause, Trash2, RefreshCw, Settings, Clock, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface AutomationRule {
    id: string;
    name: string;
    description?: string;
    ruleType: string;
    triggerConfig: Record<string, unknown>;
    actionConfig: Record<string, unknown>;
    enabled: boolean;
    lastTriggeredAt?: number;
    nextTriggerAt?: number;
    triggerCount: number;
}

interface AutomationStats {
    totalRules: number;
    activeRules: number;
    totalTriggers: number;
    successfulTriggers: number;
    failedTriggers: number;
    byType: Record<string, number>;
}

export default function AutomationTab() {
    const [rules, setRules] = useState<AutomationRule[]>([]);
    const [stats, setStats] = useState<AutomationStats | null>(null);
    const [loading, setLoading] = useState(true);
    const wallet = "demo-wallet";

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [rulesRes, statsRes] = await Promise.all([
                api.getAutomationRules(wallet),
                api.getAutomationStats(wallet),
            ]);
            if (rulesRes.success && rulesRes.data) setRules(rulesRes.data as AutomationRule[]);
            if (statsRes.success && statsRes.data) setStats(statsRes.data as AutomationStats);
        } catch (error) {
            console.error('Failed to load automation data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleRule = async (ruleId: string, enabled: boolean) => {
        try {
            await api.toggleAutomationRule(ruleId, !enabled);
            setRules(prev => prev.map(r => r.id === ruleId ? { ...r, enabled: !enabled } : r));
        } catch (error) {
            console.error('Failed to toggle rule:', error);
        }
    };

    const handleDeleteRule = async (ruleId: string) => {
        if (!confirm('Are you sure you want to delete this automation rule?')) return;
        try {
            await api.deleteAutomationRule(ruleId);
            setRules(prev => prev.filter(r => r.id !== ruleId));
        } catch (error) {
            console.error('Failed to delete rule:', error);
        }
    };

    const formatTimeAgo = (timestamp?: number) => {
        if (!timestamp) return 'Never';
        const diff = Date.now() - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'Just now';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                    Configure automated trading rules and triggers
                </div>
                <div className="flex gap-2">
                    <button onClick={loadData} className="p-2 rounded-lg border border-white/10 hover:bg-white/5">
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground">
                        <Plus className="w-4 h-4" />
                        New Rule
                    </button>
                </div>
            </div>

            {/* Stats */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="text-xs text-muted-foreground mb-1">Active Rules</div>
                        <div className="text-2xl font-bold">{stats.activeRules}/{stats.totalRules}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="text-xs text-muted-foreground mb-1">Total Triggers</div>
                        <div className="text-2xl font-bold">{stats.totalTriggers}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="text-xs text-muted-foreground mb-1">Success Rate</div>
                        <div className="text-2xl font-bold text-green-400">
                            {stats.totalTriggers > 0 ? ((stats.successfulTriggers / stats.totalTriggers) * 100).toFixed(1) : 0}%
                        </div>
                    </div>
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <div className="text-xs text-muted-foreground mb-1">Failed Triggers</div>
                        <div className="text-2xl font-bold text-red-400">{stats.failedTriggers}</div>
                    </div>
                </div>
            )}

            {/* Rules List */}
            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : rules.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                    <Zap className="w-12 h-12 mb-4 opacity-50" />
                    <p>No automation rules configured</p>
                    <p className="text-sm">Create a rule to automate your trading</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {rules.map((rule) => (
                        <motion.div
                            key={rule.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={cn(
                                "p-4 rounded-xl border bg-white/[0.02] transition-colors",
                                rule.enabled ? "border-green-500/20" : "border-white/5"
                            )}
                        >
                            <div className="flex justify-between items-start">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className={cn(
                                            "w-8 h-8 rounded-lg flex items-center justify-center",
                                            rule.enabled ? "bg-green-500/10 text-green-400" : "bg-gray-500/10 text-gray-400"
                                        )}>
                                            <Zap className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold">{rule.name}</h3>
                                            <span className="text-xs px-2 py-0.5 rounded bg-white/5 text-muted-foreground">
                                                {rule.ruleType}
                                            </span>
                                        </div>
                                    </div>
                                    {rule.description && (
                                        <p className="text-sm text-muted-foreground mb-3">{rule.description}</p>
                                    )}
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            Last: {formatTimeAgo(rule.lastTriggeredAt)}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <CheckCircle className="w-3 h-3" />
                                            {rule.triggerCount} triggers
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleToggleRule(rule.id, rule.enabled)}
                                        className={cn(
                                            "p-2 rounded-lg transition-colors",
                                            rule.enabled ? "bg-green-500/10 text-green-400" : "bg-white/5 text-muted-foreground"
                                        )}
                                    >
                                        {rule.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                    </button>
                                    <button className="p-2 rounded-lg bg-white/5 text-muted-foreground hover:text-white">
                                        <Settings className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteRule(rule.id)}
                                        className="p-2 rounded-lg bg-white/5 text-muted-foreground hover:text-red-400"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}
