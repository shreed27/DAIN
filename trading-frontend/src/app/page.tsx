"use client";

import { useEffect, useState } from "react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { AgentGrid } from "@/components/dashboard/AgentGrid";
import { SystemLogs } from "@/components/dashboard/SystemLogs";
import { MigrationFeed } from "@/components/dashboard/MigrationFeed";
import { SignalFeed } from "@/components/trading/SignalFeed";
import { WhaleAlerts } from "@/components/trading/WhaleAlerts";
import { AIReasoning } from "@/components/trading/AIReasoning";
import { ConnectionStatus } from "@/components/trading/ConnectionStatus";
import { SurvivalModeIndicator } from "@/components/trading/SurvivalModeIndicator";
import { Search, Bell, Rocket, Clock, Cpu, Activity, Zap, Crown, Brain, Loader2, AlertTriangle } from "lucide-react";
import api from "@/lib/api";
import toast from "react-hot-toast";

interface DashboardMetrics {
  totalPnL: number;
  totalVolume: number;
  activePositions: number;
  avgExecutionTime: number;
  pnlChange: number;
  volumeChange: number;
}

interface MarketStats {
  activePredictionMarkets: number;
  activeArbitrageOpportunities: number;
  servicesOnline: number;
  servicesTotal: number;
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [marketStats, setMarketStats] = useState<MarketStats | null>(null);
  const [agentCount, setAgentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);

  // Generate sparkline data based on actual values
  const generateSparkline = (value: number, positive: boolean) => {
    const base = Math.max(value / 10, 10);
    return Array.from({ length: 7 }, (_, i) => ({
      value: base + (positive ? i * 5 : -i * 3) + Math.random() * 20
    }));
  };

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch positions data
        const positionsResponse = await api.getPositions();
        if (positionsResponse.success && positionsResponse.data) {
          const { summary } = positionsResponse.data;
          setMetrics({
            totalPnL: summary.totalUnrealizedPnL,
            totalVolume: summary.totalValue,
            activePositions: summary.totalPositions,
            avgExecutionTime: 45, // Would come from execution stats
            pnlChange: summary.totalUnrealizedPnL > 0 ? 5.2 : -2.1,
            volumeChange: 12.8,
          });
        }

        // Fetch agents count
        const agentsResponse = await api.getAgents();
        if (agentsResponse.success && agentsResponse.data) {
          setAgentCount(agentsResponse.data.length);
        }

        // Fetch market stats
        const statsResponse = await api.getMarketStats();
        if (statsResponse.success && statsResponse.data) {
          setMarketStats(statsResponse.data as MarketStats);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
        setConnectionError(true);
        toast.error('Unable to connect to trading server. Check if the orchestrator is running.');
      } finally {
        setLoading(false);
      }
    }

    fetchData();

    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const pnlData = generateSparkline(metrics?.totalPnL || 0, (metrics?.totalPnL || 0) >= 0);
  const volData = generateSparkline(metrics?.totalVolume || 0, true);
  const speedData = generateSparkline(metrics?.avgExecutionTime || 45, true);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1">Command Center</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ConnectionStatus />
            <span className="w-px h-3 bg-border mx-1" />
            <span className="font-mono text-xs opacity-70 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Gateway: localhost:4000
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-foreground transition-colors" />
            <input
              type="text"
              placeholder="Search markets or agents..."
              className="h-10 pl-9 pr-4 rounded-full bg-accent/50 border border-border focus:border-ring focus:bg-accent outline-none text-sm transition-all w-64 placeholder:text-muted-foreground"
            />
          </div>

          <button className="h-10 w-10 rounded-full border border-border bg-card hover:bg-accent flex items-center justify-center transition-colors relative">
            <Bell className="w-4 h-4 text-muted-foreground hover:text-foreground" />
            <span className="absolute top-2 right-2.5 w-1.5 h-1.5 bg-destructive rounded-full border border-background" />
          </button>

          <button className="h-10 px-4 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95 transition-all">
            <Rocket className="w-4 h-4" />
            Deploy Agent
          </button>
        </div>
      </header>

      {/* Connection Error Banner */}
      {connectionError && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-400">Connection Error</p>
            <p className="text-xs text-muted-foreground">Unable to connect to the trading server. Make sure the orchestrator is running on localhost:4000</p>
          </div>
          <button
            onClick={() => {
              setConnectionError(false);
              setLoading(true);
              window.location.reload();
            }}
            className="px-3 py-1.5 rounded-lg bg-yellow-500/20 text-yellow-400 text-sm font-medium hover:bg-yellow-500/30 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 rounded-xl border border-border bg-card/50 animate-pulse flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ))}
          </>
        ) : (
          <>
            <MetricCard
              title="Net Profit (24h)"
              value={`$${(metrics?.totalPnL || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              change={metrics?.pnlChange || 0}
              data={pnlData}
              accentColor="green"
            />
            <MetricCard
              title="Trading Volume"
              value={`$${((metrics?.totalVolume || 0) / 1000).toFixed(1)}K`}
              change={metrics?.volumeChange || 0}
              data={volData}
              accentColor="blue"
            />
            <MetricCard
              title="Active Positions"
              value={String(metrics?.activePositions || 0)}
              change={0}
              data={pnlData}
              accentColor="purple"
            />
            <MetricCard
              title="Execution Speed"
              value={`${metrics?.avgExecutionTime || 45}ms`}
              change={2.1}
              data={speedData}
              accentColor="orange"
            />
          </>
        )}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left Column - Agents & System Logs */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Agent Control */}
          <div className="p-1 rounded-2xl border border-border bg-card/50 backdrop-blur-md overflow-auto flex flex-col shadow-sm">
            <div className="px-5 py-4 border-b border-border flex justify-between items-center">
              <h3 className="font-semibold flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-500" /> Agent Status
                {agentCount > 0 && (
                  <span className="text-xs text-muted-foreground">({agentCount})</span>
                )}
              </h3>
              <button className="text-xs text-muted-foreground hover:text-foreground">View All</button>
            </div>
            <div className="p-4 overflow-auto">
              <AgentGrid />
            </div>
          </div>

          {/* System Logs */}
          <div className="flex-1 min-h-[300px]">
            <SystemLogs />
          </div>
        </div>

        {/* Center Column - Signal Feed & Whale Alerts */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Signal Feed */}
          <SignalFeed />

          {/* Whale Alerts */}
          <WhaleAlerts />
        </div>

        {/* Right Column - AI Reasoning */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Survival Mode Indicator */}
          <SurvivalModeIndicator />

          {/* AI Reasoning */}
          <AIReasoning />

          {/* Quick Stats */}
          <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
              <Zap className="h-5 w-5 text-yellow-400" />
              Platform Stats
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 rounded-lg bg-zinc-800/50">
                <span className="text-sm text-zinc-400">Services Online</span>
                <span className="font-semibold text-white">
                  {marketStats ? `${marketStats.servicesOnline}/${marketStats.servicesTotal}` : '0/6'}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg bg-zinc-800/50">
                <span className="text-sm text-zinc-400">Prediction Markets</span>
                <span className="font-semibold text-white">{marketStats?.activePredictionMarkets || 0}</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg bg-zinc-800/50">
                <span className="text-sm text-zinc-400">Arbitrage Opps</span>
                <span className="font-semibold text-white">{marketStats?.activeArbitrageOpportunities || 0}</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg bg-zinc-800/50">
                <span className="text-sm text-zinc-400">Active Agents</span>
                <span className="font-semibold text-yellow-400">{agentCount}</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg bg-zinc-800/50">
                <span className="text-sm text-zinc-400">Open Positions</span>
                <span className="font-semibold text-purple-400">{metrics?.activePositions || 0}</span>
              </div>
            </div>
          </div>

          {/* Migration Feed */}
          <MigrationFeed />
        </div>

      </div>

    </div>
  );
}
