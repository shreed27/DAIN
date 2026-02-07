"use client";

import {
    LayoutDashboard, Users, Activity, Settings, Terminal, Wallet, LogOut, Globe,
    Target, Trophy, Copy, Zap, BookOpen, Rocket, Crosshair, TrendingUp,
    ArrowLeftRight, FlaskConical, Shield, Network, Store, Sparkles, HeartPulse, Layers
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { motion } from "framer-motion";

const menuItems = [
    { icon: LayoutDashboard, label: "Overview", href: "/", section: "main" },
    { icon: Globe, label: "Market Intel", href: "/market-intelligence", section: "main" },
    { icon: Users, label: "Agents", href: "/agents", section: "main" },
    { icon: Store, label: "Agent Market", href: "/agent-marketplace", section: "main" },
    { icon: Activity, label: "Live Execution", href: "/execution", section: "trading" },
    { icon: TrendingUp, label: "Futures", href: "/futures", section: "trading" },
    { icon: Crosshair, label: "Limit Orders", href: "/limit-orders", section: "trading" },
    { icon: Network, label: "Swarm Trading", href: "/swarm", section: "trading" },
    { icon: Copy, label: "Copy Trading", href: "/copy-trading", section: "trading" },
    { icon: ArrowLeftRight, label: "Arbitrage", href: "/arbitrage", section: "analytics" },
    { icon: FlaskConical, label: "Backtest", href: "/backtest", section: "analytics" },
    { icon: Shield, label: "Risk", href: "/risk", section: "analytics" },
    { icon: Target, label: "Bounties", href: "/bounties", section: "other" },
    { icon: Trophy, label: "Leaderboard", href: "/leaderboard", section: "other" },
    { icon: Zap, label: "Automation", href: "/automation", section: "other" },
    { icon: BookOpen, label: "Trade Ledger", href: "/trade-ledger", section: "other" },
    { icon: Rocket, label: "Migrations", href: "/migrations", section: "other" },
    { icon: Sparkles, label: "Skills", href: "/skills", section: "other" },
    { icon: HeartPulse, label: "Survival", href: "/survival", section: "other" },
    { icon: Layers, label: "EVM Bridge", href: "/evm", section: "other" },
    { icon: Terminal, label: "Logs", href: "/logs", section: "system" },
    { icon: Wallet, label: "Portfolio", href: "/portfolio", section: "system" },
    { icon: Settings, label: "Settings", href: "/settings", section: "system" },
];

export function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="h-full w-64 border-r border-border/40 bg-background/60 backdrop-blur-xl flex flex-col fixed left-0 top-0 bottom-0 z-50 transition-all duration-300">
            {/* Branding */}
            <div className="h-20 flex items-center px-6">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-primary to-purple-600 flex items-center justify-center mr-3 shadow-lg shadow-primary/20">
                    <Activity className="h-5 w-5 text-white" />
                </div>
                <div>
                    <span className="font-bold text-lg tracking-tight text-foreground block leading-none">Orchestrator</span>
                    <span className="text-[10px] text-muted-foreground font-medium tracking-widest uppercase">PRO v2.4</span>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-4 px-4 space-y-1 overflow-y-auto scrollbar-hide">
                {menuItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-300 relative group overflow-hidden",
                                isActive
                                    ? "text-primary-foreground bg-primary shadow-md shadow-primary/10"
                                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                            )}
                        >
                            {isActive && (
                                <motion.div
                                    layoutId="sidebar-active"
                                    className="absolute inset-0 bg-primary z-0 rounded-lg"
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                />
                            )}

                            <item.icon className={cn(
                                "w-4 h-4 transition-colors relative z-10 flex-shrink-0",
                                isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
                            )} />
                            <span className="relative z-10 truncate">{item.label}</span>
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom Actions */}
            <div className="p-4 space-y-1">
                <button className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                    <LogOut className="w-4 h-4" />
                    Disconnect
                </button>
            </div>

            {/* User Profile Snippet */}
            <div className="p-4 border-t border-border/40 bg-card/10">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 border border-white/10" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">Admin Account</p>
                        <p className="text-[10px] text-muted-foreground truncate">admin@collesium.io</p>
                    </div>
                </div>
            </div>
        </aside>
    );
}
