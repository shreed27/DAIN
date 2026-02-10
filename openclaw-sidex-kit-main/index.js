/**
 * OpenClaw Server - Multi-Exchange Trading with Survival Mode
 * HTTP API for the Collesium trading platform
 */

import http from 'http';
import { URL } from 'url';
import { SurvivalManager } from './core/survival/SurvivalManager.js';
import { X402Client } from './core/x402/X402Client.js';

const PORT = process.env.PORT || 3003;

// Initialize X402 Client
const x402Client = new X402Client({
    budgetMode: 'conservative',
    maxPaymentPerRequest: 0.5,
    totalBudget: 100.0,
    dailyLimit: 50.0
});

// Initialize Survival Manager with X402 integration
const survivalManager = new SurvivalManager({
    initialBalance: parseFloat(process.env.INITIAL_BALANCE || '10000'),
    x402Client,
    exitOnCritical: process.env.EXIT_ON_CRITICAL !== 'false',
    onGrowth: (data) => console.log('🚀 Growth mode callback triggered', data),
    onDefensive: (data) => console.log('🛡️ Defensive mode callback triggered', data),
    onCritical: (data) => console.log('🔴 Critical mode callback triggered', data)
});

/**
 * Parse JSON body from request
 */
async function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(new Error('Invalid JSON'));
            }
        });
        req.on('error', reject);
    });
}

/**
 * Send JSON response
 */
function sendJSON(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

/**
 * Request handler
 */
async function handleRequest(req, res) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname;
    const method = req.method;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    try {
        // Health check
        if (path === '/health' && method === 'GET') {
            return sendJSON(res, {
                status: 'healthy',
                service: 'openclaw',
                version: '1.0.0',
                survivalState: survivalManager.state,
                timestamp: new Date().toISOString()
            });
        }

        // Survival Status
        if (path === '/api/survival/status' && method === 'GET') {
            return sendJSON(res, {
                success: true,
                data: survivalManager.getStatus()
            });
        }

        // Update balance (vital signs)
        if (path === '/api/survival/update' && method === 'POST') {
            const body = await parseBody(req);
            if (typeof body.balance !== 'number') {
                return sendJSON(res, { error: 'Balance required' }, 400);
            }
            const state = survivalManager.updateVitalSigns(body.balance);
            return sendJSON(res, {
                success: true,
                data: {
                    state,
                    status: survivalManager.getStatus()
                }
            });
        }

        // Force state (manual override)
        if (path === '/api/survival/force' && method === 'POST') {
            const body = await parseBody(req);
            if (!body.state) {
                return sendJSON(res, { error: 'State required' }, 400);
            }
            survivalManager.forceState(body.state);
            return sendJSON(res, {
                success: true,
                data: survivalManager.getStatus()
            });
        }

        // Get risk parameters
        if (path === '/api/survival/risk' && method === 'GET') {
            return sendJSON(res, {
                success: true,
                data: {
                    params: survivalManager.getRiskParams(),
                    canOpenPosition: survivalManager.canOpenPosition(),
                    maxPositionSize: survivalManager.getMaxPositionSize(),
                    maxLeverage: survivalManager.getMaxLeverage()
                }
            });
        }

        // Health history
        if (path === '/api/survival/history' && method === 'GET') {
            const limit = parseInt(url.searchParams.get('limit') || '100');
            return sendJSON(res, {
                success: true,
                data: {
                    health: survivalManager.getHealthHistory(limit),
                    states: survivalManager.getStateHistory(limit)
                }
            });
        }

        // X402 Status
        if (path === '/api/x402/status' && method === 'GET') {
            return sendJSON(res, {
                success: true,
                data: x402Client.getStats()
            });
        }

        // X402 Set budget mode
        if (path === '/api/x402/budget-mode' && method === 'POST') {
            const body = await parseBody(req);
            if (!body.mode) {
                return sendJSON(res, { error: 'Mode required' }, 400);
            }
            const result = x402Client.setBudgetMode(body.mode);
            return sendJSON(res, {
                success: true,
                data: result
            });
        }

        // X402 Fetch (proxy with payment handling)
        if (path === '/api/x402/fetch' && method === 'POST') {
            const body = await parseBody(req);
            if (!body.url) {
                return sendJSON(res, { error: 'URL required' }, 400);
            }
            const response = await x402Client.fetch(body.url, body.options || {});
            const data = await response.json().catch(() => ({}));
            return sendJSON(res, {
                success: response.ok,
                status: response.status,
                data
            });
        }

        // 404 Not Found
        sendJSON(res, { error: 'Not found', path }, 404);

    } catch (error) {
        console.error('Request error:', error);
        sendJSON(res, { error: error.message }, 500);
    }
}

// Create and start server
const server = http.createServer(handleRequest);

server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                     OPENCLAW SERVER                            ║
║              Multi-Exchange + Survival Mode                    ║
╠═══════════════════════════════════════════════════════════════╣
║  Port: ${PORT}                                                   ║
║  Survival State: ${survivalManager.state.padEnd(10)}                          ║
║  Initial Balance: $${survivalManager.initialBalance.toFixed(2).padEnd(10)}                      ║
║  X402 Budget Mode: ${x402Client.budgetMode.padEnd(10)}                        ║
╠═══════════════════════════════════════════════════════════════╣
║  Endpoints:                                                    ║
║    GET  /health              - Health check                    ║
║    GET  /api/survival/status - Full survival status            ║
║    POST /api/survival/update - Update balance                  ║
║    POST /api/survival/force  - Force state override            ║
║    GET  /api/survival/risk   - Get risk parameters             ║
║    GET  /api/survival/history - Get health/state history       ║
║    GET  /api/x402/status     - X402 payment stats              ║
║    POST /api/x402/budget-mode - Set budget mode                ║
║    POST /api/x402/fetch      - Fetch with auto-payment         ║
╚═══════════════════════════════════════════════════════════════╝
`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
