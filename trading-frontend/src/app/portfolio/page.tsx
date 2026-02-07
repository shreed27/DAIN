"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, FileText, ArrowLeftRight, RefreshCcw, DollarSign, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const HoldingsTab = dynamic(() => import("./tabs/HoldingsTab"), { ssr: false });
const TradeLedgerTab = dynamic(() => import("./tabs/TradeLedgerTab"), { ssr: false });
const EVMBridgeTab = dynamic(() => import("./tabs/EVMBridgeTab"), { ssr: false });

const tabs = [
    { id: "holdings", label: "Holdings", icon: Wallet, description: "View portfolio allocation and open positions" },
    { id: "ledger", label: "Trade Ledger", icon: FileText, description: "Complete history of all trades and decisions" },
    { id: "bridge", label: "EVM Bridge", icon: ArrowLeftRight, description: "Bridge assets between Solana and EVM chains" },
];

export default function PortfolioPage() {
    const [activeTab, setActiveTab] = useState("holdings");

    const renderTabContent = () => {
        switch (activeTab) {
            case "holdings":
                return <HoldingsTab />;
            case "ledger":
                return <TradeLedgerTab />;
            case "bridge":
                return <EVMBridgeTab />;
            default:
                return <HoldingsTab />;
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight mb-1">Portfolio & Assets</h1>
                    <p className="text-muted-foreground">Manage capital allocation and performance analysis.</p>
                </div>
                <div className="flex gap-3">
                    <button className="h-10 px-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-2 text-sm font-medium transition-colors">
                        <RefreshCcw className="w-4 h-4" /> Sync Wallets
                    </button>
                    <button className="h-10 px-4 rounded-lg bg-green-600 hover:bg-green-500 text-white flex items-center gap-2 text-sm font-medium transition-colors shadow-lg shadow-green-900/20">
                        <DollarSign className="w-4 h-4" /> Deposit
                    </button>
                </div>
            </header>

            {/* Tabs */}
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
