/**
 * Retry Utility with Exponential Backoff
 * Provides resilient execution for adapter operations
 */

export interface RetryOptions {
    /** Maximum number of attempts (default: 3) */
    maxAttempts?: number;
    /** Initial delay in ms (default: 1000) */
    initialDelayMs?: number;
    /** Maximum delay in ms (default: 30000) */
    maxDelayMs?: number;
    /** Backoff multiplier (default: 2) */
    backoffMultiplier?: number;
    /** Add jitter to prevent thundering herd (default: true) */
    jitter?: boolean;
    /** Errors that should NOT be retried */
    nonRetryableErrors?: string[];
    /** Callback on each retry attempt */
    onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'nonRetryableErrors'>> = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitter: true,
};

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(
    attempt: number,
    initialDelayMs: number,
    maxDelayMs: number,
    backoffMultiplier: number,
    jitter: boolean
): number {
    // Exponential backoff: delay = initial * (multiplier ^ attempt)
    let delay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);

    // Cap at max delay
    delay = Math.min(delay, maxDelayMs);

    // Add jitter (±25% randomization)
    if (jitter) {
        const jitterRange = delay * 0.25;
        delay = delay + (Math.random() * jitterRange * 2 - jitterRange);
    }

    return Math.round(delay);
}

/**
 * Check if an error is retryable
 */
function isRetryable(error: Error, nonRetryableErrors?: string[]): boolean {
    if (!nonRetryableErrors || nonRetryableErrors.length === 0) {
        return true;
    }

    const errorMessage = error.message.toLowerCase();
    const errorName = error.name.toLowerCase();

    for (const pattern of nonRetryableErrors) {
        const lowerPattern = pattern.toLowerCase();
        if (errorMessage.includes(lowerPattern) || errorName.includes(lowerPattern)) {
            return false;
        }
    }

    return true;
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options?: RetryOptions
): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // Check if we should retry
            if (attempt >= opts.maxAttempts) {
                break;
            }

            if (!isRetryable(lastError, opts.nonRetryableErrors)) {
                break;
            }

            // Calculate delay for next attempt
            const delay = calculateDelay(
                attempt,
                opts.initialDelayMs,
                opts.maxDelayMs,
                opts.backoffMultiplier,
                opts.jitter
            );

            // Call retry callback if provided
            if (opts.onRetry) {
                opts.onRetry(attempt, lastError, delay);
            }

            // Wait before next attempt
            await sleep(delay);
        }
    }

    throw lastError || new Error('Retry failed with unknown error');
}

/**
 * Create a retry wrapper for a class method
 * Usage: retryMethod(adapter, 'executeSwap', { maxAttempts: 5 })
 */
export function retryMethod<T extends object, K extends keyof T>(
    obj: T,
    methodName: K,
    options?: RetryOptions
): T[K] {
    const originalMethod = obj[methodName];
    if (typeof originalMethod !== 'function') {
        throw new Error(`${String(methodName)} is not a function`);
    }

    return (async function (...args: unknown[]) {
        return withRetry(() => (originalMethod as Function).apply(obj, args), options);
    }) as T[K];
}

/**
 * Circuit Breaker state
 */
export enum CircuitState {
    CLOSED = 'CLOSED',       // Normal operation
    OPEN = 'OPEN',           // Failing, reject all requests
    HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

export interface CircuitBreakerOptions {
    /** Number of failures before opening circuit (default: 5) */
    failureThreshold?: number;
    /** Time in ms before attempting to close circuit (default: 30000) */
    resetTimeoutMs?: number;
    /** Number of successes needed to close circuit (default: 3) */
    successThreshold?: number;
}

/**
 * Circuit Breaker implementation
 * Prevents cascading failures by short-circuiting requests to failing services
 */
export class CircuitBreaker {
    private state: CircuitState = CircuitState.CLOSED;
    private failures: number = 0;
    private successes: number = 0;
    private lastFailureTime: number = 0;

    private readonly failureThreshold: number;
    private readonly resetTimeoutMs: number;
    private readonly successThreshold: number;

    constructor(
        private readonly name: string,
        options?: CircuitBreakerOptions
    ) {
        this.failureThreshold = options?.failureThreshold ?? 5;
        this.resetTimeoutMs = options?.resetTimeoutMs ?? 30000;
        this.successThreshold = options?.successThreshold ?? 3;
    }

    /**
     * Execute a function through the circuit breaker
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        // Check if circuit should transition from OPEN to HALF_OPEN
        if (this.state === CircuitState.OPEN) {
            if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
                this.state = CircuitState.HALF_OPEN;
                this.successes = 0;
                console.log(`[CircuitBreaker:${this.name}] Transitioning to HALF_OPEN`);
            } else {
                throw new Error(`Circuit breaker [${this.name}] is OPEN - request rejected`);
            }
        }

        try {
            const result = await fn();

            // Record success
            if (this.state === CircuitState.HALF_OPEN) {
                this.successes++;
                if (this.successes >= this.successThreshold) {
                    this.state = CircuitState.CLOSED;
                    this.failures = 0;
                    console.log(`[CircuitBreaker:${this.name}] Circuit CLOSED after successful recovery`);
                }
            } else {
                this.failures = 0; // Reset failures on success in CLOSED state
            }

            return result;
        } catch (error) {
            this.recordFailure();
            throw error;
        }
    }

    /**
     * Record a failure
     */
    private recordFailure(): void {
        this.failures++;
        this.lastFailureTime = Date.now();

        if (this.state === CircuitState.HALF_OPEN) {
            // Failed during recovery, go back to OPEN
            this.state = CircuitState.OPEN;
            console.log(`[CircuitBreaker:${this.name}] Recovery failed, circuit OPEN`);
        } else if (this.failures >= this.failureThreshold) {
            this.state = CircuitState.OPEN;
            console.log(`[CircuitBreaker:${this.name}] Failure threshold reached, circuit OPEN`);
        }
    }

    /**
     * Get current state
     */
    getState(): CircuitState {
        return this.state;
    }

    /**
     * Get stats
     */
    getStats(): { state: CircuitState; failures: number; successes: number } {
        return {
            state: this.state,
            failures: this.failures,
            successes: this.successes,
        };
    }

    /**
     * Force reset the circuit breaker
     */
    reset(): void {
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.successes = 0;
        console.log(`[CircuitBreaker:${this.name}] Manually reset to CLOSED`);
    }
}

/**
 * Create a resilient executor with both retry and circuit breaker
 */
export function createResilientExecutor(
    name: string,
    retryOptions?: RetryOptions,
    circuitOptions?: CircuitBreakerOptions
) {
    const circuitBreaker = new CircuitBreaker(name, circuitOptions);

    return {
        execute: async <T>(fn: () => Promise<T>): Promise<T> => {
            return circuitBreaker.execute(() => withRetry(fn, retryOptions));
        },
        getCircuitState: () => circuitBreaker.getState(),
        getStats: () => circuitBreaker.getStats(),
        reset: () => circuitBreaker.reset(),
    };
}
