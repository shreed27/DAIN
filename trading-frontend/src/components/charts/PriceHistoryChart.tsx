"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { TrendingUp, TrendingDown, Clock, RefreshCw } from "lucide-react";

interface PriceCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PriceStats {
  high24h: number;
  low24h: number;
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  avgPrice24h: number;
}

type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

const INTERVALS: { value: Interval; label: string }[] = [
  { value: "1m", label: "1m" },
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "1h", label: "1h" },
  { value: "4h", label: "4h" },
  { value: "1d", label: "1d" },
];

interface PriceHistoryChartProps {
  token: string;
  tokenSymbol?: string;
  className?: string;
  showStats?: boolean;
  height?: number;
}

export function PriceHistoryChart({
  token,
  tokenSymbol,
  className,
  showStats = true,
  height = 300,
}: PriceHistoryChartProps) {
  const [interval, setInterval] = useState<Interval>("1h");
  const [priceData, setPriceData] = useState<PriceCandle[]>([]);
  const [stats, setStats] = useState<PriceStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      // Calculate time range based on interval
      const intervalMs = {
        "1m": 60 * 1000,
        "5m": 5 * 60 * 1000,
        "15m": 15 * 60 * 1000,
        "1h": 60 * 60 * 1000,
        "4h": 4 * 60 * 60 * 1000,
        "1d": 24 * 60 * 60 * 1000,
      };

      const candleCount = 100;
      const endTime = Date.now();
      const startTime = endTime - candleCount * intervalMs[interval];

      const [historyRes, statsRes] = await Promise.all([
        api.getPriceHistory(token, interval, startTime, endTime),
        api.getPriceStats(token),
      ]);

      if (historyRes.success && historyRes.data) {
        setPriceData(historyRes.data as PriceCandle[]);
      }

      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data as PriceStats);
      }
    } catch (error) {
      console.error("Failed to fetch price history:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token, interval]);

  // Format data for chart
  const chartData = priceData.map((candle) => ({
    time: new Date(candle.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    price: candle.close,
    high: candle.high,
    low: candle.low,
    volume: candle.volume,
  }));

  const latestPrice = priceData[priceData.length - 1]?.close || 0;
  const priceChange = stats?.changePercent24h || 0;
  const isPositive = priceChange >= 0;

  const formatPrice = (price: number) => {
    if (price >= 1) return `$${price.toFixed(2)}`;
    if (price >= 0.01) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(8)}`;
  };

  return (
    <div className={cn("rounded-xl border border-white/5 bg-white/[0.02] p-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-white flex items-center gap-2">
            {tokenSymbol || token.slice(0, 8)}
            <span className="text-muted-foreground text-sm font-normal">Price History</span>
          </h3>
          {!isLoading && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-2xl font-bold text-white">{formatPrice(latestPrice)}</span>
              <span
                className={cn(
                  "flex items-center gap-1 text-sm font-medium",
                  isPositive ? "text-green-400" : "text-red-400"
                )}
              >
                {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {isPositive ? "+" : ""}
                {priceChange.toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Interval Selector */}
          <div className="flex rounded-lg bg-white/5 p-1">
            {INTERVALS.map((int) => (
              <button
                key={int.value}
                onClick={() => setInterval(int.value)}
                className={cn(
                  "px-2 py-1 rounded text-xs font-medium transition-all",
                  interval === int.value
                    ? "bg-white/10 text-white"
                    : "text-muted-foreground hover:text-white"
                )}
              >
                {int.label}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => fetchData(true)}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <RefreshCw
              className={cn("w-4 h-4 text-muted-foreground", isRefreshing && "animate-spin")}
            />
          </button>
        </div>
      </div>

      {/* Chart */}
      {isLoading ? (
        <div className="flex items-center justify-center" style={{ height }}>
          <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full" />
        </div>
      ) : chartData.length > 0 ? (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id={`gradient-${token}`} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={isPositive ? "#22c55e" : "#ef4444"}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor={isPositive ? "#22c55e" : "#ef4444"}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="time"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#666", fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#666", fontSize: 10 }}
                domain={["auto", "auto"]}
                tickFormatter={(value) => formatPrice(value)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(0,0,0,0.9)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  padding: "8px 12px",
                }}
                labelStyle={{ color: "#888", fontSize: 12 }}
                formatter={(value: number) => [formatPrice(value), "Price"]}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={isPositive ? "#22c55e" : "#ef4444"}
                strokeWidth={2}
                fillOpacity={1}
                fill={`url(#gradient-${token})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div
          className="flex items-center justify-center text-muted-foreground"
          style={{ height }}
        >
          No price data available
        </div>
      )}

      {/* Stats */}
      {showStats && stats && (
        <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-white/5">
          <div>
            <p className="text-xs text-muted-foreground">24h High</p>
            <p className="text-sm font-medium text-green-400">{formatPrice(stats.high24h)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">24h Low</p>
            <p className="text-sm font-medium text-red-400">{formatPrice(stats.low24h)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">24h Volume</p>
            <p className="text-sm font-medium text-white">
              ${(stats.volume24h / 1000).toFixed(1)}K
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Avg Price</p>
            <p className="text-sm font-medium text-white">{formatPrice(stats.avgPrice24h)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default PriceHistoryChart;
