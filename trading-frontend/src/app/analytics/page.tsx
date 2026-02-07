"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, ArrowLeftRight, FlaskConical, Shield, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const MarketIntelTab = dynamic(() => import("./tabs/MarketIntelTab"), { ssr: false });
const ArbitrageTab = dynamic(() => import("./tabs/ArbitrageTab"), { ssr: false });
const BacktestTab = dynamic(() => import("./tabs/BacktestTab"), { ssr: false });
const RiskTab = dynamic(() => import("./tabs/RiskTab"), { ssr: false });

const tabs = [
    { id: "market-intel", label: "Market Intel", icon: Globe, description: "Real-time market signals and analysis" },
    { id: "arbitrage", label: "Arbitrage", icon: ArrowLeftRight, description: "Cross-platform price arbitrage opportunities" },
    { id: "backtest", label: "Backtest", icon: FlaskConical, description: "Test strategies against historical data" },
    { id: "risk", label: "Risk Management", icon: Shield, description: "Portfolio risk analysis and circuit breakers" },
];

export default function AnalyticsPage() {
    const [activeTab, setActiveTab] = useState("market-intel");

    const renderTabContent = () => {
        switch (activeTab) {
            case "market-intel":
                return <MarketIntelTab />;
            case "arbitrage":
                return <ArbitrageTab />;
            case "backtest":
                return <BacktestTab />;
            case "risk":
                return <RiskTab />;
            default:
                return <MarketIntelTab />;
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Analytics</h1>
                    <p className="text-muted-foreground">
                        Market analysis, backtesting, and risk management tools
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
