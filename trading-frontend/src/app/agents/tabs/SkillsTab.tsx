"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Sparkles, Star, Play, RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface Skill {
    id: string;
    name: string;
    description: string;
    category: string;
    icon?: string;
    enabled: boolean;
    usageCount?: number;
}

export default function SkillsTab() {
    const [skills, setSkills] = useState<Record<string, Skill[]>>({});
    const [favorites, setFavorites] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [executing, setExecuting] = useState<string | null>(null);
    const wallet = "demo-wallet";

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [skillsRes, favoritesRes] = await Promise.all([
                api.getSkillsByCategory(),
                api.getFavoriteSkills(wallet),
            ]);
            if (skillsRes.success && skillsRes.data) {
                setSkills(skillsRes.data as Record<string, Skill[]>);
            }
            if (favoritesRes.success && favoritesRes.data) {
                setFavorites((favoritesRes.data as Skill[]).map(s => s.id));
            }
        } catch (error) {
            console.error('Failed to load skills:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleExecuteSkill = async (skillId: string) => {
        setExecuting(skillId);
        try {
            await api.executeSkill(skillId, wallet, {});
        } catch (error) {
            console.error('Failed to execute skill:', error);
        } finally {
            setExecuting(null);
        }
    };

    const handleToggleFavorite = async (skillId: string) => {
        try {
            if (favorites.includes(skillId)) {
                await api.removeFavoriteSkill(wallet, skillId);
                setFavorites(prev => prev.filter(id => id !== skillId));
            } else {
                await api.addFavoriteSkill(wallet, skillId);
                setFavorites(prev => [...prev, skillId]);
            }
        } catch (error) {
            console.error('Failed to toggle favorite:', error);
        }
    };

    const categories = Object.keys(skills);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                    One-click trading tools and utilities
                </div>
                <button onClick={loadData} className="p-2 rounded-lg border border-white/10 hover:bg-white/5">
                    <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : categories.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                    <Sparkles className="w-12 h-12 mb-4 opacity-50" />
                    <p>No skills available</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {/* Favorites Section */}
                    {favorites.length > 0 && (
                        <div>
                            <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                                <Star className="w-4 h-4 text-yellow-400" />
                                Favorites
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {categories.flatMap(cat => skills[cat] || [])
                                    .filter(skill => favorites.includes(skill.id))
                                    .map(skill => (
                                        <SkillCard
                                            key={skill.id}
                                            skill={skill}
                                            isFavorite={true}
                                            isExecuting={executing === skill.id}
                                            onExecute={() => handleExecuteSkill(skill.id)}
                                            onToggleFavorite={() => handleToggleFavorite(skill.id)}
                                        />
                                    ))
                                }
                            </div>
                        </div>
                    )}

                    {/* All Skills by Category */}
                    {categories.map(category => (
                        <div key={category}>
                            <h3 className="text-sm font-medium mb-4 capitalize">{category}</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {(skills[category] || []).map(skill => (
                                    <SkillCard
                                        key={skill.id}
                                        skill={skill}
                                        isFavorite={favorites.includes(skill.id)}
                                        isExecuting={executing === skill.id}
                                        onExecute={() => handleExecuteSkill(skill.id)}
                                        onToggleFavorite={() => handleToggleFavorite(skill.id)}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function SkillCard({
    skill,
    isFavorite,
    isExecuting,
    onExecute,
    onToggleFavorite,
}: {
    skill: Skill;
    isFavorite: boolean;
    isExecuting: boolean;
    onExecute: () => void;
    onToggleFavorite: () => void;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
        >
            <div className="flex justify-between items-start mb-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-purple-400" />
                </div>
                <button
                    onClick={onToggleFavorite}
                    className="p-1 rounded hover:bg-white/5"
                >
                    <Star className={cn(
                        "w-4 h-4",
                        isFavorite ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground"
                    )} />
                </button>
            </div>
            <h4 className="font-semibold mb-1">{skill.name}</h4>
            <p className="text-xs text-muted-foreground mb-4 line-clamp-2">{skill.description}</p>
            <button
                onClick={onExecute}
                disabled={isExecuting || !skill.enabled}
                className={cn(
                    "w-full py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors",
                    skill.enabled
                        ? "bg-primary/10 text-primary hover:bg-primary/20"
                        : "bg-gray-500/10 text-gray-500 cursor-not-allowed"
                )}
            >
                {isExecuting ? (
                    <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Running...
                    </>
                ) : (
                    <>
                        <Play className="w-3 h-3" />
                        Execute
                    </>
                )}
            </button>
        </motion.div>
    );
}
