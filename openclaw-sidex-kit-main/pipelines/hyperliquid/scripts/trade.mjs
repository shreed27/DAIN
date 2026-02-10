import { parseArgs } from 'util';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { keccak256, encodePacked, toHex, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const { values } = parseArgs({
    options: {
        symbol: { type: 'string' },
        side: { type: 'string' },
        amount: { type: 'string' }, // Size in USD or Token
        leverage: { type: 'string' },
        private_key: { type: 'string' }, // User's Private Key for signing
        wallet_address: { type: 'string' },
        price: { type: 'string' }, // Limit price (optional, 0 for market)
        reduce_only: { type: 'boolean', default: false }
    },
});

const { symbol, side, amount, leverage, private_key, wallet_address, price, reduce_only } = values;

const DEBUG_LOG = path.join(path.dirname(process.argv[1]), 'hyperliquid_debug.log');
fs.appendFileSync(DEBUG_LOG, `${new Date().toISOString()} - Hyperliquid Pipeline started: ${JSON.stringify({ symbol, side, amount, leverage })}
`);

if (!symbol || !side || !amount || !private_key) {
    console.error("Missing required arguments: symbol, side, amount, private_key");
    process.exit(1);
}

const INFO_URL = "https://api.hyperliquid.xyz/info";
const EXCHANGE_URL = "https://api.hyperliquid.xyz/exchange";

console.log(`Hyperliquid Pipeline connecting...`);

// Get asset metadata to find the asset index
async function getAssetIndex(symbolName) {
    const res = await fetch(INFO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'meta' })
    });
    const meta = await res.json();

    // Find the asset index
    const universe = meta.universe || [];
    for (let i = 0; i < universe.length; i++) {
        if (universe[i].name.toUpperCase() === symbolName.toUpperCase() ||
            universe[i].name.toUpperCase() === symbolName.replace('USDT', '').replace('/USDT', '').toUpperCase()) {
            return i;
        }
    }
    throw new Error(`Asset ${symbolName} not found in Hyperliquid universe`);
}

// Get current mid price for market orders
async function getMidPrice(assetIndex) {
    const res = await fetch(INFO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'allMids' })
    });
    const mids = await res.json();
    return parseFloat(mids[assetIndex]);
}

// Sign Hyperliquid action using EIP-712
function signL1Action(account, action, nonce, vaultAddress = null) {
    // Hyperliquid uses a custom phantom agent for signing
    // The actual signing process requires specific domain and types
    const connectionId = toHex(crypto.randomBytes(16));

    return {
        action,
        nonce,
        signature: { r: '0x0', s: '0x0', v: 27 }, // Placeholder - will be replaced with real signing
        vaultAddress
    };
}

async function executeTrade() {
    try {
        // Format symbol
        const symbolName = symbol.replace('/USDT', '').replace('USDT', '').toUpperCase();

        console.log(`✅ Pipeline: Preparing trade for ${symbolName} ${side.toUpperCase()}`);

        // 1. Get asset index
        console.log(`📊 Fetching asset metadata...`);
        const assetIndex = await getAssetIndex(symbolName);
        console.log(`   Asset Index: ${assetIndex}`);

        // 2. Get wallet account from private key
        const formattedKey = private_key.startsWith('0x') ? private_key : `0x${private_key}`;
        const account = privateKeyToAccount(formattedKey);
        const walletAddr = wallet_address || account.address;

        console.log(`   Wallet: ${walletAddr.slice(0, 6)}...${walletAddr.slice(-4)}`);

        // 3. Calculate price for limit order (market orders use aggressive limit)
        let orderPrice = price ? parseFloat(price) : null;
        if (!orderPrice) {
            const midPrice = await getMidPrice(assetIndex);
            // For market order, use aggressive price (5% beyond mid)
            orderPrice = side.toLowerCase() === 'buy'
                ? midPrice * 1.05  // Buy higher
                : midPrice * 0.95; // Sell lower
            console.log(`   Mid Price: ${midPrice}, Using: ${orderPrice.toFixed(2)}`);
        }

        // 4. Build order action
        const nonce = Date.now();
        const isBuy = side.toLowerCase() === 'buy';

        const orderAction = {
            type: "order",
            orders: [{
                a: assetIndex,
                b: isBuy,
                p: orderPrice.toFixed(2),
                s: amount,
                r: reduce_only || false,
                t: {
                    limit: {
                        tif: "Ioc" // Immediate or Cancel for market-like behavior
                    }
                }
            }],
            grouping: "na"
        };

        console.log(`🚀 Sending Order to Hyperliquid`);
        console.log(`   Action: ${isBuy ? 'BUY' : 'SELL'} ${amount} ${symbolName} @ ${orderPrice.toFixed(2)}`);

        // 5. Sign the action using viem
        // Hyperliquid L1 action signing
        const actionHash = keccak256(
            encodePacked(
                ['string'],
                [JSON.stringify(orderAction)]
            )
        );

        const signature = await account.signMessage({
            message: { raw: actionHash }
        });

        // 6. Send to exchange
        const requestBody = {
            action: orderAction,
            nonce,
            signature: signature,
            vaultAddress: null
        };

        const res = await fetch(EXCHANGE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const response = await res.json();

        fs.appendFileSync(DEBUG_LOG, `${new Date().toISOString()} - Response: ${JSON.stringify(response)}
`);

        if (response.status === 'ok') {
            const statuses = response.response?.data?.statuses || [];
            const filled = statuses.find(s => s.filled || s.status === 'filled');

            console.log('✅ Trade Executed Successfully!');
            console.log(`   Status: ${JSON.stringify(statuses)}`);

            // Log successful trade
            const logEntry = {
                timestamp: new Date().toISOString(),
                exchange: 'hyperliquid',
                symbol: symbolName,
                side,
                amount: parseFloat(amount),
                leverage: parseFloat(leverage || 1),
                price: orderPrice,
                result: {
                    status: 'ok',
                    statuses
                }
            };

            const logPath = path.join(path.dirname(process.argv[1]), '..', '..', '..', 'trades.json');
            try {
                fs.appendFileSync(logPath, JSON.stringify(logEntry) + '
');
            } catch (e) { }

            // Output for programmatic use
            console.log(JSON.stringify({ success: true, ...logEntry.result }));
        } else {
            console.error(`❌ Hyperliquid Error: ${JSON.stringify(response)}`);

            // Log error
            const logEntry = {
                timestamp: new Date().toISOString(),
                exchange: 'hyperliquid',
                symbol: symbolName,
                side,
                amount: parseFloat(amount),
                leverage: parseFloat(leverage || 1),
                error: response
            };

            const logPath = path.join(path.dirname(process.argv[1]), '..', '..', '..', 'trades.json');
            try {
                fs.appendFileSync(logPath, JSON.stringify(logEntry) + '
');
            } catch (e) { }

            process.exit(1);
        }

    } catch (error) {
        console.error("Pipeline Error:", error.message);
        fs.appendFileSync(DEBUG_LOG, `${new Date().toISOString()} - Error: ${error.message}
`);
        process.exit(1);
    }
}

executeTrade();
