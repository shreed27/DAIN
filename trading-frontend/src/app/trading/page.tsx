"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Activity, TrendingUp, Crosshair, Network, Copy, Rocket,
    ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

// Lazy load the tab content components
const ExecutionContent = dynamic(() => import("./tabs/ExecutionTab"), { ssr: false });
const FuturesContent = dynamic(() => import("./tabs/FuturesTab"), { ssr: false });
const LimitOrdersContent = dynamic(() => import("./tabs/LimitOrdersTab"), { ssr: false });
const SwarmContent = dynamic(() => import("./tabs/SwarmTab"), { ssr: false });
const CopyTradingContent = dynamic(() => import("./tabs/CopyTradingTab"), { ssr: false });
const MigrationsContent = dynamic(() => import("./tabs/MigrationsTab"), { ssr: false });

const tabs = [
    { id: "execution", label: "Live Execution", icon: Activity, description: "Real-time order book and trade execution" },
    { id: "futures", label: "Futures", icon: TrendingUp, description: "Leveraged perpetual contracts" },
    { id: "limit-orders", label: "Limit Orders", icon: Crosshair, description: "Set price targets for automatic execution" },
    { id: "swarm", label: "Swarm Trading", icon: Network, description: "Coordinate multi-wallet strategies" },
    { id: "copy-trading", label: "Copy Trading", icon: Copy, description: "Mirror successful traders" },
    { id: "migrations", label: "Migrations", icon: Rocket, description: "Track token migrations and launches" },
];

export default function TradingPage() {
    const [activeTab, setActiveTab] = useState("execution");

    const renderTabContent = () => {
        switch (activeTab) {
            case "execution":
                return <ExecutionContent />;
            case "futures":
                return <FuturesContent />;
            case "limit-orders":
                return <LimitOrdersContent />;
            case "swarm":
                return <SwarmContent />;
            case "copy-trading":
                return <CopyTradingContent />;
            case "migrations":
                return <MigrationsContent />;
            default:
                return <ExecutionContent />;
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Trading</h1>
                    <p className="text-muted-foreground">
                        Execute trades, manage positions, and automate strategies
                    </p>
                </div>
            </div>

            {/* Tab Navigation */}
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

            {/* Tab Description */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ChevronRight className="w-4 h-4" />
                {tabs.find(t => t.id === activeTab)?.description}
            </div>

            {/* Tab Content */}
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
