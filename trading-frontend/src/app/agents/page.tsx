"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Store, Zap, Sparkles, Target, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const AgentsTab = dynamic(() => import("./tabs/AgentsTab"), { ssr: false });
const MarketplaceTab = dynamic(() => import("./tabs/MarketplaceTab"), { ssr: false });
const AutomationTab = dynamic(() => import("./tabs/AutomationTab"), { ssr: false });
const SkillsTab = dynamic(() => import("./tabs/SkillsTab"), { ssr: false });
const BountiesTab = dynamic(() => import("./tabs/BountiesTab"), { ssr: false });

const tabs = [
    { id: "agents", label: "My Agents", icon: Users, description: "Manage your deployed trading agents" },
    { id: "marketplace", label: "Marketplace", icon: Store, description: "Discover and hire agents from the network" },
    { id: "automation", label: "Automation", icon: Zap, description: "Configure automated trading rules" },
    { id: "skills", label: "Skills", icon: Sparkles, description: "One-click trading tools and utilities" },
    { id: "bounties", label: "Bounties", icon: Target, description: "OSINT bounties and rewards" },
];

export default function AgentsPage() {
    const [activeTab, setActiveTab] = useState("agents");

    const renderTabContent = () => {
        switch (activeTab) {
            case "agents":
                return <AgentsTab />;
            case "marketplace":
                return <MarketplaceTab />;
            case "automation":
                return <AutomationTab />;
            case "skills":
                return <SkillsTab />;
            case "bounties":
                return <BountiesTab />;
            default:
                return <AgentsTab />;
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Agents</h1>
                    <p className="text-muted-foreground">
                        Deploy, manage, and automate your trading operations
                    </p>
                </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                                isActive
                                    ? "bg-primary text-primary-foreground shadow-md"
                                    : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                            )}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ChevronRight className="w-4 h-4" />
                {tabs.find(t => t.id === activeTab)?.description}
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                >
                    {renderTabContent()}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
