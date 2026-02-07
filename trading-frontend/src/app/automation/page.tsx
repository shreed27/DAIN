"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  Plus,
  Clock,
  TrendingUp,
  Bell,
  Pause,
  Play,
  Trash2,
  X,
  AlertCircle,
  CheckCircle,
  XCircle,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  ruleType: string;
  triggerConfig: Record<string, unknown>;
  actionConfig: Record<string, unknown>;
  enabled: boolean;
  lastTriggeredAt?: number;
  nextTriggerAt?: number;
  triggerCount: number;
  maxTriggers?: number;
}

interface AutomationStats {
  totalRules: number;
  activeRules: number;
  totalTriggers: number;
  successfulTriggers: number;
  failedTriggers: number;
  byType: Record<string, number>;
}

interface AutomationHistory {
  id: string;
  ruleId: string;
  triggeredAt: number;
  actionTaken: string;
  result: string;
  error?: string;
}

const RULE_TYPE_INFO: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  scheduled: { icon: Calendar, color: "text-blue-400", label: "Scheduled" },
  recurring: { icon: Clock, color: "text-purple-400", label: "Recurring" },
  price_trigger: { icon: TrendingUp, color: "text-green-400", label: "Price Trigger" },
  condition: { icon: AlertCircle, color: "text-yellow-400", label: "Condition" },
};

const ACTION_TYPE_INFO: Record<string, { icon: React.ElementType; color: string }> = {
  trade: { icon: TrendingUp, color: "text-green-400" },
  alert: { icon: Bell, color: "text-yellow-400" },
  notify: { icon: Bell, color: "text-blue-400" },
  rebalance: { icon: Zap, color: "text-purple-400" },
  close_position: { icon: XCircle, color: "text-red-400" },
  adjust_sl_tp: { icon: AlertCircle, color: "text-orange-400" },
};

function CreateRuleModal({
  onClose,
  onCreated,
  userWallet,
}: {
  onClose: () => void;
  onCreated: () => void;
  userWallet: string;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ruleType, setRuleType] = useState("price_trigger");
  const [actionType, setActionType] = useState("alert");

  // Trigger config
  const [token, setToken] = useState("");
  const [priceCondition, setPriceCondition] = useState("above");
  const [targetPrice, setTargetPrice] = useState("");
  const [cronExpression, setCronExpression] = useState("");

  // Action config
  const [alertMessage, setAlertMessage] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      const triggerConfig: Record<string, unknown> = {};
      const actionConfig: Record<string, unknown> = { actionType };

      if (ruleType === "price_trigger") {
        triggerConfig.token = token;
        triggerConfig.priceCondition = priceCondition;
        triggerConfig.targetPrice = parseFloat(targetPrice);
      } else if (ruleType === "scheduled" || ruleType === "recurring") {
        triggerConfig.cronExpression = cronExpression;
      }

      if (actionType === "alert" || actionType === "notify") {
        actionConfig.message = alertMessage;
      }

      await api.createAutomationRule({
        userWallet,
        name: name.trim(),
        description: description.trim() || undefined,
        ruleType,
        triggerConfig,
        actionConfig,
      });
      onCreated();
      onClose();
    } catch (error) {
      console.error("Failed to create rule:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-900 border border-white/10 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-auto"
      >
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Create Automation Rule</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Basic Info */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Rule Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Alert when SOL hits $200"
              className="w-full h-10 px-4 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={2}
              className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-yellow-500/50 resize-none"
            />
          </div>

          {/* Rule Type */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Trigger Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(RULE_TYPE_INFO).map(([type, info]) => {
                const Icon = info.icon;
                return (
                  <button
                    key={type}
                    onClick={() => setRuleType(type)}
                    className={cn(
                      "p-3 rounded-lg border flex items-center gap-2 transition-all",
                      ruleType === type
                        ? "border-yellow-500/50 bg-yellow-500/10"
                        : "border-white/10 hover:border-white/20"
                    )}
                  >
                    <Icon className={cn("w-4 h-4", info.color)} />
                    <span className="text-sm text-white">{info.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Trigger Config */}
          {ruleType === "price_trigger" && (
            <div className="p-4 rounded-lg bg-white/5 space-y-3">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Token
                </label>
                <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Token mint address"
                  className="w-full h-10 px-4 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">
                    Condition
                  </label>
                  <select
                    value={priceCondition}
                    onChange={(e) => setPriceCondition(e.target.value)}
                    className="w-full h-10 px-4 rounded-lg bg-white/5 border border-white/10 text-white"
                  >
                    <option value="above">Price Above</option>
                    <option value="below">Price Below</option>
                    <option value="crosses">Price Crosses</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">
                    Target Price ($)
                  </label>
                  <input
                    type="number"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full h-10 px-4 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {(ruleType === "scheduled" || ruleType === "recurring") && (
            <div className="p-4 rounded-lg bg-white/5">
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Cron Expression
              </label>
              <input
                type="text"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                placeholder="e.g., 0 9 * * * (daily at 9am)"
                className="w-full h-10 px-4 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Format: minute hour day month weekday
              </p>
            </div>
          )}

          {/* Action Type */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Action
            </label>
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
              className="w-full h-10 px-4 rounded-lg bg-white/5 border border-white/10 text-white"
            >
              <option value="alert">Send Alert</option>
              <option value="notify">Send Notification</option>
              <option value="trade">Execute Trade</option>
              <option value="close_position">Close Position</option>
            </select>
          </div>

          {(actionType === "alert" || actionType === "notify") && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Alert Message
              </label>
              <input
                type="text"
                value={alertMessage}
                onChange={(e) => setAlertMessage(e.target.value)}
                placeholder="Message to send..."
                className="w-full h-10 px-4 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
          )}
        </div>

        <div className="p-6 border-t border-white/10">
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || isSubmitting}
            className="w-full h-12 rounded-xl bg-yellow-600 hover:bg-yellow-500 disabled:bg-white/10 disabled:text-muted-foreground text-white font-medium transition-colors"
          >
            {isSubmitting ? "Creating..." : "Create Rule"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function RuleCard({
  rule,
  onToggle,
  onDelete,
}: {
  rule: AutomationRule;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const typeInfo = RULE_TYPE_INFO[rule.ruleType] || RULE_TYPE_INFO.condition;
  const actionInfo = ACTION_TYPE_INFO[(rule.actionConfig as { actionType?: string })?.actionType || 'alert'] || ACTION_TYPE_INFO.alert;
  const TypeIcon = typeInfo.icon;
  const ActionIcon = actionInfo.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "p-4 rounded-xl border transition-all",
        rule.enabled
          ? "bg-white/[0.02] border-white/10"
          : "bg-white/[0.01] border-white/5 opacity-60"
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center")}>
            <TypeIcon className={cn("w-5 h-5", typeInfo.color)} />
          </div>
          <div>
            <h3 className="font-medium text-white">{rule.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={cn("text-xs px-2 py-0.5 rounded", typeInfo.color, `bg-current/10`)}>
                {typeInfo.label}
              </span>
              <span
                className={cn(
                  "px-2 py-0.5 rounded text-xs",
                  rule.enabled
                    ? "bg-green-500/10 text-green-400"
                    : "bg-white/5 text-muted-foreground"
                )}
              >
                {rule.enabled ? "Active" : "Paused"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onToggle(rule.id, !rule.enabled)}
            className={cn(
              "p-2 rounded-lg transition-colors",
              rule.enabled
                ? "hover:bg-yellow-500/10 text-yellow-400"
                : "hover:bg-green-500/10 text-green-400"
            )}
          >
            {rule.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            onClick={() => onDelete(rule.id)}
            className="p-2 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {rule.description && (
        <p className="text-sm text-muted-foreground mb-3">{rule.description}</p>
      )}

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-4 text-muted-foreground">
          <span className="flex items-center gap-1">
            <ActionIcon className={cn("w-4 h-4", actionInfo.color)} />
            {(rule.actionConfig as { actionType?: string })?.actionType || 'alert'}
          </span>
          <span>Triggered {rule.triggerCount} times</span>
        </div>
        {rule.nextTriggerAt && (
          <span className="text-xs text-muted-foreground">
            Next: {new Date(rule.nextTriggerAt).toLocaleString()}
          </span>
        )}
      </div>
    </motion.div>
  );
}

export default function AutomationPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [stats, setStats] = useState<AutomationStats | null>(null);
  const [history, setHistory] = useState<AutomationHistory[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Mock wallet
  const userWallet = "demo_wallet_address";

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [rulesRes, statsRes, historyRes] = await Promise.all([
        api.getAutomationRules(userWallet),
        api.getAutomationStats(userWallet),
        api.getAutomationHistory({ userWallet, limit: 20 }),
      ]);

      if (rulesRes.success && rulesRes.data) {
        setRules(rulesRes.data as AutomationRule[]);
      }

      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data as AutomationStats);
      }

      if (historyRes.success && historyRes.data) {
        setHistory(historyRes.data as AutomationHistory[]);
      }
    } catch (error) {
      console.error("Failed to fetch automation data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggle = async (ruleId: string, enabled: boolean) => {
    await api.toggleAutomationRule(ruleId, enabled);
    fetchData();
  };

  const handleDelete = async (ruleId: string) => {
    if (confirm("Are you sure you want to delete this rule?")) {
      await api.deleteAutomationRule(ruleId);
      fetchData();
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
            <Zap className="w-8 h-8 text-yellow-400" /> Automation
          </h1>
          <p className="text-muted-foreground">
            Create rules to automate trading actions, alerts, and more.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="h-10 px-6 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white font-medium flex items-center gap-2 shadow-lg transition-all hover:scale-105 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Create Rule
        </button>
      </header>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <p className="text-xs text-muted-foreground">Active Rules</p>
            <p className="font-bold text-2xl text-white mt-1">
              {stats.activeRules}/{stats.totalRules}
            </p>
          </div>
          <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <p className="text-xs text-muted-foreground">Total Triggers</p>
            <p className="font-bold text-2xl text-white mt-1">{stats.totalTriggers}</p>
          </div>
          <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <p className="text-xs text-muted-foreground">Successful</p>
            <p className="font-bold text-2xl text-green-400 mt-1">
              {stats.successfulTriggers}
            </p>
          </div>
          <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <p className="text-xs text-muted-foreground">Failed</p>
            <p className="font-bold text-2xl text-red-400 mt-1">{stats.failedTriggers}</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full" />
        </div>
      ) : (
        <>
          {/* Rules */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Rules</h2>
            {rules.length > 0 ? (
              <div className="space-y-3">
                {rules.map((rule) => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 rounded-xl border border-white/5 bg-white/[0.02]">
                <Zap className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">
                  No automation rules yet. Create your first rule!
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="h-10 px-6 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white font-medium"
                >
                  Create Rule
                </button>
              </div>
            )}
          </div>

          {/* History */}
          {history.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-4">Recent Executions</h2>
              <div className="space-y-2">
                {history.slice(0, 10).map((h) => (
                  <div
                    key={h.id}
                    className="p-3 rounded-lg border border-white/5 bg-white/[0.02] flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center",
                          h.result === "success"
                            ? "bg-green-500/10"
                            : h.result === "failed"
                              ? "bg-red-500/10"
                              : "bg-yellow-500/10"
                        )}
                      >
                        {h.result === "success" ? (
                          <CheckCircle className="w-4 h-4 text-green-400" />
                        ) : h.result === "failed" ? (
                          <XCircle className="w-4 h-4 text-red-400" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-yellow-400" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm text-white">{h.actionTaken}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(h.triggeredAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    {h.error && (
                      <span className="text-xs text-red-400">{h.error}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateRuleModal
            onClose={() => setShowCreateModal(false)}
            onCreated={fetchData}
            userWallet={userWallet}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
