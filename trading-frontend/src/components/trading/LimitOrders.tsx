"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Target,
  TrendingUp,
  TrendingDown,
  Clock,
  Trash2,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface LimitOrder {
  id: string;
  walletAddress: string;
  token: string;
  tokenSymbol?: string;
  side: "buy" | "sell";
  amount: number;
  targetPrice: number;
  currentPrice?: number;
  status: "pending" | "triggered" | "executed" | "cancelled" | "expired";
  triggerCondition: "above" | "below";
  expiresAt?: number;
  createdAt: number;
}

interface LimitOrderStats {
  total: number;
  pending: number;
  executed: number;
  cancelled: number;
}

const STATUS_INFO: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  pending: { color: "text-yellow-400", icon: Clock, label: "Pending" },
  triggered: { color: "text-blue-400", icon: AlertCircle, label: "Triggered" },
  executed: { color: "text-green-400", icon: CheckCircle, label: "Executed" },
  cancelled: { color: "text-gray-400", icon: XCircle, label: "Cancelled" },
  expired: { color: "text-red-400", icon: XCircle, label: "Expired" },
};

function OrderCard({
  order,
  onCancel,
}: {
  order: LimitOrder;
  onCancel: (id: string) => void;
}) {
  const statusInfo = STATUS_INFO[order.status];
  const StatusIcon = statusInfo.icon;
  const isBuy = order.side === "buy";
  const isPending = order.status === "pending";

  // Calculate how close to trigger
  const priceDistance =
    order.currentPrice && order.targetPrice
      ? ((order.targetPrice - order.currentPrice) / order.currentPrice) * 100
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.03] transition-all"
    >
      <div className="flex items-center gap-4">
        {/* Side Icon */}
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

        {/* Order Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("font-medium uppercase", isBuy ? "text-green-400" : "text-red-400")}>
              {order.side}
            </span>
            <span className="font-medium text-white">
              {order.tokenSymbol || order.token.slice(0, 8)}
            </span>
            <span className={cn("px-2 py-0.5 rounded text-xs flex items-center gap-1", statusInfo.color, "bg-current/10")}>
              <StatusIcon className="w-3 h-3" />
              {statusInfo.label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {order.amount.toFixed(4)} @ ${order.targetPrice.toFixed(6)}
            <span className="mx-2">|</span>
            Trigger: {order.triggerCondition === "above" ? ">" : "<"} target
          </p>
        </div>

        {/* Price Info */}
        <div className="text-right">
          {order.currentPrice && (
            <p className="text-sm text-white">Current: ${order.currentPrice.toFixed(6)}</p>
          )}
          {priceDistance !== null && isPending && (
            <p
              className={cn(
                "text-xs mt-1",
                Math.abs(priceDistance) < 5 ? "text-yellow-400" : "text-muted-foreground"
              )}
            >
              {priceDistance > 0 ? "+" : ""}
              {priceDistance.toFixed(1)}% to trigger
            </p>
          )}
        </div>

        {/* Actions */}
        {isPending && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCancel(order.id);
            }}
            className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Expiry */}
      {order.expiresAt && isPending && (
        <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          Expires: {new Date(order.expiresAt).toLocaleString()}
        </div>
      )}
    </motion.div>
  );
}

interface CreateOrderFormProps {
  onSubmit: (order: Partial<LimitOrder>) => void;
  onCancel: () => void;
}

function CreateOrderForm({ onSubmit, onCancel }: CreateOrderFormProps) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [triggerCondition, setTriggerCondition] = useState<"above" | "below">("below");
  const [expiresIn, setExpiresIn] = useState("24");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      side,
      token,
      amount: parseFloat(amount),
      targetPrice: parseFloat(targetPrice),
      triggerCondition,
      expiresAt: Date.now() + parseInt(expiresIn) * 60 * 60 * 1000,
    });
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      onSubmit={handleSubmit}
      className="p-6 rounded-xl border border-white/10 bg-white/[0.03] space-y-4"
    >
      <h3 className="font-semibold text-white">Create Limit Order</h3>

      {/* Side Toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setSide("buy")}
          className={cn(
            "flex-1 py-2 rounded-lg font-medium transition-all",
            side === "buy"
              ? "bg-green-500/20 text-green-400 ring-1 ring-green-500/50"
              : "bg-white/5 text-muted-foreground hover:bg-white/10"
          )}
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => setSide("sell")}
          className={cn(
            "flex-1 py-2 rounded-lg font-medium transition-all",
            side === "sell"
              ? "bg-red-500/20 text-red-400 ring-1 ring-red-500/50"
              : "bg-white/5 text-muted-foreground hover:bg-white/10"
          )}
        >
          Sell
        </button>
      </div>

      {/* Token */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Token Address</label>
        <input
          type="text"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Enter token mint address"
          className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          required
        />
      </div>

      {/* Amount and Price */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Amount</label>
          <input
            type="number"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            required
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Target Price ($)</label>
          <input
            type="number"
            step="any"
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            placeholder="0.00"
            className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            required
          />
        </div>
      </div>

      {/* Trigger Condition */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Trigger When Price Is</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTriggerCondition("below")}
            className={cn(
              "flex-1 py-2 rounded-lg text-sm transition-all",
              triggerCondition === "below"
                ? "bg-white/10 text-white ring-1 ring-white/20"
                : "bg-white/5 text-muted-foreground hover:bg-white/10"
            )}
          >
            Below Target
          </button>
          <button
            type="button"
            onClick={() => setTriggerCondition("above")}
            className={cn(
              "flex-1 py-2 rounded-lg text-sm transition-all",
              triggerCondition === "above"
                ? "bg-white/10 text-white ring-1 ring-white/20"
                : "bg-white/5 text-muted-foreground hover:bg-white/10"
            )}
          >
            Above Target
          </button>
        </div>
      </div>

      {/* Expiry */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Expires In (hours)</label>
        <select
          value={expiresIn}
          onChange={(e) => setExpiresIn(e.target.value)}
          className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          <option value="1">1 hour</option>
          <option value="6">6 hours</option>
          <option value="12">12 hours</option>
          <option value="24">24 hours</option>
          <option value="48">48 hours</option>
          <option value="168">1 week</option>
        </select>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-10 rounded-lg bg-white/5 hover:bg-white/10 text-muted-foreground font-medium transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className={cn(
            "flex-1 h-10 rounded-lg font-medium transition-colors",
            side === "buy"
              ? "bg-green-600 hover:bg-green-500 text-white"
              : "bg-red-600 hover:bg-red-500 text-white"
          )}
        >
          Create Order
        </button>
      </div>
    </motion.form>
  );
}

interface LimitOrdersProps {
  walletAddress?: string;
  className?: string;
  compact?: boolean;
}

export function LimitOrders({ walletAddress = "demo_wallet", className, compact = false }: LimitOrdersProps) {
  const [orders, setOrders] = useState<LimitOrder[]>([]);
  const [stats, setStats] = useState<LimitOrderStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const fetchData = async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const [ordersRes, statsRes] = await Promise.all([
        api.getLimitOrders(walletAddress),
        api.getLimitOrderStats(walletAddress),
      ]);

      if (ordersRes.success && ordersRes.data) {
        setOrders(ordersRes.data as LimitOrder[]);
      }

      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data as LimitOrderStats);
      }
    } catch (error) {
      console.error("Failed to fetch limit orders:", error);
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
  }, [walletAddress]);

  const handleCreateOrder = async (orderData: Partial<LimitOrder>) => {
    try {
      const response = await api.createLimitOrder({
        walletAddress,
        ...orderData,
      });

      if (response.success) {
        setShowCreateForm(false);
        fetchData(true);
      }
    } catch (error) {
      console.error("Failed to create limit order:", error);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    try {
      const response = await api.cancelLimitOrder(orderId);
      if (response.success) {
        fetchData(true);
      }
    } catch (error) {
      console.error("Failed to cancel limit order:", error);
    }
  };

  const filteredOrders = orders.filter((order) => {
    if (filter === "all") return true;
    return order.status === filter;
  });

  return (
    <div className={cn("rounded-xl border border-white/5 bg-white/[0.02] p-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-orange-400" />
          <h3 className="font-semibold text-white">Limit Orders</h3>
          {stats && (
            <span className="text-xs text-muted-foreground">
              ({stats.pending} pending)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchData(true)}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <RefreshCw
              className={cn("w-4 h-4 text-muted-foreground", isRefreshing && "animate-spin")}
            />
          </button>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            New Order
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && !compact && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="p-3 rounded-lg bg-white/5 text-center">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="font-bold text-white">{stats.total}</p>
          </div>
          <div className="p-3 rounded-lg bg-yellow-500/10 text-center">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="font-bold text-yellow-400">{stats.pending}</p>
          </div>
          <div className="p-3 rounded-lg bg-green-500/10 text-center">
            <p className="text-xs text-muted-foreground">Executed</p>
            <p className="font-bold text-green-400">{stats.executed}</p>
          </div>
          <div className="p-3 rounded-lg bg-gray-500/10 text-center">
            <p className="text-xs text-muted-foreground">Cancelled</p>
            <p className="font-bold text-gray-400">{stats.cancelled}</p>
          </div>
        </div>
      )}

      {/* Filter */}
      {!compact && (
        <div className="flex gap-2 mb-4">
          {["all", "pending", "executed", "cancelled"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-medium transition-all",
                filter === f
                  ? "bg-white/10 text-white"
                  : "bg-white/5 text-muted-foreground hover:bg-white/10"
              )}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* Create Form */}
      <AnimatePresence>
        {showCreateForm && (
          <div className="mb-4">
            <CreateOrderForm
              onSubmit={handleCreateOrder}
              onCancel={() => setShowCreateForm(false)}
            />
          </div>
        )}
      </AnimatePresence>

      {/* Orders List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin w-6 h-6 border-2 border-white/20 border-t-white rounded-full" />
        </div>
      ) : filteredOrders.length > 0 ? (
        <div className={cn("space-y-2", compact ? "max-h-[300px]" : "max-h-[500px]", "overflow-y-auto")}>
          <AnimatePresence mode="popLayout">
            {filteredOrders.map((order) => (
              <OrderCard key={order.id} order={order} onCancel={handleCancelOrder} />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="text-center py-8">
          <Target className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No limit orders found.</p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="mt-3 text-sm text-orange-400 hover:underline"
          >
            Create your first limit order
          </button>
        </div>
      )}
    </div>
  );
}

export default LimitOrders;
