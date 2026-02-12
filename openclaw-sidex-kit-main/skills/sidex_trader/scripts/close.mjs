import WebSocket from 'ws';
import { parseArgs } from 'util';
import fs from 'fs';
import path from 'path';

const { values } = parseArgs({
    options: {
        symbol: { type: 'string' },
        direction: { type: 'string' },
        token: { type: 'string' },
    },
});

const { symbol, direction, token } = values;

if (!symbol || !direction || !token) {
    console.error("Missing required arguments: --symbol, --direction, --token");
    process.exit(1);
}

const GATEWAY_URL = process.env.SIDEX_GATEWAY || `wss://devs.sidex.fun/gateway?token=${token}`;

console.log(`Closing ${direction} position on ${symbol}...`);

const ws = new WebSocket(GATEWAY_URL);

ws.on('open', () => {
    console.log('✅ Connected to Sidex Execution Layer.');

    const payload = {
        action: 'close',
        asset: symbol,
        side: direction
    };

    console.log('🚀 Sending Close Command:', payload);
    ws.send(JSON.stringify(payload));
});

ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log('📩 Gateway Response:', msg);

    if (msg.status === 'success' || msg.status === 'error' || msg.status === 'ignored') {
        if (msg.status === 'success') {
            try {
                const logEntry = {
                    timestamp: new Date().toISOString(),
                    type: 'trade',
                    action: 'close',
                    symbol,
                    direction,
                    result: msg
                };

                // Save to local kit directory (relative path)
                const logPath = path.join(path.dirname(process.argv[1]), '..', '..', '..', 'trades.json');
                fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');

            } catch (err) {
                console.error('Failed to log trade:', err);
            }
        }

        setTimeout(() => {
            ws.close();
            if (msg.status === 'success') process.exit(0);
            else process.exit(1);
        }, 1000);
    }
});

ws.on('error', (err) => {
    console.error('WebSocket Error:', err.message);
    process.exit(1);
});

setTimeout(() => {
    console.error('Timeout waiting for gateway response');
    process.exit(1);
}, 10000);
