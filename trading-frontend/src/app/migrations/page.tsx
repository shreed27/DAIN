"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Rocket,
  TrendingUp,
  Users,
  ExternalLink,
  RefreshCw,
  Search,
  Filter,
  ChevronDown,
  BarChart3,
  Clock,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface Migration {
  id: string;
  oldMint: string;
  newMint: string;
  oldSymbol?: string;
  newSymbol?: string;
  migrationType: string;
  detectedAt: number;
  rankingScore: number;
  godWalletCount: number;
  volume24h: number;
  marketCap: number;
  priceChange24h?: number;
}

interface MigrationStats {
  total: number;
  last24h: number;
  last7d: number;
  byType: Record<string, number>;
}

const MIGRATION_TYPE_INFO: Record<string, { label: string; color: string; bgColor: string; icon: string }> = {
  pump_to_raydium: { label: "Pump to Raydium", color: "text-green-400", bgColor: "bg-green-500/10", icon: "🚀" },
  bonding_curve: { label: "Bonding Curve", color: "text-blue-400", bgColor: "bg-blue-500/10", icon: "📈" },
  upgrade: { label: "Token Upgrade", color: "text-purple-400", bgColor: "bg-purple-500/10", icon: "⬆️" },
  rebrand: { label: "Rebrand", color: "text-yellow-400", bgColor: "bg-yellow-500/10", icon: "✨" },
  other: { label: "Other", color: "text-gray-400", bgColor: "bg-gray-500/10", icon: "🔄" },
};

function MigrationCard({ migration, index }: { migration: Migration; index: number }) {
  const typeInfo = MIGRATION_TYPE_INFO[migration.migrationType] || MIGRATION_TYPE_INFO.other;
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-2xl", typeInfo.bgColor)}>
          {typeInfo.icon}
        </div>

        {/* Main Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white text-lg">
              {migration.newSymbol || migration.newMint.slice(0, 8)}...
            </span>
            <span className={cn("px-2 py-0.5 rounded text-xs font-medium", typeInfo.color, typeInfo.bgColor)}>
              {typeInfo.label}
            </span>
            {migration.rankingScore >= 80 && (
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/10 text-yellow-400">
                <Zap className="w-3 h-3 inline mr-1" />
                Hot
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="w-4 h-4" /> {migration.godWalletCount} god wallets
            </span>
            <span className="flex items-center gap-1">
              <TrendingUp className="w-4 h-4" /> Score: {migration.rankingScore.toFixed(0)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" /> {new Date(migration.detectedAt).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="text-right space-y-1">
          {migration.marketCap > 0 && (
            <p className="text-lg font-bold text-white">
              ${(migration.marketCap / 1000).toFixed(0)}K
            </p>
          )}
          {migration.volume24h > 0 && (
            <p className="text-sm text-muted-foreground">
              Vol: ${(migration.volume24h / 1000).toFixed(0)}K
            </p>
          )}
          {migration.priceChange24h !== undefined && (
            <p className={cn(
              "text-sm font-medium",
              migration.priceChange24h >= 0 ? "text-green-400" : "text-red-400"
            )}>
              {migration.priceChange24h >= 0 ? "+" : ""}{migration.priceChange24h.toFixed(1)}%
            </p>
          )}
        </div>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 pt-4 border-t border-white/5"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Old Token</p>
                <p className="font-mono text-sm text-white truncate">
                  {migration.oldSymbol || migration.oldMint.slice(0, 12)}...
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">New Token</p>
                <p className="font-mono text-sm text-white truncate">
                  {migration.newSymbol || migration.newMint.slice(0, 12)}...
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Migration Type</p>
                <p className={cn("text-sm font-medium", typeInfo.color)}>{typeInfo.label}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Actions</p>
                <div className="flex gap-2">
                  <a
                    href={`https://solscan.io/token/${migration.newMint}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 text-sm flex items-center gap-1 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function StatsCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ElementType; color: string }) {
  return (
    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
      <div className="flex items-center gap-3">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", color.replace("text-", "bg-") + "/10")}>
          <Icon className={cn("w-5 h-5", color)} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}

export default function MigrationsPage() {
  const [migrations, setMigrations] = useState<Migration[]>([]);
  const [stats, setStats] = useState<MigrationStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("ranking");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchData = async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const [migrationsRes, statsRes] = await Promise.all([
        api.getTopMigrations(50),
        api.getMigrationStats(),
      ]);

      if (migrationsRes.success && migrationsRes.data) {
        setMigrations(migrationsRes.data as Migration[]);
      }

      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data as MigrationStats);
      }
    } catch (error) {
      console.error("Failed to fetch migrations:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Refresh every 60 seconds
    const interval = setInterval(() => fetchData(true), 60000);
    return () => clearInterval(interval);
  }, []);

  // Filter and sort migrations
  const filteredMigrations = migrations
    .filter((m) => {
      if (filter !== "all" && m.migrationType !== filter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          m.newSymbol?.toLowerCase().includes(query) ||
          m.oldSymbol?.toLowerCase().includes(query) ||
          m.newMint.toLowerCase().includes(query) ||
          m.oldMint.toLowerCase().includes(query)
        );
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "ranking":
          return b.rankingScore - a.rankingScore;
        case "godWallets":
          return b.godWalletCount - a.godWalletCount;
        case "marketCap":
          return b.marketCap - a.marketCap;
        case "recent":
          return b.detectedAt - a.detectedAt;
        default:
          return 0;
      }
    });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
            <Rocket className="w-8 h-8 text-green-400" /> Token Migrations
          </h1>
          <p className="text-muted-foreground">
            Track token migrations and upgrades across the Solana ecosystem.
          </p>
        </div>

        <button
          onClick={() => fetchData(true)}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
        >
          <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
          Refresh
        </button>
      </header>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard
            label="Total Migrations"
            value={stats.total}
            icon={Rocket}
            color="text-green-400"
          />
          <StatsCard
            label="Last 24 Hours"
            value={stats.last24h}
            icon={Clock}
            color="text-blue-400"
          />
          <StatsCard
            label="Last 7 Days"
            value={stats.last7d}
            icon={BarChart3}
            color="text-purple-400"
          />
          <StatsCard
            label="Types Tracked"
            value={Object.keys(stats.byType).length}
            icon={Filter}
            color="text-yellow-400"
          />
        </div>
      )}

      {/* Type Breakdown */}
      {stats && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.byType).map(([type, count]) => {
            const typeInfo = MIGRATION_TYPE_INFO[type] || MIGRATION_TYPE_INFO.other;
            return (
              <button
                key={type}
                onClick={() => setFilter(filter === type ? "all" : type)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all",
                  filter === type ? "bg-white/10 ring-1 ring-white/20" : "bg-white/5 hover:bg-white/10"
                )}
              >
                <span>{typeInfo.icon}</span>
                <span className={cn("text-sm font-medium", typeInfo.color)}>{typeInfo.label}</span>
                <span className="text-xs text-muted-foreground">({count})</span>
              </button>
            );
          })}
          {filter !== "all" && (
            <button
              onClick={() => setFilter("all")}
              className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-sm hover:bg-red-500/20 transition-colors"
            >
              Clear Filter
            </button>
          )}
        </div>
      )}

      {/* Search and Sort */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by token symbol or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-green-500/50"
          />
        </div>
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="h-10 px-4 pr-10 rounded-lg bg-white/5 border border-white/10 text-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500/50"
          >
            <option value="ranking">By Ranking Score</option>
            <option value="godWallets">By God Wallets</option>
            <option value="marketCap">By Market Cap</option>
            <option value="recent">Most Recent</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Migrations List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full" />
        </div>
      ) : filteredMigrations.length > 0 ? (
        <div className="space-y-3">
          {filteredMigrations.map((migration, index) => (
            <MigrationCard key={migration.id} migration={migration} index={index} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 rounded-xl border border-white/5 bg-white/[0.02]">
          <Rocket className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg text-muted-foreground">No migrations found.</p>
          {(filter !== "all" || searchQuery) && (
            <p className="text-sm text-muted-foreground mt-2">
              Try adjusting your filters or search query.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
