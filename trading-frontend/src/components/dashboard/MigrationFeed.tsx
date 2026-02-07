"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Rocket, TrendingUp, Users, ExternalLink, RefreshCw } from "lucide-react";
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
}

interface MigrationStats {
  total: number;
  last24h: number;
  last7d: number;
  byType: Record<string, number>;
}

const MIGRATION_TYPE_INFO: Record<string, { label: string; color: string; icon: string }> = {
  pump_to_raydium: { label: "Pump to Raydium", color: "text-green-400", icon: "🚀" },
  bonding_curve: { label: "Bonding Curve", color: "text-blue-400", icon: "📈" },
  upgrade: { label: "Token Upgrade", color: "text-purple-400", icon: "⬆️" },
  rebrand: { label: "Rebrand", color: "text-yellow-400", icon: "✨" },
  other: { label: "Other", color: "text-gray-400", icon: "🔄" },
};

function MigrationCard({ migration }: { migration: Migration }) {
  const typeInfo = MIGRATION_TYPE_INFO[migration.migrationType] || MIGRATION_TYPE_INFO.other;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="p-3 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="text-2xl">{typeInfo.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-white">
              {migration.newSymbol || migration.newMint.slice(0, 8)}...
            </span>
            <span className={cn("text-xs px-1.5 py-0.5 rounded", typeInfo.color, "bg-current/10")}>
              {typeInfo.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" /> {migration.godWalletCount} god wallets
            </span>
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Score: {migration.rankingScore.toFixed(0)}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">
            {new Date(migration.detectedAt).toLocaleTimeString()}
          </p>
          {migration.marketCap > 0 && (
            <p className="text-xs text-green-400 mt-1">
              ${(migration.marketCap / 1000).toFixed(0)}K MC
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function MigrationFeed() {
  const [migrations, setMigrations] = useState<Migration[]>([]);
  const [stats, setStats] = useState<MigrationStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const [migrationsRes, statsRes] = await Promise.all([
        api.getTopMigrations(10),
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

    // Refresh every 30 seconds
    const interval = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Rocket className="w-5 h-5 text-green-400" />
          <h3 className="font-semibold text-white">Token Migrations</h3>
        </div>
        <div className="flex items-center gap-2">
          {stats && (
            <span className="text-xs text-muted-foreground">
              {stats.last24h} today
            </span>
          )}
          <button
            onClick={() => fetchData(true)}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <RefreshCw
              className={cn(
                "w-4 h-4 text-muted-foreground",
                isRefreshing && "animate-spin"
              )}
            />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin w-6 h-6 border-2 border-white/20 border-t-white rounded-full" />
        </div>
      ) : migrations.length > 0 ? (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          <AnimatePresence mode="popLayout">
            {migrations.map((migration) => (
              <MigrationCard key={migration.id} migration={migration} />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="text-center py-8">
          <Rocket className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No migrations detected recently.</p>
        </div>
      )}

      {stats && (
        <div className="mt-4 pt-4 border-t border-white/5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Total migrations tracked: {stats.total}
            </span>
            <a
              href="/migrations"
              className="text-blue-400 hover:underline flex items-center gap-1"
            >
              View all <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default MigrationFeed;
