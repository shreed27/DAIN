import { parseArgs } from 'util';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const { values } = parseArgs({
    options: {
        symbol: { type: 'string' },
        side: { type: 'string' },
        amount: { type: 'string' },
        leverage: { type: 'string' },
        api_key: { type: 'string' },
        api_secret: { type: 'string' }
    },
});

const { symbol, side, amount, leverage, api_key, api_secret } = values;

const DEBUG_LOG = path.join(path.dirname(process.argv[1]), 'bybit_debug.log');
fs.appendFileSync(DEBUG_LOG, `${new Date().toISOString()} - Bybit Pipeline started: ${JSON.stringify(values)}\n`);

if (!symbol || !side || !amount || !api_key || !api_secret) {
    console.error("Missing required arguments: symbol, side, amount, api_key, api_secret");
    process.exit(1);
}

const BASE_URL = 'https://api.bybit.com'; // V5 API

console.log(`Bybit CEX Pipeline connecting...`);

// Bybit V5 Signature
function getSignature(parameters, secret, timestamp) {
    const recvWindow = '5000';
    const stringToSign = timestamp + api_key + recvWindow + parameters;
    return crypto.createHmac('sha256', secret).update(stringToSign).digest('hex');
}

async function setLeverage(symbolName, leverageValue) {
    const timestamp = Date.now().toString();
    const recvWindow = '5000';

    const payload = {
        category: "linear",
        symbol: symbolName,
        buyLeverage: leverageValue.toString(),
        sellLeverage: leverageValue.toString()
    };

    const bodyStr = JSON.stringify(payload);
    const signature = getSignature(bodyStr, api_secret, timestamp);

    const res = await fetch(`${BASE_URL}/v5/position/set-leverage`, {
        method: 'POST',
        headers: {
            'X-BAPI-API-KEY': api_key,
            'X-BAPI-TIMESTAMP': timestamp,
            'X-BAPI-SIGN': signature,
            'X-BAPI-RECV-WINDOW': recvWindow,
            'Content-Type': 'application/json'
        },
        body: bodyStr
    });

    const data = await res.json();
    if (data.retCode === 0) {
        console.log(`✅ Leverage set to ${leverageValue}x for ${symbolName}`);
    } else if (data.retCode === 110043) {
        // Leverage not modified - already set to this value
        console.log(`ℹ️ Leverage already at ${leverageValue}x`);
    } else {
        console.warn(`⚠️ Leverage warning: ${data.retMsg} (code: ${data.retCode})`);
    }
    return data;
}

async function executeTrade() {
    try {
        // Format symbol (remove slash if present)
        const symbolName = symbol.replace('/', '').toUpperCase();
        // Bybit uses "Buy" and "Sell" (capitalized)
        const sideFormatted = side.charAt(0).toUpperCase() + side.slice(1).toLowerCase();

        console.log(`✅ Pipeline: Preparing trade for ${symbolName} ${sideFormatted}`);

        // 1. Set Leverage (Required before order for futures)
        if (leverage && parseInt(leverage) > 1) {
            console.log(`⚙️  Setting Leverage to ${leverage}x`);
            await setLeverage(symbolName, parseInt(leverage));
        }

        // 2. Prepare Order Payload
        const timestamp = Date.now().toString();
        const recvWindow = '5000';

        const payload = {
            category: "linear", // USDT Perpetual
            symbol: symbolName,
            side: sideFormatted,
            orderType: "Market",
            qty: amount
        };

        const bodyStr = JSON.stringify(payload);
        const signature = getSignature(bodyStr, api_secret, timestamp);

        console.log(`🚀 Sending Signed Order to Bybit V5 API`);
        console.log(`   Endpoint: ${BASE_URL}/v5/order/create`);
        console.log(`   Symbol: ${symbolName}, Side: ${sideFormatted}, Amount: ${amount}`);

        // Execute REAL order
        const res = await fetch(`${BASE_URL}/v5/order/create`, {
            method: 'POST',
            headers: {
                'X-BAPI-API-KEY': api_key,
                'X-BAPI-TIMESTAMP': timestamp,
                'X-BAPI-SIGN': signature,
                'X-BAPI-RECV-WINDOW': recvWindow,
                'Content-Type': 'application/json'
            },
            body: bodyStr
        });

        const response = await res.json();

        fs.appendFileSync(DEBUG_LOG, `${new Date().toISOString()} - Response: ${JSON.stringify(response)}\n`);

        if (response.retCode === 0) {
            console.log('✅ Trade Executed Successfully!');
            console.log(`   Order ID: ${response.result.orderId}`);
            console.log(`   Order Link ID: ${response.result.orderLinkId}`);

            // Log successful trade
            const logEntry = {
                timestamp: new Date().toISOString(),
                exchange: 'bybit',
                symbol: symbolName,
                side,
                amount: parseFloat(amount),
                leverage: parseFloat(leverage || 1),
                result: {
                    orderId: response.result.orderId,
                    orderLinkId: response.result.orderLinkId
                }
            };

            const logPath = path.join(path.dirname(process.argv[1]), '..', '..', '..', 'trades.json');
            try {
                fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
            } catch (e) { }

            // Output for programmatic use
            console.log(JSON.stringify({ success: true, ...logEntry.result }));
        } else {
            console.error(`❌ Bybit Error ${response.retCode}: ${response.retMsg}`);

            // Log error for debugging
            const logEntry = {
                timestamp: new Date().toISOString(),
                exchange: 'bybit',
                symbol: symbolName,
                side,
                amount: parseFloat(amount),
                leverage: parseFloat(leverage || 1),
                error: response
            };

            const logPath = path.join(path.dirname(process.argv[1]), '..', '..', '..', 'trades.json');
            try {
                fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
            } catch (e) { }

            process.exit(1);
        }

    } catch (error) {
        console.error("Pipeline Error:", error.message);
        fs.appendFileSync(DEBUG_LOG, `${new Date().toISOString()} - Error: ${error.message}\n`);
        process.exit(1);
    }
}

executeTrade();
