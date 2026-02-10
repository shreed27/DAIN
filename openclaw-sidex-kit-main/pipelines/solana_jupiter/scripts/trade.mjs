import { parseArgs } from 'util';
import fs from 'fs';
import path from 'path';
import { Keypair, Connection, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

const { values } = parseArgs({
    options: {
        symbol: { type: 'string' }, // Output token mint address
        side: { type: 'string' },   // 'buy' (USDC->Token) or 'sell' (Token->USDC)
        amount: { type: 'string' }, // Amount in input token
        private_key: { type: 'string' }, // Base58 or hex private key
        slippage: { type: 'string' } // Slippage in bps (default 50 = 0.5%)
    },
});

const { symbol, side, amount, private_key, slippage } = values;

const DEBUG_LOG = path.join(path.dirname(process.argv[1]), 'solana_debug.log');
fs.appendFileSync(DEBUG_LOG, `${new Date().toISOString()} - Solana Jupiter Pipeline started: ${JSON.stringify({ symbol, side, amount, slippage })}\n`);

if (!symbol || !amount || !private_key) {
    console.error("Missing required arguments: symbol, amount, private_key");
    process.exit(1);
}

// Constants
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const JUP_API = 'https://quote-api.jup.ag/v6';
const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

console.log(`Solana Jupiter Pipeline: Swapping ${side === 'sell' ? symbol : 'USDC'} -> ${side === 'sell' ? 'USDC' : symbol}...`);

// Parse private key (supports base58 and hex formats)
function parsePrivateKey(key) {
    try {
        // Try base58 first (common Solana format)
        if (!key.startsWith('0x') && key.length > 60) {
            return Keypair.fromSecretKey(bs58.decode(key));
        }
        // Try hex format
        const hexKey = key.startsWith('0x') ? key.slice(2) : key;
        const bytes = Buffer.from(hexKey, 'hex');
        return Keypair.fromSecretKey(bytes);
    } catch (e) {
        // Try as array format [1,2,3...]
        try {
            const arr = JSON.parse(key);
            return Keypair.fromSecretKey(Uint8Array.from(arr));
        } catch {
            throw new Error(`Invalid private key format: ${e.message}`);
        }
    }
}

// Get token decimals
async function getTokenDecimals(mint) {
    if (mint === USDC_MINT) return 6;
    if (mint === SOL_MINT) return 9;

    // Fetch from RPC for other tokens
    try {
        const connection = new Connection(SOLANA_RPC);
        const info = await connection.getParsedAccountInfo(new (await import('@solana/web3.js')).PublicKey(mint));
        return info.value?.data?.parsed?.info?.decimals || 9;
    } catch {
        return 9; // Default to 9 decimals
    }
}

async function executeSwap() {
    try {
        // 1. Parse wallet
        console.log(`✅ Pipeline: Parsing wallet...`);
        const wallet = parsePrivateKey(private_key);
        const walletPubkey = wallet.publicKey.toBase58();
        console.log(`   Wallet: ${walletPubkey.slice(0, 6)}...${walletPubkey.slice(-4)}`);

        // 2. Determine input/output mints
        const isBuy = side?.toLowerCase() !== 'sell';
        const inputMint = isBuy ? USDC_MINT : symbol;
        const outputMint = isBuy ? symbol : USDC_MINT;

        // 3. Calculate amount in smallest unit
        const inputDecimals = await getTokenDecimals(inputMint);
        const amountInSmallestUnit = Math.floor(parseFloat(amount) * Math.pow(10, inputDecimals));

        console.log(`✅ Pipeline: Fetching Quote`);
        console.log(`   ${isBuy ? 'Buying' : 'Selling'}: ${amount} (${amountInSmallestUnit} lamports)`);
        console.log(`   Input: ${inputMint.slice(0, 8)}...`);
        console.log(`   Output: ${outputMint.slice(0, 8)}...`);

        // 4. Get Quote from Jupiter
        const slippageBps = slippage || '50';
        const quoteUrl = `${JUP_API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountInSmallestUnit}&slippageBps=${slippageBps}`;

        const quoteRes = await fetch(quoteUrl);
        if (!quoteRes.ok) {
            throw new Error(`Quote failed: ${quoteRes.status} ${await quoteRes.text()}`);
        }
        const quote = await quoteRes.json();

        if (quote.error) {
            throw new Error(`Jupiter quote error: ${quote.error}`);
        }

        console.log(`   Quote received: ${quote.outAmount} output tokens`);
        console.log(`   Price Impact: ${quote.priceImpactPct}%`);

        // 5. Get Swap Transaction
        console.log(`🚀 Building swap transaction...`);

        const swapRes = await fetch(`${JUP_API}/swap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                quoteResponse: quote,
                userPublicKey: walletPubkey,
                wrapAndUnwrapSol: true,
                dynamicComputeUnitLimit: true,
                prioritizationFeeLamports: 'auto'
            })
        });

        if (!swapRes.ok) {
            throw new Error(`Swap request failed: ${swapRes.status} ${await swapRes.text()}`);
        }
        const swapData = await swapRes.json();

        if (swapData.error) {
            throw new Error(`Jupiter swap error: ${swapData.error}`);
        }

        // 6. Deserialize and sign transaction
        console.log(`✅ Signing transaction...`);
        const swapTxBuf = Buffer.from(swapData.swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(swapTxBuf);
        transaction.sign([wallet]);

        // 7. Send transaction
        console.log(`🚀 Sending transaction to Solana...`);
        const connection = new Connection(SOLANA_RPC, 'confirmed');

        const signature = await connection.sendRawTransaction(transaction.serialize(), {
            skipPreflight: false,
            maxRetries: 3,
            preflightCommitment: 'confirmed'
        });

        console.log(`   Signature: ${signature}`);

        // 8. Confirm transaction
        console.log(`⏳ Confirming transaction...`);
        const confirmation = await connection.confirmTransaction(signature, 'confirmed');

        if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }

        console.log('✅ Swap Executed Successfully!');
        console.log(`   Signature: ${signature}`);
        console.log(`   Explorer: https://solscan.io/tx/${signature}`);

        // Log trade
        const logEntry = {
            timestamp: new Date().toISOString(),
            exchange: 'solana_jupiter',
            symbol,
            side: isBuy ? 'buy' : 'sell',
            amountInput: parseFloat(amount),
            amountOutput: parseFloat(quote.outAmount) / Math.pow(10, await getTokenDecimals(outputMint)),
            signature,
            priceImpact: quote.priceImpactPct
        };

        fs.appendFileSync(DEBUG_LOG, `${new Date().toISOString()} - Success: ${JSON.stringify(logEntry)}\n`);

        const logPath = path.join(path.dirname(process.argv[1]), '..', '..', '..', 'trades.json');
        try {
            fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
        } catch (e) { }

        // Output for programmatic use
        console.log(JSON.stringify({ success: true, signature, ...logEntry }));

    } catch (error) {
        console.error("Pipeline Error:", error.message);
        fs.appendFileSync(DEBUG_LOG, `${new Date().toISOString()} - Error: ${error.message}\n`);

        // Log failed attempt
        const logEntry = {
            timestamp: new Date().toISOString(),
            exchange: 'solana_jupiter',
            symbol,
            side: side || 'buy',
            amount: parseFloat(amount),
            error: error.message
        };

        const logPath = path.join(path.dirname(process.argv[1]), '..', '..', '..', 'trades.json');
        try {
            fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
        } catch (e) { }

        process.exit(1);
    }
}

executeSwap();
