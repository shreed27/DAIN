"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Trophy,
  Medal,
  Crown,
  TrendingUp,
  DollarSign,
  Target,
  Flame,
  Award,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface Hunter {
  rank: number;
  walletAddress: string;
  hunterRank: string;
  totalEarnings: number;
  bountiesCompleted: number;
  successRate: number;
  reputationScore: number;
  badges: Array<{ id: string; name: string; icon: string; rarity: string }>;
  streakCurrent?: number;
}

interface RankInfo {
  name: string;
  minScore: number;
  icon: string;
}

const RANK_COLORS: Record<string, string> = {
  Novice: "#6B7280",
  Apprentice: "#22C55E",
  Investigator: "#3B82F6",
  Detective: "#8B5CF6",
  Expert: "#F59E0B",
  Master: "#EF4444",
  Legend: "#F472B6",
};

const RARITY_COLORS: Record<string, string> = {
  common: "#6B7280",
  uncommon: "#22C55E",
  rare: "#3B82F6",
  epic: "#8B5CF6",
  legendary: "#F59E0B",
};

function getRankColor(rank: string): string {
  return RANK_COLORS[rank] || RANK_COLORS.Novice;
}

function HunterCard({
  hunter,
  position,
}: {
  hunter: Hunter;
  position: number;
}) {
  const isTop3 = position <= 3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: position * 0.05 }}
      className={cn(
        "p-4 rounded-xl border transition-all hover:scale-[1.01]",
        isTop3
          ? "bg-gradient-to-r from-yellow-500/10 via-transparent to-transparent border-yellow-500/20"
          : "bg-white/[0.02] border-white/5"
      )}
    >
      <div className="flex items-center gap-4">
        {/* Rank */}
        <div
          className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg",
            position === 1
              ? "bg-yellow-500/20 text-yellow-400"
              : position === 2
                ? "bg-gray-400/20 text-gray-300"
                : position === 3
                  ? "bg-orange-600/20 text-orange-400"
                  : "bg-white/5 text-muted-foreground"
          )}
        >
          {position === 1 ? (
            <Crown className="w-6 h-6" />
          ) : position === 2 ? (
            <Medal className="w-6 h-6" />
          ) : position === 3 ? (
            <Medal className="w-6 h-6" />
          ) : (
            `#${position}`
          )}
        </div>

        {/* Hunter Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-white truncate">
              {hunter.walletAddress.slice(0, 8)}...{hunter.walletAddress.slice(-4)}
            </span>
            <span
              className="px-2 py-0.5 rounded text-xs font-bold"
              style={{
                backgroundColor: `${getRankColor(hunter.hunterRank)}20`,
                color: getRankColor(hunter.hunterRank),
              }}
            >
              {hunter.hunterRank}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-muted-foreground">
              {hunter.bountiesCompleted} bounties
            </span>
            <span className="text-xs text-muted-foreground">
              {hunter.successRate.toFixed(0)}% win rate
            </span>
            {hunter.streakCurrent && hunter.streakCurrent > 0 && (
              <span className="text-xs text-orange-400 flex items-center gap-1">
                <Flame className="w-3 h-3" /> {hunter.streakCurrent} streak
              </span>
            )}
          </div>
        </div>

        {/* Badges */}
        <div className="hidden md:flex items-center gap-1">
          {hunter.badges.slice(0, 5).map((badge) => (
            <div
              key={badge.id}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
              style={{ backgroundColor: `${RARITY_COLORS[badge.rarity]}20` }}
              title={badge.name}
            >
              {badge.icon}
            </div>
          ))}
        </div>

        {/* Score & Earnings */}
        <div className="text-right">
          <p className="font-bold text-white">
            {hunter.reputationScore.toLocaleString()} pts
          </p>
          <p className="text-sm text-green-400">
            {hunter.totalEarnings.toFixed(2)} SOL
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function TopHunterCard({ hunter, position }: { hunter: Hunter; position: number }) {
  const colors = {
    1: { bg: "from-yellow-500/20", border: "border-yellow-500/30", text: "text-yellow-400" },
    2: { bg: "from-gray-400/20", border: "border-gray-400/30", text: "text-gray-300" },
    3: { bg: "from-orange-600/20", border: "border-orange-600/30", text: "text-orange-400" },
  };

  const style = colors[position as keyof typeof colors];

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: position * 0.1 }}
      className={cn(
        "p-6 rounded-2xl border bg-gradient-to-b to-transparent",
        style.bg,
        style.border,
        position === 1 ? "col-span-1 md:scale-110 z-10" : ""
      )}
    >
      <div className="text-center">
        <div
          className={cn(
            "w-16 h-16 mx-auto rounded-xl flex items-center justify-center mb-4",
            position === 1 ? "bg-yellow-500/20" : "bg-white/5"
          )}
        >
          {position === 1 ? (
            <Crown className={cn("w-8 h-8", style.text)} />
          ) : (
            <Medal className={cn("w-8 h-8", style.text)} />
          )}
        </div>

        <p className="font-mono text-white mb-1">
          {hunter.walletAddress.slice(0, 8)}...
        </p>

        <p
          className="text-sm font-bold mb-3"
          style={{ color: getRankColor(hunter.hunterRank) }}
        >
          {hunter.hunterRank}
        </p>

        <div className="flex justify-center gap-1 mb-4">
          {hunter.badges.slice(0, 3).map((badge) => (
            <span key={badge.id} className="text-lg" title={badge.name}>
              {badge.icon}
            </span>
          ))}
        </div>

        <p className="text-2xl font-bold text-white mb-1">
          {hunter.reputationScore.toLocaleString()}
        </p>
        <p className="text-sm text-muted-foreground">reputation points</p>

        <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-2 gap-4">
          <div>
            <p className="text-lg font-bold text-green-400">
              {hunter.totalEarnings.toFixed(1)} SOL
            </p>
            <p className="text-xs text-muted-foreground">earned</p>
          </div>
          <div>
            <p className="text-lg font-bold text-white">
              {hunter.bountiesCompleted}
            </p>
            <p className="text-xs text-muted-foreground">completed</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function LeaderboardPage() {
  const [hunters, setHunters] = useState<Hunter[]>([]);
  const [ranks, setRanks] = useState<RankInfo[]>([]);
  const [sortBy, setSortBy] = useState<string>("score");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        const [leaderboardRes, ranksRes] = await Promise.all([
          api.getLeaderboard({ sortBy, limit: 50 }),
          api.getRanks(),
        ]);

        if (leaderboardRes.success && leaderboardRes.data) {
          setHunters(
            leaderboardRes.data.hunters.map((h: Record<string, unknown>, i: number) => ({
              ...h,
              rank: i + 1,
              hunterRank: h.rank as string,
            })) as Hunter[]
          );
        }

        if (ranksRes.success && ranksRes.data) {
          setRanks(ranksRes.data as RankInfo[]);
        }
      } catch (error) {
        console.error("Failed to fetch leaderboard:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [sortBy]);

  const top3 = hunters.slice(0, 3);
  const rest = hunters.slice(3);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
            <Trophy className="w-8 h-8 text-yellow-400" /> Hunter Leaderboard
          </h1>
          <p className="text-muted-foreground">
            Top OSINT hunters ranked by reputation and earnings.
          </p>
        </div>

        {/* Sort Dropdown */}
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="h-10 px-4 pr-10 rounded-lg bg-white/5 border border-white/10 text-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500/50"
          >
            <option value="score">By Reputation</option>
            <option value="earnings">By Earnings</option>
            <option value="bounties">By Bounties</option>
            <option value="success_rate">By Win Rate</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </header>

      {/* Rank Legend */}
      <div className="flex flex-wrap gap-2">
        {ranks.map((rank) => (
          <div
            key={rank.name}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5"
          >
            <span>{rank.icon}</span>
            <span
              className="text-sm font-medium"
              style={{ color: getRankColor(rank.name) }}
            >
              {rank.name}
            </span>
            <span className="text-xs text-muted-foreground">
              ({rank.minScore.toLocaleString()}+)
            </span>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full" />
        </div>
      ) : (
        <>
          {/* Top 3 Podium */}
          {top3.length >= 3 && (
            <div className="grid grid-cols-3 gap-4 md:gap-6 items-end">
              {/* 2nd Place */}
              <TopHunterCard hunter={top3[1]} position={2} />
              {/* 1st Place */}
              <TopHunterCard hunter={top3[0]} position={1} />
              {/* 3rd Place */}
              <TopHunterCard hunter={top3[2]} position={3} />
            </div>
          )}

          {/* Rest of Leaderboard */}
          <div className="space-y-2">
            {rest.map((hunter, index) => (
              <HunterCard
                key={hunter.walletAddress}
                hunter={hunter}
                position={index + 4}
              />
            ))}
          </div>

          {hunters.length === 0 && (
            <div className="text-center py-20">
              <Award className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg text-muted-foreground">
                No hunters on the leaderboard yet.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Complete bounties to appear here!
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
