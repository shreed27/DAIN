/**
 * PermissionManager - Handles wallet permission checks and enforcement
 */

import {
    WalletPermission,
    PermissionCheck,
    Action,
    TradeIntent
} from '../types';

export class PermissionManager {
    private permissions: Map<string, WalletPermission> = new Map();
    private dailyUsage: Map<string, { date: string; amount: number }> = new Map();
    private weeklyUsage: Map<string, { week: string; amount: number }> = new Map();

    /**
     * Register a wallet permission
     */
    registerPermission(permission: WalletPermission): void {
        this.permissions.set(permission.id, permission);
    }

    /**
     * Get permission by ID
     */
    getPermission(permissionId: string): WalletPermission | undefined {
        return this.permissions.get(permissionId);
    }

    /**
     * Get permission by agent ID
     */
    getPermissionByAgent(agentId: string): WalletPermission | undefined {
        return Array.from(this.permissions.values()).find(
            p => p.agentId === agentId && p.isActive
        );
    }

    /**
     * Check if a trade intent is permitted
     */
    checkPermission(intent: TradeIntent, permission: WalletPermission): PermissionCheck {
        // Check if permission is active
        if (!permission.isActive) {
            return {
                permitted: false,
                reason: 'Permission is not active'
            };
        }

        // Check if permission has expired
        if (Date.now() > permission.expiresAt) {
            return {
                permitted: false,
                reason: 'Permission has expired'
            };
        }

        // Check if action is allowed
        const actionAllowed = this.isActionAllowed(intent.action, permission.allowedActions);
        if (!actionAllowed) {
            return {
                permitted: false,
                reason: `Action '${intent.action}' is not permitted`
            };
        }

        // Check transaction value limit
        if (intent.amount > permission.limits.maxTransactionValue) {
            return {
                permitted: false,
                reason: `Transaction amount ${intent.amount} exceeds limit ${permission.limits.maxTransactionValue}`
            };
        }

        // Check daily limit
        const dailyCheck = this.checkDailyLimit(permission.id, intent.amount, permission.limits.dailyLimit);
        if (!dailyCheck.permitted) {
            return dailyCheck;
        }

        // Check weekly limit
        const weeklyCheck = this.checkWeeklyLimit(permission.id, intent.amount, permission.limits.weeklyLimit);
        if (!weeklyCheck.permitted) {
            return weeklyCheck;
        }

        // Check if manual approval is required
        if (permission.limits.requiresApproval) {
            const threshold = permission.limits.approvalThreshold || 0;
            if (intent.amount > threshold) {
                return {
                    permitted: false,
                    reason: 'Manual approval required for this transaction',
                    remainingDailyLimit: dailyCheck.remainingDailyLimit,
                    remainingWeeklyLimit: weeklyCheck.remainingWeeklyLimit
                };
            }
        }

        return {
            permitted: true,
            remainingDailyLimit: dailyCheck.remainingDailyLimit,
            remainingWeeklyLimit: weeklyCheck.remainingWeeklyLimit
        };
    }

    /**
     * Record transaction usage
     */
    recordUsage(permissionId: string, amount: number): void {
        // Record daily usage
        const today = new Date().toISOString().split('T')[0];
        const dailyKey = `${permissionId}-${today}`;
        const currentDaily = this.dailyUsage.get(dailyKey) || { date: today, amount: 0 };
        this.dailyUsage.set(dailyKey, {
            date: today,
            amount: currentDaily.amount + amount
        });

        // Record weekly usage
        const weekNumber = this.getWeekNumber(new Date());
        const weeklyKey = `${permissionId}-${weekNumber}`;
        const currentWeekly = this.weeklyUsage.get(weeklyKey) || { week: weekNumber, amount: 0 };
        this.weeklyUsage.set(weeklyKey, {
            week: weekNumber,
            amount: currentWeekly.amount + amount
        });
    }

    /**
     * Revoke a permission
     */
    revokePermission(permissionId: string): boolean {
        const permission = this.permissions.get(permissionId);
        if (!permission) {
            return false;
        }

        permission.isActive = false;
        permission.revokedAt = Date.now();
        return true;
    }

    /**
     * Clean up expired permissions
     */
    cleanupExpired(): number {
        const now = Date.now();
        let cleaned = 0;

        for (const [id, permission] of this.permissions.entries()) {
            if (permission.expiresAt < now && permission.isActive) {
                permission.isActive = false;
                cleaned++;
            }
        }

        return cleaned;
    }

    // Private helper methods

    private isActionAllowed(action: string, allowedActions: Action[]): boolean {
        // Map trade intent actions to permission actions
        const actionMap: Record<string, Action> = {
            'buy': Action.SWAP,
            'sell': Action.SWAP,
            'place_order': Action.PLACE_ORDER,
            'cancel_order': Action.CANCEL_ORDER,
            'close': Action.CLOSE_POSITION
        };

        const requiredAction = actionMap[action];
        return requiredAction ? allowedActions.includes(requiredAction) : false;
    }

    private checkDailyLimit(permissionId: string, amount: number, limit: number): PermissionCheck {
        const today = new Date().toISOString().split('T')[0];
        const dailyKey = `${permissionId}-${today}`;
        const usage = this.dailyUsage.get(dailyKey);
        const currentUsage = usage?.amount || 0;

        if (currentUsage + amount > limit) {
            return {
                permitted: false,
                reason: `Daily limit exceeded. Used: ${currentUsage}, Limit: ${limit}`,
                remainingDailyLimit: Math.max(0, limit - currentUsage)
            };
        }

        return {
            permitted: true,
            remainingDailyLimit: limit - currentUsage - amount
        };
    }

    private checkWeeklyLimit(permissionId: string, amount: number, limit: number): PermissionCheck {
        const weekNumber = this.getWeekNumber(new Date());
        const weeklyKey = `${permissionId}-${weekNumber}`;
        const usage = this.weeklyUsage.get(weeklyKey);
        const currentUsage = usage?.amount || 0;

        if (currentUsage + amount > limit) {
            return {
                permitted: false,
                reason: `Weekly limit exceeded. Used: ${currentUsage}, Limit: ${limit}`,
                remainingWeeklyLimit: Math.max(0, limit - currentUsage)
            };
        }

        return {
            permitted: true,
            remainingWeeklyLimit: limit - currentUsage - amount
        };
    }

    private getWeekNumber(date: Date): string {
        const year = date.getFullYear();
        const firstDayOfYear = new Date(year, 0, 1);
        const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
        const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
        return `${year}-W${weekNumber}`;
    }
}
