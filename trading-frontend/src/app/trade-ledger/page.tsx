"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  TrendingUp,
  TrendingDown,
  Brain,
  Copy,
  Zap,
  Target,
  Filter,
  ChevronDown,
  ExternalLink,
  DollarSign,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCustomWalletModal } from "@/components/providers/CustomWalletModalProvider";

interface LedgerEntry {
  id: string;
  walletAddress: string;
  action: string;
  token: string;
  tokenSymbol?: string;
  chain: string;
  amount: number;
  price: number;
  decisionSource: string;
  reasoning?: string;
  confidence?: number;
  txSignature?: string;
  fees: number;
  slippage: number;
  pnl?: number;
  createdAt: number;
}

interface LedgerStats {
  totalTrades: number;
  totalVolume: number;
  totalFees: number;
  totalPnl: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  avgTradeSize: number;
  bySource: Record<string, number>;
  byAction: Record<string, number>;
}

interface CalibrationData {
  ranges: Array<{ min: number; max: number; count: number; winRate: number }>;
  avgConfidence: number;
  calibrationScore: number;
}

const SOURCE_INFO: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  manual: { icon: Target, color: "text-gray-400", label: "Manual" },
  ai: { icon: Brain, color: "text-purple-400", label: "AI" },
  signal: { icon: Activity, color: "text-blue-400", label: "Signal" },
  copy_trade: { icon: Copy, color: "text-green-400", label: "Copy Trade" },
  automation: { icon: Zap, color: "text-yellow-400", label: "Automation" },
  limit_order: { icon: Target, color: "text-orange-400", label: "Limit Order" },
};

function LedgerEntryCard({ entry }: { entry: LedgerEntry }) {
  const sourceInfo = SOURCE_INFO[entry.decisionSource] || SOURCE_INFO.manual;
  const SourceIcon = sourceInfo.icon;
  const isBuy = entry.action === "buy" || entry.action === "open_position";
  const hasPnl = entry.pnl !== undefined;
  const isProfitable = entry.pnl && entry.pnl >= 0;

  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.03] transition-all cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-4">
        {/* Action Icon */}
        <div
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center",
            isBuy ? "bg-green-500/10" : "bg-red-500/10"
          )}
        >
          {isBuy ? (
            <TrendingUp className="w-5 h-5 text-green-400" />
          ) : (
            <TrendingDown className="w-5 h-5 text-red-400" />
          )}
        </div>

        {/* Main Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-white uppercase">{entry.action}</span>
            <span className="text-muted-foreground">
              {entry.tokenSymbol || entry.token.slice(0, 8)}...
            </span>
            <span
              className={cn(
                "px-2 py-0.5 rounded text-xs flex items-center gap-1",
                sourceInfo.color,
                `bg-current/10`
              )}
            >
              <SourceIcon className="w-3 h-3" />
              {sourceInfo.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(entry.createdAt).toLocaleString()} on {entry.chain}
          </p>
        </div>

        {/* Amount & Price */}
        <div className="text-right">
          <p className="font-medium text-white">
            {entry.amount.toFixed(4)} @ ${entry.price.toFixed(4)}
          </p>
          <p className="text-xs text-muted-foreground">
            Vol: ${(entry.amount * entry.price).toFixed(2)}
          </p>
        </div>

        {/* PnL */}
        {hasPnl && (
          <div className="text-right min-w-[80px]">
            <p
              className={cn(
                "font-bold",
                isProfitable ? "text-green-400" : "text-red-400"
              )}
            >
              {isProfitable ? "+" : ""}
              {entry.pnl?.toFixed(4)} SOL
            </p>
          </div>
        )}

        {/* Confidence */}
        {entry.confidence && (
          <div className="w-12 h-12 relative">
            <svg className="w-12 h-12 -rotate-90">
              <circle
                cx="24"
                cy="24"
                r="20"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
                className="text-white/10"
              />
              <circle
                cx="24"
                cy="24"
                r="20"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
                strokeDasharray={125.6}
                strokeDashoffset={125.6 * (1 - entry.confidence / 100)}
                className={cn(
                  entry.confidence >= 70
                    ? "text-green-400"
                    : entry.confidence >= 40
                      ? "text-yellow-400"
                      : "text-red-400"
                )}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white">
              {entry.confidence}%
            </span>
          </div>
        )}
      </div>

      {/* Expanded Content */}
      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-4 pt-4 border-t border-white/5"
        >
          {entry.reasoning && (
            <div className="mb-4">
              <p className="text-xs text-muted-foreground mb-1">AI Reasoning</p>
              <p className="text-sm text-white bg-purple-500/10 p-3 rounded-lg">
                {entry.reasoning}
              </p>
            </div>
          )}

          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Fees</p>
              <p className="text-white">${entry.fees.toFixed(4)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Slippage</p>
              <p className="text-white">{entry.slippage.toFixed(2)}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Token</p>
              <p className="text-white font-mono text-xs truncate">{entry.token}</p>
            </div>
            {entry.txSignature && (
              <div>
                <p className="text-xs text-muted-foreground">Transaction</p>
                <a
                  href={`https://solscan.io/tx/${entry.txSignature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 text-xs flex items-center gap-1 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  View <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function CalibrationChart({ data }: { data: CalibrationData }) {
  return (
    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-white">Confidence Calibration</h3>
        <span
          className={cn(
            "px-2 py-1 rounded text-sm font-medium",
            data.calibrationScore >= 70
              ? "bg-green-500/10 text-green-400"
              : data.calibrationScore >= 40
                ? "bg-yellow-500/10 text-yellow-400"
                : "bg-red-500/10 text-red-400"
          )}
        >
          {data.calibrationScore.toFixed(0)}% calibrated
        </span>
      </div>

      <div className="space-y-2">
        {data.ranges.map((range, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-20">
              {range.min}-{range.max}%
            </span>
            <div className="flex-1 h-6 bg-white/5 rounded overflow-hidden relative">
              <div
                className={cn(
                  "h-full transition-all",
                  range.winRate >= 60
                    ? "bg-green-500/50"
                    : range.winRate >= 40
                      ? "bg-yellow-500/50"
                      : "bg-red-500/50"
                )}
                style={{ width: `${range.winRate}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-xs text-white">
                {range.count} trades - {range.winRate.toFixed(0)}% win rate
              </span>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        Average confidence: {data.avgConfidence.toFixed(0)}%
      </p>
    </div>
  );
}

export default function TradeLedgerPage() {
  const { publicKey, connected } = useWallet();
  const { setVisible } = useCustomWalletModal();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [stats, setStats] = useState<LedgerStats | null>(null);
  const [calibration, setCalibration] = useState<CalibrationData | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);

  const walletAddress = connected && publicKey ? publicKey.toBase58() : null;

  useEffect(() => {
    async function fetchData() {
      if (!walletAddress) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const params: { walletAddress: string; decisionSource?: string } = { walletAddress };
        if (filter !== "all") {
          params.decisionSource = filter;
        }

        const [ledgerRes, statsRes, calibrationRes] = await Promise.all([
          api.getTradeLedger(params),
          api.getTradeLedgerStats(walletAddress),
          api.getConfidenceCalibration(walletAddress),
        ]);

        if (ledgerRes.success && ledgerRes.data) {
          setEntries(ledgerRes.data.entries as LedgerEntry[]);
        }

        if (statsRes.success && statsRes.data) {
          setStats(statsRes.data as LedgerStats);
        }

        if (calibrationRes.success && calibrationRes.data) {
          setCalibration(calibrationRes.data as CalibrationData);
        }
      } catch (error) {
        console.error("Failed to fetch trade ledger:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [walletAddress, filter]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-blue-400" /> Trade Ledger
          </h1>
          <p className="text-muted-foreground">
            Complete audit trail of all trading decisions and outcomes.
          </p>
        </div>

        {/* Filter */}
        <div className="relative">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-10 px-4 pr-10 rounded-lg bg-white/5 border border-white/10 text-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <option value="all">All Sources</option>
            <option value="ai">AI Decisions</option>
            <option value="signal">Signals</option>
            <option value="copy_trade">Copy Trades</option>
            <option value="automation">Automation</option>
            <option value="manual">Manual</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </header>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <p className="text-xs text-muted-foreground">Total Trades</p>
            <p className="font-bold text-2xl text-white mt-1">{stats.totalTrades}</p>
          </div>
          <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <p className="text-xs text-muted-foreground">Win Rate</p>
            <p
              className={cn(
                "font-bold text-2xl mt-1",
                stats.winRate >= 50 ? "text-green-400" : "text-red-400"
              )}
            >
              {stats.winRate.toFixed(1)}%
            </p>
          </div>
          <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <p className="text-xs text-muted-foreground">Total P&L</p>
            <p
              className={cn(
                "font-bold text-2xl mt-1",
                stats.totalPnl >= 0 ? "text-green-400" : "text-red-400"
              )}
            >
              {stats.totalPnl >= 0 ? "+" : ""}
              {stats.totalPnl.toFixed(2)} SOL
            </p>
          </div>
          <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <p className="text-xs text-muted-foreground">Total Volume</p>
            <p className="font-bold text-2xl text-white mt-1">
              ${stats.totalVolume.toFixed(0)}
            </p>
          </div>
        </div>
      )}

      {/* Source Breakdown */}
      {stats && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.bySource).map(([source, count]) => {
            const info = SOURCE_INFO[source] || SOURCE_INFO.manual;
            const Icon = info.icon;
            return (
              <div
                key={source}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5"
              >
                <Icon className={cn("w-4 h-4", info.color)} />
                <span className="text-sm text-white">{info.label}</span>
                <span className="text-xs text-muted-foreground">({count})</span>
              </div>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Entries */}
          <div className="lg:col-span-2 space-y-3">
            <h2 className="text-lg font-semibold text-white">Trade History</h2>
            {entries.length > 0 ? (
              entries.map((entry) => (
                <LedgerEntryCard key={entry.id} entry={entry} />
              ))
            ) : (
              <div className="text-center py-12 rounded-xl border border-white/5 bg-white/[0.02]">
                <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No trades recorded yet.</p>
              </div>
            )}
          </div>

          {/* Calibration */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">AI Calibration</h2>
            {calibration ? (
              <CalibrationChart data={calibration} />
            ) : (
              <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] text-center">
                <p className="text-sm text-muted-foreground">
                  Not enough AI trades to calculate calibration.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
