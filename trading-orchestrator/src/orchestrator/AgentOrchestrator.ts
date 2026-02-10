/**
 * AgentOrchestrator - Manages agent lifecycle and coordinates execution
 */

import { EventEmitter } from 'events';
import {
    AgentConfig,
    AgentStatus,
    AgentPerformance,
    Signal,
    SignalSource,
    TradeIntent,
    ExecutionResult,
    Position,
    AgentEvent,
    EventType,
    TradeSide
} from '../types';
import { PermissionManager } from './PermissionManager';
import { StrategyRegistry } from './StrategyRegistry';
import {
    AgentDexAdapter,
    OpenClawAdapter,
    OpusXAdapter,
    OsintMarketAdapter,
    ClawdnetAdapter,
    CloddsBotAdapter
} from '../adapters';

// SOL mint address (native SOL wrapped)
const SOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 * Calculate realized P&L from an execution result
 */
function calculatePnL(
    result: ExecutionResult,
    positions: Position[]
): { pnl: number; isWin: boolean } {
    if (!result.success) {
        return { pnl: 0, isWin: false };
    }

    // For sell orders, we're closing a position - calculate realized P&L
    if (result.side === 'sell') {
        // Find matching position by token
        const position = positions.find(p => p.token === result.token);
        if (position) {
            const entryValue = position.entryPrice * result.executedAmount;
            const exitValue = result.executedPrice * result.executedAmount;
            const fees = result.fees || 0;
            const pnl = exitValue - entryValue - fees;
            return { pnl, isWin: pnl > 0 };
        }
    }

    // For buy orders, P&L is realized on close
    // Track entry for future calculation (no realized P&L yet)
    return { pnl: 0, isWin: false };
}

interface ClosePositionResult {
    success: boolean;
    amountReceived?: number;
    error?: string;
}

export interface OrchestratorAdapters {
    agentDex?: AgentDexAdapter;
    openClaw?: OpenClawAdapter;
    opusX?: OpusXAdapter;
    osintMarket?: OsintMarketAdapter;
    clawdnet?: ClawdnetAdapter;
    cloddsBot?: CloddsBotAdapter;
}

export class AgentOrchestrator extends EventEmitter {
    private agents: Map<string, AgentConfig> = new Map();
    private positions: Map<string, Position[]> = new Map();
    private performance: Map<string, AgentPerformance> = new Map();
    private adapters: OrchestratorAdapters;

    constructor(
        private permissionManager: PermissionManager,
        private strategyRegistry: StrategyRegistry,
        adapters?: OrchestratorAdapters
    ) {
        super();
        this.adapters = adapters || {};
    }

    /**
     * Set adapters after construction
     */
    setAdapters(adapters: OrchestratorAdapters): void {
        this.adapters = { ...this.adapters, ...adapters };
    }

    /**
     * Create and start a new agent
     */
    async createAgent(config: Omit<AgentConfig, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<AgentConfig> {
        // Validate strategy exists
        const strategy = this.strategyRegistry.get(config.strategyId);
        if (!strategy) {
            throw new Error(`Strategy ${config.strategyId} not found`);
        }

        // Create agent config
        const agent: AgentConfig = {
            ...config,
            id: this.generateAgentId(),
            status: AgentStatus.Active,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        // Register permission
        this.permissionManager.registerPermission(config.permissions);

        // Initialize agent state
        this.agents.set(agent.id, agent);
        this.positions.set(agent.id, []);
        this.performance.set(agent.id, {
            totalTrades: 0,
            winRate: 0,
            totalPnL: 0,
            currentPositions: 0,
            dailyPnL: 0,
            weeklyPnL: 0
        });

        // Emit event
        this.emitEvent({
            type: EventType.AgentResumed,
            agentId: agent.id,
            timestamp: Date.now(),
            data: agent
        });

        return agent;
    }

    /**
     * Get agent by ID
     */
    getAgent(agentId: string): AgentConfig | undefined {
        return this.agents.get(agentId);
    }

    /**
     * Get all agents for a user
     */
    getAgentsByUser(userId: string): AgentConfig[] {
        return Array.from(this.agents.values()).filter(
            a => a.userId === userId
        );
    }

    /**
     * Process signals for an agent
     */
    async processSignals(agentId: string, signals: Signal[]): Promise<TradeIntent | null> {
        const agent = this.agents.get(agentId);
        if (!agent || agent.status !== AgentStatus.Active) {
            return null;
        }

        // Get strategy
        const strategy = this.strategyRegistry.get(agent.strategyId);
        if (!strategy) {
            throw new Error(`Strategy ${agent.strategyId} not found`);
        }

        // Emit signal received events
        signals.forEach(signal => {
            this.emitEvent({
                type: EventType.SignalReceived,
                agentId,
                timestamp: Date.now(),
                data: signal
            });
        });

        // Evaluate strategy
        const intent = strategy.evaluate(signals);

        if (intent) {
            // Add agent context to intent
            intent.agentId = agentId;
            intent.strategyId = agent.strategyId;
            intent.id = this.generateIntentId();
            intent.createdAt = Date.now();

            // Emit intent generated event
            this.emitEvent({
                type: EventType.IntentGenerated,
                agentId,
                timestamp: Date.now(),
                data: intent
            });
        }

        return intent;
    }

    /**
     * Record execution result and update P&L
     */
    recordExecution(agentId: string, result: ExecutionResult): void {
        const performance = this.performance.get(agentId);
        if (!performance) {
            return;
        }

        // Update performance metrics
        performance.totalTrades++;

        if (result.success) {
            // Calculate actual P&L from execution
            const positions = this.positions.get(agentId) || [];
            const { pnl, isWin } = calculatePnL(result, positions);

            performance.totalPnL += pnl;
            performance.dailyPnL += pnl;
            performance.weeklyPnL += pnl;

            // Update win rate
            if (result.side === 'sell' && pnl !== 0) {
                const totalClosedTrades = performance.totalTrades;
                const previousWins = Math.round(performance.winRate * (totalClosedTrades - 1) / 100);
                const newWins = previousWins + (isWin ? 1 : 0);
                performance.winRate = totalClosedTrades > 0 ? (newWins / totalClosedTrades) * 100 : 0;
            }
        }

        // Emit event
        const eventType = result.success ? EventType.ExecutionCompleted : EventType.ExecutionFailed;
        this.emitEvent({
            type: eventType,
            agentId,
            timestamp: Date.now(),
            data: { ...result, calculatedPnL: result.success ? calculatePnL(result, this.positions.get(agentId) || []).pnl : 0 }
        });
    }

    /**
     * Add position for an agent
     */
    addPosition(agentId: string, position: Position): void {
        const positions = this.positions.get(agentId) || [];
        positions.push(position);
        this.positions.set(agentId, positions);

        const performance = this.performance.get(agentId);
        if (performance) {
            performance.currentPositions = positions.length;
        }

        this.emitEvent({
            type: EventType.PositionOpened,
            agentId,
            timestamp: Date.now(),
            data: position
        });
    }

    /**
     * Close position for an agent
     */
    closePosition(agentId: string, positionId: string): void {
        const positions = this.positions.get(agentId) || [];
        const index = positions.findIndex(p => p.id === positionId);

        if (index !== -1) {
            const position = positions[index];
            positions.splice(index, 1);
            this.positions.set(agentId, positions);

            const performance = this.performance.get(agentId);
            if (performance) {
                performance.currentPositions = positions.length;
            }

            this.emitEvent({
                type: EventType.PositionClosed,
                agentId,
                timestamp: Date.now(),
                data: position
            });
        }
    }

    /**
     * Get positions for an agent
     */
    getPositions(agentId: string): Position[] {
        return this.positions.get(agentId) || [];
    }

    /**
     * Get performance for an agent
     */
    getPerformance(agentId: string): AgentPerformance | undefined {
        return this.performance.get(agentId);
    }

    /**
     * Pause an agent
     */
    pauseAgent(agentId: string): boolean {
        const agent = this.agents.get(agentId);
        if (!agent) {
            return false;
        }

        agent.status = AgentStatus.Paused;
        agent.updatedAt = Date.now();

        this.emitEvent({
            type: EventType.AgentPaused,
            agentId,
            timestamp: Date.now(),
            data: { reason: 'Manual pause' }
        });

        return true;
    }

    /**
     * Resume an agent
     */
    resumeAgent(agentId: string): boolean {
        const agent = this.agents.get(agentId);
        if (!agent) {
            return false;
        }

        agent.status = AgentStatus.Active;
        agent.updatedAt = Date.now();

        this.emitEvent({
            type: EventType.AgentResumed,
            agentId,
            timestamp: Date.now(),
            data: { reason: 'Manual resume' }
        });

        return true;
    }

    /**
     * Kill switch - immediately stop agent and close all positions
     */
    async killAgent(agentId: string): Promise<{
        success: boolean;
        positionsClosed: number;
        fundsReturned: number;
        errors: string[];
    }> {
        const agent = this.agents.get(agentId);
        if (!agent) {
            return { success: false, positionsClosed: 0, fundsReturned: 0, errors: ['Agent not found'] };
        }

        // Stop agent immediately to prevent new trades
        agent.status = AgentStatus.Stopped;
        agent.updatedAt = Date.now();

        // Get all positions
        const positions = this.positions.get(agentId) || [];
        let fundsReturned = 0;
        let positionsClosed = 0;
        const errors: string[] = [];

        // Actually close each position via execution engines
        for (const position of positions) {
            try {
                const closeResult = await this.closePositionOnExchange(position);
                if (closeResult.success) {
                    fundsReturned += closeResult.amountReceived || 0;
                    positionsClosed++;

                    this.emitEvent({
                        type: EventType.PositionClosed,
                        agentId,
                        timestamp: Date.now(),
                        data: { ...position, closeResult }
                    });
                } else {
                    errors.push(`Failed to close ${position.symbol}: ${closeResult.error}`);
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                errors.push(`Error closing ${position.symbol}: ${errorMsg}`);
            }
        }

        // Clear local state only after attempting closes
        this.positions.set(agentId, []);

        // Revoke permissions
        const permission = this.permissionManager.getPermissionByAgent(agentId);
        if (permission) {
            this.permissionManager.revokePermission(permission.id);
        }

        return {
            success: errors.length === 0,
            positionsClosed,
            fundsReturned,
            errors
        };
    }

    /**
     * Close a position on the appropriate exchange
     */
    private async closePositionOnExchange(position: Position): Promise<ClosePositionResult> {
        // Route to appropriate adapter based on exchange

        // Solana DEX (Jupiter, Raydium, etc.)
        if (position.exchange === 'solana' || position.exchange === 'jupiter') {
            if (!this.adapters.agentDex) {
                return { success: false, error: 'AgentDex adapter not configured' };
            }

            try {
                // Sell token back to SOL
                const result = await this.adapters.agentDex.executeSwap({
                    inputMint: position.tokenMint || position.token,
                    outputMint: SOL_MINT,
                    amount: String(position.amount),
                    slippageBps: 100, // 1% emergency slippage
                });

                return {
                    success: true,
                    amountReceived: Number(result.outputAmount) / 1e9, // Convert lamports to SOL
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Swap execution failed',
                };
            }
        }

        // Perpetual futures (Binance, Bybit, Hyperliquid, Drift)
        if (position.exchange === 'binance' || position.exchange === 'bybit' ||
            position.exchange === 'hyperliquid' || position.exchange === 'drift') {
            if (!this.adapters.openClaw) {
                return { success: false, error: 'OpenClaw adapter not configured' };
            }

            try {
                const result = await this.adapters.openClaw.closePosition({
                    exchange: position.exchange,
                    symbol: position.symbol,
                    side: position.amount > 0 ? 'long' : 'short',
                });

                return {
                    success: result.success,
                    amountReceived: result.executedAmount ? result.executedAmount * (result.executedPrice || position.currentPrice) : undefined,
                    error: result.error,
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Close position failed',
                };
            }
        }

        // Prediction markets (Polymarket, Kalshi, Manifold, etc.)
        if (position.exchange === 'polymarket' || position.exchange === 'kalshi' ||
            position.exchange === 'manifold' || position.exchange === 'metaculus' ||
            position.exchange === 'predictit' || position.exchange === 'betfair') {
            if (!this.adapters.cloddsBot) {
                return { success: false, error: 'CloddsBot adapter not configured' };
            }

            try {
                const result = await this.adapters.cloddsBot.executeOrder({
                    platform: position.exchange,
                    marketId: position.marketId || position.symbol,
                    tokenId: position.tokenId,
                    side: 'sell',
                    price: position.currentPrice,
                    size: Math.abs(position.amount),
                    orderType: 'FOK', // Fill-or-Kill for emergency close
                });

                return {
                    success: result.success,
                    amountReceived: result.filledSize ? result.filledSize * (result.avgPrice || position.currentPrice) : undefined,
                    error: result.error,
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Order execution failed',
                };
            }
        }

        // EVM DEX (Uniswap, etc.)
        if (position.exchange === 'uniswap' || position.exchange === 'evm') {
            if (!this.adapters.openClaw) {
                return { success: false, error: 'OpenClaw adapter not configured' };
            }

            try {
                const result = await this.adapters.openClaw.closePosition({
                    exchange: 'uniswap',
                    symbol: position.symbol,
                    side: position.amount > 0 ? 'long' : 'short',
                });

                return {
                    success: result.success,
                    amountReceived: result.executedAmount ? result.executedAmount * (result.executedPrice || position.currentPrice) : undefined,
                    error: result.error,
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Close position failed',
                };
            }
        }

        return { success: false, error: `Unknown exchange: ${position.exchange}` };
    }

    // ==================== OpusX Integration ====================

    /**
     * Get whale signals from OpusX god wallets
     */
    async getWhaleSignals(): Promise<Signal[]> {
        if (!this.adapters.opusX) {
            return [];
        }

        try {
            const recentBuys = await this.adapters.opusX.getGodWalletRecentBuys(20);
            return recentBuys.map(buy => ({
                id: `whale_${buy.tokenMint}_${buy.timestamp}`,
                source: SignalSource.Whale,
                token: buy.tokenMint,
                confidence: buy.walletConfidence || 0.7,
                timestamp: buy.timestamp,
                data: {
                    walletLabel: buy.walletLabel,
                    walletAddress: buy.walletAddress,
                    amount: buy.amount,
                    entryPrice: buy.entryPrice,
                    marketCap: buy.marketCap || buy.entryMarketCap,
                }
            }));
        } catch (error) {
            console.error('[AgentOrchestrator] Failed to get whale signals:', error);
            return [];
        }
    }

    /**
     * Get AI analysis for a token from OpusX
     */
    async getAIAnalysis(tokenMint: string): Promise<{
        recommendation: string;
        confidence: number;
        reasoning: string;
    } | null> {
        if (!this.adapters.opusX) {
            return null;
        }

        try {
            const analysis = await this.adapters.opusX.getAIEntryAnalysis(tokenMint);
            if (!analysis) return null;

            return {
                recommendation: analysis.recommendation,
                confidence: analysis.confidence,
                reasoning: analysis.reasoning,
            };
        } catch (error) {
            console.error('[AgentOrchestrator] Failed to get AI analysis:', error);
            return null;
        }
    }

    /**
     * Subscribe to real-time whale signals via WebSocket
     */
    subscribeToWhaleSignals(callback: (signal: Signal) => void): void {
        if (!this.adapters.opusX) {
            console.warn('[AgentOrchestrator] OpusX adapter not configured');
            return;
        }

        this.adapters.opusX.on('god_wallet_buy', (data: any) => {
            const signal: Signal = {
                id: `whale_${data.tokenMint}_${Date.now()}`,
                source: SignalSource.Whale,
                token: data.tokenMint,
                confidence: data.walletConfidence || 0.7,
                timestamp: Date.now(),
                data
            };
            callback(signal);
        });

        this.adapters.opusX.on('whale_signal', (data: any) => {
            const signal: Signal = {
                id: `whale_${data.token}_${Date.now()}`,
                source: SignalSource.Whale,
                token: data.token,
                confidence: data.confidence || 0.6,
                timestamp: Date.now(),
                data
            };
            callback(signal);
        });
    }

    // ==================== OSINT Market Integration ====================

    /**
     * Get open OSINT bounties
     */
    async getOsintBounties(params?: { difficulty?: string; tag?: string }): Promise<Array<{
        id: string;
        question: string;
        reward: { token: string; amount: number };
        difficulty: string;
        deadline: number;
    }>> {
        if (!this.adapters.osintMarket) {
            return [];
        }

        try {
            const result = await this.adapters.osintMarket.getBounties({
                status: 'open',
                difficulty: params?.difficulty as 'easy' | 'medium' | 'hard',
                tag: params?.tag,
            });
            return result.bounties.map(b => ({
                id: b.id,
                question: b.question,
                reward: b.reward,
                difficulty: b.difficulty,
                deadline: b.deadline,
            }));
        } catch (error) {
            console.error('[AgentOrchestrator] Failed to get OSINT bounties:', error);
            return [];
        }
    }

    /**
     * Claim an OSINT bounty for an agent
     */
    async claimOsintBounty(agentId: string, bountyId: string, signature: string): Promise<{
        success: boolean;
        claimExpiresAt?: number;
        error?: string;
    }> {
        if (!this.adapters.osintMarket) {
            return { success: false, error: 'OSINT Market adapter not configured' };
        }

        const agent = this.agents.get(agentId);
        if (!agent || agent.status !== AgentStatus.Active) {
            return { success: false, error: 'Agent not active' };
        }

        return this.adapters.osintMarket.claimBounty(bountyId, signature);
    }

    /**
     * Submit findings for an OSINT bounty
     */
    async submitOsintFindings(agentId: string, bountyId: string, submission: {
        answer: string;
        sources: string[];
        confidence: number;
        methodology?: string;
        signature: string;
    }): Promise<{ success: boolean; submissionId?: string; error?: string }> {
        if (!this.adapters.osintMarket) {
            return { success: false, error: 'OSINT Market adapter not configured' };
        }

        const agent = this.agents.get(agentId);
        if (!agent) {
            return { success: false, error: 'Agent not found' };
        }

        // Convert to OsintSubmission format
        const osintSubmission = {
            bountyId,
            answer: submission.answer,
            evidence: submission.sources.map(s => ({ type: 'url' as const, content: s })),
            methodology: submission.methodology || 'Research and analysis',
            confidence: submission.confidence,
        };

        return this.adapters.osintMarket.submitFindings(bountyId, osintSubmission);
    }

    // ==================== ClawdNet A2A Integration ====================

    /**
     * Discover agents on ClawdNet network
     */
    async discoverAgents(params?: {
        capability?: string;
        skill?: string;
        maxPrice?: string;
        minReputation?: number;
    }): Promise<Array<{
        id: string;
        handle: string;
        name: string;
        capabilities: string[];
        reputation: number;
    }>> {
        if (!this.adapters.clawdnet) {
            return [];
        }

        try {
            const agents = await this.adapters.clawdnet.discoverAgents(params);
            return agents.map(a => ({
                id: a.id,
                handle: a.handle,
                name: a.name,
                capabilities: a.capabilities || [],
                reputation: a.reputationScore || a.reputation || 0,
            }));
        } catch (error) {
            console.error('[AgentOrchestrator] Failed to discover agents:', error);
            return [];
        }
    }

    /**
     * Send A2A message to another agent
     */
    async sendA2AMessage(params: {
        toHandle: string;
        skill: string;
        payload: Record<string, unknown>;
        maxPayment?: string;
    }): Promise<{ success: boolean; response?: unknown; error?: string }> {
        if (!this.adapters.clawdnet) {
            return { success: false, error: 'ClawdNet adapter not configured' };
        }

        const agent = await this.adapters.clawdnet.getAgent(params.toHandle);
        if (!agent) {
            return { success: false, error: 'Target agent not found' };
        }

        const result = await this.adapters.clawdnet.sendA2AMessage({
            toAgentId: agent.id,
            toHandle: params.toHandle,
            skill: params.skill,
            payload: params.payload,
            maxPayment: params.maxPayment,
        });

        if (result.paymentRequired) {
            // Handle X402 payment if configured
            const paymentResult = await this.adapters.clawdnet.executeX402Payment(result.paymentRequired);
            if (!paymentResult.success) {
                return { success: false, error: `Payment required: ${result.paymentRequired.amount} ${result.paymentRequired.currency}` };
            }
            // Retry after payment
            const retryResult = await this.adapters.clawdnet.sendA2AMessage({
                toAgentId: agent.id,
                toHandle: params.toHandle,
                skill: params.skill,
                payload: params.payload,
            });
            return { success: retryResult.success, response: retryResult.response, error: retryResult.error };
        }

        return { success: result.success, response: result.response, error: result.error };
    }

    /**
     * Register this orchestrator as an agent on ClawdNet
     */
    async registerOnClawdNet(params: {
        name: string;
        description: string;
        endpoint: string;
        capabilities: string[];
        skills: Array<{ id: string; price: string }>;
    }): Promise<{ success: boolean; agentId?: string; error?: string }> {
        if (!this.adapters.clawdnet) {
            return { success: false, error: 'ClawdNet adapter not configured' };
        }

        return this.adapters.clawdnet.registerAgent(params);
    }

    // ==================== CloddsBot Risk & Execution Integration ====================

    /**
     * Check trade risk before execution
     */
    async checkTradeRisk(params: {
        userId: string;
        platform: string;
        marketId?: string;
        side: 'buy' | 'sell';
        size: number;
        price: number;
    }): Promise<{
        approved: boolean;
        warnings: string[];
        regime: string;
        maxSize?: number;
    }> {
        if (!this.adapters.cloddsBot) {
            return { approved: true, warnings: ['Risk engine not configured'], regime: 'unknown' };
        }

        try {
            const decision = await this.adapters.cloddsBot.checkRisk(params);
            return {
                approved: decision.approved,
                warnings: decision.warnings,
                regime: decision.regime,
                maxSize: decision.maxSize,
            };
        } catch (error) {
            console.error('[AgentOrchestrator] Risk check failed:', error);
            return { approved: false, warnings: ['Risk check failed'], regime: 'error' };
        }
    }

    /**
     * Get circuit breaker status
     */
    async getCircuitBreakerStatus(): Promise<{
        tripped: boolean;
        canTrade: boolean;
        reason?: string;
    }> {
        if (!this.adapters.cloddsBot) {
            return { tripped: false, canTrade: true };
        }

        return this.adapters.cloddsBot.checkCircuitBreaker();
    }

    /**
     * Trip circuit breaker to halt all trading
     */
    async tripCircuitBreaker(reason: string): Promise<void> {
        if (!this.adapters.cloddsBot) {
            console.warn('[AgentOrchestrator] CloddsBot adapter not configured');
            return;
        }

        await this.adapters.cloddsBot.tripCircuitBreaker(reason);
        this.emitEvent({
            type: EventType.AgentPaused,
            agentId: 'system',
            timestamp: Date.now(),
            data: { reason: `Circuit breaker tripped: ${reason}` }
        });
    }

    /**
     * Get arbitrage opportunities
     */
    async getArbitrageOpportunities(): Promise<Array<{
        id: string;
        market: string;
        buyPlatform: string;
        sellPlatform: string;
        profitPercent: number;
        liquidity: number;
    }>> {
        if (!this.adapters.cloddsBot) {
            return [];
        }

        try {
            const opps = await this.adapters.cloddsBot.getArbitrageOpportunities();
            return opps.map(o => ({
                id: o.id,
                market: o.market,
                buyPlatform: o.buyPlatform,
                sellPlatform: o.sellPlatform,
                profitPercent: o.profitPercent,
                liquidity: o.liquidity,
            }));
        } catch (error) {
            console.error('[AgentOrchestrator] Failed to get arbitrage opportunities:', error);
            return [];
        }
    }

    /**
     * Execute arbitrage opportunity
     */
    async executeArbitrage(opportunityId: string, size: number): Promise<{
        success: boolean;
        realizedProfit?: number;
        error?: string;
    }> {
        if (!this.adapters.cloddsBot) {
            return { success: false, error: 'CloddsBot adapter not configured' };
        }

        // Check circuit breaker first
        const circuitBreaker = await this.adapters.cloddsBot.checkCircuitBreaker();
        if (circuitBreaker.tripped || !circuitBreaker.canTrade) {
            return { success: false, error: 'Circuit breaker is tripped' };
        }

        return this.adapters.cloddsBot.executeArbitrage(opportunityId, size);
    }

    /**
     * Execute order via CloddsBot with risk checks
     */
    async executeOrderWithRiskCheck(agentId: string, params: {
        platform: string;
        marketId: string;
        tokenId?: string;
        side: 'buy' | 'sell';
        price: number;
        size: number;
    }): Promise<{
        success: boolean;
        orderId?: string;
        error?: string;
    }> {
        const agent = this.agents.get(agentId);
        if (!agent || agent.status !== AgentStatus.Active) {
            return { success: false, error: 'Agent not active' };
        }

        // Check risk first
        const riskCheck = await this.checkTradeRisk({
            userId: agent.userId,
            platform: params.platform,
            marketId: params.marketId,
            side: params.side,
            size: params.size,
            price: params.price,
        });

        if (!riskCheck.approved) {
            return { success: false, error: `Risk check failed: ${riskCheck.warnings.join(', ')}` };
        }

        // Execute via CloddsBot if available, otherwise fall back to other adapters
        if (this.adapters.cloddsBot) {
            const result = await this.adapters.cloddsBot.executeOrder({
                platform: params.platform,
                marketId: params.marketId,
                tokenId: params.tokenId,
                side: params.side,
                price: params.price,
                size: params.size,
            });
            return { success: result.success, orderId: result.orderId, error: result.error };
        }

        return { success: false, error: 'No execution adapter available' };
    }

    /**
     * Setup copy trading for an agent
     */
    async setupCopyTrading(agentId: string, targetWallet: string, config?: {
        sizingMode?: 'fixed' | 'proportional' | 'percentage';
        fixedSize?: number;
        maxPositionSize?: number;
        stopLoss?: number;
        takeProfit?: number;
    }): Promise<boolean> {
        if (!this.adapters.cloddsBot) {
            console.warn('[AgentOrchestrator] CloddsBot adapter not configured');
            return false;
        }

        const agent = this.agents.get(agentId);
        if (!agent) {
            return false;
        }

        return this.adapters.cloddsBot.followWallet(targetWallet, config);
    }

    // ==================== Adapter Health Checks ====================

    /**
     * Check health of all configured adapters
     */
    async checkAdapterHealth(): Promise<Record<string, { healthy: boolean; latencyMs?: number; error?: string }>> {
        const results: Record<string, { healthy: boolean; latencyMs?: number; error?: string }> = {};

        const healthChecks = [
            { name: 'agentDex', adapter: this.adapters.agentDex },
            { name: 'openClaw', adapter: this.adapters.openClaw },
            { name: 'opusX', adapter: this.adapters.opusX },
            { name: 'osintMarket', adapter: this.adapters.osintMarket },
            { name: 'clawdnet', adapter: this.adapters.clawdnet },
            { name: 'cloddsBot', adapter: this.adapters.cloddsBot },
        ];

        await Promise.all(
            healthChecks.map(async ({ name, adapter }) => {
                if (!adapter) {
                    results[name] = { healthy: false, error: 'Not configured' };
                    return;
                }

                try {
                    const health = await adapter.checkHealth();
                    results[name] = {
                        healthy: health.healthy,
                        latencyMs: health.latencyMs,
                        error: health.error,
                    };
                } catch (error) {
                    results[name] = {
                        healthy: false,
                        error: error instanceof Error ? error.message : 'Health check failed',
                    };
                }
            })
        );

        return results;
    }

    // ==================== Signal Aggregation & Routing ====================

    /**
     * Fetch signals from all configured sources
     */
    async fetchAllSignals(): Promise<Signal[]> {
        const allSignals: Signal[] = [];
        const fetchPromises: Promise<Signal[]>[] = [];

        // Fetch whale signals from OpusX
        if (this.adapters.opusX) {
            fetchPromises.push(this.getWhaleSignals());
        }

        // Fetch arbitrage signals from CloddsBot
        if (this.adapters.cloddsBot) {
            fetchPromises.push(this.fetchArbitrageSignals());
        }

        // Execute all fetches in parallel
        const results = await Promise.allSettled(fetchPromises);

        for (const result of results) {
            if (result.status === 'fulfilled') {
                allSignals.push(...result.value);
            }
        }

        return allSignals;
    }

    /**
     * Fetch arbitrage signals from CloddsBot
     */
    private async fetchArbitrageSignals(): Promise<Signal[]> {
        if (!this.adapters.cloddsBot) {
            return [];
        }

        try {
            const opportunities = await this.adapters.cloddsBot.getArbitrageOpportunities();
            return opportunities.map(opp => ({
                id: `arb_${opp.id}`,
                source: SignalSource.Arbitrage,
                token: opp.market,
                confidence: opp.confidence,
                timestamp: Date.now(),
                data: {
                    opportunityId: opp.id,
                    market: opp.market,
                    buyPlatform: opp.buyPlatform,
                    buyPrice: opp.buyPrice,
                    sellPlatform: opp.sellPlatform,
                    sellPrice: opp.sellPrice,
                    profitPercent: opp.profitPercent,
                    liquidity: opp.liquidity,
                },
                expiresAt: opp.expiresAt,
            }));
        } catch (error) {
            console.error('[AgentOrchestrator] Failed to fetch arbitrage signals:', error);
            return [];
        }
    }

    /**
     * Process a signal and execute the resulting trade intent
     */
    async processAndExecuteSignal(agentId: string, signal: Signal): Promise<ExecutionResult | null> {
        // Process signal to get trade intent
        const intent = await this.processSignals(agentId, [signal]);
        if (!intent) {
            return null;
        }

        // Execute the trade intent
        return this.executeTradeIntent(agentId, intent);
    }

    /**
     * Execute a trade intent via the appropriate adapter
     */
    async executeTradeIntent(agentId: string, intent: TradeIntent): Promise<ExecutionResult> {
        const agent = this.agents.get(agentId);
        if (!agent || agent.status !== AgentStatus.Active) {
            return {
                intentId: intent.id || '',
                success: false,
                executedAmount: 0,
                executedPrice: 0,
                fees: 0,
                side: intent.side as TradeSide,
                token: intent.token,
                error: 'Agent not active',
                timestamp: Date.now(),
            };
        }

        // Check permissions
        const permitted = this.permissionManager.checkPermission(
            agent.permissions.id,
            { type: intent.side.toUpperCase() as any, value: intent.size * intent.price }
        );

        if (!permitted) {
            return {
                intentId: intent.id || '',
                success: false,
                executedAmount: 0,
                executedPrice: 0,
                fees: 0,
                side: intent.side as TradeSide,
                token: intent.token,
                error: 'Permission denied',
                timestamp: Date.now(),
            };
        }

        // Check risk via CloddsBot if available
        if (this.adapters.cloddsBot) {
            const riskCheck = await this.adapters.cloddsBot.checkRisk({
                userId: agent.userId,
                platform: intent.exchange || 'solana',
                marketId: intent.marketId,
                side: intent.side as 'buy' | 'sell',
                size: intent.size,
                price: intent.price,
            });

            if (!riskCheck.approved) {
                return {
                    intentId: intent.id || '',
                    success: false,
                    executedAmount: 0,
                    executedPrice: 0,
                    fees: 0,
                    side: intent.side as TradeSide,
                    token: intent.token,
                    error: `Risk check failed: ${riskCheck.warnings.join(', ')}`,
                    timestamp: Date.now(),
                };
            }
        }

        // Route to appropriate adapter based on exchange type
        const exchange = intent.exchange || 'solana';
        let result: ExecutionResult;

        try {
            if (exchange === 'solana' || exchange === 'jupiter') {
                result = await this.executeViaSolana(intent);
            } else if (['binance', 'bybit', 'hyperliquid', 'drift'].includes(exchange)) {
                result = await this.executeViaFutures(intent);
            } else if (['polymarket', 'kalshi', 'manifold', 'metaculus', 'predictit'].includes(exchange)) {
                result = await this.executeViaPredictionMarket(intent);
            } else {
                result = {
                    intentId: intent.id || '',
                    success: false,
                    executedAmount: 0,
                    executedPrice: 0,
                    fees: 0,
                    side: intent.side as TradeSide,
                    token: intent.token,
                    error: `Unsupported exchange: ${exchange}`,
                    timestamp: Date.now(),
                };
            }
        } catch (error) {
            result = {
                intentId: intent.id || '',
                success: false,
                executedAmount: 0,
                executedPrice: 0,
                fees: 0,
                side: intent.side as TradeSide,
                token: intent.token,
                error: error instanceof Error ? error.message : 'Execution failed',
                timestamp: Date.now(),
            };
        }

        // Record the execution
        this.recordExecution(agentId, result);

        // If successful buy, create position
        if (result.success && intent.side === 'buy') {
            this.addPosition(agentId, {
                id: `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                agentId,
                token: intent.token,
                symbol: intent.symbol || intent.token,
                amount: result.executedAmount,
                entryPrice: result.executedPrice,
                currentPrice: result.executedPrice,
                unrealizedPnL: 0,
                openedAt: Date.now(),
                exchange: exchange as any,
                tokenMint: intent.tokenMint,
                marketId: intent.marketId,
                tokenId: intent.tokenId,
            });
        }

        return result;
    }

    /**
     * Execute trade via Solana DEX (AgentDex)
     */
    private async executeViaSolana(intent: TradeIntent): Promise<ExecutionResult> {
        if (!this.adapters.agentDex) {
            return {
                intentId: intent.id || '',
                success: false,
                executedAmount: 0,
                executedPrice: 0,
                fees: 0,
                side: intent.side as TradeSide,
                token: intent.token,
                error: 'AgentDex adapter not configured',
                timestamp: Date.now(),
            };
        }

        const inputMint = intent.side === 'buy' ? SOL_MINT : (intent.tokenMint || intent.token);
        const outputMint = intent.side === 'buy' ? (intent.tokenMint || intent.token) : SOL_MINT;
        const amount = String(Math.floor(intent.size * 1e9)); // Convert to lamports

        const swapResult = await this.adapters.agentDex.executeSwap({
            inputMint,
            outputMint,
            amount,
            slippageBps: intent.slippageBps || 100,
        });

        return {
            intentId: intent.id || '',
            success: true,
            txHash: swapResult.txSignature,
            executedAmount: Number(swapResult.outputAmount) / 1e9,
            executedPrice: intent.price,
            fees: swapResult.fees || 0,
            side: intent.side as TradeSide,
            token: intent.token,
            timestamp: Date.now(),
        };
    }

    /**
     * Execute trade via perpetual futures (OpenClaw)
     */
    private async executeViaFutures(intent: TradeIntent): Promise<ExecutionResult> {
        if (!this.adapters.openClaw) {
            return {
                intentId: intent.id || '',
                success: false,
                executedAmount: 0,
                executedPrice: 0,
                fees: 0,
                side: intent.side as TradeSide,
                token: intent.token,
                error: 'OpenClaw adapter not configured',
                timestamp: Date.now(),
            };
        }

        const result = await this.adapters.openClaw.executeTrade({
            exchange: intent.exchange as any,
            symbol: intent.symbol || intent.token,
            side: intent.side as 'buy' | 'sell',
            amount: String(intent.size),
            size: intent.size,
            price: intent.price,
            leverage: intent.leverage,
        });

        return {
            intentId: intent.id || '',
            success: result.success,
            orderId: result.orderId,
            executedAmount: result.executedAmount || 0,
            executedPrice: result.executedPrice || intent.price,
            fees: result.fees || 0,
            side: intent.side as TradeSide,
            token: intent.token,
            error: result.error,
            timestamp: Date.now(),
        };
    }

    /**
     * Execute trade via prediction markets (CloddsBot)
     */
    private async executeViaPredictionMarket(intent: TradeIntent): Promise<ExecutionResult> {
        if (!this.adapters.cloddsBot) {
            return {
                intentId: intent.id || '',
                success: false,
                executedAmount: 0,
                executedPrice: 0,
                fees: 0,
                side: intent.side as TradeSide,
                token: intent.token,
                error: 'CloddsBot adapter not configured',
                timestamp: Date.now(),
            };
        }

        const result = await this.adapters.cloddsBot.executeOrder({
            platform: intent.exchange || 'polymarket',
            marketId: intent.marketId || intent.token,
            tokenId: intent.tokenId,
            outcome: intent.outcome,
            side: intent.side as 'buy' | 'sell',
            price: intent.price,
            size: intent.size,
            orderType: 'GTC',
        });

        return {
            intentId: intent.id || '',
            success: result.success,
            orderId: result.orderId,
            executedAmount: result.filledSize || 0,
            executedPrice: result.avgPrice || intent.price,
            fees: result.fees || 0,
            side: intent.side as TradeSide,
            token: intent.token,
            error: result.error,
            timestamp: Date.now(),
        };
    }

    /**
     * Execute via A2A (ClawdNet) - delegate trade to another agent
     */
    async delegateToAgent(params: {
        targetHandle: string;
        skill: string;
        payload: Record<string, unknown>;
        maxPayment?: string;
    }): Promise<{ success: boolean; result?: unknown; error?: string }> {
        if (!this.adapters.clawdnet) {
            return { success: false, error: 'ClawdNet adapter not configured' };
        }

        return this.sendA2AMessage({
            toHandle: params.targetHandle,
            skill: params.skill,
            payload: params.payload,
            maxPayment: params.maxPayment,
        });
    }

    /**
     * Start continuous signal processing for an agent
     */
    startSignalProcessing(agentId: string, intervalMs: number = 30000): NodeJS.Timer {
        const timer = setInterval(async () => {
            const agent = this.agents.get(agentId);
            if (!agent || agent.status !== AgentStatus.Active) {
                return;
            }

            try {
                // Fetch all signals
                const signals = await this.fetchAllSignals();

                // Process each signal
                for (const signal of signals) {
                    // Skip expired signals
                    if (signal.expiresAt && signal.expiresAt < Date.now()) {
                        continue;
                    }

                    // Skip low confidence signals
                    if (signal.confidence < 0.5) {
                        continue;
                    }

                    // Process and potentially execute
                    await this.processAndExecuteSignal(agentId, signal);
                }
            } catch (error) {
                console.error(`[AgentOrchestrator] Signal processing error for ${agentId}:`, error);
            }
        }, intervalMs);

        return timer;
    }

    // Private helper methods

    private generateAgentId(): string {
        return `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private generateIntentId(): string {
        return `intent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private emitEvent(event: AgentEvent): void {
        this.emit(event.type, event);
        this.emit('event', event);
    }
}
